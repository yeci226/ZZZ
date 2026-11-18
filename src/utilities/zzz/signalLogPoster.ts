import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GachaArchiveBanner } from "./gachaArchive.js";
import type { GachaStatCategory } from "./gachaStatApi.js";
import { getZzzOfficialFont } from "./canvasFonts.js";
import { getPaperAccent, safeAccent } from "./profileColors.js";
import {
  fitLocaleText,
  gtCardKind,
  IMAGE_DIR,
  localeText,
  numberText,
  PAPER,
  POSTER_WIDTH,
  prepareSCard,
} from "./signalLogPaper.js";
import type { SignalLogView } from "./signalLogPagination.js";
import { isLimitedCategory, type SignalItemKind, type SignalLogModel, type SignalSEntry } from "./signalLogModel.js";

export type PosterArt = {
  type: "full" | "wide" | "icon" | "none";
  image: Image | null;
  crop?: [number, number, number, number];
  path?: string;
};

export interface PosterSubject {
  agentId: string | null;
  iconItem: { id: string; kind: SignalItemKind } | null;
  accent: string;
}

const DEFAULT_CROP: [number, number, number, number] = [.3, .1, .4, .6];
const PORTRAIT_DIR = join("src", "assets", "gacha-simulation", "ui", "characters");
const CATALOG_PATH = join("src", "assets", "gacha-simulation", "catalog.json");

let signatureAgents: Record<string, string> | undefined;
let agentElements: Record<string, { elementType?: number }> | undefined;
let catalogItems: Record<string, { crop?: unknown }> | null | undefined;

function readJson(path: string): any {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function signatureAgentOf(weaponId: string): string | null {
  signatureAgents ??= readJson(join("src", "assets", "signature-weapons.json")) ?? {};
  return signatureAgents![weaponId] ?? null;
}

function elementOf(agentId: string): number | undefined {
  agentElements ??= readJson(join("src", "assets", "disc-leaderboard-elements.json"))?.agents ?? {};
  const value = agentElements![agentId]?.elementType;
  return typeof value === "number" ? value : undefined;
}

function catalogCrop(agentId: string): [number, number, number, number] {
  if (catalogItems === undefined) catalogItems = readJson(CATALOG_PATH)?.items ?? null;
  const crop = catalogItems?.[agentId]?.crop;
  return Array.isArray(crop) && crop.length === 4 && crop.every((value) => typeof value === "number")
    ? (crop as [number, number, number, number])
    : DEFAULT_CROP;
}

type BannerItems = Pick<GachaArchiveBanner, "upItems">;

function subjectOf(id: string, kind: SignalItemKind, banner?: BannerItems): PosterSubject {
  const resolvedKind = kind === "unknown" ? gtCardKind("", id) : kind;
  let agentId: string | null = null;
  if (resolvedKind === "character") agentId = id;
  else if (resolvedKind === "weapon") agentId = signatureAgentOf(id);
  const iconItem = resolvedKind === "character" ? null : { id, kind: resolvedKind };
  let accent: string = PAPER.defaultAccent;
  if (agentId) {
    const elementType = banner?.upItems.find((item) => String(item.id) === agentId)?.elementType ?? elementOf(agentId);
    if (elementType !== undefined) accent = getPaperAccent(safeAccent(undefined, elementType));
  }
  return { agentId, iconItem, accent };
}

const NONE: PosterSubject = { agentId: null, iconItem: null, accent: PAPER.defaultAccent };

function newestEntry(model: SignalLogModel): SignalSEntry | null {
  const all = Object.values(model.channels).flatMap((channel) => channel.entries);
  const time = (entry: SignalSEntry) => (entry.pulledAt ? Date.parse(entry.pulledAt) : Number.NaN);
  const newest = (list: SignalSEntry[]) =>
    list.reduce<SignalSEntry | null>((best, entry) => {
      if (best === null) return entry;
      const a = time(entry);
      const b = time(best);
      return !Number.isNaN(a) && (Number.isNaN(b) || a > b) ? entry : best;
    }, null);
  return newest(all.filter((entry) => entry.kind === "character")) ?? newest(all.filter((entry) => entry.kind === "weapon"));
}

export function resolvePosterSubject(input: {
  view: SignalLogView;
  model: SignalLogModel;
  category: GachaStatCategory;
  banner?: Pick<GachaArchiveBanner, "upItems">;
}): PosterSubject {
  if (input.view === "home") {
    const entry = newestEntry(input.model);
    return entry ? subjectOf(entry.itemId, entry.kind) : NONE;
  }
  if (input.view === "cycles" && input.banner) {
    const up = input.banner.upItems.find((item) => item.rarity === "S");
    if (up) return subjectOf(String(up.id), up.itemType ?? gtCardKind("", String(up.id)), input.banner);
  }
  const channel = input.model.channels[input.category];
  const entries = channel?.entries ?? [];
  const entry = isLimitedCategory(input.category) ? entries.find((item) => item.isUp === true) ?? entries[0] : entries[0];
  return entry ? subjectOf(entry.itemId, entry.kind, input.banner) : NONE;
}

async function tryLoad(path: string): Promise<Image | null> {
  try { return await loadImage(path); } catch { return null; }
}

export async function loadPosterArt(subject: PosterSubject): Promise<PosterArt> {
  if (subject.agentId) {
    const dir = process.env.ZZZ_AGENT_ART_DIR || join(IMAGE_DIR, "agents");
    const fullPath = join(dir, `${subject.agentId}.webp`);
    const full = await tryLoad(fullPath);
    if (full) return { type: "full", image: full, path: fullPath };
    const wide = await tryLoad(join(PORTRAIT_DIR, `${subject.agentId}.png`));
    if (wide) return { type: "wide", image: wide, crop: catalogCrop(subject.agentId) };
  }
  if (subject.iconItem) {
    try {
      const card = await prepareSCard({ itemId: subject.iconItem.id, kind: subject.iconItem.kind });
      if (card.images.art) return { type: "icon", image: card.images.art };
    } catch { /* fall through */ }
  }
  return { type: "none", image: null };
}

function stripes(ctx: SKRSContext2D, top: number, height: number): void {
  ctx.save();
  ctx.globalAlpha = .14;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  for (let x = -height; x < POSTER_WIDTH + 20; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, top + height);
    ctx.lineTo(x + height, top);
    ctx.stroke();
  }
  ctx.restore();
}

