import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GachaArchiveBanner, GachaArchiveSource, GachaChannelCategory } from "./gachaArchive.js";
import type { AnalyzedGachaRecord, GachaSummary } from "./gachaAnalysis.js";
import { getZzzOfficialNumberFont } from "./canvasFonts.js";
import { resolveGachaWeaponIcon } from "./gachaWeaponIcons.js";
import { resolveGachaBangbooIcon } from "./gachaBangbooIcons.js";
import {
  drawGtCard,
  GT_CARD_COMPACT_SIZE,
  loadGtCardAssets,
  safeGtCardImage,
  type GtCardAssets,
} from "./gtCardRenderer.js";
import {
  drawZeroPageBackground,
  loadZeroPageBackground,
  type ZeroPageBackgroundAssets,
} from "./zeroPageBackground.js";
import { signalCategoryText, signalText } from "./recordText.js";
import { overviewMetrics, overviewStatCards, renderSignalOverview, sItemCounts, statsEntries, ticketValue } from "./signalLogOverview.js";
import {
  bannerUpItems,
  coverPlacement,
  drawWrappedName,
  fitWithFont,
  fittedNumberSize,
  formatDate,
  gtCardKind,
  gtCardSource,
  IMAGE_DIR,
  itemIcon,
  prepareGtCard,
  remoteImage,
  text,
  wrapNameLines,
  wrappedName,
  type WrappedName,
} from "./signalLogPaper.js";

const WIDTH = 1044;
const OUTPUT_SCALE = 2;
const ASSET_DIR = join(".", "src", "assets", "images", "zzz", "official-record");
const RECORD_GRID_X = 48;
const RECORD_GRID_WIDTH = 948;
const RECORD_GRID_Y = 251;
const RECORD_GRID_COLUMNS = 5;
const RECORD_CARD_SIZE = GT_CARD_COMPACT_SIZE * 2;
const RECORD_CARD_GAP = 40;
const RECORD_NAME_WIDTH = 184;
const RECORD_NAME_SIZE = 14;
const RECORD_NAME_LINE_HEIGHT = 18;
const RECORD_NAME_GAP = 8;
const RECORD_ROW_BOTTOM_PADDING = 16;
const RECORD_BOTTOM_PADDING = 48;
const RECORD_PULL_NUMBER_STYLE = {
  fontSize: 20,
  lineWidth: 5,
  fill: "#fff",
  stroke: "rgba(0,0,0,.92)",
  insetX: 7,
  centerY: 18,
} as const;
const RECORD_GRID_START_X = RECORD_GRID_X
  + (RECORD_GRID_WIDTH - (RECORD_GRID_COLUMNS * RECORD_CARD_SIZE
    + (RECORD_GRID_COLUMNS - 1) * RECORD_CARD_GAP)) / 2;

export interface SignalLogRenderInput {
  locale?: string;
  source: GachaArchiveSource;
  uid: string;
  playerName?: string | null;
  archivedAt?: string | null;
  stale?: boolean;
  category: GachaChannelCategory;
  bannerLabel: string;
  banner?: Pick<GachaArchiveBanner, "name" | "version" | "channelCategory" | "upItems">;
  headerItem?: {
    id: string;
    name: string;
    itemType: "bangboo";
    rarity: "S";
    icon?: string;
  };
  summary: GachaSummary;
  view: "overview" | "records";
  page: number;
  details?: any;
  pityEstimated?: boolean;
}

interface RendererAssets {
  pageBackground: ZeroPageBackgroundAssets;
  recordsTop: Image;
  topIcon: Image;
  resources: Image[];
  gtCard: GtCardAssets;
}

function rr(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius = 16): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.closePath();
}

function createScaledCanvas(height: number) {
  const canvas = createCanvas(WIDTH * OUTPUT_SCALE, height * OUTPUT_SCALE);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.scale(OUTPUT_SCALE, OUTPUT_SCALE);
  return { canvas, ctx };
}

