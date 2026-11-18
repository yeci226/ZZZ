import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AnalyzedGachaRecord } from "./gachaAnalysis.js";
import { getZzzOfficialFont, getZzzOfficialNumberFont } from "./canvasFonts.js";
import { resolveGachaWeaponIcon } from "./gachaWeaponIcons.js";
import { resolveGachaBangbooIcon } from "./gachaBangbooIcons.js";
import {
  loadGtCardMetadataImages,
  safeGtCardImage,
  type GtCardItem,
  type GtCardKind,
  type GtCardRank,
} from "./gtCardRenderer.js";

export const WIDTH = 1000;
export const OUTPUT_SCALE = 2;
export const IMAGE_DIR = join(".", "src", "assets", "images");
const OFFICIAL_CDN = "https://act-webstatic.hoyoverse.com/game_record/zzzv2";
const remoteImageCache = new Map<string, Promise<Image | null>>();

export const PAPER = {
  paper: "#f4eee7",
  paperBright: "#fbf7f0",
  ink: "#171719",
  muted: "#817a75",
  line: "#ddd5cb",
  s: "#f08a24",
  a: "#8d55bb",
  b: "#e8e1d7",
  lost: "#de493e",
  defaultAccent: "#de493e",
} as const;

export const NUMBER_FONT = "Nunito";

export function createScaledCanvas(height: number) {
  const canvas = createCanvas(WIDTH * OUTPUT_SCALE, Math.ceil(height) * OUTPUT_SCALE);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.scale(OUTPUT_SCALE, OUTPUT_SCALE);
  return { canvas, ctx };
}

export function drawPaper(ctx: SKRSContext2D, height: number): void {
  ctx.fillStyle = PAPER.paper;
  ctx.fillRect(0, 0, WIDTH, height);
}

export function drawGlassCard(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { border?: string; radius?: number } = {},
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, options.radius ?? 14);
  ctx.fillStyle = "rgba(255,255,255,.78)";
  ctx.fill();
  ctx.strokeStyle = options.border ?? PAPER.line;
  ctx.lineWidth = options.border ? 2 : 1;
  ctx.stroke();
}

export const POSTER_WIDTH = 264;
export const CONTENT_X = 284;
export const CONTENT_WIDTH = 700;
export const PAGE_MARGIN = 16;
export const MIN_IMAGE_HEIGHT = 560;
export const MAX_IMAGE_HEIGHT = 1100;

/** Pity tone by position / hardPity; the same scale is used by every view. */
export function pityTone(position: number | null, hardPity: number): string {
  if (position === null) return PAPER.muted;
  const ratio = position / hardPity;
  return ratio >= .84 ? "#d9473b" : ratio >= .58 ? "#c9870f" : "#2f8f6f";
}

export function progressColor(position: number | null, hardPity: number): string {
  return pityTone(position, hardPity);
}

/** Yellow "UP" tag whose right edge sits at `right`. */
export function drawUpTag(ctx: SKRSContext2D, right: number, top: number, size: number): void {
  ctx.font = `${size}px ${NUMBER_FONT}`;
  const width = ctx.measureText("UP").width + size * .8;
  const height = size * 1.35;
  ctx.beginPath();
  ctx.roundRect(right - width, top, width, height, 5);
  ctx.fillStyle = "#ffd21f";
  ctx.fill();
  ctx.strokeStyle = PAPER.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  numberText(ctx, "UP", right - width / 2, top + height / 2 + 1, size, PAPER.ink, "center");
}

/** Rounded colour block with a white pity number. */
export function drawPityPill(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  color: string,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fillStyle = color;
  ctx.fill();
  numberText(ctx, label, x + width / 2, y + height / 2 + 1, height * .74, "#ffffff", "center");
}

export interface FittedLocaleText { font: string; text: string; width: number }

/** Shrink down to 70% of `size`, then truncate with an ellipsis; measured in the drawing font. */
export function fitLocaleText(
  ctx: SKRSContext2D,
  locale: string | undefined,
  value: unknown,
  size: number,
  bold = false,
  maxWidth?: number,
): FittedLocaleText {
  const family = getZzzOfficialFont(locale);
  const original = String(value ?? "");
  const fontAt = (px: number) => `${bold ? "bold " : ""}${px}px ${family}`;
  ctx.font = fontAt(size);
  let width = ctx.measureText(original).width;
  if (maxWidth === undefined || width <= maxWidth) return { font: fontAt(size), text: original, width };
  const floor = Math.max(1, Math.floor(size * .7));
  for (let px = size - 1; px >= floor; px--) {
    ctx.font = fontAt(px);
    width = ctx.measureText(original).width;
    if (width <= maxWidth) return { font: fontAt(px), text: original, width };
  }
  const chars = Array.from(original);
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars.pop();
  const truncated = `${chars.join("")}…`;
  return { font: fontAt(floor), text: truncated, width: ctx.measureText(truncated).width };
}

/** Draws text in the locale's official font and returns the drawn width. */
export function localeText(
  ctx: SKRSContext2D,
  locale: string | undefined,
  value: unknown,
  x: number,
  y: number,
  size: number,
  color: string,
  options: { align?: CanvasTextAlign; bold?: boolean; maxWidth?: number } = {},
): number {
  const fitted = fitLocaleText(ctx, locale, value, size, options.bold, options.maxWidth);
  ctx.font = fitted.font;
  ctx.fillStyle = color;
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = "middle";
  ctx.fillText(fitted.text, x, y);
  return fitted.width;
}

