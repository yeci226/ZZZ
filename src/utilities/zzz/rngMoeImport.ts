import axios from "axios";

import {
  type GachaArchiveRecord,
  type GachaArchiveStore,
  type GachaChannelCategory,
  type GachaMergeResult,
  getGachaArchiveStore,
} from "./gachaArchive.js";

export const RNG_MOE_BACKUP_MAX_BYTES = 10 * 1024 * 1024;
export const RNG_MOE_DOWNLOAD_TIMEOUT_MS = 30_000;
const SUPPORTED_ROOT_VERSION = 1;
const SUPPORTED_PROFILE_VERSION = 11;
const GACHA_TYPES: Record<string, GachaChannelCategory> = {
  "1001": "standard",
  "2001": "character_up",
  "3001": "weapon_up",
  "5001": "bangboo",
  "12001": "character_return",
  "13001": "weapon_return",
};

export interface RngMoeProfileSummary {
  key: string;
  name: string;
  uid: string;
  recordCount: number;
}

export interface ParsedRngMoeBackup {
  root: Record<string, unknown>;
  profiles: RngMoeProfileSummary[];
}

export interface RngMoeImportResult extends GachaMergeResult {
  uid: string;
  total: number;
}

type ItemMetadata = { name: string; itemType: string };
type ItemCatalog = Record<string, ItemMetadata>;