async function officialItemImage(input: {
  id?: string;
  itemType?: string;
  icon?: string;
}): Promise<Image | null> {
  const id = String(input.id ?? "");
  if (!id) return null;
  const kind = gtCardKind(input.itemType ?? "", id);
  if (kind === "weapon" || kind === "bangboo") {
    const source = kind === "weapon"
      ? await resolveGachaWeaponIcon(id)
      : await resolveGachaBangbooIcon(id);
    if (source) {
      const resolvedImage = /^https?:\/\//i.test(source)
        ? await remoteImage(source)
        : await safeGtCardImage(source);
      if (resolvedImage) return resolvedImage;
    }
  }
  if (input.icon) {
    const direct = await remoteImage(input.icon);
    if (direct) return direct;
  }
  const local = kind === "character"
    ? join(IMAGE_DIR, "icons", "roleCircle", `${id}.webp`)
    : "";
  if (existsSync(local)) {
    try { return await loadImage(local); } catch { /* fall through to the official CDN */ }
  }
  const record = { itemId: id, itemType: input.itemType ?? "" } as AnalyzedGachaRecord;
  return remoteImage(itemIcon(record));
}

function drawCircleItem(ctx: SKRSContext2D, image: Image | null, x: number, y: number, radius: number, placeholder = "S"): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#d9d5cb";
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  if (image) {
    const diameter = radius * 2;
    const placement = coverPlacement(image.width, image.height, diameter, diameter);
    if (placement) {
      ctx.drawImage(
        image,
        x - radius + placement.x,
        y - radius + placement.y,
        placement.width,
        placement.height,
      );
    }
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, radius + 1, 0, Math.PI * 2);
  ctx.strokeStyle = "#f1d547";
  ctx.lineWidth = 2;
  ctx.stroke();
  if (!image) text(ctx, placeholder, x, y + 1, Math.max(14, radius * .65), "#242523", "center", true);
}

function drawImagePanel(ctx: SKRSContext2D, image: Image, x: number, y: number, width: number, height: number, overlay = "rgba(5,6,6,.20)"): void {
  ctx.save();
  rr(ctx, x, y, width, height, 17);
  ctx.clip();
  ctx.drawImage(image, x, y, width, height);
  ctx.fillStyle = overlay;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
  rr(ctx, x, y, width, height, 17);
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawFlatPanel(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, accent = false): void {
  rr(ctx, x, y, width, height, 13);
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, "rgba(31,36,40,.98)");
  gradient.addColorStop(1, "rgba(15,18,20,.98)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(160,171,177,.34)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (accent) {
    ctx.fillStyle = "#f1d547";
    ctx.fillRect(x + 15, y, Math.min(150, width * .28), 3);
  }
}

function resultLabel(record: AnalyzedGachaRecord): string {
  if (record.guaranteeResult === "guaranteed") return "大保底";
  if (record.guaranteeResult === "won") return "未歪";
  if (record.guaranteeResult === "lost") return "歪卡";
  if (record.isUp === true) return "UP · 無法判定";
  if (record.isUp === false) return "常駐 · 無法判定";
  if (record.guaranteeResult === "unknown") return "無法判定";
  return "";
}

function progressColor(position: number | null, hardPity: number): string {
  if (position === null) return "#777";
  const ratio = position / hardPity;
  return ratio >= .84 ? "#ff8269" : ratio >= .58 ? "#ffbd5a" : "#9ce9d7";
}

async function loadAssets(): Promise<RendererAssets> {
  const [pageBackground, recordsTop, topIcon, poly, encrypted, original, bangboo, gtCard] = await Promise.all([
    loadZeroPageBackground(),
    loadImage(join(ASSET_DIR, "records-top-card.8af7750c.png")),
    loadImage(join(ASSET_DIR, "icon-top.140345aa.png")),
    loadImage(join(ASSET_DIR, "icon-feilin-summary.8643ebfe.png")),
    loadImage(join(IMAGE_DIR, "icons", "gacha", "character.png")),
    loadImage(join(ASSET_DIR, "icon-origin-master.1b749a67.png")),
    loadImage(join(ASSET_DIR, "icon-bangboo-summary.3b54ed6e.png")),
    loadGtCardAssets(),
  ]);
  return { pageBackground, recordsTop, topIcon, resources: [poly, encrypted, original, bangboo], gtCard };
}

function drawBase(ctx: SKRSContext2D, height: number, assets: RendererAssets): void {
  drawZeroPageBackground(ctx, WIDTH, height, assets.pageBackground);
}

