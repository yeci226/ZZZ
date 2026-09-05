import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { join } from "node:path";
import { getZzzOfficialFont, getZzzOfficialNumberFont } from "./canvasFonts.js";
import { resolveGachaWeaponIcon } from "./gachaWeaponIcons.js";
import {
  drawGtCard,
  GT_CARD_COMPACT_SIZE,
  GT_CARD_OVERLAY,
  GT_CARD_PC_SIZE,
  loadGtCardAssets,
  loadGtCardMetadataImages,
  originalRatioPlacement,
  type GtCardAssets,
  type GtCardItem,
  type GtCardRank,
} from "./gtCardRenderer.js";
import {
  drawZeroPageBackground,
  loadZeroPageBackground,
} from "./zeroPageBackground.js";

const WIDTH = 1044;
const OUTPUT_SCALE = 2;
const SIDE = 20;
const GAP = 12;
const COLUMN_WIDTH = (WIDTH - SIDE * 2 - GAP) / 2;
const ASSET_DIR = join(".", "src", "assets", "images", "zzz", "official-record");
const GT_CARD_SIZE = GT_CARD_COMPACT_SIZE;
const GT_CARD_SCALE = GT_CARD_SIZE / GT_CARD_PC_SIZE;
const GT_CARD_GAP = 6;
const GT_CARDS_PER_ROW = 5;
const OFFICIAL_CLOCK_SVG = Buffer.from(`<svg width="10" height="10" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.75 5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM10 5A5 5 0 110 5a5 5 0 0110 0zM5 5V2a3 3 0 11-2.882 2.166L5 5z" fill="#FFDE00"/></svg>`);

type BannerSide = "agent" | "weapon";
type BannerState = "active" | "upcoming";

interface NormalizedSchedule {
  raw: any;
  side: BannerSide;
  state: BannerState;
  sourceIndex: number;
  startMs: number | null;
  endMs: number | null;
  startLeft: number | null;
  endLeft: number | null;
}

interface BannerPair {
  agent: NormalizedSchedule | null;
  weapon: NormalizedSchedule | null;
}

interface BannerItem extends GtCardItem {
  id: string;
  name: string;
  icon: string;
  rarity: GtCardRank;
  elementType: number | null;
  subElementType: number | null;
  profession: unknown;
}

interface GuaranteeStatus {
  visible: boolean;
  label: "已觸發" | "未觸發" | null;
}

function fit(ctx: SKRSContext2D, value: unknown, width: number) {
  let valueText = String(value ?? "");
  if (ctx.measureText(valueText).width <= width) return valueText;
  while (valueText.length > 1 && ctx.measureText(`${valueText}…`).width > width) valueText = valueText.slice(0, -1);
  return `${valueText}…`;
}

function countdown(seconds: unknown) {
  let value = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(value / 86400); value %= 86400;
  const hours = Math.floor(value / 3600);
  return days ? `${String(days).padStart(2, "0")}天${String(hours).padStart(2, "0")}時` : `${String(hours).padStart(2, "0")}時`;
}

function timestampMs(value: unknown): number | null {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value.trim()))) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (amount >= 10_000_000_000) return amount;
    if (amount >= 1_000_000_000) return amount * 1000;
    return null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function relativeSeconds(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount < 1_000_000_000 ? amount : null;
}

function rawStart(schedule: any) {
  return schedule?.start_ts ?? schedule?.start_time ?? schedule?.start_at;
}

function rawEnd(schedule: any) {
  return schedule?.end_ts ?? schedule?.end_time ?? schedule?.end_at;
}

function scheduleState(schedule: any, now: number): BannerState | "ended" {
  const raw = String(schedule?.gacha_state ?? schedule?.state ?? "").toUpperCase();
  const start = timestampMs(rawStart(schedule));
  const end = timestampMs(rawEnd(schedule));
  if (raw.includes("COMPLETE") || raw.includes("INACTIVE") || raw.includes("CLOSE") || raw.includes("FINISH") || raw.includes("EXPIRE") || raw.includes("ENDED")) return "ended";
  if (end !== null && end <= now) return "ended";
  if (raw.includes("NOT_START") || raw.includes("UPCOMING") || raw.includes("LOCK")) return "upcoming";
  if (start !== null && start > now) return "upcoming";
  if (raw.includes("PROGRESS") || raw.includes("ACTIVE") || raw.includes("OPEN")) return "active";
  if (relativeSeconds(schedule?.left_start_ts ?? schedule?.left_start_time) !== null) return "upcoming";
  return "active";
}

