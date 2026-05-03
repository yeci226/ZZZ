import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import axios from "axios";
import Logger from "../core/logger.js";

const WIKI_PAINTINGS_DIR = "src/assets/images/zzz/wiki_paintings";

const WIKI_HEADERS = {
  "x-rpc-wiki_app": "zzz",
  "x-rpc-language": "zh-tw",
  Referer: "https://wiki.hoyolab.com/",
  Origin: "https://wiki.hoyolab.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
};

const downloadImage = async (url: string, filepath: string) => {
  const res = await fetch(url);
  if (!res.ok) return false;

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filepath, buffer);
  return true;
};

export async function downloadPaintingCache(url: string) {
  if (!url || !url.startsWith("http")) return url;

  try {
    const filename = url.split("/").pop() || `${Date.now()}.png`;
    const filepath = path.resolve(
      "src/assets/images/zzz/paintings",
      filename.split("?")[0],
    );

    if (fs.existsSync(filepath)) return filepath;

    const success = await downloadImage(url, filepath);
    return success ? filepath : url;
  } catch (error) {
    console.error(`[downloadPaintingCache] Failed to download ${url}:`, error);
    return url;
  }
}

/** Map a character's rank (0–6) to the correct painting index.
 *  0–2 → index 0,  3–5 → index 1,  6 → index 2
 */
export function paintingIndexForRank(rank: number): number {
  if (rank >= 6) return 2;
  if (rank >= 3) return 1;
  return 0;
}

/** Get local path for a wiki painting (entry_page_id + index). Returns null if not cached. */
export function getLocalWikiPainting(entryPageId: string | number, index: number): string | null {
  const p = path.resolve(WIKI_PAINTINGS_DIR, String(entryPageId), `${index}.png`);
  return fs.existsSync(p) ? p : null;
}

/** Get all locally cached wiki painting paths for an entry, sorted by index. */
export function getLocalWikiPaintings(entryPageId: string | number): string[] {
  const dir = path.resolve(WIKI_PAINTINGS_DIR, String(entryPageId));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map((f) => path.join(dir, f));
}

/** Fetch all agent entry_page entries from wiki (paginated). */
async function fetchAllAgentEntries(): Promise<Array<{ id: string; name: string }>> {
  const entries: Array<{ id: string; name: string }> = [];
  let page = 1;
  const pageSize = 50;

  while (true) {
    const res = await axios.post(
      "https://sg-wiki-api.hoyolab.com/hoyowiki/zzz/wapi/get_entry_page_list",
      { menu_id: "8", page_size: pageSize, page_num: page, lang: "zh-tw", filters: [] },
      { headers: WIKI_HEADERS },
    );
    if (res.data?.retcode !== 0) break;
    const list: any[] = res.data?.data?.list ?? [];
    if (list.length === 0) break;
    for (const item of list) {
      entries.push({ id: String(item.entry_page_id), name: item.name ?? "" });
    }
    if (list.length < pageSize) break;
    page++;
  }

  return entries;
}

/** Fetch img_list from wiki 意象影畫 module for a given entry_page_id. */
async function fetchWikiPaintingUrls(entryPageId: string): Promise<string[]> {
  try {
    const res = await axios.get(
      `https://sg-wiki-api.hoyolab.com/hoyowiki/zzz/wapi/entry_page?entry_page_id=${entryPageId}&lang=zh-tw`,
      { headers: WIKI_HEADERS },
    );
    if (res.data?.retcode !== 0) return [];
    const modules: any[] = res.data?.data?.page?.modules ?? [];
    const mod = modules.find((m: any) => String(m.id) === "4");
    if (!mod) return [];
    const raw = mod.components?.[0]?.data;
    if (!raw) return [];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return (parsed.img_list ?? []).map((i: any) => i.icon_url).filter(Boolean);
  } catch {
    return [];
  }
}

const WIKI_INDEX_FILE = path.resolve(WIKI_PAINTINGS_DIR, "index.json");

/** Load the name→entry_page_id mapping from disk. */
export function loadWikiIndex(): Record<string, string> {
  try {
    if (fs.existsSync(WIKI_INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(WIKI_INDEX_FILE, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

/** Download all wiki 意象影畫 for every agent to local disk. Skips already-downloaded entries. */
export async function downloadAllWikiPaintings(): Promise<void> {
  const logger = new Logger("WikiPaintings");

  let entries: Array<{ id: string; name: string }>;
  try {
    entries = await fetchAllAgentEntries();
  } catch (e: any) {
    logger.error(`Failed to fetch agent list: ${e?.message ?? e}`);
    return;
  }

  logger.info(`Found ${entries.length} agents, downloading 意象影畫...`);
  let downloaded = 0;
  let skipped = 0;

  // Always (re-)save the name index so searchWikiEntry can use it offline
  fs.mkdirSync(path.resolve(WIKI_PAINTINGS_DIR), { recursive: true });
  const index: Record<string, string> = loadWikiIndex();
  for (const entry of entries) {
    index[entry.name] = entry.id;
  }
  fs.writeFileSync(WIKI_INDEX_FILE, JSON.stringify(index, null, 2), "utf-8");

  for (const entry of entries) {
    const dir = path.resolve(WIKI_PAINTINGS_DIR, entry.id);

    // Skip if already downloaded (directory exists with at least one file)
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
      skipped++;
      continue;
    }

    const urls = await fetchWikiPaintingUrls(entry.id);
    if (urls.length === 0) continue;

    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < urls.length; i++) {
      const dest = path.join(dir, `${i}.png`);
      try {
        await downloadImage(urls[i], dest);
        downloaded++;
      } catch (e: any) {
        logger.error(`Failed ${entry.name}[${i}]: ${e?.message ?? e}`);
      }
    }

    // Small delay to avoid rate-limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  logger.success(`意象影畫下載完成：新增 ${downloaded} 張，略過 ${skipped} 個已存在角色`);
}