async function drawHeader(ctx: SKRSContext2D, input: SignalLogRenderInput, assets: RendererAssets): Promise<void> {
  const copy = signalText(input.locale);
  drawImagePanel(ctx, assets.recordsTop, 48, 24, 948, 128, "rgba(9,12,14,.42)");
  const upItems = bannerUpItems(input).slice(0, 3);
  const icons = await Promise.all(upItems.map((item) => officialItemImage(item)));
  const avatarStart = 92;
  if (upItems.length) {
    upItems.forEach((_, index) => drawCircleItem(ctx, icons[index] ?? null, avatarStart + index * 52, 88, 38, "?"));
  } else {
    drawCircleItem(ctx, null, avatarStart, 88, 38, "?");
  }
  const avatarCount = Math.max(1, upItems.length);
  const titleX = avatarStart + (avatarCount - 1) * 52 + 56;
  const upNames = upItems.map((item) => item.name).filter(Boolean).join("／");
  const categoryLabel = signalCategoryText(input.locale, input.category);
  const genericName = input.banner?.name && !categoryLabel.includes(input.banner.name)
    ? input.banner.name
    : "";
  const title = upNames || genericName || input.bannerLabel;
  const titleLayout = wrappedName(ctx, title, Math.max(180, 718 - titleX), 32, 2, 18);
  const titleFirstBaseline = titleLayout.lines.length === 1
    ? 70
    : 70 - titleLayout.lineHeight / 2;
  drawWrappedName(ctx, titleLayout, titleX, titleFirstBaseline, "#f4f4f2", "left");
  const meta = [input.banner?.version, categoryLabel].filter(Boolean).join(" · ");
  const metaY = titleLayout.lines.length > 1 ? 119 : 110;
  text(ctx, fitWithFont(ctx, meta, Math.max(180, 718 - titleX), 16), titleX, metaY, 16, "#aeb1af");
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.fillRect(742, 43, 1, 90);
  text(ctx, fitWithFont(ctx, input.playerName || copy.recordTitle, 218, 22), 976, 49, 22, "#e1e3e1", "right");
  text(ctx, `UID ${fitWithFont(ctx, input.uid, 180, 18)}`, 976, 81, 18, "#b7bab8", "right", true);
  const update = input.stale
    ? `${copy.syncFailed} · ${copy.updatedAt} ${formatDate(input.archivedAt, true, input.locale)}`
    : `${copy.updatedAt} ${formatDate(input.archivedAt, true, input.locale)}`;
  text(ctx, fitWithFont(ctx, update, 218, 14), 976, 116, 14, input.stale ? "#ff9a72" : "#858987", "right");
}

