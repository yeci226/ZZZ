import axios from "axios";
import { loadImage } from "@napi-rs/canvas";
import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const WALLPAPER_API =
  "https://sg-public-api-static.hoyoverse.com/content_v2_user/app/3e9196a4b9274bd7/getContentList";
const POOL_KEY = "zzz.wallpaperArticlePool";
const TODAY_KEY = "zzz.wallpaperToday";
const DAY = 86_400_000;
const REUSE_AFTER_DAYS = 30;

export interface WallpaperArticle {
  urls: string[];
  usedDate: string | null;
  pickedUrl?: string | null;
}
interface Selection {
  date: string;
  url: string;
}
interface WallpaperDb {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<any>;
}
interface Candidate {
  url: string;
  bytes: Buffer;
  width: number;
  height: number;
}
interface WallpaperOptions {
  cacheDir?: string;
  now?: () => Date;
  random?: () => number;
  download?: (url: string) => Promise<Buffer>;
  fetchArticles?: () => Promise<{ urls: string[] }[]>;
}

export function wallpaperDate(date = new Date()): string {
  // Taipei has a fixed UTC+8 offset; never depend on the host's timezone.
  return new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}
export function wallpaperHash(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}
export function wallpaperScore(width: number, height: number): number {
  const ratio = width / height;
  const landscape = ratio >= 1.3 && ratio <= 2.2;
  const quality = landscape && width >= 1280 && height >= 720;
  return (
    (quality ? 0 : landscape ? 10 : 20) + Math.abs(Math.log(ratio / (16 / 9)))
  );
}

