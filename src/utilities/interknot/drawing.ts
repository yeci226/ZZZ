import { GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { getZzzOfficialFont } from "../zzz/canvasFonts.js";

export const ASSET_DIR = "./src/assets/images/interknot";
export const [WIDTH, HEIGHT] = [1920, 1080];

// Measured from the in-game 3.2 screenshots (previews/interknot-reference).
export const FEED = { colX: [93, 446, 800, 1154, 1507], top: 208, cardW: 320, border: 5, gapY: 26, pageH: 872 };

export const COLORS = {
  card: "#222222",
  title: "#dadada",
  excerpt: "#8f8f8d",
  author: "#ffffff",
  separator: "#353535",
  newBadge: "#ffff02",
  tabSelected: "#f6db00",
  close: "#c32607",
  detailTitle: "#ffffff",
  detailBody: "#b4b4b4",
  commentName: "#959595",
  commentBody: "#989898",
  floorPill: "#60605f",
  featured: "#1f6ff2",
  heart: "#ff4f7b",
  panel: "#151515",
  bar: "#1d1d1d",
  barBorder: "#2c2c2c",
};

const EMOJI_FONT = join(".", "src", "assets", "seguiemj.ttf");
if (existsSync(EMOJI_FONT)) GlobalFonts.registerFromPath(EMOJI_FONT, "seguiemj");

// The official ZZZ face is already heavy; adding `bold` makes canvas synthesize a smeared faux-bold.
export function font(locale: string, px: number, style = "normal"): string {
  return `${style} ${px}px ${getZzzOfficialFont(locale)}, seguiemj`;
}

export type Corner = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

export function roundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  opts: { corners?: Corner[]; fill?: string; stroke?: string; lineWidth?: number; img?: Image } = {},
): void {
  const corners = opts.corners ?? ["topLeft", "topRight", "bottomRight", "bottomLeft"];
  const has = (c: Corner) => corners.includes(c);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + (has("topLeft") ? r : 0), y);
  if (has("topRight")) ctx.arcTo(x + w, y, x + w, y + r, r);
  else ctx.lineTo(x + w, y);
  if (has("bottomRight")) ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  else ctx.lineTo(x + w, y + h);
  if (has("bottomLeft")) ctx.arcTo(x, y + h, x, y + h - r, r);
  else ctx.lineTo(x, y + h);
  if (has("topLeft")) ctx.arcTo(x, y, x + r, y, r);
  else ctx.lineTo(x, y);
  ctx.closePath();
  if (opts.fill) {
    ctx.fillStyle = opts.fill;
    ctx.fill();
  }
  if (opts.img) {
    ctx.save();
    ctx.clip();
    drawCover(ctx, opts.img, x, y, w, h);
    ctx.restore();
  }
  if (opts.stroke) {
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = opts.lineWidth ?? 1;
    ctx.stroke();
  }
  ctx.restore();
}

/** Draws `img` filling the box, cropping the overflow around the centre (CSS object-fit: cover). */
export function drawCover(ctx: SKRSContext2D, img: Image, x: number, y: number, w: number, h: number): void {
  const scale = Math.max(w / img.width, h / img.height);
  const [sw, sh] = [w / scale, h / scale];
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** Wraps by code point (CJK has no spaces); the last kept line ends in `…` when text overflows. */
export function wrapLines(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text.replace(/\s+/g, " ")) {
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) break;
    } else line += ch;
  }
  if (lines.length < maxLines) {
    if (line) lines.push(line);
    return lines;
  }
  let last = [...lines[maxLines - 1]];
  while (last.length && ctx.measureText(last.join("") + "…").width > maxWidth) last.pop();
  lines[maxLines - 1] = last.join("") + "…";
  return lines;
}

// Only bundled assets and stored covers are loaded here; the cache is bounded by the post count in view.
const imageCache = new Map<string, Promise<Image>>();
const FALLBACK = "./src/assets/images/None.png";
export function cachedImage(path: string): Promise<Image> {
  let image = imageCache.get(path);
  if (!image) {
    image = loadImage(path).catch(() => loadImage(FALLBACK));
    imageCache.set(path, image);
    if (imageCache.size > 500) imageCache.delete(imageCache.keys().next().value!);
  }
  return image;
}

