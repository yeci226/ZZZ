import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";

import {
  ASSET_DIR,
  COLORS,
  HEIGHT,
  WIDTH,
  cachedImage,
  drawAvatar,
  drawFeaturedPill,
  font,
  roundedRect,
  wrapLines,
} from "./drawing.js";

export interface DetailComment {
  floor: number;
  nickname: string;
  avatarId: number;
  body: string;
  isOp: boolean;
}

export interface DetailInput {
  author: { nickname: string; avatarId: number; reputation: number };
  title: string;
  body: string;
  coverPath: string | null;
  featured: boolean;
  featuredLabel: string;
  comments: DetailComment[];
  expanded: boolean;
  commentPage: number;
  endLabel: string;
  opLabel: string;
  locale: string;
}

// Measured from previews/interknot-reference/detail.png.
const PANEL = { x: 258, y: 170, w: 1404, h: 735 };
const CONTENT = { top: 322, bottom: 862 };
const COVER = { x: 315, w: 413 };
const TEXT = { x: 752, w: 318 };
const COMMENTS = { x: 1110, w: 510 };
const COMMENT = { textX: 1215, textW: 365, maxLines: 4, line: 26, pad: 18 };
const BODY_PX = 19;
const MIN_EXPANDED_PX = 15;

type Block = { floor: number; h: number; comment?: DetailComment; lines: string[] } | { end: true; h: number };

export async function renderDetail(
  i: DetailInput,
): Promise<{ buffer: Buffer; bodyTruncated: boolean; commentPages: number; commentPage: number; visibleFloors: number[] }> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(await cachedImage(`${ASSET_DIR}/bgDark.jpg`), 0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  roundedRect(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, 30, { fill: COLORS.panel, stroke: "#2a2a2a", lineWidth: 6 });
  roundedRect(ctx, PANEL.x + 3, PANEL.y + 3, PANEL.w - 6, 112, 28, { corners: ["topLeft", "topRight"], fill: "#1f1f1f" });
  await drawHeader(ctx, i);

  roundedRect(ctx, 300, 308, 790, 570, 22, { fill: "#0e0e0e" });
  const bodyTruncated = i.expanded ? drawExpanded(ctx, i) : await drawPost(ctx, i);

  roundedRect(ctx, COMMENTS.x, 308, COMMENTS.w, 570, 22, { fill: "#0e0e0e" });
  const pages = paginateComments(ctx, i);
  const commentPage = Math.min(Math.max(0, i.commentPage), pages.length - 1);
  await drawComments(ctx, i, pages[commentPage], commentPage < pages.length - 1);

  return {
    buffer: canvas.toBuffer("image/png"),
    bodyTruncated,
    commentPages: pages.length,
    commentPage,
    visibleFloors: pages[commentPage].flatMap((b) => ("floor" in b ? [b.floor] : [])),
  };
}

async function drawHeader(ctx: SKRSContext2D, i: DetailInput): Promise<void> {
  await drawAvatar(ctx, i.author.avatarId, 338, 230, 76);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = font(i.locale, 24);
  ctx.fillStyle = COLORS.commentName;
  ctx.fillText(i.author.nickname, 395, 214, 700);
  ctx.font = font(i.locale, 18);
  const rep = `♥${i.author.reputation}`;
  const w = ctx.measureText(rep).width + 22;
  roundedRect(ctx, 395, 237, w, 26, 13, { fill: "#3a3a3a" });
  ctx.fillStyle = "#cfcfcf";
  ctx.fillText(rep, 406, 251);

  // Decorative close button; the real close is the Discord "back" button.
  ctx.beginPath();
  ctx.moveTo(1560, 205);
  ctx.lineTo(1632, 205);
  ctx.lineTo(1617, 260);
  ctx.lineTo(1545, 260);
  ctx.closePath();
  ctx.fillStyle = COLORS.close;
  ctx.fill();
  ctx.strokeStyle = "#ff6a3d";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(1578, 222);
  ctx.lineTo(1598, 242);
  ctx.moveTo(1598, 222);
  ctx.lineTo(1578, 242);
  ctx.stroke();
  ctx.lineCap = "butt";
}

/** Normal mode: cover | title + body. Returns whether the body was cut off. */
async function drawPost(ctx: SKRSContext2D, i: DetailInput): Promise<boolean> {
  const frameH = CONTENT.bottom - CONTENT.top;
  roundedRect(ctx, COVER.x, CONTENT.top, COVER.w, frameH, 20, { fill: "#1b1b1b" });
  const cover = await cachedImage(i.coverPath ?? `${ASSET_DIR}/postDefault.webp`);
  // Contain the cover inside the frame, like the game's letterboxed image.
  const inner = { x: COVER.x + 6, y: CONTENT.top + 6, w: COVER.w - 12, h: frameH - 12 };
  const scale = Math.min(inner.w / cover.width, inner.h / cover.height) || 1;
  const [cw, ch] = [cover.width * scale, cover.height * scale];
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w, inner.h, 16);
  ctx.clip();
  ctx.fillStyle = "#000000";
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  ctx.drawImage(cover, inner.x + (inner.w - cw) / 2, inner.y + (inner.h - ch) / 2, cw, ch);
  ctx.restore();
  roundedRect(ctx, COVER.x, CONTENT.top, COVER.w, frameH, 20, { stroke: "#3a3a3a", lineWidth: 4 });
  if (i.featured) drawFeaturedPill(ctx, COVER.x + 16, CONTENT.top + 16, i.featuredLabel, i.locale);

  return drawText(ctx, i, TEXT.x, TEXT.w, BODY_PX, false);
}

