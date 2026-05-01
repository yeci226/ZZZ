// src/utilities/zzz/wallpaperManager.ts
import axios from "axios";

const WALLPAPER_API =
  "https://sg-public-api-static.hoyoverse.com/content_v2_user/app/3e9196a4b9274bd7/getContentList";

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

function extractImageUrl(sContent: string): string | null {
  const match = sContent.match(/<img[^>]+src="([^"]+\.png[^"]*)"/i);
  return match ? match[1] : null;
}

async function fetchWallpaperPage(page: number): Promise<{ total: number; urls: string[] }> {
  const res = await axios.get<ContentListResponse>(WALLPAPER_API, {
    params: { iPageSize: 20, iPage: page, iChanId: 288, sLangKey: "en-us" },
    timeout: 10000,
  });
  const { iTotal, list } = res.data.data;
  const urls: string[] = [];
  for (const item of list) {
    if (!item.sTitle.toLowerCase().includes("wallpaper")) continue;
    const url = extractImageUrl(item.sContent);
    if (url) urls.push(url);
  }
  return { total: iTotal, urls };
}

export async function refreshWallpapers(db: any): Promise<void> {
  const firstPage = await fetchWallpaperPage(1);
  const maxPage = Math.ceil(firstPage.total / 20);
  const allUrls: string[] = [...firstPage.urls];

  for (let page = 2; page <= maxPage; page++) {
    try {
      const { urls } = await fetchWallpaperPage(page);
      allUrls.push(...urls);
    } catch {
      // best-effort: stop if a page fails
      break;
    }
  }

  if (allUrls.length === 0) return; // don't overwrite if fetch completely failed

  await db.set("zzz.wallpapers", allUrls);
  await db.set("zzz.usedWallpapers", []);
}

export async function getTodayWallpaper(db: any): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const stored = await db.get("zzz.todayWallpaper") as { date: string; url: string } | null;
  if (stored && stored.date === today) return stored.url;

  let pool: string[] = (await db.get("zzz.wallpapers")) || [];
  const used: string[] = (await db.get("zzz.usedWallpapers")) || [];

  // If all used, reset
  const remaining = pool.filter((u) => !used.includes(u));
  const effective = remaining.length > 0 ? remaining : pool;
  if (effective.length === 0) return null;

  const url = effective[Math.floor(Math.random() * effective.length)];
  await db.set("zzz.usedWallpapers", [...used.filter((u) => pool.includes(u)), url]);
  await db.set("zzz.todayWallpaper", { date: today, url });
  return url;
}
