import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { normalizeRank, type AnalyzedGachaRecord } from "./gachaAnalysis.js";
import { getZzzOfficialFont, getZzzOfficialNumberFont, normalizeZzzLocale } from "./canvasFonts.js";
import { resolveGachaWeaponIcon } from "./gachaWeaponIcons.js";
import { resolveGachaBangbooIcon } from "./gachaBangbooIcons.js";
import {
  loadGtCardMetadataImages,
  safeGtCardImage,
  type GtCardItem,
  type GtCardKind,
  type GtCardRank,
} from "./gtCardRenderer.js";
import { getPaperAccent, safeAccent } from "./profileColors.js";
import { signalCategoryText, signalText } from "./recordText.js";
import type { SignalLogRenderInput } from "./signalLogRenderer.js";

export const WIDTH = 1000;
export const OUTPUT_SCALE = 2;
export const IMAGE_DIR = join(".", "src", "assets", "images");
const PORTRAIT_DIR = join(".", "src", "assets", "gacha-simulation", "ui", "characters");
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

/** Same thresholds as the dark renderer, with tones that stay readable on paper. */
export function progressColor(position: number | null, hardPity: number): string {
  if (position === null) return PAPER.muted;
  const ratio = position / hardPity;
  return ratio >= .84 ? "#d9473b" : ratio >= .58 ? "#d99a1e" : "#3e9c7c";
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

export interface WrappedName {
  lines: string[];
  size: number;
  lineHeight: number;
}

export function wrapNameLines(ctx: SKRSContext2D, value: unknown, width: number, size: number): string[] {
  const source = String(value ?? "").trim();
  if (!source) return [""];
  ctx.font = `${size}px ${getZzzOfficialFont("tw")}`;
  const lines: string[] = [];
  let line = "";
  for (const character of Array.from(source)) {
    const candidate = `${line}${character}`;
    if (line && ctx.measureText(candidate).width > width) {
      lines.push(line.trimEnd());
      line = character.trimStart();
    } else {
      line = candidate;
    }
  }
  if (line || !lines.length) lines.push(line.trimEnd());
  return lines;
}

export function wrappedName(
  ctx: SKRSContext2D,
  value: unknown,
  width: number,
  preferredSize: number,
  maxLines: number,
  minimumSize: number,
): WrappedName {
  for (let size = preferredSize; size >= minimumSize; size -= 1) {
    const lines = wrapNameLines(ctx, value, width, size);
    if (lines.length <= maxLines || size === minimumSize) {
      return { lines, size, lineHeight: Math.ceil(size * 1.25) };
    }
  }
  return { lines: [String(value ?? "")], size: minimumSize, lineHeight: Math.ceil(minimumSize * 1.25) };
}

export function drawWrappedName(
  ctx: SKRSContext2D,
  layout: WrappedName,
  x: number,
  firstBaseline: number,
  color = "#f0f1f0",
  align: CanvasTextAlign = "center",
): void {
  layout.lines.forEach((line, index) => {
    text(ctx, line, x, firstBaseline + index * layout.lineHeight, layout.size, color, align);
  });
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
  return request;
}

export function bannerUpItems(input: SignalLogRenderInput) {
  if (input.category === "bangboo") {
    if (input.headerItem) return [input.headerItem];
    const latest = input.summary.sRecords.find((record) =>
      gtCardKind(record.itemType, String(record.itemId ?? "")) === "bangboo");
    return latest ? [{
      id: String(latest.itemId ?? ""),
      name: latest.name,
      itemType: "bangboo" as const,
      rarity: "S" as const,
      icon: "",
    }] : [];
  }
  const items = input.banner?.upItems ?? [];
  const sItems = items.filter((item) => item.rarity !== undefined && normalizeRank(item.rarity) === "S");
  return sItems.length ? sItems : items.slice(0, 1);
}

export interface GtCardSourceItem {
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

export async function loadSquareItemImage(item: GtCardSourceItem): Promise<Image | null> {
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

export function gtCardSource(
  input: SignalLogRenderInput,
  value: GtCardSourceItem,
): GtCardSourceItem {
  const metadata = input.banner?.upItems.find((item) => String(item.id) === value.id);
  return {
    ...value,
    icon: metadata?.icon || value.icon,
    elementType: metadata?.elementType ?? value.elementType,
    subElementType: metadata?.subElementType ?? value.subElementType,
    profession: metadata?.profession ?? value.profession,
  };
}

export async function prepareGtCard(
  input: SignalLogRenderInput,
  value: GtCardSourceItem,
) {
  const source = gtCardSource(input, value);
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

export function coverPlacement(
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
) {
  if (!(imageWidth > 0) || !(imageHeight > 0)) return null;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  return {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}

export function formatDate(value?: string | null, withTime = true, locale?: string): string {
  if (!value) return signalText(locale).notSynced;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const intlLocale: Record<string, string> = { tw: "zh-TW", cn: "zh-CN", jp: "ja-JP", kr: "ko-KR", fr: "fr-FR", vi: "vi-VN", en: "en-US" };
  return new Intl.DateTimeFormat(intlLocale[normalizeZzzLocale(locale)] ?? "en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

export function signalAccent(input: SignalLogRenderInput): string {
  const elementType = input.banner?.upItems[0]?.elementType;
  return elementType === undefined ? PAPER.defaultAccent : getPaperAccent(safeAccent(undefined, elementType));
}

async function localImage(file: string): Promise<Image | null> {
  return existsSync(file) ? safeGtCardImage(file) : null;
}

async function bangbooArt(id: string): Promise<Image | null> {
  const source = await resolveGachaBangbooIcon(id);
  if (!source) return null;
  return /^https?:\/\//i.test(source) ? remoteImage(source) : safeGtCardImage(source);
}

/** Banner art by pool type, then the newest S agent's portrait, else null (plain paper). */
export async function resolveHeroArt(input: SignalLogRenderInput): Promise<Image | null> {
  const up = bannerUpItems(input)[0];
  const id = String(up?.id ?? "");
  let art: Image | null = null;
  if (id && (input.category === "character_up" || input.category === "character_return")) {
    art = await localImage(join(PORTRAIT_DIR, `${id}.png`));
  } else if (id && (input.category === "weapon_up" || input.category === "weapon_return")) {
    art = await localImage(join(IMAGE_DIR, "icons", "gacha", "weapon-big", `${id}.webp`));
  } else if (id && input.category === "bangboo") {
    art = await bangbooArt(id);
  }
  if (art) return art;
  const agent = input.summary.sRecords.find((record) => gtCardKind(record.itemType, record.itemId) === "character");
  return agent ? localImage(join(PORTRAIT_DIR, `${agent.itemId}.png`)) : null;
}

export function heroTitle(input: SignalLogRenderInput): string {
  const upNames = bannerUpItems(input).slice(0, 3).map((item) => item.name).filter(Boolean).join("／");
  const categoryLabel = signalCategoryText(input.locale, input.category);
  const genericName = input.banner?.name && !categoryLabel.includes(input.banner.name) ? input.banner.name : "";
  return upNames || genericName || input.bannerLabel;
}

export async function drawHeroBanner(
  ctx: SKRSContext2D,
  input: SignalLogRenderInput,
  height: number,
  subtitle: string,
): Promise<void> {
  const accent = signalAccent(input);
  const copy = signalText(input.locale);
  ctx.fillStyle = PAPER.paperBright;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.save();
  ctx.globalAlpha = .9;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(WIDTH * .68, 0);
  ctx.lineTo(WIDTH * .6, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  const art = await resolveHeroArt(input);
  if (art) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WIDTH, height);
    ctx.clip();
    if (art.width > art.height * 1.2) {
      // Wide agent portraits: fill the width and keep the face band in view.
      const drawHeight = WIDTH * art.height / art.width;
      ctx.drawImage(art, 0, -drawHeight * .1, WIDTH, drawHeight);
    } else {
      const size = height * 1.15;
      ctx.drawImage(art, WIDTH * .58 - size / 2, (height - size) / 2, size, size);
    }
    ctx.restore();
  }
  const fade = ctx.createLinearGradient(0, height * .5, 0, height);
  fade.addColorStop(0, "rgba(251,247,240,0)");
  fade.addColorStop(1, "rgba(251,247,240,.88)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, height * .5, WIDTH * .62, height * .5);

  const titleSize = height >= 240 ? 46 : 36;
  const title = wrappedName(ctx, heroTitle(input), WIDTH * .55, titleSize, 1, 22);
  const titleY = height - 30 - titleSize * .55;
  ctx.font = `bold ${title.size}px ${getZzzOfficialFont(input.locale)}`;
  ctx.fillStyle = PAPER.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const titleText = fitWithFont(ctx, title.lines[0] ?? "", WIDTH * .55, title.size);
  ctx.font = `bold ${title.size}px ${getZzzOfficialFont(input.locale)}`;
  ctx.fillText(titleText, 24, titleY);
  const titleWidth = ctx.measureText(titleText).width;
  ctx.font = `italic ${Math.round(titleSize * .55)}px ${NUMBER_FONT}, ${getZzzOfficialFont(input.locale)}`;
  ctx.fillStyle = accent;
  ctx.fillText(fitWithFont(ctx, subtitle, Math.max(80, WIDTH * .6 - titleWidth - 50), Math.round(titleSize * .55)), 24 + titleWidth + 14, titleY + 4);
  ctx.fillStyle = accent;
  ctx.fillRect(0, height - 10, WIDTH * .6, 10);

  const cardWidth = 250;
  drawGlassCard(ctx, WIDTH - cardWidth - 16, 16, cardWidth, 74, { radius: 12 });
  const right = WIDTH - 30;
  text(ctx, fitWithFont(ctx, input.playerName || copy.recordTitle, cardWidth - 28, 17), right, 33, 17, PAPER.ink, "right");
  text(ctx, `UID ${input.uid}`, right, 54, 13, PAPER.muted, "right", true);
  const update = input.stale
    ? `${copy.syncFailed} · ${formatDate(input.archivedAt, true, input.locale)}`
    : `${copy.updatedAt} ${formatDate(input.archivedAt, true, input.locale)}`;
  text(ctx, fitWithFont(ctx, update, cardWidth - 28, 12), right, 74, 12, input.stale ? PAPER.lost : PAPER.muted, "right");
}
