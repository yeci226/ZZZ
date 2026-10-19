import { readFile } from "node:fs/promises";
import path from "node:path";

export type GachaRank = "S" | "A" | "B";
export interface GachaResultItem {
  id: string;
  name: string;
  rank: GachaRank;
  /** Local asset, never a user-supplied URL. */
  image: string;
  crop?: readonly [number, number, number, number];
  isNew?: boolean;
}

export const GACHA_CENTER_OUT = [6, 4, 5, 2, 9, 1, 7, 3, 8, 10] as const;
export const DEFAULT_GACHA_CACHE = path.resolve("src/assets/gacha-simulation/r4-pair-r1");

export function gachaRanks(items: readonly Pick<GachaResultItem, "rank">[]): string {
  if (![1, 10].includes(items.length) || items.some(i => !["S", "A", "B"].includes(i.rank))) {
    throw new Error("調頻結果必須是 1 個或 10 個有效的 S／A／B 項目。");
  }
  return items.map(i => i.rank).sort((a, b) => "SAB".indexOf(a) - "SAB".indexOf(b)).join("");
}

export function gachaCacheKey(items: readonly Pick<GachaResultItem, "rank">[]): string {
  const ranks = gachaRanks(items);
  if (ranks.length === 1) return `single-${ranks.toLowerCase()}`;
  return "ten-" + ["S", "A", "B"].map(r => `${r.toLowerCase()}${String([...ranks].filter(x => x === r).length).padStart(2, "0")}`).join("-");
}

export interface GachaGifFile {
  file: string;
  bytes: number;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  /** Extra final-frame dwell, separate from the original animation duration. */
  endHoldMs?: number;
  /** Exact decoded last frame of this GIF, with no reframing. */
  lastFrame: string;
  /** Populated only by the upload script after public URL verification. */
  remoteUrl?: string;
}
export interface GachaAnimation {
  key: string;
  ranks: string;
  directory: string;
  gifs: GachaGifFile[];
  lastFrame: string;
}

function cachePath(root: string, file: string): string {
  const resolved = path.resolve(root, file);
  if (path.isAbsolute(file) || !resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new Error("Invalid gacha cache asset path");
  }
  return resolved;
}

/** A missing count variant must never silently play another result's animation. */
export async function loadGachaAnimation(
  items: readonly GachaResultItem[],
  directory = process.env.ZZZ_GACHA_CACHE_DIR || DEFAULT_GACHA_CACHE,
): Promise<GachaAnimation> {
  const key = gachaCacheKey(items);
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const variant = manifest.variants?.[key];
  if (manifest.schemaVersion !== 1 || !variant || variant.ranks !== gachaRanks(items)) {
    throw new Error(`這組調頻動畫尚未準備完成：${key}`);
  }
  if (!Array.isArray(variant.gifs) || !variant.gifs.length) throw new Error("Missing cached GIF");
  const gifs: GachaGifFile[] = variant.gifs.map((f: GachaGifFile) => {
    if (![f.bytes, f.width, f.height, f.fps, f.durationMs].every(v => Number.isFinite(v) && v > 0) || f.durationMs > 120_000) {
      throw new Error("Invalid GIF metadata");
    }
    if (f.endHoldMs !== undefined && (!Number.isFinite(f.endHoldMs) || f.endHoldMs < 0 || f.endHoldMs >= f.durationMs)) {
      throw new Error("Invalid GIF ending duration");
    }
    if (f.remoteUrl && (new URL(f.remoteUrl).protocol !== "https:" || new URL(f.remoteUrl).username || new URL(f.remoteUrl).password)) throw new Error("Invalid animation CDN URL");
    return { ...f, file: cachePath(directory, f.file), lastFrame: cachePath(directory, f.lastFrame) };
  });
  return { key, ranks: variant.ranks, directory, gifs, lastFrame: cachePath(directory, variant.lastFrame) };
}

export async function readGachaGif(file: GachaGifFile): Promise<Buffer> {
  const data = await readFile(file.file);
  if (data.length !== file.bytes || !/^GIF8[79]a$/.test(data.subarray(0, 6).toString("ascii"))) {
    throw new Error("Cached GIF is incomplete; rebuild the animation cache");
  }
  return data;
}