const ALPHA_MIN = 60;
const FOCUS_SAMPLE_HEIGHT = 160;
const focusCache = new Map<string, number>();

/** Horizontal position (0..1) of the figure's head: median x of the opaque pixels in the top fifth of its bounding box. */
export function posterFocusX(image: Image): number {
  const h = FOCUS_SAMPLE_HEIGHT;
  const w = Math.max(1, Math.round(image.width * h / image.height));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const opaque = (x: number, y: number) => data[(y * w + x) * 4 + 3]! > ALPHA_MIN;
  let first = -1;
  let last = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (opaque(x, y)) { if (first < 0) first = y; last = y; break; }
    }
  }
  if (first < 0) return 0.5;
  const band = Math.max(4, Math.round(0.2 * (last - first + 1)));
  const xs: number[] = [];
  for (let y = first; y < Math.min(h, first + band); y++) {
    for (let x = 0; x < w; x++) if (opaque(x, y)) xs.push(x);
  }
  if (!xs.length) return 0.5;
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)]! / w;
}

/** Left offset that centres the art's focus in the panel while still covering it horizontally. */
export function posterArtOffset(panelWidth: number, artWidth: number, focus: number): number {
  if (artWidth < panelWidth) return (panelWidth - artWidth) / 2;
  return Math.min(0, Math.max(panelWidth - artWidth, panelWidth / 2 - focus * artWidth));
}

function cachedFocus(art: PosterArt): number {
  if (!art.image) return 0.5;
  const cached = art.path ? focusCache.get(art.path) : undefined;
  if (cached !== undefined) return cached;
  const focus = posterFocusX(art.image);
  if (art.path) focusCache.set(art.path, focus);
  return focus;
}

