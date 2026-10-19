import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import axios from "axios";
import Database from "better-sqlite3";
import {
  WallpaperManager,
  wallpaperDate,
  wallpaperHash,
  wallpaperScore,
} from "../src/utilities/zzz/wallpaperManager.js";
jest.mock("axios");
const png = (w: number, h: number) => createCanvas(w, h).toBuffer("image/png");
const landscape = png(1280, 720);
const poolKey = "zzz.wallpaperArticlePool";
const todayKey = "zzz.wallpaperToday";
class MemoryDb {
  values: Record<string, any> = {};
  async get(key: string) {
    return structuredClone(this.values[key] ?? null);
  }
  async set(key: string, value: any) {
    this.values[key] = structuredClone(value);
  }
}
let directory: string;
let db: MemoryDb;
const now = () => new Date("2026-09-09T04:00:00Z");
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "zzz-wallpaper-"));
  db = new MemoryDb();
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
  jest.restoreAllMocks();
});

test("Taipei midnight is independent of machine timezone and URL hashes include the entire URL", () => {
  expect(wallpaperDate(new Date("2026-09-08T15:59:59Z"))).toBe("2026-09-08");
  expect(wallpaperDate(new Date("2026-09-08T16:00:00Z"))).toBe("2026-09-09");
  expect(wallpaperHash("https://same.example/a.png")).not.toBe(
    wallpaperHash("https://same.example/b.png"),
  );
  expect(wallpaperScore(1280, 720)).toBeLessThan(wallpaperScore(2560, 1080));
  expect(wallpaperScore(640, 360)).toBeLessThan(wallpaperScore(1080, 1920));
});

test("selects a decoded high-resolution 16:9 variant; concurrent instances and restart keep the same selection", async () => {
  await db.set(poolKey, [
    {
      urls: [
        "https://a/portrait.png",
        "https://a/small.png",
        "https://a/wide.png",
      ],
      usedDate: null,
    },
  ]);
  const download = jest.fn(async (url: string) => {
    await new Promise((r) => setTimeout(r, 10));
    return url.includes("portrait")
      ? png(400, 700)
      : url.includes("small")
        ? png(640, 360)
        : landscape;
  });
  const options = { cacheDir: directory, now, download };
  const a = new WallpaperManager(options),
    b = new WallpaperManager(options);
  const paths = await Promise.all([
    a.getToday(db),
    a.getToday(db),
    b.getToday(db),
  ]);
  expect(new Set(paths).size).toBe(1);
  expect((await db.get(todayKey)).url).toBe("https://a/wide.png");
  expect(download).toHaveBeenCalledTimes(3);
  expect(await new WallpaperManager(options).getToday(db)).toBe(paths[0]);
  expect(download).toHaveBeenCalledTimes(3);
});

test("refresh preserves selection/history, does not reset expired history, and keeps a removed current article", async () => {
  await db.set(poolKey, [
    {
      urls: ["https://a/today.png"],
      usedDate: "2026-09-09",
      pickedUrl: "https://a/today.png",
    },
    { urls: ["https://a/old.png"], usedDate: "2026-01-01" },
  ]);
  const manager = new WallpaperManager({
    cacheDir: directory,
    now,
    fetchArticles: async () => [{ urls: ["https://a/old.png"] }],
  });
  await manager.refresh(db);
  expect(await db.get(poolKey)).toEqual([
    { urls: ["https://a/old.png"], usedDate: "2026-01-01" },
    {
      urls: ["https://a/today.png"],
      usedDate: "2026-09-09",
      pickedUrl: "https://a/today.png",
    },
  ]);
});

test("incomplete API pages and empty refreshes never replace a working pool", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const original = [{ urls: ["https://a/original.png"], usedDate: null }];
  await db.set(poolKey, original);
  jest.mocked(axios.get).mockResolvedValueOnce({
    data: {
      data: {
        iTotal: 21,
        list: Array.from({ length: 20 }, () => ({
          sTitle: "Wallpaper",
          sContent: '<img src="https://a/new.png">',
        })),
      },
    },
  });
  jest.mocked(axios.get).mockRejectedValueOnce(new Error("partial failure"));
  await new WallpaperManager({ cacheDir: directory }).refresh(db);
  expect(await db.get(poolKey)).toEqual(original);
  await new WallpaperManager({
    cacheDir: directory,
    fetchArticles: async () => [],
  }).refresh(db);
  expect(await db.get(poolKey)).toEqual(original);
});

test("legacy cached selection migrates offline, and refresh or midnight cannot reuse an old pickedUrl blindly", async () => {
  const url = "https://same.example/today.png";
  const hash = Buffer.from(url)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 16);
  await writeFile(join(directory, `wp_2026-09-09_${hash}.png`), landscape);
  await db.set(poolKey, [
    { urls: [url], usedDate: "2026-09-09", pickedUrl: url },
  ]);
  const download = jest.fn(async () => {
    throw new Error("offline");
  });
  const result = await new WallpaperManager({
    cacheDir: directory,
    now,
    download,
  }).getToday(db);
  expect(result).toContain(wallpaperHash(url));
  expect(download).not.toHaveBeenCalled();
  expect(await db.get(todayKey)).toEqual({ date: "2026-09-09", url });
  await db.set(poolKey, [
    {
      urls: ["https://a/old.png", "https://a/new.png"],
      usedDate: "2026-09-09",
      pickedUrl: "https://a/old.png",
    },
  ]);
  const nextDownload = jest.fn(async (u: string) =>
    u.endsWith("old.png") ? png(100, 200) : landscape,
  );
  await new WallpaperManager({
    cacheDir: directory,
    now: () => new Date("2026-09-09T16:00:00Z"),
    download: nextDownload,
  }).getToday(db);
  expect(await db.get(todayKey)).toEqual({
    date: "2026-09-10",
    url: "https://a/new.png",
  });
});

