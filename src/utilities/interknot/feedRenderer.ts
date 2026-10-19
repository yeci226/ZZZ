import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";

import {
  ASSET_DIR,
  COLORS,
  FEED,
  HEIGHT,
  WIDTH,
  cachedImage,
  cachedSize,
  drawAvatar,
  drawFeaturedPill,
  drawNewBadge,
  drawPlayerBar,
  drawTabs,
  font,
  roundedRect,
  wrapLines,
} from "./drawing.js";

export interface FeedCard {
  id: number;
  /** Already prefixed with `[標籤]`. */
  title: string;
  excerpt: string;
  nickname: string;
  avatarId: number;
  coverPath: string | null;
  featured: boolean;
  isNew: boolean;
  read: boolean;
}

export interface FeedInput {
  viewer: { nickname: string; avatarId: number; reputation: number };
  mainLabels: string[];
  subLabels: string[];
  main: number;
  sub: number;
  disabledMain?: number[];
  cards: FeedCard[];
  page: number;
  highlightId?: number;
  featuredLabel: string;
  locale: string;
}

const RADIUS = 26;
const INNER_W = FEED.cardW - FEED.border * 2;
const [COVER_MIN, COVER_MAX] = [180, 460];
const LINE = 26;
const SCROLL_TOP = 185;
const MAX_SELECTABLE = 25; // Discord select menu option limit

/** Masonry layout: each post goes to the shortest column. Returns per-post boxes and the tallest column. */
export function layoutPosts(heights: number[]): { boxes: { x: number; y: number; h: number }[]; bottom: number } {
  const columns = FEED.colX.map(() => FEED.top);
  const boxes = heights.map((h) => {
    const col = columns.indexOf(Math.min(...columns));
    const box = { x: FEED.colX[col], y: columns[col], h };
    columns[col] += h + FEED.gapY;
    return box;
  });
  return { boxes, bottom: boxes.length ? Math.max(...columns) - FEED.gapY : FEED.top };
}

export async function renderFeed(
  i: FeedInput,
): Promise<{ buffer: Buffer; totalPages: number; page: number; visibleIds: number[] }> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(await cachedImage(`${ASSET_DIR}/bgDark.jpg`), 0, 0, WIDTH, HEIGHT);

  const coverOf = (c: FeedCard) => c.coverPath ?? `${ASSET_DIR}/postDefault.webp`;
  // Layout needs every card's aspect ratio, but only cards on this page are decoded.
  const measured = i.cards.map((c) => {
    ctx.font = font(i.locale, 22);
    const title = wrapLines(ctx, c.title, INNER_W - 34, 2);
    ctx.font = font(i.locale, 19, "normal");
    const excerpt = wrapLines(ctx, c.excerpt, INNER_W - 34, 1);
    const size = cachedSize(coverOf(c));
    const ratio = size?.width ? size.height / size.width : 1;
    const coverH = Math.min(COVER_MAX, Math.max(COVER_MIN, Math.round(INNER_W * ratio)));
    return { title, excerpt, coverH, height: FEED.border + coverH + 86 + LINE * title.length };
  });
  const { boxes } = layoutPosts(measured.map((m) => m.height));

  // A card belongs to the page whose window contains its top edge, so every card is selectable exactly once.
  const pageOf = (y: number) => Math.floor((y - FEED.top) / FEED.pageH);
  const totalPages = Math.max(1, ...boxes.map((b) => pageOf(b.y) + 1));
  const page = Math.min(Math.max(0, i.page), totalPages - 1);
  const offset = page * FEED.pageH;
  const visibleIds = i.cards
    .map((c, n) => ({ id: c.id, ...boxes[n] }))
    .filter((b) => pageOf(b.y) === page)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, MAX_SELECTABLE)
    .map((b) => b.id);

  // Cards scroll inside the area below the header, as in game.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, SCROLL_TOP, WIDTH, HEIGHT - SCROLL_TOP);
  ctx.clip();
  for (let n = 0; n < i.cards.length; n++) {
    const { x, h } = boxes[n];
    const y = boxes[n].y - offset;
    if (y + h < 0 || y > HEIGHT) continue;
    await drawCard(ctx, i, i.cards[n], measured[n], x, y, h, await cachedImage(coverOf(i.cards[n])));
  }

  ctx.restore();

  await drawPlayerBar(ctx, i.viewer, i.locale);
  drawTabs(ctx, 1045, 20, 805, i.mainLabels, i.main, "main", i.locale, i.disabledMain);
  drawTabs(ctx, 1248, 122, 602, i.subLabels, i.sub, "sub", i.locale);
  if (totalPages > 1) {
    ctx.font = font(i.locale, 18, "normal");
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#8f8f8d";
    ctx.fillText(`${page + 1} / ${totalPages}`, WIDTH - 24, HEIGHT - 14);
  }

  return { buffer: canvas.toBuffer("image/png"), totalPages, page, visibleIds };
}

async function drawCard(
  ctx: SKRSContext2D,
  i: FeedInput,
  c: FeedCard,
  m: { title: string[]; excerpt: string[]; coverH: number },
  x: number,
  y: number,
  h: number,
  cover: Awaited<ReturnType<typeof cachedImage>>,
): Promise<void> {
  const b = FEED.border;
  const corners = ["topLeft", "topRight", "bottomLeft"] as const;
  roundedRect(ctx, x, y, FEED.cardW, h, RADIUS, { corners: [...corners], fill: COLORS.card });
  roundedRect(ctx, x + b, y + b, INNER_W, m.coverH, RADIUS - b, { corners: ["topLeft", "topRight"], img: cover });
  roundedRect(ctx, x + b / 2, y + b / 2, FEED.cardW - b, h - b, RADIUS, {
    corners: [...corners],
    stroke: c.id === i.highlightId ? COLORS.tabSelected : "#000000",
    lineWidth: b,
  });
  if (c.featured) drawFeaturedPill(ctx, x + 16, y + 14, i.featuredLabel, i.locale);
  if (c.isNew) drawNewBadge(ctx, x + FEED.cardW - 4, y + 18, i.locale);

  const cb = y + b + m.coverH;
  await drawAvatar(ctx, c.avatarId, x + 52, cb - 6, 62);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = font(i.locale, 20);
  ctx.fillStyle = c.read ? COLORS.excerpt : COLORS.author;
  ctx.fillText(c.nickname, x + 95, cb + 18, FEED.cardW - 115);
  ctx.fillStyle = COLORS.separator;
  ctx.fillRect(x + 95, cb + 35, FEED.cardW - 115, 3);

  ctx.font = font(i.locale, 22);
  ctx.fillStyle = COLORS.title;
  m.title.forEach((line, n) => ctx.fillText(line, x + 22, cb + 62 + LINE * n));
  ctx.font = font(i.locale, 19, "normal");
  ctx.fillStyle = COLORS.excerpt;
  ctx.fillText(m.excerpt[0] ?? "", x + 22, cb + 64 + LINE * m.title.length);
}