export function numberText(
  ctx: SKRSContext2D,
  value: unknown,
  x: number,
  y: number,
  size: number,
  color: string = PAPER.ink,
  align: CanvasTextAlign = "left",
): void {
  ctx.font = `${size}px ${NUMBER_FONT}, ${getZzzOfficialNumberFont("tw")}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(String(value ?? ""), x, y);
}

export function fit(ctx: SKRSContext2D, value: unknown, width: number): string {
  const original = String(value ?? "");
  if (ctx.measureText(original).width <= width) return original;
  let result = original;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > width) result = result.slice(0, -1);
  return `${result}…`;
}

export function text(
  ctx: SKRSContext2D,
  value: unknown,
  x: number,
  y: number,
  size: number,
  color = "#f3f3f3",
  align: CanvasTextAlign = "left",
  numberFont = false,
): void {
  ctx.font = `${size}px ${numberFont ? getZzzOfficialNumberFont("tw") : getZzzOfficialFont("tw")}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(String(value ?? ""), x, y);
}

export function fitWithFont(ctx: SKRSContext2D, value: string, width: number, size: number): string {
  ctx.font = `${size}px ${getZzzOfficialFont("tw")}`;
  return fit(ctx, value, width);
}

export function fittedNumberSize(
  ctx: SKRSContext2D,
  value: unknown,
  maxWidth: number,
  preferredSize: number,
): number {
  const label = String(value ?? "");
  for (let size = preferredSize; size >= 10; size--) {
    ctx.font = `${size}px ${getZzzOfficialNumberFont("tw")}`;
    if (ctx.measureText(label).width <= maxWidth) return size;
  }
  return 10;
}

export function itemIcon(record: AnalyzedGachaRecord): string {
  const id = Number(record.itemId);
  if (!Number.isFinite(id) || id <= 0) return "";
  if (id < 10000) return `${OFFICIAL_CDN}/role_square_avatar/role_square_avatar_${record.itemId}.png`;
  if (id < 50000) return `${OFFICIAL_CDN}/weapon_square_avatar/weapon_square_avatar_${record.itemId}.png`;
  return `${OFFICIAL_CDN}/bangboo_square_avatar/bangboo_square_avatar_${record.itemId}.png`;
}

export async function remoteImage(url: string): Promise<Image | null> {
  if (!url) return null;
  const cached = remoteImageCache.get(url);
  if (cached) return cached;
  const request = (async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
      if (!response.ok) return null;
      return await loadImage(Buffer.from(await response.arrayBuffer()));
    } catch {
      return null;
    }
  })();
  remoteImageCache.set(url, request);
  // Decoded images are large; keep only the most recent ones.
  if (remoteImageCache.size > 64) remoteImageCache.delete(remoteImageCache.keys().next().value!);
  return request;
}

interface GtCardSourceItem {
  id: string;
  itemType: string;
  rarity: GtCardRank;
  icon?: string;
  elementType?: number;
  subElementType?: number;
  profession?: string | number;
}

export function gtCardKind(itemType: string, itemId: string): GtCardKind {
  const type = itemType.toLowerCase();
  if (type.includes("weapon") || type.includes("音擎")) return "weapon";
  if (type.includes("bangboo") || type.includes("邦布")) return "bangboo";
  if (type.includes("character") || type.includes("代理人") || type.includes("角色")) return "character";
  const numeric = Number(itemId);
  if (Number.isFinite(numeric)) {
    if (numeric < 10_000) return "character";
    if (numeric < 50_000) return "weapon";
    return "bangboo";
  }
  return "unknown";
}

async function loadSquareItemImage(item: GtCardSourceItem): Promise<Image | null> {
  const kind = gtCardKind(item.itemType, item.id);
  if (kind === "weapon") {
    const source = await resolveGachaWeaponIcon(item.id);
    if (source) {
      const image = /^https?:\/\//i.test(source)
        ? await remoteImage(source)
        : await safeGtCardImage(source);
      if (image) return image;
    }
  } else if (kind === "bangboo") {
    const source = await resolveGachaBangbooIcon(item.id);
    if (source) {
      const image = /^https?:\/\//i.test(source)
        ? await remoteImage(source)
        : await safeGtCardImage(source);
      if (image) return image;
    }
  }
  if (item.icon) {
    const direct = /^https?:\/\//i.test(item.icon)
      ? await remoteImage(item.icon)
      : await safeGtCardImage(item.icon);
    if (direct) return direct;
  }
  const local = kind === "character"
    ? join(IMAGE_DIR, "zzz", "paintings", `role_square_avatar_${item.id}.png`)
    : "";
  if (local && existsSync(local)) {
    const image = await safeGtCardImage(local);
    if (image) return image;
  }
  return remoteImage(itemIcon({ itemId: item.id, itemType: item.itemType } as AnalyzedGachaRecord));
}

export async function prepareGtCard(source: GtCardSourceItem) {
  const item: GtCardItem = {
    id: source.id,
    rarity: source.rarity,
    elementType: source.elementType,
    subElementType: source.subElementType,
    profession: source.profession,
  };
  const [art, metadata] = await Promise.all([
    loadSquareItemImage(source),
    loadGtCardMetadataImages(item),
  ]);
  return {
    item,
    kind: gtCardKind(source.itemType, source.id),
    images: { art, ...metadata },
  };
}

/** Square-art card source for one S entry (no banner metadata). */
export function prepareSCard(entry: { itemId: string; kind: string }) {
  const itemType = entry.kind === "character" || entry.kind === "weapon" || entry.kind === "bangboo" ? entry.kind : "";
  return prepareGtCard({ id: entry.itemId, itemType, rarity: "S" });
}
