import { loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { join } from "node:path";
import type { GachaChannelCategory } from "./gachaArchive.js";
import type { AnalyzedGachaRecord, GachaSummary } from "./gachaAnalysis.js";
import { getZzzOfficialFont } from "./canvasFonts.js";
import { drawGtCard, loadGtCardAssets, type GtCardAssets } from "./gtCardRenderer.js";
import { signalCategoryText, signalText } from "./recordText.js";
import { SIGNAL_LOG_PAGE_SIZE, signalLogPageCount } from "./signalLogPagination.js";
import {
  createScaledCanvas,
  drawGlassCard,
  drawHeroBanner,
  drawPaper,
  fitWithFont,
  fittedNumberSize,
  IMAGE_DIR,
  NUMBER_FONT,
  numberText,
  PAPER,
  prepareGtCard,
  progressColor,
  remoteImage,
  signalAccent,
  text,
  WIDTH,
} from "./signalLogPaper.js";
import type { SignalLogRenderInput } from "./signalLogRenderer.js";

const ASSET_DIR = join(IMAGE_DIR, "zzz", "official-record");
const MARGIN = 16;
const HERO_HEIGHT = 300;
const GAP = 12;
const RESOURCE_ROW_HEIGHT = 64;
const STAT_HEIGHT = 96;
const SECTION_HEIGHT = 48;
const ROW_HEIGHT = 76;
const ROW_GAP = 10;
const EMPTY_HEIGHT = 120;
const FOOTER_HEIGHT = 44;
const CONTENT_WIDTH = WIDTH - MARGIN * 2;

const TICKET_MATCHERS = [
  (type: string) => type.endsWith("POLYCHROME"),
  (type: string) => type.endsWith("ENCRYPTED_MASTER_TAPE"),
  (type: string) => type.endsWith("MASTER_TAPE") && !type.includes("ENCRYPTED"),
  (type: string) => type.endsWith("BOOPON"),
];

function ticketEntry(details: any, matcher: (type: string) => boolean): any | undefined {
  const tickets = Array.isArray(details?.tickets) ? details.tickets : [];
  return tickets.find((item: any) => matcher(String(item?.ticket_type ?? "").toUpperCase()));
}

export function ticketValue(details: any, matcher: (type: string) => boolean): number {
  return Number(ticketEntry(details, matcher)?.ticket_cnt ?? 0);
}

function hasResourceRow(input: SignalLogRenderInput): boolean {
  return input.source === "official" && Array.isArray(input.details?.tickets) && input.details.tickets.length > 0;
}

function displayValue(amount: number | null, suffix = ""): string {
  return amount === null ? "—" : `${amount}${suffix}`;
}

export function statsEntries(summary: GachaSummary, category: GachaChannelCategory, locale?: string): Array<[string, string, boolean]> {
  const copy = signalText(locale);
  const limited = ["character_up", "character_return", "weapon_up", "weapon_return"].includes(category);
  return [
    [copy.total, String(summary.total), false],
    [copy.averageS, displayValue(summary.averageS), false],
    [copy.averageUp, limited ? displayValue(summary.averageUp) : "—", limited],
    [copy.winRate, limited ? displayValue(summary.winRate, "%") : "—", limited],
  ];
}

/** Stat cards in display order; the current-pity card only belongs to the first page. */
export function overviewStatCards(input: SignalLogRenderInput): Array<[string, string, boolean]> {
  const cards = statsEntries(input.summary, input.category, input.locale);
  if (input.page !== 0) return cards;
  const pity = input.summary.currentPity;
  return [...cards, [signalText(input.locale).currentPity, pity === null ? "?" : String(pity), true]];
}

export interface SItemCount {
  id: string;
  name: string;
  itemType: string;
  icon: string;
  count: number;
  isUp: boolean;
  elementType?: number;
  subElementType?: number;
  profession?: string | number;
}

export function sItemCounts(input: SignalLogRenderInput): SItemCount[] {
  const bannerItems = new Map((input.banner?.upItems ?? []).map((item) => [String(item.id), item]));
  const counts = new Map<string, SItemCount>();
  for (const record of input.summary.sRecords) {
    const id = String(record.itemId ?? "");
    const key = id || `name:${record.name}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
      existing.isUp ||= record.isUp === true;
      continue;
    }
    const bannerItem = bannerItems.get(id);
    counts.set(key, {
      id,
      name: record.name,
      itemType: record.itemType,
      icon: bannerItem?.icon ?? "",
      count: 1,
      isUp: record.isUp === true,
      elementType: bannerItem?.elementType,
      subElementType: bannerItem?.subElementType,
      profession: bannerItem?.profession,
    });
  }
  return [...counts.values()].sort((left, right) =>
    Number(right.isUp) - Number(left.isUp)
    || right.count - left.count
    || left.name.localeCompare(right.name, "zh-Hant"));
}

export function pageLabel(locale: string | undefined, page: number, pages: number): string {
  return signalText(locale).pageOf.replace("{page}", String(page + 1)).replace("{pages}", String(pages));
}

export function hasTopBadge(record: Pick<AnalyzedGachaRecord, "isUp">): boolean {
  return record.isUp === true;
}

let topIcon: Promise<Image> | null = null;
export function loadTopIcon(): Promise<Image> {
  topIcon ??= loadImage(join(ASSET_DIR, "icon-top.140345aa.png"));
  return topIcon;
}

const TOP_HEIGHT = 18;

export function topBadgeWidth(top: Image): number {
  return top.width * TOP_HEIGHT / top.height;
}

/** Draws the TOP icon left-aligned at x, vertically centred on y. */
export function drawTopBadge(ctx: SKRSContext2D, top: Image, x: number, y: number): void {
  ctx.drawImage(top, x, y - TOP_HEIGHT / 2, topBadgeWidth(top), TOP_HEIGHT);
}

function drawBar(ctx: SKRSContext2D, x: number, y: number, width: number, value: number | null, max: number, color: string): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, 8, 4);
  ctx.fillStyle = "#e4ddd3";
  ctx.fill();
  if (value === null) return;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(8, Math.min(width, value / max * width)), 8, 4);
  ctx.fillStyle = color;
  ctx.fill();
}

async function drawResourceRow(ctx: SKRSContext2D, input: SignalLogRenderInput, y: number): Promise<void> {
  const copy = signalText(input.locale);
  const fallbacks = await Promise.all([
    join(ASSET_DIR, "icon-feilin-summary.8643ebfe.png"),
    join(IMAGE_DIR, "icons", "gacha", "character.png"),
    join(ASSET_DIR, "icon-origin-master.1b749a67.png"),
    join(ASSET_DIR, "icon-bangboo-summary.3b54ed6e.png"),
  ].map((file) => loadImage(file)));
  const icons: Array<Image | null> = await Promise.all(TICKET_MATCHERS.map(async (matcher) => {
    const ticket = ticketEntry(input.details, matcher);
    const url = String(ticket?.icon ?? ticket?.icon_url ?? ticket?.item_icon ?? "");
    return url ? remoteImage(url) : null;
  }));
  const names = [copy.polychrome, copy.encrypted, copy.original, copy.boopon];
  drawGlassCard(ctx, MARGIN, y, CONTENT_WIDTH, RESOURCE_ROW_HEIGHT);
  const cell = CONTENT_WIDTH / 4;
  names.forEach((name, index) => {
    const x = MARGIN + index * cell + 16;
    ctx.drawImage(icons[index] ?? fallbacks[index]!, x, y + 14, 36, 36);
    text(ctx, fitWithFont(ctx, name, cell - 70, 13), x + 46, y + 21, 13, PAPER.muted);
    const amount = ticketValue(input.details, TICKET_MATCHERS[index]!).toLocaleString("en-US");
    numberText(ctx, amount, x + 46, y + 44, fittedNumberSize(ctx, amount, cell - 70, 22), PAPER.ink);
    if (index) {
      ctx.fillStyle = PAPER.line;
      ctx.fillRect(MARGIN + index * cell, y + 14, 1, RESOURCE_ROW_HEIGHT - 28);
    }
  });
}

function drawStatCards(ctx: SKRSContext2D, input: SignalLogRenderInput, y: number): void {
  const copy = signalText(input.locale);
  const accent = signalAccent(input);
  const cards = overviewStatCards(input);
  const gap = 10;
  const width = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;
  cards.forEach(([label, value], index) => {
    const x = MARGIN + index * (width + gap);
    const pityCard = input.page === 0 && index === cards.length - 1;
    drawGlassCard(ctx, x, y, width, STAT_HEIGHT, pityCard ? { border: accent } : {});
    const labelText = pityCard && input.pityEstimated ? `${label} · ${copy.estimated}` : label;
    text(ctx, fitWithFont(ctx, labelText, width - 28, 14), x + 14, y + 22, 14, PAPER.muted);
    if (!pityCard) {
      numberText(ctx, value, x + 14, y + 60, fittedNumberSize(ctx, value, width - 28, 34));
      return;
    }
    const hard = input.summary.hardPity;
    const color = progressColor(input.summary.currentPity, hard);
    numberText(ctx, value, x + 14, y + 56, 34, color);
    ctx.font = `34px ${NUMBER_FONT}`;
    const valueWidth = ctx.measureText(value).width;
    numberText(ctx, `/${hard}`, x + 18 + valueWidth, y + 62, 16, PAPER.muted);
    if (input.summary.nextGuaranteed) {
      text(ctx, copy.bigGuarantee, x + width - 14, y + 56, 13, accent, "right");
    }
    drawBar(ctx, x + 14, y + 78, width - 28, input.summary.currentPity, hard, color);
  });
}

async function drawSectionHeader(ctx: SKRSContext2D, input: SignalLogRenderInput, y: number, cardAssets: GtCardAssets): Promise<void> {
  const copy = signalText(input.locale);
  ctx.font = `bold 22px ${getZzzOfficialFont(input.locale)}`;
  ctx.fillStyle = PAPER.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(copy.sRecords, MARGIN + 8, y + 24);
  const titleWidth = ctx.measureText(copy.sRecords).width;
  numberText(ctx, input.summary.sRecords.length, MARGIN + 16 + titleWidth, y + 25, 20, PAPER.muted);
  const items = sItemCounts(input).slice(0, 6);
  const cards = await Promise.all(items.map((item) => prepareGtCard(input, {
    id: item.id, itemType: item.itemType, rarity: "S", icon: item.icon,
    elementType: item.elementType, subElementType: item.subElementType, profession: item.profession,
  })));
  let x = WIDTH - MARGIN - 8;
  for (let index = items.length - 1; index >= 0; index--) {
    const label = `×${items[index]!.count}`;
    ctx.font = `20px ${NUMBER_FONT}`;
    const labelWidth = ctx.measureText(label).width;
    numberText(ctx, label, x, y + 25, 20, items[index]!.isUp ? PAPER.ink : PAPER.muted, "right");
    x -= labelWidth + 6 + 36;
    const card = cards[index]!;
    drawGtCard(ctx, card.item, card.kind, x, y + 6, 36, card.images, cardAssets);
    x -= 14;
  }
}

async function drawSRecordGrid(
  ctx: SKRSContext2D,
  input: SignalLogRenderInput,
  records: AnalyzedGachaRecord[],
  y: number,
  cardAssets: GtCardAssets,
): Promise<void> {
  const copy = signalText(input.locale);
  if (!records.length) {
    drawGlassCard(ctx, MARGIN, y, CONTENT_WIDTH, EMPTY_HEIGHT);
    text(ctx, input.banner ? copy.noSForBanner : copy.noS, WIDTH / 2, y + EMPTY_HEIGHT / 2, 20, PAPER.muted, "center");
    return;
  }
  const [cards, top] = await Promise.all([
    Promise.all(records.map((record) => prepareGtCard(input, {
      id: String(record.itemId ?? ""), itemType: record.itemType, rarity: record.rank,
    }))),
    loadTopIcon(),
  ]);
  const width = (CONTENT_WIDTH - ROW_GAP) / 2;
  const hard = input.summary.hardPity;
  records.forEach((record, index) => {
    const x = MARGIN + (index % 2) * (width + ROW_GAP);
    const rowY = y + Math.floor(index / 2) * (ROW_HEIGHT + ROW_GAP);
    drawGlassCard(ctx, x, rowY, width, ROW_HEIGHT, { radius: 12 });
    const card = cards[index]!;
    drawGtCard(ctx, card.item, card.kind, x + 10, rowY + 10, 56, card.images, cardAssets);
    const nameX = x + 78;
    const numberWidth = 70;
    const badge = hasTopBadge(record);
    const reserved = badge ? topBadgeWidth(top) + 8 : 0;
    const nameMax = width - (nameX - x) - numberWidth - 40 - reserved;
    const name = fitWithFont(ctx, record.name, nameMax, 18);
    ctx.font = `bold 18px ${getZzzOfficialFont(input.locale)}`;
    ctx.fillStyle = PAPER.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(name, nameX, rowY + 28);
    if (badge) drawTopBadge(ctx, top, nameX + ctx.measureText(name).width + 8, rowY + 28);
    const color = progressColor(record.pityPosition, hard);
    drawBar(ctx, nameX, rowY + 50, width - (nameX - x) - numberWidth - 14, record.pityPosition, hard, color);
    numberText(ctx, record.pityPosition === null ? "?" : record.pityPosition, x + width - 14, rowY + ROW_HEIGHT / 2 + 2, 32, color, "right");
  });
}

function gridHeight(count: number): number {
  return count ? Math.ceil(count / 2) * (ROW_HEIGHT + ROW_GAP) - ROW_GAP : EMPTY_HEIGHT;
}

export async function renderSignalOverview(input: SignalLogRenderInput): Promise<Buffer> {
  const records = input.summary.sRecords.slice(input.page * SIGNAL_LOG_PAGE_SIZE, (input.page + 1) * SIGNAL_LOG_PAGE_SIZE);
  const resources = hasResourceRow(input);
  const height = HERO_HEIGHT + GAP
    + (resources ? RESOURCE_ROW_HEIGHT + GAP : 0)
    + STAT_HEIGHT + GAP
    + SECTION_HEIGHT
    + gridHeight(records.length)
    + FOOTER_HEIGHT;
  const { canvas, ctx } = createScaledCanvas(height);
  const cardAssets = await loadGtCardAssets();
  drawPaper(ctx, height);
  const subtitle = [input.banner?.version, signalCategoryText(input.locale, input.category)].filter(Boolean).join(" · ");
  await drawHeroBanner(ctx, input, HERO_HEIGHT, subtitle);
  let y = HERO_HEIGHT + GAP;
  if (resources) {
    await drawResourceRow(ctx, input, y);
    y += RESOURCE_ROW_HEIGHT + GAP;
  }
  drawStatCards(ctx, input, y);
  y += STAT_HEIGHT + GAP;
  await drawSectionHeader(ctx, input, y, cardAssets);
  y += SECTION_HEIGHT;
  await drawSRecordGrid(ctx, input, records, y, cardAssets);
  const pages = signalLogPageCount(input.summary, "overview");
  text(ctx, pageLabel(input.locale, input.page, pages), WIDTH - MARGIN - 8, height - FOOTER_HEIGHT / 2, 13, PAPER.muted, "right");
  return canvas.toBuffer("image/png");
}

export const overviewMetrics = { resourceRowHeight: RESOURCE_ROW_HEIGHT + GAP };
