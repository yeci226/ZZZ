import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import axios from "axios";
import Logger from "../core/logger.js";
import { findWikiElementIcons } from "./elements.js";
import { getGachaWeaponIconMap, weaponIconLocalPath } from "./gachaWeaponIcons.js";
import { bangbooIconLocalPath, getGachaBangbooIconMap } from "./gachaBangbooIcons.js";

const WIKI_PAINTINGS_DIR = "src/assets/images/zzz/wiki_paintings";
const FACE_CACHE_FILE = path.resolve(WIKI_PAINTINGS_DIR, "face_cache.json");
const DEFAULT_FACE_Y = 0.35;
const DEFAULT_FACE_X = 0.5;

/** Get the face Y position (0~1 ratio from top) for a wiki entry. Returns default if not cached. */
export function getFaceY(entryPageId: string | number): number {
  try {
    if (!fs.existsSync(FACE_CACHE_FILE)) return DEFAULT_FACE_Y;
    const cache = JSON.parse(fs.readFileSync(FACE_CACHE_FILE, "utf-8"));
    const val = cache[String(entryPageId)];
    if (typeof val === "number") return val; // legacy flat format
    return typeof val?.faceY === "number" ? val.faceY : DEFAULT_FACE_Y;
  } catch {
    return DEFAULT_FACE_Y;
  }
}

/** Get face position (faceX, faceY) for a wiki entry. Returns defaults if not cached. */
export function getFacePos(entryPageId: string | number): {
  faceX: number;
  faceY: number;
} {
  try {
    if (!fs.existsSync(FACE_CACHE_FILE))
      return { faceX: DEFAULT_FACE_X, faceY: DEFAULT_FACE_Y };
    const cache = JSON.parse(fs.readFileSync(FACE_CACHE_FILE, "utf-8"));
    const val = cache[String(entryPageId)];
    if (typeof val === "number") return { faceX: DEFAULT_FACE_X, faceY: val }; // legacy
    return {
      faceX: typeof val?.faceX === "number" ? val.faceX : DEFAULT_FACE_X,
      faceY: typeof val?.faceY === "number" ? val.faceY : DEFAULT_FACE_Y,
    };
  } catch {
    return { faceX: DEFAULT_FACE_X, faceY: DEFAULT_FACE_Y };
  }
}

const WIKI_HEADERS = {
  "x-rpc-wiki_app": "zzz",
  "x-rpc-language": "zh-tw",
  Referer: "https://wiki.hoyolab.com/",
  Origin: "https://wiki.hoyolab.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
};

const isPng = (buffer: Buffer) =>
  buffer.length >= 8 &&
  buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
const isWebp = (buffer: Buffer) =>
  buffer.length >= 12 &&
  buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
  buffer.subarray(8, 12).toString("ascii") === "WEBP";
const isJpeg = (buffer: Buffer) =>
  buffer.length >= 3 &&
  buffer[0] === 0xff &&
  buffer[1] === 0xd8 &&
  buffer[2] === 0xff;