export function avatarPath(id: number): string {
  const safe = Number.isInteger(id) && id >= 1 && id <= 11 ? id : 1;
  return `${ASSET_DIR}/IconInterKnot${String(safe).padStart(4, "0")}.png`;
}

/** The game's tab strip: a dark rounded track with the selected tab as a yellow slanted block. */
export function drawTabs(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  labels: string[],
  selected: number,
  size: "main" | "sub",
  locale: string,
  disabled: number[] = [],
): void {
  const h = size === "main" ? 62 : 42;
  const slant = size === "main" ? 26 : 18;
  const segW = w / labels.length;
  roundedRect(ctx, x, y, w, h, h / 2, { fill: "#000000", stroke: COLORS.barBorder, lineWidth: 4 });
  if (selected >= 0 && selected < labels.length) {
    const sx = x + segW * selected;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(sx + (selected ? slant : -h), y);
    ctx.lineTo(sx + segW + slant, y);
    ctx.lineTo(sx + segW - (selected === labels.length - 1 ? -h : slant), y + h);
    ctx.lineTo(sx - (selected ? slant : h), y + h);
    ctx.closePath();
    ctx.fillStyle = COLORS.tabSelected;
    ctx.fill();
    ctx.restore();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(locale, size === "main" ? 30 : 20, "italic");
  labels.forEach((label, i) => {
    ctx.fillStyle = i === selected ? "#000000" : disabled.includes(i) ? "#555555" : "#ffffff";
    ctx.fillText(label, x + segW * (i + 0.5), y + h / 2 + 1, segW - 20);
  });
}

export function drawNewBadge(ctx: SKRSContext2D, right: number, baseline: number, locale: string): void {
  ctx.save();
  ctx.font = font(locale, 22, "italic");
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#000000";
  ctx.strokeText("NEW!", right, baseline);
  ctx.fillStyle = COLORS.newBadge;
  ctx.fillText("NEW!", right, baseline);
  ctx.restore();
}

export function drawFeaturedPill(ctx: SKRSContext2D, x: number, y: number, label: string, locale: string): void {
  ctx.save();
  ctx.font = font(locale, 19);
  const text = `◎ ${label}`;
  const w = ctx.measureText(text).width + 28;
  roundedRect(ctx, x, y, w, 32, 16, { fill: COLORS.featured, stroke: "#8fc2ff", lineWidth: 2 });
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 14, y + 17);
  ctx.restore();
}

/** Circular avatar with the dark ring the game draws around it. */
export async function drawAvatar(ctx: SKRSContext2D, id: number, cx: number, cy: number, d: number): Promise<void> {
  roundedRect(ctx, cx - d / 2 - 4, cy - d / 2 - 4, d + 8, d + 8, d / 2 + 4, { fill: COLORS.card });
  roundedRect(ctx, cx - d / 2, cy - d / 2, d, d, d / 2, { fill: "#dddddd", img: await cachedImage(avatarPath(id)) });
}

/** The player bar at the top-left: avatar, nickname and ♥ reputation (no level bar, no back button). */
export async function drawPlayerBar(
  ctx: SKRSContext2D,
  viewer: { nickname: string; avatarId: number; reputation: number },
  locale: string,
): Promise<void> {
  const [x, y, h] = [60, 22, 58];
  ctx.font = font(locale, 22);
  const w = Math.max(240, Math.min(ctx.measureText(viewer.nickname).width, 260) + 110);
  roundedRect(ctx, x, y, w, h, h / 2, { fill: COLORS.bar, stroke: COLORS.barBorder, lineWidth: 3 });
  await drawAvatar(ctx, viewer.avatarId, x + 31, y + h / 2, 46);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(viewer.nickname, x + 64, y + 26, w - 80);
  ctx.font = font(locale, 18);
  ctx.fillStyle = COLORS.heart;
  ctx.fillText("♥", x + 64, y + 49);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(String(viewer.reputation), x + 86, y + 49);
}
