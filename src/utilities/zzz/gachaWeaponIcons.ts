import axios from "axios";
import fs from "node:fs";
import path from "node:path";

const GACHA_WEAPON_ICONS_DIR = "src/assets/images/icons/gacha/weapon-big";
const NANOKA_BASE_URL = "https://static.nanoka.cc/assets/zzz";
const HB_DATA_ITEM_URL =
  "https://git.mero.moe/dimbreath/ZenlessData/raw/branch/master/FileCfg/ItemTemplateTb.json";

function findKeyByValue(data: any[], anchor: any): string | null {
  for (const row of data) {
    const key = Object.keys(row).find((candidate) => row[candidate] === anchor);
    if (key) return key;
  }
  return null;
}

export function weaponIconMapFromItems(itemRows: any[]): Record<string, string> {
  const itemIdKey = findKeyByValue(itemRows, 31021);
  const iconKey = itemRows.flatMap((row) => Object.entries(row))
    .find(([, value]) => typeof value === "string" && /\/ItemIconWeaponBig\/UnPacker\//i.test(value))?.[0];
  if (!itemIdKey || !iconKey) return {};

  const result: Record<string, string> = {};
  for (const row of itemRows) {
    const itemId = String(row?.[itemIdKey] ?? "");
    const iconPath = String(row?.[iconKey] ?? "");
    if (!itemId || !/\/ItemIconWeaponBig\/UnPacker\/[^/]+\.(?:png|webp)$/i.test(iconPath)) continue;
    const iconFile = path.basename(iconPath, path.extname(iconPath));
    if (iconFile) result[itemId] = `${NANOKA_BASE_URL}/${iconFile}.webp`;
  }
  return result;
}

let weaponIconMapPromise: Promise<Record<string, string>> | null = null;

export function getGachaWeaponIconMap(): Promise<Record<string, string>> {
  weaponIconMapPromise ??= axios.get(HB_DATA_ITEM_URL).then((response) => {
    const itemRows = Object.values(response.data)[0] as any[];
    return weaponIconMapFromItems(Array.isArray(itemRows) ? itemRows : []);
  }).catch((error) => {
    weaponIconMapPromise = null;
    throw error;
  });
  return weaponIconMapPromise;
}

export function weaponIconLocalPath(itemId: string | number): string {
  return path.resolve(GACHA_WEAPON_ICONS_DIR, `${String(itemId)}.webp`);
}

export async function resolveGachaWeaponIcon(itemId: string | number): Promise<string | null> {
  const local = weaponIconLocalPath(itemId);
  if (fs.existsSync(local)) return local;
  try {
    return (await getGachaWeaponIconMap())[String(itemId)] ?? null;
  } catch {
    return null;
  }
}
