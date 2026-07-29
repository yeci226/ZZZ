import fs from "fs";
import path from "path";
import axios from "axios";

const FLAT_SUIT_ICONS_DIR = "src/assets/images/icons/disk-suits";
const NANOKA_BASE_URL = "https://static.nanoka.cc/assets/zzz";
const HB_DATA_EQUIPMENT_SUIT_URL =
  "https://git.mero.moe/dimbreath/ZenlessData/raw/branch/master/FileCfg/EquipmentSuitTemplateTb.json";

function findKeyByValue(data: any[], anchor: any): string | null {
  for (const row of data) {
    const key = Object.keys(row).find((candidate) => row[candidate] === anchor);
    if (key) return key;
  }
  return null;
}

/** Build suit ID → official flat IconSuit URL from the obfuscated suit table. */
export function buildFlatSuitIconMap(data: any[]): Record<string, string> {
  const suitIdKey = findKeyByValue(data, 31000);
  const iconAnchor =
    "UI/Sprite/A1DynamicLoad/IconSuit/UnPacker/SuitWoodpeckerElectro.png";
  const iconKey =
    findKeyByValue(data, iconAnchor) ??
    data
      .flatMap((row) => Object.keys(row))
      .find((key) =>
        data.some(
          (row) =>
            typeof row[key] === "string" &&
            row[key].includes("/IconSuit/UnPacker/Suit"),
        ),
      ) ??
    null;

  if (!suitIdKey || !iconKey) return {};

  const result: Record<string, string> = {};
  for (const row of data) {
    const suitId = Number(row[suitIdKey]);
    const iconPath = String(row[iconKey] ?? "");
    const iconFile = iconPath
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "");
    if (!Number.isFinite(suitId) || !iconFile) continue;
    result[String(suitId)] = `${NANOKA_BASE_URL}/${iconFile}.webp`;
  }
  return result;
}

let flatSuitIconMapPromise: Promise<Record<string, string>> | null = null;

async function fetchFlatSuitIconMap(): Promise<Record<string, string>> {
  flatSuitIconMapPromise ??= axios
    .get(HB_DATA_EQUIPMENT_SUIT_URL)
    .then((response) => {
      const rows = Object.values(response.data)[0] as any[];
      return buildFlatSuitIconMap(rows);
    })
    .catch((error) => {
      flatSuitIconMapPromise = null;
      throw error;
    });
  return flatSuitIconMapPromise;
}

const flatSuitIconDownloads = new Map<string, Promise<string | null>>();

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

async function downloadFlatSuitIcon(
  url: string,
  destination: string,
): Promise<boolean> {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(response.data);
  if (!isWebp(buffer)) return false;

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, buffer);
    fs.renameSync(temporary, destination);
    return true;
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

/** Resolve one official flat IconSuit image, downloading and caching it when absent. */
export async function getFlatSuitIcon(
  suitId: string | number,
): Promise<string | null> {
  const id = String(suitId || "");
  if (!id) return null;

  const destination = path.resolve(FLAT_SUIT_ICONS_DIR, `${id}.webp`);
  if (fs.existsSync(destination)) return destination;

  const existing = flatSuitIconDownloads.get(id);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const iconMap = await fetchFlatSuitIconMap();
      const url = iconMap[id];
      if (!url) return null;
      return (await downloadFlatSuitIcon(url, destination))
        ? destination
        : null;
    } catch {
      return null;
    } finally {
      flatSuitIconDownloads.delete(id);
    }
  })();

  flatSuitIconDownloads.set(id, pending);
  return pending;
}