function normalizeSchedule(raw: any, side: BannerSide, sourceIndex: number, now: number): NormalizedSchedule | null {
  const state = scheduleState(raw, now);
  if (state === "ended") return null;
  return {
    raw,
    side,
    state,
    sourceIndex,
    startMs: timestampMs(rawStart(raw)),
    endMs: timestampMs(rawEnd(raw)),
    startLeft: relativeSeconds(raw?.left_start_ts ?? raw?.left_start_time),
    endLeft: relativeSeconds(raw?.left_end_ts ?? raw?.left_end_time),
  };
}

function strictPeriodKey(schedule: NormalizedSchedule): string | null {
  if (schedule.startMs !== null && schedule.endMs !== null) return `${schedule.startMs}:${schedule.endMs}`;
  return null;
}

function relativePeriodKey(schedule: NormalizedSchedule): string | null {
  const version = String(schedule.raw?.version ?? "");
  const countdownValue = schedule.state === "upcoming" ? schedule.startLeft : schedule.endLeft;
  if (!version && countdownValue === null) return null;
  return `${version}:${schedule.state}:${countdownValue ?? ""}`;
}

function loosePeriodKey(schedule: NormalizedSchedule) {
  return `${String(schedule.raw?.version ?? "")}:${schedule.state}`;
}

function isSupportedSchedule(schedule: any, side: BannerSide) {
  const type = String(schedule?.gacha_type ?? "").toUpperCase();
  if (!type) return true;
  return side === "agent"
    ? type.includes("CHARACTER") || type.includes("AVATAR")
    : type.includes("WEAPON") || type.includes("W_ENGINE");
}

function pairSchedules(calendar: any, now = Date.now()): BannerPair[] {
  const agents = (Array.isArray(calendar?.avatar_gacha_schedule_list) ? calendar.avatar_gacha_schedule_list : [])
    .filter((raw: any) => isSupportedSchedule(raw, "agent"))
    .map((raw: any, index: number) => normalizeSchedule(raw, "agent", index, now))
    .filter(Boolean) as NormalizedSchedule[];
  const weapons = (Array.isArray(calendar?.weapon_gacha_schedule_list) ? calendar.weapon_gacha_schedule_list : [])
    .filter((raw: any) => isSupportedSchedule(raw, "weapon"))
    .map((raw: any, index: number) => normalizeSchedule(raw, "weapon", index, now))
    .filter(Boolean) as NormalizedSchedule[];
  const unusedWeapons = new Set(weapons.map((_, index) => index));
  const rows: BannerPair[] = [];

  for (const agent of agents) {
    const findWeapon = (key: (schedule: NormalizedSchedule) => string | null) => {
      const agentKey = key(agent);
      if (agentKey === null) return -1;
      return weapons.findIndex((weapon, index) => unusedWeapons.has(index) && key(weapon) === agentKey);
    };
    let weaponIndex = findWeapon(strictPeriodKey);
    if (weaponIndex < 0) weaponIndex = findWeapon(relativePeriodKey);
    if (weaponIndex < 0) weaponIndex = findWeapon(loosePeriodKey);
    if (weaponIndex >= 0) unusedWeapons.delete(weaponIndex);
    rows.push({ agent, weapon: weaponIndex >= 0 ? weapons[weaponIndex] : null });
  }
  for (const index of unusedWeapons) rows.push({ agent: null, weapon: weapons[index] });

  const orderValue = (row: BannerPair) => {
    const schedule = row.agent ?? row.weapon;
    if (!schedule) return Number.MAX_SAFE_INTEGER;
    const stateOrder = schedule.state === "active" ? 0 : 1;
    const time = schedule.state === "active"
      ? schedule.endMs ?? ((schedule.endLeft ?? Number.MAX_SAFE_INTEGER) * 1000 + now)
      : schedule.startMs ?? ((schedule.startLeft ?? Number.MAX_SAFE_INTEGER) * 1000 + now);
    return stateOrder * 10_000_000_000_000 + time;
  };
  return rows.sort((left, right) => orderValue(left) - orderValue(right));
}