function object(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 格式不正確`);
  }
  return value as Record<string, any>;
}

function profileRows(root: Record<string, any>): Array<[string, Record<string, any>]> {
  if (root.version !== SUPPORTED_ROOT_VERSION || root.game !== "zzz") {
    throw new Error("這不是支援的 rng.moe 絕區零備份版本");
  }
  const data = object(root.data, "備份 data");
  const profiles = object(data.profiles, "備份 profiles");
  const rows: Array<[string, Record<string, any>]> = Object.entries(profiles)
    .map(([key, value]) => [key, object(value, `Profile ${key}`)]);
  if (!rows.length) throw new Error("備份內沒有任何 Profile");
  if (rows.some(([key]) => !/^\d{1,12}$/.test(key))) throw new Error("備份含有無效的 Profile ID");
  return rows;
}

function profileItems(profile: Record<string, any>): Record<string, unknown[]> {
  const version = Number(profile.version);
  if (!Number.isInteger(version) || version < 1 || version > SUPPORTED_PROFILE_VERSION) {
    throw new Error(`不支援的 rng.moe Profile 版本：${String(profile.version ?? "未知")}`);
  }
  const stores = object(profile.stores, "Profile stores");
  const gacha = object(stores[0] ?? stores["0"], "Profile 抽卡資料");
  const items = object(gacha.items, "Profile 抽卡紀錄");
  for (const [type, list] of Object.entries(items)) {
    if (!(type in GACHA_TYPES) && Array.isArray(list) && list.length > 0) {
      throw new Error(`不支援的 rng.moe 抽卡頻道：${type}`);
    }
  }
  const result: Record<string, unknown[]> = {};
  for (const [type, category] of Object.entries(GACHA_TYPES)) {
    void category;
    const list = items[type] ?? [];
    if (!Array.isArray(list)) throw new Error(`頻道 ${type} 的抽卡紀錄格式不正確`);
    result[type] = list;
  }
  return result;
}

export function parseRngMoeBackup(input: string | Buffer): ParsedRngMoeBackup {
  const bytes = typeof input === "string" ? Buffer.byteLength(input) : input.byteLength;
  if (bytes > RNG_MOE_BACKUP_MAX_BYTES) throw new Error("rng.moe JSON 檔案不可超過 10 MiB");
  let root: Record<string, any>;
  try {
    root = object(JSON.parse(input.toString()), "備份");
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("rng.moe JSON 檔案已損壞或不是 JSON");
    throw error;
  }
  const profiles = profileRows(root).map(([key, profile]) => {
    const items = profileItems(profile);
    return {
      key,
      name: (String(profile.name ?? "").trim() || `Profile ${key}`).slice(0, 80),
      uid: profile.bindUid === null || profile.bindUid === undefined ? "" : String(profile.bindUid),
      recordCount: Object.values(items).reduce((sum, list) => sum + list.length, 0),
    };
  });
  return { root, profiles };
}

function rarity(value: unknown): string {
  const rank = Number(value);
  if (rank === 4) return "S";
  if (rank === 3) return "A";
  if (rank === 2) return "B";
  throw new Error(`未知的 rng.moe 稀有度：${String(value)}`);
}

function recordTime(value: unknown): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("抽卡時間戳記缺失或失真");
  }
  const date = new Date(value);
  const earliest = Date.UTC(2024, 5, 1);
  if (Number.isNaN(date.getTime()) || value < earliest || value > Date.now() + 86_400_000) {
    throw new Error(`抽卡時間戳記超出合理範圍：${String(value)}`);
  }
  return date.toISOString();
}

function recordId(value: unknown): string {
  // JSON numbers cannot represent HoYoverse's 19-digit IDs without precision
  // loss, so a numeric value must be rejected rather than silently rounded.
  if (typeof value !== "string" || !/^\d{16,24}$/.test(value)) {
    throw new Error("抽卡紀錄 ID 缺失或失真；請重新從 rng.moe 匯出原始 JSON");
  }
  return value;
}

function itemId(value: unknown): string {
  const id = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : String(value ?? "");
  if (!/^\d{3,10}$/.test(id)) throw new Error(`無效的物品 ID：${id || "缺失"}`);
  return id;
}

function itemTypeFor(id: string, category: GachaChannelCategory): string {
  if (category === "bangboo" || Number(id) >= 50_000) return "邦布";
  if (Number(id) >= 10_000) return "音擎";
  return "代理人";
}

function convertProfile(
  profile: Record<string, any>,
  ownerId: string,
  uid: string,
  catalog: ItemCatalog,
): GachaArchiveRecord[] {
  const records: GachaArchiveRecord[] = [];
  const seen = new Set<string>();
  for (const [type, rows] of Object.entries(profileItems(profile))) {
    const category = GACHA_TYPES[type]!;
    for (const rawValue of rows) {
      const raw = object(rawValue, `頻道 ${type} 的抽卡紀錄`);
      if (raw.manual === true) throw new Error("備份含有 rng.moe 人工建立的紀錄，無法匯入");
      const id = recordId(raw.uid);
      if (seen.has(id)) throw new Error(`備份內有重複的抽卡紀錄 ID：${id}`);
      seen.add(id);
      const item = itemId(raw.id);
      const metadata = catalog[item];
      records.push({
        ownerId,
        uid,
        source: "rng_moe",
        gachaType: type,
        channelCategory: category,
        // rng.moe's banner number belongs to its own catalogue. The storage
        // provenance table retains it; it must not be treated as an official ID.
        bannerId: raw.gacha === undefined || raw.gacha === null ? null : `rng:${String(raw.gacha)}`,
        recordId: id,
        itemId: item,
        name: metadata?.name ?? `物品 ${item}`,
        itemType: metadata?.itemType ?? itemTypeFor(item, category),
        rarity: rarity(raw.rarity),
        pulledAt: recordTime(raw.timestamp),
        isUp: category === "bangboo" && Number(raw.rarity) === 4 ? true : null,
      });
    }
  }
  return records;
}

export async function downloadRngMoeBackup(url: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: RNG_MOE_DOWNLOAD_TIMEOUT_MS,
    maxContentLength: RNG_MOE_BACKUP_MAX_BYTES,
    maxBodyLength: RNG_MOE_BACKUP_MAX_BYTES,
  });
  const buffer = Buffer.from(response.data);
  if (buffer.byteLength > RNG_MOE_BACKUP_MAX_BYTES) throw new Error("rng.moe JSON 檔案不可超過 10 MiB");
  return buffer;
}

let catalogPromise: Promise<ItemCatalog> | null = null;

/** Read the public localized item table used by rng.moe. Import still works
 * with ID labels if the optional catalogue is temporarily unavailable. */
export async function loadRngMoeItemCatalog(): Promise<ItemCatalog> {
  catalogPromise ??= axios.get<string>("https://zzz.rng.moe/en/tracker", { timeout: 8_000 })
    .then(async ({ data: html }) => {
      const scripts = [...html.matchAll(/(?:src|href)="([^"?]+\.js)"/g)]
        .map((match) => new URL(match[1]!, "https://zzz.rng.moe/en/tracker").href)
        .filter((url) => url.startsWith("https://zzz.rng.moe/_out/immutable/"));
      for (const script of scripts.reverse()) {
        try {
          const code = String((await axios.get<string>(script, { timeout: 8_000 })).data);
          const match = code.match(/data\/zzz\/zh\/gachaConfig\.json"[^]*?import\("\.\/chunks\/([^"?]+\.js)"\)/);
          if (!match) continue;
          const itemCode = String((await axios.get<string>(new URL(`./chunks/${match[1]}`, script).href, {
            timeout: 8_000,
          })).data);
          const catalog: ItemCatalog = {};
          for (const row of itemCode.matchAll(/(\d+):\{id:\d+,(?:key:"(?:\\.|[^"])*",)?name:("(?:\\.|[^"])*")[^}]*?type:(\d+)/g)) {
            const id = row[1]!;
            const name = JSON.parse(row[2]!);
            const type = Number(row[3]);
            catalog[id] = { name, itemType: type === 2 ? "邦布" : type === 1 ? "音擎" : "代理人" };
          }
          if (Object.keys(catalog).length) return catalog;
        } catch {
          // Try the next first-party application bundle.
        }
      }
      return {};
    })
    .catch(() => ({}));
  return catalogPromise;
}

export async function importRngMoeProfile(options: {
  ownerId: string;
  backup: ParsedRngMoeBackup;
  profileKey: string;
  uid?: string;
  archive?: GachaArchiveStore;
  catalog?: ItemCatalog;
}): Promise<RngMoeImportResult> {
  const entry = profileRows(options.backup.root as Record<string, any>)
    .find(([key]) => key === options.profileKey);
  if (!entry) throw new Error("找不到所選的 rng.moe Profile");
  const [, profile] = entry;
  const profileUid = profile.bindUid === null || profile.bindUid === undefined ? "" : String(profile.bindUid);
  const suppliedUid = String(options.uid ?? "").trim();
  if (profileUid && suppliedUid && profileUid !== suppliedUid) {
    throw new Error(`備份 UID（${profileUid}）與指定 UID（${suppliedUid}）不一致`);
  }
  const uid = profileUid || suppliedUid;
  if (!/^\d{8,10}$/.test(uid)) throw new Error("這個 Profile 沒有 UID，請在指令中提供遊戲 UID");
  const archive = options.archive ?? getGachaArchiveStore();
  const records = convertProfile(
    profile,
    options.ownerId,
    uid,
    options.catalog ?? await loadRngMoeItemCatalog(),
  );
  if (!records.length) throw new Error("所選 Profile 沒有可匯入的抽卡紀錄");
  const merged = archive.mergeRecords(records);
  archive.classifyUnresolvedUpRecords({ ownerId: options.ownerId, uid, source: "rng_moe", region: "" });
  return { ...merged, uid, total: records.length };
}
