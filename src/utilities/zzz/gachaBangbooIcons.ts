import axios from "axios";
import fs from "node:fs";
import path from "node:path";

const GACHA_BANGBOO_ICONS_DIR = "src/assets/images/icons/gacha/bangboo";
const NANOKA_BASE_URL = "https://static.nanoka.cc/assets/zzz";
const GACHA_ITEM_RESOURCE_URL =
  "https://git.mero.moe/dimbreath/ZenlessData/raw/branch/master/FileCfg/GachaItemResourceTemplateTb.json";

function findKeyByValue(data: any[], anchors: unknown[]): string | null {
  for (const anchor of anchors) {
    for (const row of data) {
      const key = Object.keys(row).find((candidate) => row[candidate] === anchor);
      if (key) return key;
    }
  }
  return null;
}

export function bangbooIconMapFromItems(itemRows: any[]): Record<string, string> {
  const itemIdKey = findKeyByValue(itemRows, [54010, 53001, 54023]);
  const artKey = itemRows.flatMap((row) => Object.entries(row))
    .find(([, value]) => typeof value === "string"
      && /\/BangbooModGarage\/UnPacker\/BangbooRole\/[^/]+\.(?:png|webp)$/i.test(value))?.[0];
  if (!itemIdKey || !artKey) return {};

  const result: Record<string, string> = {};
  for (const row of itemRows) {
    const itemId = String(row?.[itemIdKey] ?? "");
    const artPath = String(row?.[artKey] ?? "");
    if (!itemId || !/\/BangbooModGarage\/UnPacker\/BangbooRole\/[^/]+\.(?:png|webp)$/i.test(artPath)) continue;
    const artFile = path.basename(artPath, path.extname(artPath));
    if (artFile) result[itemId] = `${NANOKA_BASE_URL}/${artFile}.webp`;
  }
  return result;
}

let bangbooIconMapPromise: Promise<Record<string, string>> | null = null;

export function getGachaBangbooIconMap(): Promise<Record<string, string>> {
  bangbooIconMapPromise ??= axios.get(GACHA_ITEM_RESOURCE_URL).then((response) => {
    const itemRows = Object.values(response.data)[0] as any[];
    return bangbooIconMapFromItems(Array.isArray(itemRows) ? itemRows : []);
  }).catch((error) => {
    bangbooIconMapPromise = null;
    throw error;
  });
  return bangbooIconMapPromise;
}

export function bangbooIconLocalPath(itemId: string | number): string {
  return path.resolve(GACHA_BANGBOO_ICONS_DIR, `${String(itemId)}.webp`);
}

export async function resolveGachaBangbooIcon(itemId: string | number): Promise<string | null> {
  const id = String(itemId).trim();
  if (!id) return null;
  const local = bangbooIconLocalPath(id);
  if (fs.existsSync(local)) return local;
  try {
    return (await getGachaBangbooIconMap())[id] ?? null;
  } catch {
    return null;
  }
}