/** Expanded mode: cover is dropped and title + body use both columns, shrinking the font until the body fits. */
function drawExpanded(ctx: SKRSContext2D, i: DetailInput): boolean {
  const w = TEXT.x + TEXT.w - COVER.x;
  for (let px = BODY_PX; px > MIN_EXPANDED_PX; px--) if (!drawText(ctx, i, COVER.x, w, px, true)) return drawText(ctx, i, COVER.x, w, px, false);
  return drawText(ctx, i, COVER.x, w, MIN_EXPANDED_PX, false);
}

/** Draws title and body; with `dryRun` only measures. Returns true when the body did not fit. */
function drawText(ctx: SKRSContext2D, i: DetailInput, x: number, w: number, px: number, dryRun: boolean): boolean {
  const line = Math.round(px * 1.38);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = font(i.locale, px + 1);
  const title = wrapLines(ctx, i.title, w, 3);
  let y = CONTENT.top + 6;
  if (!dryRun) {
    ctx.fillStyle = COLORS.detailTitle;
    title.forEach((t, n) => ctx.fillText(t, x, y + line * n));
  }
  y += line * title.length + 12;
  ctx.font = font(i.locale, px);
  const maxLines = Math.max(1, Math.floor((CONTENT.bottom - y) / line));
  // Keep the author's line breaks; wrap each paragraph separately.
  const all = i.body.split(/\r?\n/).flatMap((p) => (p.trim() ? wrapLines(ctx, p, w, Number.MAX_SAFE_INTEGER) : [""]));
  const truncated = all.length > maxLines;
  const lines = truncated ? all.slice(0, maxLines) : all;
  if (truncated) lines[maxLines - 1] = wrapLines(ctx, lines[maxLines - 1] + "……", w, 1)[0];
  if (!dryRun) {
    ctx.fillStyle = COLORS.detailBody;
    lines.forEach((t, n) => ctx.fillText(t, x, y + line * n));
  }
  return truncated;
}

function paginateComments(ctx: SKRSContext2D, i: DetailInput): Block[][] {
  ctx.font = font(i.locale, 18);
  const blocks: Block[] = i.comments.map((c) => {
    const lines = wrapLines(ctx, c.body, COMMENT.textW, COMMENT.maxLines);
    return { floor: c.floor, comment: c, lines, h: Math.max(84, 40 + COMMENT.line * lines.length) + COMMENT.pad };
  });
  blocks.push({ end: true, h: 50 });
  const usable = CONTENT.bottom - CONTENT.top - 30; // room for the ▼ more marker
  const pages: Block[][] = [[]];
  let used = 0;
  for (const b of blocks) {
    if (used + b.h > usable && pages.at(-1)!.length) {
      pages.push([]);
      used = 0;
    }
    pages.at(-1)!.push(b);
    used += b.h;
  }
  return pages;
}

async function drawComments(ctx: SKRSContext2D, i: DetailInput, page: Block[], more: boolean): Promise<void> {
  let y = CONTENT.top + 6;
  for (const b of page) {
    if (!("floor" in b)) {
      ctx.font = font(i.locale, 18);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#5c5c5c";
      ctx.fillText(i.endLabel, COMMENTS.x + COMMENTS.w / 2, y + 22);
      continue;
    }
    const c = b.comment!;
    await drawAvatar(ctx, c.avatarId, 1167, y + 36, 60);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = font(i.locale, 19);
    ctx.fillStyle = COLORS.commentName;
    ctx.fillText(c.isOp ? `${i.opLabel} ${c.nickname}` : c.nickname, COMMENT.textX, y + 18, 300);

    const floor = `${c.floor} F`;
    ctx.font = font(i.locale, 15);
    const fw = Math.max(48, ctx.measureText(floor).width + 20);
    roundedRect(ctx, 1593 - fw, y + 6, fw, 24, 12, { fill: COLORS.floorPill });
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(floor, 1593 - fw / 2, y + 18);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = font(i.locale, 18);
    ctx.fillStyle = COLORS.commentBody;
    b.lines.forEach((t, n) => ctx.fillText(t, COMMENT.textX, y + 36 + COMMENT.line * n));
    y += b.h;
    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(1135, y - COMMENT.pad / 2, 460, 3);
  }
  if (more) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(1351, CONTENT.bottom - 14);
    ctx.lineTo(1379, CONTENT.bottom - 14);
    ctx.lineTo(1365, CONTENT.bottom);
    ctx.closePath();
    ctx.fill();
  }
}