function drawRecordPullNumber(
  ctx: SKRSContext2D,
  value: number | null,
  x: number,
  y: number,
): void {
  const label = recordPullLabel(value);
  ctx.save();
  ctx.font = `${RECORD_PULL_NUMBER_STYLE.fontSize}px ${getZzzOfficialNumberFont("tw")}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = RECORD_PULL_NUMBER_STYLE.lineWidth;
  ctx.strokeStyle = RECORD_PULL_NUMBER_STYLE.stroke;
  ctx.strokeText(label, x, y);
  ctx.fillStyle = RECORD_PULL_NUMBER_STYLE.fill;
  ctx.fillText(label, x, y);
  ctx.restore();
}

function recordPullLabel(value: number | null): string {
  return value === null ? "?" : String(value);
}

function recordCardPlacement(index: number, rowOffsets: number[] = []) {
  const column = index % RECORD_GRID_COLUMNS;
  const row = Math.floor(index / RECORD_GRID_COLUMNS);
  const x = RECORD_GRID_START_X + column * (RECORD_CARD_SIZE + RECORD_CARD_GAP);
  const defaultRowHeight = RECORD_CARD_SIZE + RECORD_NAME_GAP
    + RECORD_NAME_LINE_HEIGHT + RECORD_ROW_BOTTOM_PADDING;
  const y = RECORD_GRID_Y + (rowOffsets[row] ?? row * defaultRowHeight);
  return { column, row, x, y };
}

function recordGridLayout(names: string[]) {
  const measureContext = createCanvas(1, 1).getContext("2d");
  const nameLayouts = names.map((name): WrappedName => ({
    lines: wrapNameLines(measureContext, name, RECORD_NAME_WIDTH, RECORD_NAME_SIZE),
    size: RECORD_NAME_SIZE,
    lineHeight: RECORD_NAME_LINE_HEIGHT,
  }));
  const rowCount = Math.max(1, Math.ceil(names.length / RECORD_GRID_COLUMNS));
  const rowHeights = Array.from({ length: rowCount }, (_, row) => {
    const layouts = nameLayouts.slice(row * RECORD_GRID_COLUMNS, (row + 1) * RECORD_GRID_COLUMNS);
    const lineCount = Math.max(1, ...layouts.map((layout) => layout.lines.length));
    return RECORD_CARD_SIZE + RECORD_NAME_GAP
      + lineCount * RECORD_NAME_LINE_HEIGHT + RECORD_ROW_BOTTOM_PADDING;
  });
  const rowOffsets: number[] = [];
  let offset = 0;
  rowHeights.forEach((height) => {
    rowOffsets.push(offset);
    offset += height;
  });
  return {
    height: RECORD_GRID_Y + offset + RECORD_BOTTOM_PADDING,
    rowHeights,
    placements: nameLayouts.map((name, index) => ({
      ...recordCardPlacement(index, rowOffsets),
      name,
    })),
  };
}

async function renderRecords(input: SignalLogRenderInput): Promise<Buffer> {
  const copy = signalText(input.locale);
  const records = input.summary.records.slice(input.page * 20, input.page * 20 + 20);
  const layout = recordGridLayout(records.map((record) => record.name));
  const { canvas, ctx } = createScaledCanvas(layout.height);
  const assets = await loadAssets();
  drawBase(ctx, layout.height, assets);
  await drawHeader(ctx, input, assets);
  drawFlatPanel(ctx, 48, 168, 948, 65, true);
  text(ctx, copy.allRecords, 66, 200, 29, "#f2f3f2");
  const first = records[0]?.pulledAt, last = records[records.length - 1]?.pulledAt;
  text(ctx, records.length ? `${formatDate(last, false, input.locale)}－${formatDate(first, false, input.locale)}` : copy.noRecords, 978, 196, 17, "#c5c8c6", "right");
  text(ctx, `${copy.page} ${input.page + 1} · 20`, 978, 219, 14, "#898c8a", "right");
  const cards = await Promise.all(records.map((record) => prepareGtCard(input, {
    id: String(record.itemId ?? ""),
    itemType: record.itemType,
    rarity: record.rank,
  })));
  records.forEach((record, index) => {
    const { x, y, name } = layout.placements[index]!;
    const card = cards[index]!;
    drawGtCard(ctx, card.item, card.kind, x, y, RECORD_CARD_SIZE, card.images, assets.gtCard);
    drawRecordPullNumber(
      ctx,
      record.pityPosition,
      x + RECORD_CARD_SIZE - RECORD_PULL_NUMBER_STYLE.insetX,
      y + RECORD_PULL_NUMBER_STYLE.centerY,
    );
    drawWrappedName(
      ctx,
      name,
      x + RECORD_CARD_SIZE / 2,
      y + RECORD_CARD_SIZE + RECORD_NAME_GAP + RECORD_NAME_LINE_HEIGHT / 2,
    );
  });
  if (!records.length) text(ctx, copy.noRecords, 522, RECORD_GRID_Y + 80, 24, "#9a9d9b", "center");
  return canvas.toBuffer("image/png");
}

export async function renderSignalLog(input: SignalLogRenderInput): Promise<Buffer> {
  return input.view === "records" ? renderRecords(input) : renderSignalOverview(input);
}

export const __signalLogRendererInternals = {
  itemIcon,
  resultLabel,
  ticketValue,
  formatDate,
  progressColor,
  sItemCounts,
  bannerUpItems,
  gtCardKind,
  gtCardSource,
  coverPlacement,
  recordPullLabel,
  recordPullNumberStyle: RECORD_PULL_NUMBER_STYLE,
  recordCardPlacement,
  recordGridLayout,
  wrapNameLines,
  fittedNumberSize,
  outputScale: OUTPUT_SCALE,
  overviewMetrics,
  overviewStatCards,
  statsEntries,

  recordGridMetrics: {
    cardSize: RECORD_CARD_SIZE,
    columns: RECORD_GRID_COLUMNS,
    gap: RECORD_CARD_GAP,
    nameWidth: RECORD_NAME_WIDTH,
    nameSize: RECORD_NAME_SIZE,
    nameLineHeight: RECORD_NAME_LINE_HEIGHT,
    startX: RECORD_GRID_START_X,
    startY: RECORD_GRID_Y,
  },
};