async function fetchAllWallpaperArticles(): Promise<{ urls: string[] }[]> {
  const articles: { urls: string[] }[] = [];
  let expectedTotal: number | undefined;
  let received = 0;
  for (let page = 1; page <= 100; page++) {
    const response = await axios.get(WALLPAPER_API, {
      params: { iPageSize: 20, iPage: page, iChanId: 288, sLangKey: "en-us" },
      timeout: 10000,
    });
    const data = response.data?.data;
    if (
      !data ||
      !Number.isInteger(data.iTotal) ||
      data.iTotal <= 0 ||
      !Array.isArray(data.list) ||
      !data.list.length ||
      (expectedTotal !== undefined && data.iTotal !== expectedTotal)
    ) {
      throw new Error("wallpaper_incomplete_list");
    }
    expectedTotal = data.iTotal;
    received += data.list.length;
    for (const item of data.list) {
      if (typeof item.sTitle !== "string" || typeof item.sContent !== "string")
        throw new Error("wallpaper_invalid_article");
      if (!/wallpaper/i.test(item.sTitle) || /calendar/i.test(item.sTitle))
        continue;
      const urls = [
        ...item.sContent.matchAll(
          /src=["']([^"']+\.(?:png|jpe?g|webp)[^"']*)["']/gi,
        ),
      ]
        .map((match: any) => String(match[1]).replace(/&amp;/g, "&"))
        .filter((url) => /^https?:\/\//.test(url));
      if (urls.length) articles.push({ urls: [...new Set(urls)] });
    }
    if (received >= expectedTotal!) {
      if (!articles.length) throw new Error("wallpaper_empty_pool");
      return articles;
    }
    if (data.list.length < 20) throw new Error("wallpaper_incomplete_page");
  }
  throw new Error("wallpaper_page_limit");
}

/** Shared lock file uses a SQLite lease so workers cannot race stale-lock removal. */
export class WallpaperManager {
  readonly cacheDir: string;
  private now: () => Date;
  private random: () => number;
  private download: (url: string) => Promise<Buffer>;
  private fetchArticles: () => Promise<{ urls: string[] }[]>;
  private pending = new WeakMap<object, Promise<string | null>>();
  constructor(options: WallpaperOptions = {}) {
    this.cacheDir =
      options.cacheDir ?? path.join(process.cwd(), "cache", "wallpapers");
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.fetchArticles = options.fetchArticles ?? fetchAllWallpaperArticles;
    this.download =
      options.download ??
      (async (url) => {
        const res = await axios.get<ArrayBuffer>(url, {
          responseType: "arraybuffer",
          timeout: 15000,
          maxContentLength: 32 * 1024 * 1024,
        });
        return Buffer.from(res.data);
      });
  }
  private async locked<T>(
    work: (assertLease: () => void) => Promise<T>,
  ): Promise<T> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const lock = new Database(
      path.join(this.cacheDir, ".wallpaper-lock.sqlite"),
    );
    lock.pragma("busy_timeout = 5000");
    lock.exec(
      "CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY, owner TEXT, until_at INTEGER)",
    );
    const owner = randomUUID();
    const acquire = () =>
      lock
        .prepare(
          "INSERT INTO lease VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,until_at=excluded.until_at WHERE lease.until_at<? OR lease.owner=?",
        )
        .run(owner, Date.now() + 120_000, Date.now(), owner).changes === 1;
    // Renewal must never reacquire a lease lost during a long process suspension.
    const renew = () =>
      lock
        .prepare(
          "UPDATE lease SET until_at=? WHERE id=1 AND owner=? AND until_at>=?",
        )
        .run(Date.now() + 120_000, owner, Date.now()).changes === 1;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let lost = false;
    try {
      const deadline = Date.now() + 30_000;
      while (!acquire()) {
        if (Date.now() >= deadline) throw new Error("wallpaper_busy");
        await delay(75);
      }
      heartbeat = setInterval(() => {
        try {
          if (!renew()) lost = true;
        } catch {
          lost = true;
        }
      }, 10_000);
      heartbeat.unref();
      return await work(() => {
        if (lost || !renew()) throw new Error("wallpaper_lease_lost");
      });
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      lock.prepare("DELETE FROM lease WHERE id=1 AND owner=?").run(owner);
      lock.close();
    }
  }
  async refresh(db: WallpaperDb): Promise<void> {
    try {
      // Do network work before taking the shared lock; commit only a complete snapshot.
      const articles = await this.fetchArticles();
      if (!articles.length || articles.some((a) => !a.urls?.length)) return;
      await this.locked(async (assertLease) => {
        const existing: WallpaperArticle[] = (await db.get(POOL_KEY)) ?? [];
        const pool = articles.map((article) => {
          const previous = existing.find((e) =>
            e.urls.some((url) => article.urls.includes(url)),
          );
          return {
            ...previous,
            urls: [...new Set(article.urls)],
            usedDate: previous?.usedDate ?? null,
          };
        });
        // Preserve a legacy selection even if its article was just removed upstream.
        for (const entry of existing) {
          if (
            entry.usedDate === wallpaperDate(this.now()) &&
            !pool.some((e) => e.urls.some((u) => entry.urls.includes(u)))
          )
            pool.push(entry);
        }
        assertLease();
        await db.set(POOL_KEY, pool);
      });
    } catch {
      console.warn("[wallpaperManager] Refresh failed; keeping existing pool");
    }
  }
  getToday(db: WallpaperDb): Promise<string | null> {
    const running = this.pending.get(db);
    if (running) return running;
    const result = this.locked((assertLease) =>
      this.select(db, assertLease),
    ).catch(async () => {
      console.warn(
        "[wallpaperManager] Selection unavailable; using last valid cache",
      );
      return this.lastValid();
    });
    this.pending.set(db, result);
    void result.finally(() => this.pending.delete(db));
    return result;
  }
  private filename(date: string, url: string): string {
    return path.join(this.cacheDir, `wp_${date}_${wallpaperHash(url)}.img`);
  }
  private async candidate(url: string): Promise<Candidate> {
    const names = (await fs.readdir(this.cacheDir))
      .filter((name) => name.endsWith(`_${wallpaperHash(url)}.img`))
      .sort()
      .reverse();
    for (const name of names) {
      try {
        const bytes = await fs.readFile(path.join(this.cacheDir, name));
        const image = await loadImage(bytes);
        return { url, bytes, width: image.width, height: image.height };
      } catch {
        /* Retry the source if a cached file is incomplete. */
      }
    }
    const bytes = await this.download(url);
    const image = await loadImage(bytes);
    if (!image.width || !image.height)
      throw new Error("wallpaper_invalid_dimensions");
    return { url, bytes, width: image.width, height: image.height };
  }
  private async save(date: string, candidate: Candidate): Promise<string> {
    const file = this.filename(date, candidate.url);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, candidate.bytes);
      await fs.rename(temporary, file);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
    return file;
  }
  private async lastValid(): Promise<string | null> {
    const names = await fs.readdir(this.cacheDir).catch(() => [] as string[]);
    for (const name of names
      .filter((n) =>
        /^wp_\d{4}-\d{2}-\d{2}_.+\.(?:img|png|jpg|jpeg|webp)$/.test(n),
      )
      .sort()
      .reverse()) {
      try {
        const file = path.join(this.cacheDir, name);
        await loadImage(await fs.readFile(file));
        return file;
      } catch {
        /* Skip corrupt files without losing another valid fallback. */
      }
    }
    return null;
  }
  private async cleanup(date: string): Promise<void> {
    const cutoff = new Date(Date.parse(`${date}T00:00:00Z`) - 6 * DAY)
      .toISOString()
      .slice(0, 10);
    for (const name of await fs.readdir(this.cacheDir)) {
      const match =
        /^wp_(\d{4}-\d{2}-\d{2})_.+\.(?:img|png|jpg|jpeg|webp)$/.exec(name);
      if (match && match[1] < cutoff)
        await fs.unlink(path.join(this.cacheDir, name)).catch(() => {});
    }
  }
  private async select(
    db: WallpaperDb,
    assertLease: () => void,
  ): Promise<string | null> {
    const today = wallpaperDate(this.now());
    const pool: WallpaperArticle[] = (await db.get(POOL_KEY)) ?? [];
    const saved: Selection | null = await db.get(TODAY_KEY);
    const legacy = pool.find((e) => e.usedDate === today && e.pickedUrl);
    const pinned =
      saved?.date === today
        ? saved
        : legacy
          ? { date: today, url: legacy.pickedUrl! }
          : null;
    if (pinned) {
      try {
        const currentFile = this.filename(today, pinned.url);
        try {
          await loadImage(await fs.readFile(currentFile));
          assertLease();
          if (saved?.date !== today) await db.set(TODAY_KEY, pinned);
          return currentFile;
        } catch {
          /* Restore a missing/corrupt file from a validated source. */
        }
        let image: Candidate;
        try {
          // Migrate the old truncated-base64 filename without changing today's image.
          const oldHash = Buffer.from(pinned.url)
            .toString("base64")
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 16);
          const oldFile = path.join(
            this.cacheDir,
            `wp_${today}_${oldHash}${path.extname(new URL(pinned.url).pathname) || ".jpg"}`,
          );
          const bytes = await fs.readFile(oldFile);
          const decoded = await loadImage(bytes);
          image = {
            url: pinned.url,
            bytes,
            width: decoded.width,
            height: decoded.height,
          };
        } catch {
          image = await this.candidate(pinned.url);
        }
        assertLease();
        const file = await this.save(today, image);
        await db.set(TODAY_KEY, pinned);
        await this.cleanup(today);
        return file;
      } catch {
        return this.lastValid();
      }
    }
    const cutoff = new Date(
      Date.parse(`${today}T00:00:00Z`) - REUSE_AFTER_DAYS * DAY,
    )
      .toISOString()
      .slice(0, 10);
    const shuffled = pool.map((article) => ({
      article,
      random: this.random(),
    }));
    shuffled.sort((a, b) => {
      const aUnused = !a.article.usedDate || a.article.usedDate <= cutoff;
      const bUnused = !b.article.usedDate || b.article.usedDate <= cutoff;
      if (aUnused !== bUnused) return aUnused ? -1 : 1;
      if (!aUnused)
        return (
          a.article.usedDate!.localeCompare(b.article.usedDate!) ||
          a.random - b.random
        );
      return a.random - b.random;
    });
    for (const { article } of shuffled) {
      let chosen: Candidate | undefined;
      let bestScore = Infinity,
        tied = 0;
      const urls = [...new Set(article.urls)];
      // At most three downloads in flight; only decoded candidates can be selected.
      let index = 0;
      await Promise.all(
        Array.from({ length: Math.min(3, urls.length) }, async () => {
          while (index < urls.length) {
            const url = urls[index++];
            try {
              const candidate = await this.candidate(url);
              const score = wallpaperScore(candidate.width, candidate.height);
              if (score < bestScore - 0.001) {
                chosen = candidate;
                bestScore = score;
                tied = 1;
              } else if (
                Math.abs(score - bestScore) < 0.001 &&
                this.random() < 1 / ++tied
              ) {
                chosen = candidate;
              }
              // Retain just the best buffer instead of every full-resolution variant.
            } catch {
              /* Try the other variants. */
            }
          }
        }),
      );
      if (!chosen) continue;
      assertLease();
      const file = await this.save(today, chosen);
      // Persist the independent selection first, so a partial DB failure cannot change it.
      await db.set(TODAY_KEY, { date: today, url: chosen.url });
      article.usedDate = today;
      article.pickedUrl = chosen.url;
      await db.set(POOL_KEY, pool);
      await this.cleanup(today);
      return file;
    }
    return this.lastValid();
  }
}
const manager = new WallpaperManager();
export const refreshWallpapers = (db: WallpaperDb): Promise<void> =>
  manager.refresh(db);
export const getTodayWallpaper = (db: WallpaperDb): Promise<string | null> =>
  manager.getToday(db);