test("expired articles are available before recently used ones, otherwise use oldest history", async () => {
  await db.set(poolKey, [
    { urls: ["https://a/recent.png"], usedDate: "2026-09-08" },
    { urls: ["https://a/oldest.png"], usedDate: "2026-08-11" },
  ]);
  const download = jest.fn(async () => landscape);
  await new WallpaperManager({
    cacheDir: directory,
    now,
    download,
    random: () => 0,
  }).getToday(db);
  expect((await db.get(todayKey)).url).toBe("https://a/oldest.png");
  expect(download).toHaveBeenCalledTimes(1);
});

test("corrupt/download-failed candidates do not poison selection or delete last good background; successful save retains seven days", async () => {
  const old = join(directory, "wp_2026-09-01_legacy.png");
  await writeFile(old, landscape);
  await writeFile(
    join(directory, "wp_2026-09-08_corrupt.png"),
    Buffer.from("bad"),
  );
  await db.set(poolKey, [{ urls: ["https://a/broken.png"], usedDate: null }]);
  expect(
    await new WallpaperManager({
      cacheDir: directory,
      now,
      download: async () => Buffer.from("bad"),
    }).getToday(db),
  ).toBe(old);
  expect(await db.get(todayKey)).toBeNull();
  expect(await readFile(old)).toEqual(landscape);
  await new WallpaperManager({
    cacheDir: directory,
    now,
    download: async () => landscape,
  }).getToday(db);
  expect(await readdir(directory)).not.toContain("wp_2026-09-01_legacy.png");
  expect((await readdir(directory)).some((n) => n.endsWith(".tmp"))).toBe(
    false,
  );
});

test("pinned file loss restores the same URL and expired worker lease can be recovered", async () => {
  const url = "https://a/locked.png";
  await db.set(todayKey, { date: "2026-09-09", url });
  const lock = new Database(join(directory, ".wallpaper-lock.sqlite"));
  lock.exec(
    "CREATE TABLE lease (id INTEGER PRIMARY KEY, owner TEXT, until_at INTEGER); INSERT INTO lease VALUES(1,'crashed',0)",
  );
  lock.close();
  const download = jest.fn(async () => landscape);
  expect(
    await new WallpaperManager({ cacheDir: directory, now, download }).getToday(
      db,
    ),
  ).toContain(wallpaperHash(url));
  expect(download).toHaveBeenCalledWith(url);
});

test("separate bot processes share one daily selection and download", async () => {
  const shared = new Database(join(directory, "shared.sqlite"));
  shared.exec("CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)");
  shared
    .prepare("INSERT INTO kv VALUES (?,?)")
    .run(
      poolKey,
      JSON.stringify([{ urls: ["https://a/worker.png"], usedDate: null }]),
    );
  shared.close();
  await writeFile(join(directory, "source.png"), landscape);
  const run = () =>
    promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/wallpapers/worker.ts", directory],
      { cwd: process.cwd() },
    );
  const [a, b] = await Promise.all([run(), run()]);
  expect(a.stdout.trim()).toBe(b.stdout.trim());
  expect(await readFile(join(directory, "downloads.log"), "utf8")).toBe(
    "https://a/worker.png\n",
  );
}, 15000);

test("an expired article is eligible before recent history, and broken variants fall through to another article", async () => {
  await db.set(poolKey, [
    { urls: ["https://a/recent.png"], usedDate: "2026-09-08" },
    { urls: ["https://a/expired.png"], usedDate: "2026-07-01" },
  ]);
  const download = jest.fn(async (url: string) => {
    if (url.includes("expired")) throw new Error("missing image");
    return landscape;
  });
  await new WallpaperManager({ cacheDir: directory, now, download }).getToday(
    db,
  );
  expect(download.mock.calls.map(([url]) => url)).toEqual([
    "https://a/expired.png",
    "https://a/recent.png",
  ]);
  expect((await db.get(todayKey)).url).toBe("https://a/recent.png");
  expect((await db.get(poolKey))[1].usedDate).toBe("2026-07-01");
});

test("a worker that loses its lease cannot publish a stale choice or release the replacement owner's lock", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await db.set(poolKey, [{ urls: ["https://a/stale.png"], usedDate: null }]);
  const download = async () => {
    const other = new Database(join(directory, ".wallpaper-lock.sqlite"));
    other
      .prepare("UPDATE lease SET owner='replacement',until_at=?")
      .run(Date.now() + 120_000);
    other.close();
    return landscape;
  };
  expect(
    await new WallpaperManager({ cacheDir: directory, now, download }).getToday(
      db,
    ),
  ).toBeNull();
  expect(await db.get(todayKey)).toBeNull();
  const lock = new Database(join(directory, ".wallpaper-lock.sqlite"));
  expect(lock.prepare("SELECT owner FROM lease").get()).toEqual({
    owner: "replacement",
  });
  lock.close();
});
