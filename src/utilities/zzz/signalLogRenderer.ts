import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GachaArchiveBanner, GachaArchiveSource, GachaChannelCategory } from "./gachaArchive.js";
import { normalizeRank, type AnalyzedGachaRecord, type GachaSummary } from "./gachaAnalysis.js";
import { getZzzOfficialFont, getZzzOfficialNumberFont } from "./canvasFonts.js";
import { resolveGachaWeaponIcon } from "./gachaWeaponIcons.js";
import { resolveGachaBangbooIcon } from "./gachaBangbooIcons.js";
import {
  drawGtCard,
  GT_CARD_COMPACT_SIZE,
  loadGtCardAssets,
  loadGtCardMetadataImages,
  safeGtCardImage,
  type GtCardAssets,
  type GtCardItem,
  type GtCardKind,
  type GtCardRank,
} from "./gtCardRenderer.js";
import {
  drawZeroPageBackground,
  loadZeroPageBackground,
  type ZeroPageBackgroundAssets,
} from "./zeroPageBackground.js";
import { normalizeZzzLocale } from "./canvasFonts.js";
import { signalCategoryText, signalText } from "./recordText.js";

const WIDTH = 1044;
const OUTPUT_SCALE = 2;
const IMAGE_DIR = join(".", "src", "assets", "images");
const ASSET_DIR = join(".", "src", "assets", "images", "zzz", "official-record");
const OFFICIAL_CDN = "https://act-webstatic.hoyoverse.com/game_record/zzzv2";
const remoteImageCache = new Map<string, Promise<Image | null>>();
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
const OFFICIAL_INFO_PANEL_HEIGHT = 154;
const OFFICIAL_INFO_BLOCK_HEIGHT = 170;
const OFFICIAL_INFO_ROW_STEP = 72;
const OFFICIAL_INFO_DIVIDER_Y = 77;
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

function fit(ctx: SKRSContext2D, value: unknown, width: number): string {
  const original = String(value ?? "");
  if (ctx.measureText(original).width <= width) return original;
  let result = original;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > width) result = result.slice(0, -1);
  return `${result}…`;
}

