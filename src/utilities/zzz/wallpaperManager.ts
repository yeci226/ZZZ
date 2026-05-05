// src/utilities/zzz/wallpaperManager.ts
import axios from "axios";
import fs from "fs";
import path from "path";

const WALLPAPER_API =
  "https://sg-public-api-static.hoyoverse.com/content_v2_user/app/3e9196a4b9274bd7/getContentList";

// After this many days, a used article becomes available again
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

/** One article = one pool entry; stores all image URLs from that article */
interface WallpaperArticle {
  urls: string[];
  usedDate: string | null; // "YYYY-MM-DD" when last used, null if never used / expired
  pickedUrl?: string | null; // the specific image picked for usedDate
}

function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function extractImageUrls(sContent: string): string[] {
  const matches = [...sContent.matchAll(/src="([^"]+\.(png|jpg|webp)[^"]*)"/gi)];
  return matches.map((m) => m[1]);
}

/** Returns true if the title looks like a Calendar wallpaper (skip these) */
function isCalendar(title: string): boolean {
  return /calendar/i.test(title);
}

async function fetchAllWallpaperArticles(): Promise<{ title: string; urls: string[] }[]> {
  const articles: { title: string; urls: string[] }[] = [];
  let page = 1;
  let maxPage = Infinity;

  while (page <= maxPage) {
    try {
      const res = await axios.get<ContentListResponse>(WALLPAPER_API, {
        params: { iPageSize: 20, iPage: page, iChanId: 288, sLangKey: "en-us" },
        timeout: 10000,
      });
      if (!res.data?.data) break;
      const { iTotal, list } = res.data.data;
      maxPage = Math.ceil(iTotal / 20);

      for (const item of list) {
        if (!item.sTitle.toLowerCase().includes("wallpaper")) continue;
        if (isCalendar(item.sTitle)) continue;
        const urls = extractImageUrls(item.sContent);
        if (urls.length === 0) continue;
        articles.push({ title: item.sTitle.trim(), urls });
      }
    } catch {
      break;
    }
    page++;
  }

  return articles;
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

/** Delete all cached wallpaper files. */
function purgeAllCacheFiles(): void {
  if (!fs.existsSync(CACHE_DIR)) return;
  for (const file of fs.readdirSync(CACHE_DIR)) {
    try { fs.unlinkSync(path.join(CACHE_DIR, file)); } catch { /* ignore */ }
  }
}

export async function refreshWallpapers(db: any): Promise<void> {
  // Fetch all wallpaper articles (excluding calendar)
  let articles: { title: string; urls: string[] }[];
  try {
    articles = await fetchAllWallpaperArticles();
  } catch (err) {
    console.warn("[wallpaperManager] Failed to fetch wallpapers:", err);
    return;
  }

  // Build pool: one entry per article
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - REUSE_AFTER_DAYS);
  const cutoffStr = localDateString(cutoff);

  // Load existing pool to preserve usedDate info
  const existing: WallpaperArticle[] = (await db.get("zzz.wallpaperArticlePool")) || [];
  const existingMap = new Map(existing.map((e) => [JSON.stringify(e.urls.slice().sort()), e]));

  const pool: WallpaperArticle[] = articles.map((a) => {
    const key = JSON.stringify(a.urls.slice().sort());
    const prev = existingMap.get(key);
    let usedDate = prev?.usedDate ?? null;
    // Reset if expired
    if (usedDate && usedDate < cutoffStr) usedDate = null;
    return { urls: a.urls, usedDate };
  });

  await db.set("zzz.wallpaperArticlePool", pool);
}

export async function getTodayWallpaper(db: any): Promise<string | null> {
  const today = localDateString();
  const pool: WallpaperArticle[] = (await db.get("zzz.wallpaperArticlePool")) || [];

  // Find if today's article is already selected
  let todayArticle = pool.find((e) => e.usedDate === today);
  if (!todayArticle) {
    // Pick a random unused article
    let candidates = pool.filter((e) => e.usedDate === null);
    if (candidates.length === 0) {
      // All used — reset all and start over
      for (const entry of pool) entry.usedDate = null;
      await db.set("zzz.wallpaperArticlePool", pool);
      candidates = pool;
    }
    if (candidates.length === 0) return null;

    todayArticle = candidates[Math.floor(Math.random() * candidates.length)];
    todayArticle.usedDate = today;
    await db.set("zzz.wallpaperArticlePool", pool);
  }

  // Pick a random image from today's article (lock it for the rest of the day)
  const urls = todayArticle.urls;
  let pickedUrl = todayArticle.pickedUrl ?? null;
  if (!pickedUrl) {
    pickedUrl = urls[Math.floor(Math.random() * urls.length)];
    todayArticle.pickedUrl = pickedUrl;
    await db.set("zzz.wallpaperArticlePool", pool);
  }

  // Cache file keyed by URL hash
  const urlHash = Buffer.from(pickedUrl).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  const ext = path.extname(new URL(pickedUrl).pathname) || ".jpg";
  const filename = `wp_${today}_${urlHash}${ext}`;
  const localPath = path.join(CACHE_DIR, filename);

  // Purge old cache files (keep today's)
  if (fs.existsSync(CACHE_DIR)) {
    for (const file of fs.readdirSync(CACHE_DIR)) {
      if (file !== filename) {
        try { fs.unlinkSync(path.join(CACHE_DIR, file)); } catch { /* ignore */ }
      }
    }
  }

  if (fs.existsSync(localPath)) return localPath;

  // Download and cache
  try {
    return await downloadToCache(pickedUrl, filename);
  } catch (err) {
    console.warn("[wallpaperManager] Failed to download wallpaper, returning URL:", err);
    return pickedUrl;
  }
}