function drawArt(ctx: SKRSContext2D, art: PosterArt, height: number, accent: string): void {
  const edge = POSTER_WIDTH + 12;
  if (art.type === "full" && art.image) {
    const artHeight = Math.max(height * 1.28, 900);
    const artWidth = artHeight * art.image.width / art.image.height;
    ctx.drawImage(art.image, posterArtOffset(POSTER_WIDTH, artWidth, cachedFocus(art)), 6, artWidth, artHeight);
  } else if (art.type === "wide" && art.image) {
    const [cx, cy, cw, ch] = art.crop ?? DEFAULT_CROP;
    const band = Math.min(height * .5, 420);
    const scale = band / (art.image.height * Math.min(1, ch + .3));
    const faceX = (cx + cw / 2) * art.image.width * scale;
    const faceY = (cy + ch / 2) * art.image.height * scale;
    ctx.drawImage(art.image, POSTER_WIDTH / 2 - faceX, band * .46 - faceY, art.image.width * scale, art.image.height * scale);
    const blend = ctx.createLinearGradient(0, band * .55, 0, band * 1.05);
    blend.addColorStop(0, "rgba(0,0,0,0)");
    blend.addColorStop(1, accent);
    ctx.fillStyle = blend;
    ctx.fillRect(0, band * .55, edge, band * .5 + 2);
    ctx.fillStyle = accent;
    ctx.fillRect(0, band * 1.05, edge, height);
    stripes(ctx, band * 1.05, height - band * 1.05);
  } else if (art.type === "icon" && art.image) {
    const size = POSTER_WIDTH * 1.02;
    ctx.save();
    ctx.translate(POSTER_WIDTH / 2 - 4, height * .36);
    ctx.rotate(-.12);
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(art.image, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

const TITLE_MAX = 46;
const TITLE_MIN = 34;
const TITLE_FLOOR = 28;

/** One line at 46px, shrinking to 34px; otherwise at most two lines at 34px, truncating only what still overflows. */
export function posterTitleLines(
  ctx: SKRSContext2D,
  locale: string | undefined,
  title: string,
  maxWidth: number,
): { lines: string[]; size: number } {
  const family = getZzzOfficialFont(locale);
  const width = (value: string, size: number) => {
    ctx.font = `bold ${size}px ${family}`;
    return ctx.measureText(value).width;
  };
  for (let size = TITLE_MAX; size >= TITLE_MIN; size -= 2) {
    if (width(title, size) <= maxWidth) return { lines: [title], size };
  }
  // Two lines: stay at 34px unless a single word still overflows, then shrink to 28px before truncating.
  const wrap = (size: number): { lines: string[]; clipped: boolean } => {
    const truncate = (value: string) => {
      if (width(value, size) <= maxWidth) return value;
      const chars = Array.from(value);
      while (chars.length > 1 && width(`${chars.join("")}…`, size) > maxWidth) chars.pop();
      return `${chars.join("")}…`;
    };
    const chars = Array.from(title);
    const spaced: Array<[string, string]> = [];
    chars.forEach((char, index) => {
      if (!/\s/u.test(char)) return;
      const left = chars.slice(0, index).join("").trim();
      const right = chars.slice(index + 1).join("").trim();
      if (left && right) spaced.push([left, right]);
    });
    let pair: [string, string];
    if (spaced.length) {
      const fits = spaced.filter(([left, right]) => width(left, size) <= maxWidth && width(right, size) <= maxWidth);
      const gap = (item: [string, string]) => Math.abs(width(item[0], size) - width(item[1], size));
      pair = (fits.length ? fits : spaced).reduce((best, item) => (gap(item) < gap(best) ? item : best));
    } else {
      let cut = 1;
      while (cut < chars.length && width(chars.slice(0, cut + 1).join(""), size) <= maxWidth) cut++;
      pair = [chars.slice(0, cut).join(""), chars.slice(cut).join("")];
    }
    const lines = [truncate(pair[0]), truncate(pair[1])];
    return { lines, clipped: lines.some((line) => line.endsWith("…") && !title.includes(line)) };
  };
  for (let size = TITLE_MIN; size > TITLE_FLOOR; size -= 2) {
    const result = wrap(size);
    if (!result.clipped) return { lines: result.lines, size };
  }
  return { lines: wrap(TITLE_FLOOR).lines, size: TITLE_FLOOR };
}

export async function drawPoster(
  ctx: SKRSContext2D,
  height: number,
  input: { subject: PosterSubject; title: string; chip: string; playerName: string; uid: string; locale?: string },
): Promise<void> {
  const { accent } = input.subject;
  const edge = POSTER_WIDTH + 12;
  const art = await loadPosterArt(input.subject);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(edge, 0);
  ctx.lineTo(POSTER_WIDTH - 12, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, edge, height);
  stripes(ctx, 0, height);
  drawArt(ctx, art, height, accent);
  const fade = ctx.createLinearGradient(0, height - 300, 0, height);
  fade.addColorStop(0, "rgba(12,14,16,0)");
  fade.addColorStop(.75, "rgba(12,14,16,.86)");
  fade.addColorStop(1, "rgba(12,14,16,.94)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, height - 300, edge, 300);
  ctx.restore();

  // slanted ink edge
  ctx.beginPath();
  ctx.moveTo(edge, 0);
  ctx.lineTo(POSTER_WIDTH + 19, 0);
  ctx.lineTo(POSTER_WIDTH - 5, height);
  ctx.lineTo(POSTER_WIDTH - 12, height);
  ctx.closePath();
  ctx.fillStyle = PAPER.ink;
  ctx.fill();

  const textWidth = POSTER_WIDTH - 40;
  // chip: white pill sized to the fitted text, kept inside the slanted edge
  const chipSize = 15;
  const chipPad = chipSize * .7;
  const chip = fitLocaleText(ctx, input.locale, input.chip, chipSize, true, textWidth - chipPad * 2);
  const chipHeight = chipSize * 1.9;
  const title = posterTitleLines(ctx, input.locale, input.title, textWidth);
  const lineHeight = title.size * 1.12;
  const titleBottom = height - 104;
  const titleTop = titleBottom - (title.lines.length - 1) * lineHeight;
  const chipY = titleTop - 48;
  ctx.beginPath();
  ctx.roundRect(20, chipY - chipHeight / 2, chip.width + chipPad * 2, chipHeight, chipHeight / 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  localeText(ctx, input.locale, input.chip, 20 + chipPad, chipY + 1, chipSize, accent, { bold: true, maxWidth: textWidth - chipPad * 2 });

  ctx.save();
  ctx.transform(1, 0, -.1, 1, 0, 0);
  title.lines.forEach((line, index) => {
    const y = titleTop + index * lineHeight;
    localeText(ctx, input.locale, line, 20 + y * .1, y, title.size, "#ffffff", { bold: true, maxWidth: textWidth });
  });
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,.35)";
  ctx.fillRect(20, height - 70, POSTER_WIDTH - 70, 1);
  localeText(ctx, input.locale, input.playerName, 20, height - 48, 17, "#ffffff", { bold: true, maxWidth: textWidth });
  numberText(ctx, `UID ${input.uid}`, 20, height - 25, 14, "rgba(255,255,255,.78)");
}