const downloadImage = async (url: string, filepath: string) => {
  const res = await fetch(url);
  if (!res.ok) return false;

  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) return false;

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!isPng(buffer) && !isWebp(buffer) && !isJpeg(buffer)) return false;

  const extension = path.extname(filepath).toLowerCase();
  if (
    (extension === ".png" && !isPng(buffer)) ||
    (extension === ".webp" && !isWebp(buffer)) ||
    ([".jpg", ".jpeg"].includes(extension) && !isJpeg(buffer))
  ) {
    return false;
  }

  const dir = path.dirname(filepath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filepath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, filepath);
    return true;
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
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
export function getLocalWikiPainting(
  entryPageId: string | number,
  index: number,
): string | null {
  const p = path.resolve(
    WIKI_PAINTINGS_DIR,
    String(entryPageId),
    `${index}.png`,
  );
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
async function fetchAllAgentEntries(): Promise<
  Array<{ id: string; name: string }>
> {
  const entries: Array<{ id: string; name: string }> = [];
  let page = 1;
  const pageSize = 50;

  while (true) {
    const res = await axios.post(
      "https://sg-wiki-api.hoyolab.com/hoyowiki/zzz/wapi/get_entry_page_list",
      {
        menu_id: "8",
        page_size: pageSize,
        page_num: page,
        lang: "zh-tw",
        filters: [],
      },
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

async function cacheWikiPaintingUrls(
  entryPageId: string,
  urls: string[],
): Promise<string[]> {
  const directory = path.resolve(WIKI_PAINTINGS_DIR, String(entryPageId));
  fs.mkdirSync(directory, { recursive: true });
  const cached: string[] = [];
  for (let index = 0; index < urls.length; index++) {
    const destination = path.join(directory, `${index}.png`);
    if (fs.existsSync(destination)) {
      cached[index] = destination;
      continue;
    }
    try {
      if (await downloadImage(urls[index], destination)) {
        cached[index] = destination;
      }
    } catch {
      // Preserve the remote URL as a last-resort runtime fallback below.
    }
  }
  return cached;
}

const wikiM6PaintingCache: Record<string, string | null> = {};

function normalizeWikiName(value: unknown): string {
  return String(value ?? "")
    .replace(/[「」『』\s'"’]/g, "")
    .replace(/[·・•]/g, "")
    .toLowerCase();
}

function characterWikiNames(character: any): string[] {
  return [
    character?.full_name_mi18n,
    character?.name_mi18n,
    character?.full_name,
    character?.name,
    character?.character_name,
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim())
    .filter((value, index, values) => values.indexOf(value) === index);
}

function findLocalWikiEntryId(names: string[]): string | null {
  const index = loadWikiIndex();
  const entries = Object.entries(index);
  for (const name of names) {
    const normalized = normalizeWikiName(name);
    if (!normalized) continue;
    const exact = entries.find(
      ([entryName]) => normalizeWikiName(entryName) === normalized,
    );
    if (exact) return String(exact[1]);
    const partial = entries.find(([entryName]) => {
      const candidate = normalizeWikiName(entryName);
      return candidate.includes(normalized) || normalized.includes(candidate);
    });
    if (partial) return String(partial[1]);
  }
  return null;
}

async function findRemoteWikiEntryId(names: string[]): Promise<string | null> {
  for (const name of names) {
    try {
      const response = await axios.get(
        `https://sg-wiki-api.hoyolab.com/hoyowiki/zzz/wapi/search?keyword=${encodeURIComponent(name.replace(/[「」]/g, ""))}`,
        { headers: WIKI_HEADERS },
      );
      const list: any[] = response.data?.data?.list ?? [];
      const normalized = normalizeWikiName(name);
      const entry =
        list.find((item) => normalizeWikiName(item?.name) === normalized) ??
        list.find((item) => {
          const candidate = normalizeWikiName(item?.name);
          return candidate.includes(normalized) || normalized.includes(candidate);
        }) ??
        list[0];
      if (entry) return String(entry.entry_page_id ?? entry.id);
    } catch {
      // Try the next localized name; the local cache remains the primary path.
    }
  }
  return null;
}

/** Resolve the official Wiki image for fixed M6 (影畫), never based on user rank. */
export async function getWikiM6Painting(character: any): Promise<string | null> {
  const names = characterWikiNames(character);
  const cacheKey = `${String(character?.id ?? "")}:${names.join("|")}`;
  if (Object.prototype.hasOwnProperty.call(wikiM6PaintingCache, cacheKey)) {
    return wikiM6PaintingCache[cacheKey];
  }

  let entryId = findLocalWikiEntryId(names);
  if (!entryId) entryId = await findRemoteWikiEntryId(names);
  if (!entryId) {
    wikiM6PaintingCache[cacheKey] = null;
    return null;
  }

  const localM6 = path.resolve(WIKI_PAINTINGS_DIR, entryId, "2.png");
  if (fs.existsSync(localM6)) {
    wikiM6PaintingCache[cacheKey] = localM6;
    return localM6;
  }

  const remote = await fetchWikiPaintingUrls(entryId);
  const cached = await cacheWikiPaintingUrls(entryId, remote);
  const result =
    cached[2] ??
    (fs.existsSync(localM6) ? localM6 : null) ??
    remote[2] ??
    cached[cached.length - 1] ??
    remote[remote.length - 1] ??
    remote[0] ??
    null;
  wikiM6PaintingCache[cacheKey] = result;
  return result;
}

const WIKI_INDEX_FILE = path.resolve(WIKI_PAINTINGS_DIR, "index.json");

/** Load the name→entry_page_id mapping from disk. */
export function loadWikiIndex(): Record<string, string> {
  try {
    if (fs.existsSync(WIKI_INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(WIKI_INDEX_FILE, "utf-8"));
    }
  } catch {
    /* ignore */
  }
  return {};
}

const ELEMENT_ICONS_DIR = "src/assets/images/icons/element";
const WIKI_MENU_FILTERS_URL =
  "https://sg-wiki-api.hoyolab.com/hoyowiki/zzz/wapi/get_menu_filters";

async function fetchWikiElementIcons(): Promise<Record<string, string>> {
  const res = await axios.get(WIKI_MENU_FILTERS_URL, {
    params: { menu_id: "8", lang: "zh-tw" },
    headers: WIKI_HEADERS,
  });
  if (res.data?.retcode !== 0) return {};
  return findWikiElementIcons(res.data?.data?.filters ?? []);
}

/** Download missing Wind/Lumen icons from HoYoLAB Wiki. */
export async function downloadAllElementIcons(): Promise<void> {
  const logger = new Logger("ElementIcons");
  const dir = path.resolve(ELEMENT_ICONS_DIR);
  fs.mkdirSync(dir, { recursive: true });

  let iconMap: Record<string, string>;
  try {
    iconMap = await fetchWikiElementIcons();
  } catch (e: any) {
    logger.error(`Failed to fetch official element icons: ${e?.message ?? e}`);
    return;
  }

  let downloaded = 0;
  let skipped = 0;
  for (const [filename, url] of Object.entries(iconMap)) {
    const dest = path.join(dir, filename);
    if (fs.existsSync(dest)) {
      skipped++;
      continue;
    }
    try {
      if (await downloadImage(url, dest)) {
        downloaded++;
        logger.info(`Downloaded ${filename}`);
      } else {
        logger.warn(`Rejected invalid image for ${filename}`);
      }
    } catch (e: any) {
      logger.error(`Error downloading ${filename}: ${e?.message ?? e}`);
    }
  }

  logger.success(
    `屬性圖示更新完成：新增 ${downloaded} 個，略過 ${skipped} 個已存在`,
  );
}

const DISC_ICONS_DIR = "src/assets/images/icons/diskdrives";
const NANOKA_BASE_URL = "https://static.nanoka.cc/assets/zzz";
const HB_DATA_EQUIPMENT_URL =
  "https://git.mero.moe/dimbreath/ZenlessData/raw/branch/master/FileCfg/EquipmentTemplateTb.json";
const HB_DATA_ITEM_URL =
  "https://git.mero.moe/dimbreath/ZenlessData/raw/branch/master/FileCfg/ItemTemplateTb.json";

/** Find the obfuscated key in a data array whose value equals anchor. */
export function findKeyByValue(data: any[], anchor: any): string | null {
  for (const row of data) {
    const key = Object.keys(row).find((candidate) => row[candidate] === anchor);
    if (key) return key;
  }
  return null;
}

/** Download every W-Engine icon used by signal records. */
export async function downloadAllWeaponIcons(): Promise<void> {
  const logger = new Logger("GachaWeaponIcons");
  const dir = path.dirname(weaponIconLocalPath("placeholder"));
  fs.mkdirSync(dir, { recursive: true });

  let iconMap: Record<string, string>;
  try {
    iconMap = await getGachaWeaponIconMap();
  } catch (e: any) {
    logger.error(`Failed to fetch W-Engine icon map: ${e?.message ?? e}`);
    return;
  }

  let downloaded = 0;
  let skipped = 0;
  for (const [itemId, url] of Object.entries(iconMap)) {
    const destination = weaponIconLocalPath(itemId);
    if (fs.existsSync(destination)) {
      skipped++;
      continue;
    }
    try {
      if (await downloadImage(url, destination)) downloaded++;
      else logger.warn(`Rejected invalid W-Engine image for ${itemId}`);
    } catch (e: any) {
      logger.error(`Failed W-Engine ${itemId}: ${e?.message ?? e}`);
    }
  }
  logger.success(`音擎圖示更新完成：新增 ${downloaded} 個，略過 ${skipped} 個已存在`);
}

/** Download every Bangboo portrait used by signal records. */
export async function downloadAllBangbooIcons(): Promise<void> {
  const logger = new Logger("GachaBangbooIcons");
  const dir = path.dirname(bangbooIconLocalPath("placeholder"));
  fs.mkdirSync(dir, { recursive: true });

  let iconMap: Record<string, string>;
  try {
    iconMap = await getGachaBangbooIconMap();
  } catch (e: any) {
    logger.error(`Failed to fetch Bangboo icon map: ${e?.message ?? e}`);
    return;
  }

  let downloaded = 0;
  let skipped = 0;
  for (const [itemId, url] of Object.entries(iconMap)) {
    const destination = bangbooIconLocalPath(itemId);
    if (fs.existsSync(destination)) {
      skipped++;
      continue;
    }
    try {
      if (await downloadImage(url, destination)) downloaded++;
      else logger.warn(`Rejected invalid Bangboo image for ${itemId}`);
    } catch (e: any) {
      logger.error(`Failed Bangboo ${itemId}: ${e?.message ?? e}`);
    }
  }
  logger.success(`邦布圖示更新完成：新增 ${downloaded} 個，略過 ${skipped} 個已存在`);
}

/** Fetch disc icon map: { "338_S": "https://static.nanoka.cc/assets/zzz/ItemSuitXxx_S.webp", ... } */
async function fetchDiscIconMap(): Promise<Record<string, string>> {
  const [equipRes, itemRes] = await Promise.all([
    axios.get(HB_DATA_EQUIPMENT_URL),
    axios.get(HB_DATA_ITEM_URL),
  ]);

  const equipRaw: any[] = Object.values(equipRes.data)[0] as any[];
  const itemRaw: any[] = Object.values(itemRes.data)[0] as any[];

  // Deobfuscate keys
  const kItemIDEquip = findKeyByValue(equipRaw, 31021)!;
  const kSuitID = findKeyByValue(equipRaw, 31000)!;
  const kItemIDItem = findKeyByValue(itemRaw, 31021)!;
  const kItemIcon = findKeyByValue(
    itemRaw,
    "Assets/NapResources/UI/Sprite/A1DynamicLoad/Hollow/ItemIcon/UnPacker/IconFund.png",
  )!;

  // Build ItemID → icon path map from ItemTemplateTb
  const iconByItemID: Record<number, string> = {};
  for (const row of itemRaw) {
    const itemId = row[kItemIDItem];
    const icon: string = row[kItemIcon] ?? "";
    if (icon) iconByItemID[itemId] = icon;
  }

  const result: Record<string, string> = {};
  for (const row of equipRaw) {
    const itemId: number = row[kItemIDEquip];
    const suitId: number = row[kSuitID];
    const iconPath: string = iconByItemID[itemId] ?? "";
    if (!iconPath) continue;

    const iconFile = iconPath.split("/").pop()?.split(".")[0];
    if (!iconFile) continue;

    const prefix = String(suitId).slice(0, 3);
    let rarity: string;
    if (iconFile.endsWith("_S")) rarity = "S";
    else if (iconFile.endsWith("_A")) rarity = "A";
    else if (iconFile.endsWith("_B")) rarity = "B";
    else continue;

    const key = `${prefix}_${rarity}`;
    if (!result[key]) {
      result[key] = `${NANOKA_BASE_URL}/${iconFile}.webp`;
    }
  }

  return result;
}

/** Download missing drive disc icons from nanoka CDN. Skips already-present files. */
export async function downloadAllDiscIcons(): Promise<void> {
  const logger = new Logger("DiscIcons");
  const dir = path.resolve(DISC_ICONS_DIR);
  fs.mkdirSync(dir, { recursive: true });

  let iconMap: Record<string, string>;
  try {
    iconMap = await fetchDiscIconMap();
  } catch (e: any) {
    logger.error(`Failed to fetch disc icon map: ${e?.message ?? e}`);
    return;
  }

  logger.info(
    `Found ${Object.keys(iconMap).length} disc icons in data, checking for missing...`,
  );
  let downloaded = 0;
  let skipped = 0;

  for (const [key, url] of Object.entries(iconMap)) {
    const dest = path.resolve(dir, `${key}.webp`);
    if (fs.existsSync(dest)) {
      skipped++;
      continue;
    }
    try {
      const ok = await downloadImage(url, dest);
      if (ok) {
        downloaded++;
        logger.info(`Downloaded ${key}.webp`);
      } else {
        logger.warn(`Failed to download ${key}.webp from ${url}`);
      }
    } catch (e: any) {
      logger.error(`Error downloading ${key}.webp: ${e?.message ?? e}`);
    }
  }

  logger.success(
    `驅動盤圖示更新完成：新增 ${downloaded} 個，略過 ${skipped} 個已存在`,
  );
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
    const hasAllPaintingRanks = [0, 1, 2].every((index) =>
      fs.existsSync(path.join(dir, `${index}.png`)),
    );
    if (hasAllPaintingRanks) {
      skipped++;
      continue;
    }

    const urls = await fetchWikiPaintingUrls(entry.id);
    if (urls.length === 0) continue;

    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < urls.length; i++) {
      const dest = path.join(dir, `${i}.png`);
      if (fs.existsSync(dest)) continue;
      try {
        if (await downloadImage(urls[i], dest)) downloaded++;
      } catch (e: any) {
        logger.error(`Failed ${entry.name}[${i}]: ${e?.message ?? e}`);
      }
    }

    // Small delay to avoid rate-limiting.
    await new Promise((r) => setTimeout(r, 300));
  }

  logger.success(
    `意象影畫下載完成：新增 ${downloaded} 張，略過 ${skipped} 個已存在角色`,
  );
}