function channelLabel(type: unknown) {
  const value = String(type ?? "").toUpperCase();
  if (value.includes("CHARACTER_RETURN") || value.includes("AVATAR_RETURN")) return "獨家重映";
  if (value.includes("CHARACTER") || value.includes("AVATAR")) return "獨家頻道";
  if (value.includes("WEAPON_RETURN") || value.includes("W_ENGINE_RETURN")) return "音擎迴響";
  if (value.includes("WEAPON") || value.includes("W_ENGINE")) return "音擎頻道";
  return String(type ?? "頻道");
}

function normalizedRarity(value: unknown): BannerItem["rarity"] {
  const rarity = String(value ?? "").toUpperCase();
  if (rarity === "S" || rarity === "4" || rarity === "5") return "S";
  if (rarity === "A" || rarity === "3" || rarity === "4_STAR") return "A";
  return "B";
}

function scheduleItems(schedule: any): BannerItem[] {
  const isAgent = Array.isArray(schedule?.avatar_list);
  const list = schedule?.avatar_list ?? schedule?.weapon_list ?? schedule?.item_list ?? [];
  return (Array.isArray(list) ? list : []).map((item: any) => ({
    id: String(item?.id ?? item?.item_id ?? item?.avatar_id ?? item?.weapon_id ?? ""),
    name: String(isAgent
      ? item?.avatar_name ?? item?.full_name ?? item?.name ?? "未知項目"
      : item?.talent_title ?? item?.weapon_name ?? item?.name ?? item?.full_name ?? "未知項目"),
    icon: String(item?.icon ?? item?.icon_url ?? item?.square_icon ?? ""),
    rarity: normalizedRarity(item?.rarity ?? item?.rank_type),
    elementType: Number.isFinite(Number(item?.avatar_element_type ?? item?.element_type))
      ? Number(item?.avatar_element_type ?? item?.element_type) : null,
    subElementType: Number.isFinite(Number(item?.avatar_sub_element_type ?? item?.sub_element_type))
      ? Number(item?.avatar_sub_element_type ?? item?.sub_element_type) : null,
    profession: item?.avatar_profession ?? item?.profession,
  }));
}

async function safeImage(url: unknown) {
  if (!url) return null;
  try { return await loadImage(url as any); } catch { return null; }
}

async function bannerItemImage(item: BannerItem, side: BannerSide) {
  if (side === "weapon" && item.id) {
    const bigIcon = await resolveGachaWeaponIcon(item.id);
    const image = await safeImage(bigIcon);
    if (image) return image;
  }
  return safeImage(item.icon);
}

function ticketLabel(type: unknown) {
  const value = String(type ?? "").toUpperCase();
  if (value.endsWith("RECHARGE_MONOCHROME")) return "單色";
  if (value.endsWith("POLYCHROME")) return "菲林";
  if (value.endsWith("ENCRYPTED_MASTER_TAPE")) return "加密母帶";
  if (value.endsWith("MASTER_TAPE")) return "原裝母帶";
  if (value.endsWith("BOOPON")) return "邦布券";
  return String(type ?? "");
}

function guaranteeStatus(schedule: any): GuaranteeStatus {
  const type = String(schedule?.gacha_type ?? "").toUpperCase();
  const isRerun = type.includes("RETURN");
  if (!isRerun) return { visible: false, label: null };
  if (!("sup_lock_show" in (schedule ?? {}))) return { visible: true, label: null };
  const value = schedule.sup_lock_show;
  if (value === true || value === 1 || value === "1") return { visible: true, label: "未觸發" };
  if (value === false || value === 0 || value === "0") return { visible: true, label: "已觸發" };
  return { visible: true, label: null };
}

