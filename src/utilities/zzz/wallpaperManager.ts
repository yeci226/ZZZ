// src/utilities/zzz/wallpaperManager.ts
import axios from "axios";
import fs from "fs";
import path from "path";

const WALLPAPER_API =
  "https://sg-public-api-static.hoyoverse.com/content_v2_user/app/3e9196a4b9274bd7/getContentList";

// After this many days, a used wallpaper becomes available again
const REUSE_AFTER_DAYS = 30;

// Local cache directory for today's wallpaper image
const CACHE_DIR = path.join(process.cwd(), "cache", "wallpapers");

interface ContentItem {
  sTitle: string;
  sContent: string;
}

interface ContentListResponse {
  data: {
    iTotal: number;
    list: ContentItem[];
  };
}

interface WallpaperEntry {
  url: string;
  usedDate: string | null; // "YYYY-MM-DD" when last used, null if never used / expired
}

function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function extractImageUrls(sContent: string): string[] {
  const matches = [...sContent.matchAll(/src="([^"]+\.(png|jpg|webp)[^"]*)"/gi)];
  return matches.map((m) => m[1]);
}

async function fetchNewWallpaperUrls(known: Set<string>): Promise<string[]> {
  const newUrls: string[] = [];
  let page = 1;
  let maxPage = Infinity;
  const isFirstRun = known.size === 0;
  // For incremental updates: stop after this many consecutive pages with no new wallpapers
  const MAX_EMPTY_PAGES = 5;
  let emptyPageStreak = 0;

  while (page <= maxPage) {
    try {
      const res = await axios.get<ContentListResponse>(WALLPAPER_API, {
        params: { iPageSize: 20, iPage: page, iChanId: 288, sLangKey: "en-us" },
        timeout: 10000,
      });
      if (!res.data?.data) break;
      const { iTotal, list } = res.data.data;
      maxPage = Math.ceil(iTotal / 20);

      let foundNewOnPage = false;
      for (const item of list) {
        if (!item.sTitle.toLowerCase().includes("wallpaper")) continue;
        const urls = extractImageUrls(item.sContent);
        if (urls.length === 0) continue;
        for (const url of urls) {
          if (known.has(url)) continue;
          newUrls.push(url);
          foundNewOnPage = true;
        }
      }

      if (foundNewOnPage) {
        emptyPageStreak = 0;
      } else if (!isFirstRun) {
        // Incremental mode: stop after enough consecutive empty pages
        emptyPageStreak++;
        if (emptyPageStreak >= MAX_EMPTY_PAGES) break;
      }
    } catch {
      break;
    }
    page++;
  }

  return newUrls;
}

/** Download a wallpaper URL to local cache, return the local file path. */
async function downloadToCache(url: string, filename: string): Promise<string> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const filePath = path.join(CACHE_DIR, filename);
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 15000,
  });
  fs.writeFileSync(filePath, Buffer.from(res.data));
  return filePath;
}

/** Delete all cached wallpaper files except the one for today. */
function purgeStaleCacheFiles(todayFilename: string): void {
  if (!fs.existsSync(CACHE_DIR)) return;
  for (const file of fs.readdirSync(CACHE_DIR)) {
    if (file !== todayFilename) {
      try { fs.unlinkSync(path.join(CACHE_DIR, file)); } catch { /* ignore */ }
    }
  }
}

export async function refreshWallpapers(db: any): Promise<void> {
  const today = localDateString();
  let pool: WallpaperEntry[] = (await db.get("zzz.wallpaperPool")) || [];

  // Reset usedDate for entries older than REUSE_AFTER_DAYS
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - REUSE_AFTER_DAYS);
  const cutoffStr = localDateString(cutoff);
  for (const entry of pool) {
    if (entry.usedDate && entry.usedDate < cutoffStr) {
      entry.usedDate = null;
    }
  }

  // Fetch only new wallpapers not already in the pool
  const existingUrls = new Set(pool.map((e) => e.url));
  let fetchedUrls: string[];
  try {
    fetchedUrls = await fetchNewWallpaperUrls(existingUrls);
  } catch (err) {
    console.warn("[wallpaperManager] Failed to fetch wallpapers:", err);
    await db.set("zzz.wallpaperPool", pool);
    return;
  }

  for (const url of fetchedUrls) {
    pool.push({ url, usedDate: null });
  }

  await db.set("zzz.wallpaperPool", pool);

  // Purge stale cache files (keep today's if already downloaded)
  const todayEntry = pool.find((e) => e.usedDate === today);
  const todayFilename = todayEntry ? `today_${today}${path.extname(new URL(todayEntry.url).pathname) || ".jpg"}` : "";
  purgeStaleCacheFiles(todayFilename);
}

export async function getTodayWallpaper(db: any): Promise<string | null> {
  const today = localDateString();
  const pool: WallpaperEntry[] = (await db.get("zzz.wallpaperPool")) || [];

  // Find or select today's wallpaper entry
  let todayEntry = pool.find((e) => e.usedDate === today);
  if (!todayEntry) {
    const unused = pool.filter((e) => e.usedDate === null);
    if (unused.length === 0) return null;
    todayEntry = unused[Math.floor(Math.random() * unused.length)];
    todayEntry.usedDate = today;
    await db.set("zzz.wallpaperPool", pool);
  }

  // Return local cached file if it exists
  const ext = path.extname(new URL(todayEntry.url).pathname) || ".jpg";
  const filename = `today_${today}${ext}`;
  const localPath = path.join(CACHE_DIR, filename);

  if (fs.existsSync(localPath)) return localPath;

  // Download and cache
  try {
    return await downloadToCache(todayEntry.url, filename);
  } catch (err) {
    console.warn("[wallpaperManager] Failed to download wallpaper, returning URL:", err);
    return todayEntry.url; // fallback to URL if download fails
  }
}