function text(
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

function fitWithFont(ctx: SKRSContext2D, value: string, width: number, size: number): string {
  ctx.font = `${size}px ${getZzzOfficialFont("tw")}`;
  return fit(ctx, value, width);
}

function fittedNumberSize(
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

interface WrappedName {
  lines: string[];
  size: number;
  lineHeight: number;
}

function wrapNameLines(ctx: SKRSContext2D, value: unknown, width: number, size: number): string[] {
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

function wrappedName(
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

function drawWrappedName(
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

function createScaledCanvas(height: number) {
  const canvas = createCanvas(WIDTH * OUTPUT_SCALE, height * OUTPUT_SCALE);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.scale(OUTPUT_SCALE, OUTPUT_SCALE);
  return { canvas, ctx };
}

function itemIcon(record: AnalyzedGachaRecord): string {
  const id = Number(record.itemId);
  if (!Number.isFinite(id) || id <= 0) return "";
  if (id < 10000) return `${OFFICIAL_CDN}/role_square_avatar/role_square_avatar_${record.itemId}.png`;
  if (id < 50000) return `${OFFICIAL_CDN}/weapon_square_avatar/weapon_square_avatar_${record.itemId}.png`;
  return `${OFFICIAL_CDN}/bangboo_square_avatar/bangboo_square_avatar_${record.itemId}.png`;
}

async function remoteImage(url: string): Promise<Image | null> {
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

function bannerUpItems(input: SignalLogRenderInput) {
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

interface GtCardSourceItem {
  id: string;
  itemType: string;
  rarity: GtCardRank;
  icon?: string;
  elementType?: number;
  subElementType?: number;
  profession?: string | number;
}

function gtCardKind(itemType: string, itemId: string): GtCardKind {
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

function gtCardSource(
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

async function prepareGtCard(
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

function coverPlacement(
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

function formatDate(value?: string | null, withTime = true, locale?: string): string {
  if (!value) return signalText(locale).notSynced;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const intlLocale: Record<string, string> = { tw: "zh-TW", cn: "zh-CN", jp: "ja-JP", kr: "ko-KR", fr: "fr-FR", vi: "vi-VN", en: "en-US" };
  return new Intl.DateTimeFormat(intlLocale[normalizeZzzLocale(locale)] ?? "en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

function ticketEntry(details: any, matcher: (type: string) => boolean): any | undefined {
  const tickets = Array.isArray(details?.tickets) ? details.tickets : [];
  return tickets.find((item: any) => matcher(String(item?.ticket_type ?? "").toUpperCase()));
}

function ticketValue(details: any, matcher: (type: string) => boolean): number {
  return Number(ticketEntry(details, matcher)?.ticket_cnt ?? 0);
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

function displayValue(amount: number | null, suffix = ""): string {
  return amount === null ? "—" : `${amount}${suffix}`;
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

function statsEntries(summary: GachaSummary, category: GachaChannelCategory, locale?: string): Array<[string, string, boolean]> {
  const copy = signalText(locale);
  const limited = ["character_up", "character_return", "weapon_up", "weapon_return"].includes(category);
  return [
    [copy.total, String(summary.total), false],
    [copy.averageS, displayValue(summary.averageS), false],
    [copy.averageUp, limited ? displayValue(summary.averageUp) : "—", limited],
    [copy.winRate, limited ? displayValue(summary.winRate, "%") : "—", limited],
  ];
}

async function drawOfficialOverviewInfo(
  ctx: SKRSContext2D,
  input: SignalLogRenderInput,
  assets: RendererAssets,
  y: number,
): Promise<number> {
  const copy = signalText(input.locale);
  const panelWidth = 464;
  const panelHeight = OFFICIAL_INFO_PANEL_HEIGHT;
  drawFlatPanel(ctx, 48, y, panelWidth, panelHeight, true);
  drawFlatPanel(ctx, 532, y, panelWidth, panelHeight);
  const entries: Array<[string, number]> = [
    [copy.polychrome, ticketValue(input.details, (type) => type.endsWith("POLYCHROME"))],
    [copy.encrypted, ticketValue(input.details, (type) => type.endsWith("ENCRYPTED_MASTER_TAPE"))],
    [copy.original, ticketValue(input.details, (type) => type.endsWith("MASTER_TAPE") && !type.includes("ENCRYPTED"))],
    [copy.boopon, ticketValue(input.details, (type) => type.endsWith("BOOPON"))],
  ];
  if (!input.details || !Array.isArray(input.details.tickets)) {
    text(ctx, copy.liveResources, 72, y + 38, 16, "#d6d8d6");
    text(ctx, copy.unavailable, 72, y + 79, 26, "#929593");
  } else {
    const matchers = [
      (type: string) => type.endsWith("POLYCHROME"),
      (type: string) => type.endsWith("ENCRYPTED_MASTER_TAPE"),
      (type: string) => type.endsWith("MASTER_TAPE") && !type.includes("ENCRYPTED"),
      (type: string) => type.endsWith("BOOPON"),
    ];
    const apiIcons = await Promise.all(matchers.map(async (matcher) => {
      const ticket = ticketEntry(input.details, matcher);
      const url = String(ticket?.icon ?? ticket?.icon_url ?? ticket?.item_icon ?? "");
      return url ? remoteImage(url) : null;
    }));
    entries.forEach(([name, amount], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const cellX = 66 + column * 222;
      const cellY = y + 10 + row * OFFICIAL_INFO_ROW_STEP;
      ctx.drawImage(apiIcons[index] ?? assets.resources[index]!, cellX, cellY + 3, 38, 38);
      text(ctx, name, cellX + 48, cellY + 15, 15, "#aeb1af");
      const amountLabel = amount.toLocaleString("zh-TW");
      const amountRight = column === 0 ? 268 : 492;
      text(ctx, amountLabel, cellX + 48, cellY + 43,
        fittedNumberSize(ctx, amountLabel, amountRight - (cellX + 48), 30),
        "#f5f5f5", "left", true);
    });
    ctx.fillStyle = "rgba(255,255,255,.10)";
    ctx.fillRect(280, y + 14, 1, 126);
    ctx.fillRect(66, y + OFFICIAL_INFO_DIVIDER_Y, 424, 1);
  }

  const stats = statsEntries(input.summary, input.category, input.locale);
  stats.forEach(([label, amount, highlighted], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const cellX = 556 + column * 220;
    const cellY = y + 10 + row * OFFICIAL_INFO_ROW_STEP;
    text(ctx, label, cellX, cellY + 15, 15, "#aeb1af");
    const amountRight = column === 0 ? 752 : 976;
    text(ctx, amount, cellX, cellY + 45,
      fittedNumberSize(ctx, amount, amountRight - cellX, 32),
      highlighted ? "#ffde00" : "#f4f4f4", "left", true);
  });
  ctx.fillStyle = "rgba(255,255,255,.10)";
  ctx.fillRect(764, y + 14, 1, 126);
  ctx.fillRect(556, y + OFFICIAL_INFO_DIVIDER_Y, 416, 1);
  return y + OFFICIAL_INFO_BLOCK_HEIGHT;
}

function drawManualOverviewInfo(ctx: SKRSContext2D, input: SignalLogRenderInput, y: number): number {
  drawFlatPanel(ctx, 48, y, 948, 84, true);
  statsEntries(input.summary, input.category, input.locale).forEach(([label, amount, highlighted], index) => {
    const x = 72 + index * 237;
    text(ctx, label, x, y + 25, 15, "#aeb1af");
    text(ctx, amount, x, y + 58, 32, highlighted ? "#ffde00" : "#f4f4f4", "left", true);
    if (index < 3) {
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(x + 211, y + 17, 1, 50);
    }
  });
  return y + 100;
}

async function drawOverviewInfo(
  ctx: SKRSContext2D,
  input: SignalLogRenderInput,
  assets: RendererAssets,
  y: number,
): Promise<number> {
  return input.source === "official"
    ? drawOfficialOverviewInfo(ctx, input, assets, y)
    : drawManualOverviewInfo(ctx, input, y);
}

function drawCurrentPity(ctx: SKRSContext2D, input: SignalLogRenderInput, y: number): number {
  const copy = signalText(input.locale);
  drawFlatPanel(ctx, 48, y, 948, 84);
  drawCircleItem(ctx, null, 97, y + 42, 32, "?");
  text(ctx, copy.currentPity, 145, y + 29, 26);
  if (input.pityEstimated) text(ctx, copy.estimated, 318, y + 29, 12, "#929593");
  const pity = input.summary.currentPity;
  const hard = input.summary.hardPity;
  const pityColor = progressColor(pity, hard);
  text(ctx, `/ ${hard}`, 968, y + 42, 22, "#929593", "right", true);
  text(ctx, pity === null ? "?" : String(pity), 902, y + 42, 40, pityColor, "right", true);
  const barX = 145, barY = y + 64, barW = 685, barH = 8;
  rr(ctx, barX, barY, barW, barH, 12);
  ctx.fillStyle = "#303331";
  ctx.fill();
  if (pity !== null) {
    rr(ctx, barX, barY, Math.max(8, Math.min(barW, pity / hard * barW)), barH, 12);
    ctx.fillStyle = pityColor;
    ctx.fill();
  }
  return y + 94;
}

interface SItemCount {
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

function sItemCounts(input: SignalLogRenderInput): SItemCount[] {
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

function sSummaryHeight(input: SignalLogRenderInput): number {
  const visible = sItemCounts(input).slice(input.page * 10, input.page * 10 + 10).length;
  if (!visible) return input.page === 0 ? 104 : 0;
  return 70 + Math.ceil(visible / 5) * 96 + 16;
}

async function drawSItemSummary(
  ctx: SKRSContext2D,
  input: SignalLogRenderInput,
  assets: RendererAssets,
  y: number,
): Promise<number> {
  const copy = signalText(input.locale);
  const items = sItemCounts(input).slice(input.page * 10, input.page * 10 + 10);
  if (!items.length && input.page > 0) return y;
  const rows = Math.ceil(items.length / 5);
  const height = items.length ? 70 + rows * 96 : 88;
  drawFlatPanel(ctx, 48, y, 948, height, true);
  text(ctx, copy.periodS, 72, y + 35, 28, "#f1f2f1");
  if (!items.length) {
    text(ctx, copy.noS, 966, y + 35, 17, "#8e918f", "right");
    return y + height + 16;
  }
  const cards = await Promise.all(items.map((item) => prepareGtCard(input, {
    id: item.id,
    itemType: item.itemType,
    rarity: "S",
    icon: item.icon,
    elementType: item.elementType,
    subElementType: item.subElementType,
    profession: item.profession,
  })));
  items.forEach((item, index) => {
    const column = index % 5;
    const row = Math.floor(index / 5);
    const rowCount = Math.min(5, items.length - row * 5);
    const rowWidth = rowCount * 188;
    const x = 48 + (948 - rowWidth) / 2 + column * 188;
    const centerY = y + 100 + row * 96;
    const card = cards[index]!;
    drawGtCard(ctx, card.item, card.kind, x, centerY - 38, GT_CARD_COMPACT_SIZE, card.images, assets.gtCard);
    const nameLayout = wrappedName(ctx, item.name, 98, 18, 2, 12);
    const nameFirstBaseline = nameLayout.lines.length === 1
      ? centerY - 17
      : centerY - 27;
    drawWrappedName(ctx, nameLayout, x + 84, nameFirstBaseline, "#e7e8e6", "left");
    text(ctx, `×${item.count}`, x + 84, centerY + 18, 28, item.isUp ? "#f1d547" : "#b9bcba", "left", true);
  });
  return y + height + 16;
}

async function drawSRecords(ctx: SKRSContext2D, input: SignalLogRenderInput, records: AnalyzedGachaRecord[], assets: RendererAssets, y: number): Promise<number> {
  const copy = signalText(input.locale);
  text(ctx, copy.sRecords, 48, y + 26, 31);
  text(ctx, `${copy.page} ${input.page + 1} · ${copy.perPage10}`, 996, y + 26, 17, "#929593", "right");
  y += 53;
  if (input.page === 0) y = drawCurrentPity(ctx, input, y);
  if (!records.length) {
    drawFlatPanel(ctx, 48, y, 948, 120);
    text(ctx, copy.noSForBanner, 522, y + 60, 24, "#9a9d9b", "center");
    return y + 138;
  }
  const cards = await Promise.all(records.map((record) => prepareGtCard(input, {
    id: String(record.itemId ?? ""),
    itemType: record.itemType,
    rarity: record.rank,
  })));
  records.forEach((record, index) => {
    const x = 48, cardY = y + index * 94;
    drawFlatPanel(ctx, x, cardY, 948, 84, false);
    const card = cards[index]!;
    drawGtCard(ctx, card.item, card.kind, 97 - GT_CARD_COMPACT_SIZE / 2, cardY + 4, GT_CARD_COMPACT_SIZE, card.images, assets.gtCard);
    const nameX = 145;
    const nameLayout = wrappedName(ctx, record.name, 218, 24, 2, 12);
    const nameFirstBaseline = nameLayout.lines.length === 1
      ? cardY + 29
      : cardY + 19;
    drawWrappedName(ctx, nameLayout, nameX, nameFirstBaseline, "#f3f3f3", "left");
    if (record.isUp === true) {
      ctx.font = `${nameLayout.size}px ${getZzzOfficialFont("tw")}`;
      const widestLine = Math.max(...nameLayout.lines.map((line) => ctx.measureText(line).width));
      ctx.drawImage(assets.topIcon, Math.min(401, nameX + 8 + widestLine), cardY + 18, 68, 19);
    }
    const count = record.pityPosition;
    const countColor = progressColor(count, input.summary.hardPity);
    text(ctx, `/ ${input.summary.hardPity}`, x + 920, cardY + 42, 22, "#929593", "right", true);
    text(ctx, count === null ? "?" : String(count), x + 854, cardY + 42, 40, countColor, "right", true);
    const barX = nameX, barY = cardY + 64, barW = 685;
    rr(ctx, barX, barY, barW, 8, 5);
    ctx.fillStyle = "#343735";
    ctx.fill();
    if (count !== null) {
      rr(ctx, barX, barY, Math.max(8, Math.min(barW, count / input.summary.hardPity * barW)), 8, 5);
      ctx.fillStyle = countColor;
      ctx.fill();
    }
  });
  return y + records.length * 94;
}

async function renderOverview(input: SignalLogRenderInput): Promise<Buffer> {
  const records = input.summary.sRecords.slice(input.page * 10, input.page * 10 + 10);
  const infoHeight = input.source === "official" ? OFFICIAL_INFO_BLOCK_HEIGHT : 100;
  const summaryHeight = sSummaryHeight(input);
  const pityHeight = input.page === 0 ? 94 : 0;
  const listHeight = records.length ? records.length * 94 : 138;
  const height = 168 + infoHeight + summaryHeight + 53 + pityHeight + listHeight + 48;
  const { canvas, ctx } = createScaledCanvas(height);
  const assets = await loadAssets();
  drawBase(ctx, height, assets);
  await drawHeader(ctx, input, assets);
  let y = 168;
  y = await drawOverviewInfo(ctx, input, assets, y);
  y = await drawSItemSummary(ctx, input, assets, y);
  await drawSRecords(ctx, input, records, assets, y);
  return canvas.toBuffer("image/png");
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
  return input.view === "records" ? renderRecords(input) : renderOverview(input);
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
  overviewMetrics: {
    currentItemCenterX: 97,
    sRecordCardX: 97 - GT_CARD_COMPACT_SIZE / 2,
    contentX: 145,
    progressWidth: 685,
    officialInfoPanelHeight: OFFICIAL_INFO_PANEL_HEIGHT,
    officialInfoBlockHeight: OFFICIAL_INFO_BLOCK_HEIGHT,
    officialInfoDividerY: OFFICIAL_INFO_DIVIDER_Y,
  },
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