function countdownFor(schedule: NormalizedSchedule, now: number) {
  if (schedule.state === "upcoming") {
    if (schedule.startLeft !== null) return schedule.startLeft;
    if (schedule.startMs !== null) return Math.max(0, Math.floor((schedule.startMs - now) / 1000));
  } else {
    if (schedule.endLeft !== null) return schedule.endLeft;
    if (schedule.endMs !== null) return Math.max(0, Math.floor((schedule.endMs - now) / 1000));
  }
  return 0;
}

function cardHeight(schedule: NormalizedSchedule | null) {
  if (!schedule) return 0;
  const rows = Math.max(1, Math.ceil(scheduleItems(schedule.raw).length / GT_CARDS_PER_ROW));
  const guarantee = guaranteeStatus(schedule.raw).visible;
  return 42 + GT_CARD_SIZE + (rows - 1) * (GT_CARD_SIZE + GT_CARD_GAP) + (guarantee ? 28 : 0);
}

interface BannerAssets {
  clock: any;
  locked: any;
  discount: any;
  hot: any;
  discountMask: any;
  gtCard: GtCardAssets;
}

function roundedPanel(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.fillStyle = "rgba(255, 255, 255, .08)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, .04)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

async function drawResourceRow(ctx: SKRSContext2D, details: any, locale: string | undefined, y: number) {
  const tickets = Array.isArray(details?.tickets) ? details.tickets : [];
  const resourceTypes = [
    { key: "POLYCHROME", label: "菲林", icon: "icon-feilin-summary.8643ebfe.png" },
    { key: "ENCRYPTED_MASTER_TAPE", label: "加密母帶", icon: "icon-encrypted-master.728d9443.png" },
    { key: "MASTER_TAPE", label: "原裝母帶", icon: "icon-origin-master.1b749a67.png" },
    { key: "BOOPON", label: "邦布券", icon: "icon-bangboo-summary.3b54ed6e.png" },
  ];
  const icons = await Promise.all(resourceTypes.map((resource) => safeImage(join(ASSET_DIR, resource.icon))));
  const pillWidth = 190;
  const pillHeight = 28;
  const pillGap = 10;
  const startX = (WIDTH - pillWidth * resourceTypes.length - pillGap * (resourceTypes.length - 1)) / 2;
  resourceTypes.forEach((resource, index) => {
    const x = startX + index * (pillWidth + pillGap);
    const ticket = tickets.find((entry: any) => {
      const type = String(entry?.ticket_type ?? entry?.type ?? "").toUpperCase();
      if (resource.key === "MASTER_TAPE") return type.endsWith("MASTER_TAPE") && !type.endsWith("ENCRYPTED_MASTER_TAPE");
      return type.endsWith(resource.key);
    });
    ctx.beginPath(); ctx.roundRect(x, y, pillWidth, pillHeight, 14);
    ctx.fillStyle = "#000"; ctx.fill();
    ctx.strokeStyle = "#2a2c2b"; ctx.lineWidth = 1; ctx.stroke();
    if (icons[index]) ctx.drawImage(icons[index]!, x + 8, y - 5, 36, 36);
    ctx.fillStyle = "#f5f5f2";
    ctx.font = `16px ${getZzzOfficialNumberFont(locale)}`;
    ctx.textAlign = "right";
    ctx.fillText(String(ticket?.ticket_cnt ?? ticket?.count ?? 0), x + pillWidth - 12, y + 20);
    ctx.textAlign = "left";
  });
}

function drawDiscountCopy(
  ctx: SKRSContext2D,
  side: BannerSide,
  x: number,
  baseline: number,
  locale?: string,
) {
  ctx.font = `12px ${getZzzOfficialFont(locale)}`;
  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.fillText("首次", x, baseline);
  let cursor = x + ctx.measureText("首次").width;
  ctx.fillStyle = "#ffb500";
  ctx.fillText("S", cursor, baseline);
  cursor += ctx.measureText("S").width;
  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.fillText(side === "agent" ? "訊號必定為UP代理人" : "訊號必定為UP音擎", cursor, baseline);
}

async function drawCard(
  ctx: SKRSContext2D,
  schedule: NormalizedSchedule,
  x: number,
  y: number,
  height: number,
  locale: string | undefined,
  assets: BannerAssets,
  now: number,
) {
  const alpha = schedule.state === "upcoming" ? 0.5 : 1;
  roundedPanel(ctx, x, y, COLUMN_WIDTH, height, alpha);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.roundRect(x, y, COLUMN_WIDTH, height, 4); ctx.clip();

  const guarantee = guaranteeStatus(schedule.raw);
  if (assets.discount && guarantee.visible) ctx.drawImage(assets.discount, x, y, 170, 60);

  const headerY = y + 8;
  ctx.font = `12px ${getZzzOfficialNumberFont(locale)}`;
  const version = String(schedule.raw?.version ?? "—");
  const versionWidth = Math.max(25, Math.ceil(ctx.measureText(version).width + 8));
  ctx.beginPath(); ctx.roundRect(x + 8, headerY, versionWidth, 18, 4);
  ctx.fillStyle = schedule.state === "upcoming" ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.48)"; ctx.fill();
  ctx.fillStyle = schedule.state === "upcoming" ? "rgba(255,255,255,.35)" : "#111";
  ctx.textAlign = "center"; ctx.fillText(version, x + 8 + versionWidth / 2, headerY + 14); ctx.textAlign = "left";

  const typeX = x + 8 + versionWidth + 4;
  ctx.fillStyle = schedule.state === "upcoming" ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.9)";
  ctx.font = `600 12px ${getZzzOfficialFont(locale)}`;
  const typeText = channelLabel(schedule.raw?.gacha_type);
  const fittedType = fit(ctx, typeText, 132);
  ctx.fillText(fittedType, typeX, headerY + 14);
  const typeWidth = ctx.measureText(fittedType).width;
  if (guarantee.visible && assets.hot) ctx.drawImage(assets.hot, typeX + typeWidth + 4, headerY + 2, 25, 14);

  const countText = countdown(countdownFor(schedule, now));
  const suffix = schedule.state === "upcoming" ? "後開放" : "";
  const timeText = `${countText}${suffix}`;
  ctx.font = `12px ${getZzzOfficialNumberFont(locale)}`;
  const labelWidth = ctx.measureText(timeText).width;
  const iconWidth = schedule.state === "upcoming" ? 9 : 10;
  const iconHeight = schedule.state === "upcoming" ? 11 : 10;
  const pillWidth = Math.ceil(labelWidth + iconWidth + 12);
  const timeX = x + COLUMN_WIDTH - 8 - pillWidth;
  ctx.beginPath(); ctx.roundRect(timeX, headerY, pillWidth, 18, 9);
  ctx.fillStyle = schedule.state === "upcoming" ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.08)"; ctx.fill();
  const timeIcon = schedule.state === "upcoming" ? assets.locked : assets.clock;
  if (timeIcon) ctx.drawImage(timeIcon, timeX + 4, headerY + (18 - iconHeight) / 2, iconWidth, iconHeight);
  ctx.fillStyle = schedule.state === "upcoming" ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.65)";
  ctx.fillText(timeText, timeX + iconWidth + 6, headerY + 14);

  const items = scheduleItems(schedule.raw);
  const images = await Promise.all(items.map(async (item) => ({
    art: await bannerItemImage(item, schedule.side),
    ...await loadGtCardMetadataImages(item),
  })));
  const itemStartY = y + 34;
  items.forEach((item, index) => {
    const column = index % GT_CARDS_PER_ROW;
    const row = Math.floor(index / GT_CARDS_PER_ROW);
    drawGtCard(
      ctx,
      item,
      schedule.side === "agent" ? "character" : "weapon",
      x + 8 + column * (GT_CARD_SIZE + GT_CARD_GAP),
      itemStartY + row * (GT_CARD_SIZE + GT_CARD_GAP),
      GT_CARD_SIZE,
      images[index],
      assets.gtCard,
    );
  });

  if (guarantee.visible) {
    const statusY = y + height - 28;
    ctx.fillStyle = "rgba(255,255,255,.06)";
    ctx.fillRect(x + 8, statusY, COLUMN_WIDTH - 16, 20);
    if (assets.discountMask) ctx.drawImage(assets.discountMask, x + COLUMN_WIDTH - 268, statusY, 260, 20);
    drawDiscountCopy(ctx, schedule.side, x + 16, statusY + 15, locale);
    if (guarantee.label) {
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.font = `12px ${getZzzOfficialFont(locale)}`;
      ctx.fillText(guarantee.label, x + COLUMN_WIDTH - 16, statusY + 15);
      ctx.textAlign = "left";
    }
  }
  ctx.restore();
}

export async function renderOfficialBanner(input: {
  uid: string; locale?: string; calendar: any; details?: any; showPrivate: boolean; now?: number;
}): Promise<Buffer> {
  const now = input.now ?? Date.now();
  const pairs = pairSchedules(input.calendar, now);
  const hasResources = input.showPrivate && !!input.details;
  const contentStart = hasResources ? 72 : 38;
  const rowHeights = pairs.map((pair) => Math.max(
    cardHeight(pair.agent),
    cardHeight(pair.weapon),
  ));
  const emptyHeight = 160;
  const height = Math.max(180, contentStart + (pairs.length ? rowHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, pairs.length - 1) * GAP : emptyHeight) + 28);
  const canvas = createCanvas(WIDTH * OUTPUT_SCALE, height * OUTPUT_SCALE);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.scale(OUTPUT_SCALE, OUTPUT_SCALE);
  const [
    pageBackground, gtCard, clock, locked, discount, hot, discountMask,
  ] = await Promise.all([
    loadZeroPageBackground(),
    loadGtCardAssets(),
    safeImage(OFFICIAL_CLOCK_SVG),
    safeImage(join(ASSET_DIR, "icon-locked.5a07f363.png")),
    safeImage(join(ASSET_DIR, "gacha-discount-bg.f7d7554e.png")),
    safeImage(join(ASSET_DIR, "hot.3780623f.png")),
    safeImage(join(ASSET_DIR, "discount-tips-mask-pc.43838d59.png")),
  ]);
  const bannerAssets: BannerAssets = {
    clock,
    locked,
    discount,
    hot,
    discountMask,
    gtCard,
  };
  drawZeroPageBackground(ctx, WIDTH, height, pageBackground);

  if (hasResources) await drawResourceRow(ctx, input.details, input.locale, 31);
  ctx.textAlign = "right"; ctx.fillStyle = "rgba(0,0,0,.58)";
  ctx.font = `12px ${getZzzOfficialNumberFont(input.locale)}`;
  ctx.fillText(`UID ${input.uid}`, WIDTH - 18, 16); ctx.textAlign = "left";

  if (!pairs.length) {
    roundedPanel(ctx, SIDE, contentStart, WIDTH - SIDE * 2, 132);
    ctx.textAlign = "center"; ctx.fillStyle = "#aaa";
    ctx.font = `22px ${getZzzOfficialFont(input.locale)}`;
    ctx.fillText("目前沒有進行中或即將開放的限定頻道", WIDTH / 2, contentStart + 76); ctx.textAlign = "left";
  } else {
    let y = contentStart;
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[index];
      const rowHeight = rowHeights[index];
      if (pair.agent) await drawCard(ctx, pair.agent, SIDE, y, rowHeight, input.locale, bannerAssets, now);
      if (pair.weapon) await drawCard(ctx, pair.weapon, SIDE + COLUMN_WIDTH + GAP, y, rowHeight, input.locale, bannerAssets, now);
      y += rowHeight + GAP;
    }
  }
  return canvas.toBuffer("image/png");
}

export const __bannerRendererInternals = {
  countdown,
  channelLabel,
  ticketLabel,
  isSupportedSchedule,
  scheduleItems,
  scheduleState,
  pairSchedules,
  guaranteeStatus,
  cardHeight,
  originalRatioPlacement,
  outputScale: OUTPUT_SCALE,
  overlayMetrics: GT_CARD_OVERLAY,
  gtCardMetrics: {
    outerSize: GT_CARD_SIZE,
    pcSize: GT_CARD_PC_SIZE,
    scale: GT_CARD_SCALE,
    gap: GT_CARD_GAP,
    perRow: GT_CARDS_PER_ROW,
  },
};
