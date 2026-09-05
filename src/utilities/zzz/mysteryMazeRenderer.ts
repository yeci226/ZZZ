import {
  createCanvas,
  loadImage,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import { join } from "node:path";

import {
  getZzzOfficialFont,
  getZzzOfficialNumberFont,
  normalizeZzzLocale,
} from "./canvasFonts.js";
import {
  drawGtCard,
  drawMindscapeBadge,
  loadGtCardAssets,
  loadGtCardMetadataImages,
  safeGtCardImage,
  type GtCardItem,
  type GtCardRank,
} from "./gtCardRenderer.js";
import {
  drawZeroPageBackground,
  loadZeroPageBackground,
} from "./zeroPageBackground.js";

const WIDTH = 1044;
const MARGIN = 48;
export interface MysteryMazeLayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MYSTERY_MAZE_LAYOUT = {
  collection: {
    startX: 48,
    startY: 158,
    columns: 4,
    cardWidth: 225,
    cardHeight: 208,
    columnGap: 16,
    rowGap: 14,
  },
  record: {
    startY: 158,
    cardX: 41,
    cardWidth: 962,
    cardHeight: 196,
    rowGap: 20,
    info: { x: 67, y: 0, width: 275, height: 196 },
    team: { x: 364, y: 0, width: 346, height: 196 },
    rewards: { x: 730, y: 0, width: 258, height: 196 },
  },
} as const;

export function mysteryMazeRectanglesOverlap(
  left: MysteryMazeLayoutRect,
  right: MysteryMazeLayoutRect,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function rightAlignedIconValueRects(
  rightX: number,
  textWidth: number,
  iconSize = 18,
  gap = 8,
): { icon: MysteryMazeLayoutRect; value: MysteryMazeLayoutRect } {
  const valueX = rightX - Math.max(0, textWidth);
  return {
    icon: {
      x: valueX - gap - iconSize,
      y: 0,
      width: iconSize,
      height: iconSize,
    },
    value: { x: valueX, y: 0, width: Math.max(0, textWidth), height: iconSize },
  };
}
const ASSET = (...parts: string[]) =>
  join(
    process.cwd(),
    "src",
    "assets",
    "images",
    "zzz",
    "official-record",
    ...parts,
  );
const assets = {
  info: ASSET("info-card-bg.ac79107a.png"),
  weekly: ASSET("card-base.9e2bc63d.png"),
  coin: ASSET("icon-fund.4ff64536.png"),
  seasonCoin: ASSET("icon-season-coins.8fb93ad4.png"),
  clock: ASSET("icon-clock.98fd05c5.png"),
  map1: ASSET("map-1.a8737696.png"),
  map2: ASSET("map-2.bb95c0ca.png"),
  record: ASSET("records-top-card.8af7750c.png"),
  gain: ASSET("icon-gain-bg.c09c9484.png"),
  gainMore: ASSET("icon-gain-more.c6eedd38.png"),
  locked: ASSET("icon-locked.5a07f363.png"),
};

export interface MysteryMazeSeasonProgress {
  cur_quest?: number;
  max_quest?: number;
}
export interface MysteryMazeSeasonCurrency {
  cur_coin?: number;
  max_coin?: number;
}
export interface MysteryMazeSeason {
  cur_season_id?: number;
  season_level?: number;
  season_stage?: number;
  season_quest?: MysteryMazeSeasonProgress;
  season_coin?: MysteryMazeSeasonCurrency;
  refresh_time?: number;
}
export interface MysteryMazeMap {
  map_id?: string | number;
  map_name?: string;
  hell_unlock?: boolean;
  unlock?: boolean;
  is_challenge?: boolean;
  leave_percent?: string | number;
  success_rate?: string | number;
  max_price?: string | number;
  max_value?: string | number;
}
export interface MysteryMazeMedal {
  medal_id?: string | number;
  medal_icon?: string;
  name?: string;
  unlock?: boolean;
}
export interface MysteryMazeGoods {
  goods_id?: string | number;
  goods_icon?: string;
  name?: string;
  unlock?: boolean;
  number?: string | number;
  rarity?: string | number;
}
export interface MysteryMazeCollectionGroup<T> {
  cur?: number;
  total?: number;
  list?: T[];
  medal_list?: T[];
  goods_list?: T[];
  collection_list?: T[];
}
export interface MysteryMazeAbstract {
  nick_name?: string;
  avatar_icon?: string;
  season_unlock?: boolean;
  season_data?: MysteryMazeSeason;
  season?: MysteryMazeSeason;
  refresh_time?: number;
  abyss_duty?: { cur_duty?: number; max_duty?: number };
  collect_total_value?: string | number;
  big_red_num?: string | number;
  millions_evacuations?: string | number;
  max_rank?: number;
  is_show_percent?: boolean;
  map_list?: MysteryMazeMap[];
  collection_data?: {
    medal_data?: MysteryMazeCollectionGroup<MysteryMazeMedal>;
    goods_data?: MysteryMazeCollectionGroup<MysteryMazeGoods>;
  };
  collect_data?: Record<string, unknown>;
}
export interface MysteryMazeAvatar {
  id?: string | number;
  role_square_url?: string;
  icon_url?: string;
  icon?: string;
  rarity?: string | number;
  element_type?: number;
  sub_element_type?: number;
  avatar_profession?: string | number;
  rank?: number;
}
export interface MysteryMazeGain {
  id?: string | number;
  icon_url?: string;
  icon?: string;
  rarity?: string | number;
}
export interface MysteryMazeRecord {
  map_name?: string;
  is_success?: boolean;
  result?: string;
  start_time?: string | Record<string, string | number>;
  challenge_time_data?: Record<string, string | number>;
  challenge_time?: number | Record<string, string | number>;
  duration?: number | Record<string, string | number>;
  material_total_value?: string | number;
  total_value?: string | number;
  difficult?: string | number;
  difficulty?: string | number;
  difficulty_value?: string | number;
  avatar_list?: MysteryMazeAvatar[];
  role_list?: MysteryMazeAvatar[];
  item_list?: MysteryMazeGain[];
  gain_list?: MysteryMazeGain[];
}
export interface MysteryMazeDetail {
  max_rank?: number;
  is_show_percent?: boolean;
  map_list?: MysteryMazeMap[];
  maps?: MysteryMazeMap[];
  record_list?: MysteryMazeRecord[];
  records?: MysteryMazeRecord[];
  challenge_record_list?: MysteryMazeRecord[];
}
export interface MazeRenderOptions {
  uid: string;
  locale: string;
  abstract: MysteryMazeAbstract;
  detail?: MysteryMazeDetail;
}
export type MysteryMazePageKind = "overview" | "collection" | "records";
export interface MysteryMazeRenderedPage {
  kind: MysteryMazePageKind;
  page: number;
  pages: number;
  buffer: Buffer;
}

interface MazeCopy {
  title: string;
  proxy: string;
  season: string;
  seasonLevel: string;
  seasonGoal: string;
  stage: string;
  seasonCurrency: string;
  remaining: string;
  weekly: string;
  refresh: string;
  progress: string;
  dennies: string;
  rareGoods: string;
  millionExit: string;
  maps: string;
  hellMaps: string;
  successRate: string;
  maxValue: string;
  locked: string;
  maxFloor: string;
  collection: string;
  medals: string;
  goods: string;
  records: string;
  unknownMap: string;
  hard: string;
  hell: string;
  success: string;
  failed: string;
  exploreTime: string;
  empty: string;
  page: string;
  more: string;
}
const EN: MazeCopy = {
  title: "Mystery Maze",
  proxy: "Proxy",
  season: "Season",
  seasonLevel: "Season Level",
  seasonGoal: "Season Goal",
  stage: "Stage",
  seasonCurrency: "Season Currency",
  remaining: "remaining",
  weekly: "Weekly Goals",
  refresh: "Until refresh",
  progress: "Progress",
  dennies: "Dennies extracted",
  rareGoods: "Rare goods extracted",
  millionExit: "Million-Denny evacuations",
  maps: "Maps & Difficulty",
  hellMaps: "Inferno maps",
  successRate: "Evacuation rate",
  maxValue: "Highest value",
  locked: "Locked",
  maxFloor: "Highest floor",
  collection: "Collection",
  medals: "Medals",
  goods: "Rare goods",
  records: "Recent Records",
  unknownMap: "Unknown map",
  hard: "Hard",
  hell: "Inferno",
  success: "Evacuation successful",
  failed: "Evacuation failed",
  exploreTime: "Exploration time",
  empty: "No data available",
  page: "Page",
  more: "More",
};
const COPY: Record<string, Partial<MazeCopy>> = {
  tw: {
    title: "迷宮詭域",
    proxy: "繩匠",
    season: "季",
    seasonLevel: "賽季等級",
    seasonGoal: "賽季目標",
    stage: "階段",
    seasonCurrency: "賽季貨幣",
    remaining: "剩餘",
    weekly: "每週目標",
    refresh: "距離更新",
    progress: "進度",
    dennies: "累計帶出丁尼",
    rareGoods: "珍品帶出數",
    millionExit: "百萬丁尼撤離",
    maps: "地圖與難度",
    hellMaps: "煉獄模式地圖",
    successRate: "撤離成功率",
    maxValue: "最高價值",
    locked: "未解鎖",
    maxFloor: "最高層級",
    collection: "收藏",
    medals: "徽章",
    goods: "珍品",
    records: "近期紀錄",
    unknownMap: "未知地圖",
    hard: "困難",
    hell: "煉獄",
    success: "撤離成功",
    failed: "撤離失敗",
    exploreTime: "探索時間",
    empty: "目前沒有資料",
    page: "第",
    more: "更多",
  },
  cn: {
    title: "迷宫诡域",
    proxy: "绳匠",
    season: "季",
    seasonLevel: "赛季等级",
    seasonGoal: "赛季目标",
    stage: "阶段",
    seasonCurrency: "赛季货币",
    remaining: "剩余",
    weekly: "每周目标",
    refresh: "距离更新",
    progress: "进度",
    dennies: "累计带出丁尼",
    rareGoods: "珍品带出数",
    millionExit: "百万丁尼撤离",
    maps: "地图与难度",
    hellMaps: "炼狱模式地图",
    successRate: "撤离成功率",
    maxValue: "最高价值",
    locked: "未解锁",
    maxFloor: "最高层级",
    collection: "收藏",
    medals: "徽章",
    goods: "珍品",
    records: "近期记录",
    unknownMap: "未知地图",
    hard: "困难",
    hell: "炼狱",
    success: "撤离成功",
    failed: "撤离失败",
    exploreTime: "探索时间",
    empty: "目前没有数据",
    page: "第",
    more: "更多",
  },
  jp: {
    title: "迷宮奇域",
    proxy: "プロキシ",
    season: "シーズン",
    seasonLevel: "シーズンレベル",
    seasonGoal: "シーズン目標",
    stage: "段階",
    seasonCurrency: "シーズン通貨",
    remaining: "残り",
    weekly: "ウィークリー目標",
    refresh: "更新まで",
    progress: "進捗",
    dennies: "持ち帰ったディニー",
    rareGoods: "希少品",
    millionExit: "100万ディニー脱出",
    maps: "マップと難易度",
    hellMaps: "インフェルノマップ",
    successRate: "脱出成功率",
    maxValue: "最高価値",
    locked: "未開放",
    maxFloor: "最高階層",
    collection: "コレクション",
    medals: "勲章",
    goods: "希少品",
    records: "最近の記録",
    unknownMap: "不明なマップ",
    hard: "ハード",
    hell: "インフェルノ",
    success: "脱出成功",
    failed: "脱出失敗",
    exploreTime: "探索時間",
    empty: "データがありません",
    page: "ページ",
    more: "その他",
  },
  kr: {
    title: "미스터리 미궁",
    proxy: "로프꾼",
    season: "시즌",
    seasonLevel: "시즌 레벨",
    seasonGoal: "시즌 목표",
    stage: "단계",
    seasonCurrency: "시즌 재화",
    remaining: "남음",
    weekly: "주간 목표",
    refresh: "갱신까지",
    progress: "진행도",
    maps: "맵 및 난이도",
    locked: "잠김",
    collection: "수집",
    medals: "메달",
    goods: "진귀품",
    records: "최근 기록",
    hard: "어려움",
    hell: "연옥",
    success: "철수 성공",
    failed: "철수 실패",
    exploreTime: "탐색 시간",
    empty: "데이터 없음",
    page: "페이지",
    more: "더보기",
  },
  fr: {
    title: "Labyrinthe mystérieux",
    season: "Saison",
    seasonLevel: "Niveau de saison",
    seasonGoal: "Objectif de saison",
    stage: "Étape",
    seasonCurrency: "Monnaie saisonnière",
    remaining: "restant",
    weekly: "Objectifs hebdomadaires",
    refresh: "Actualisation dans",
    progress: "Progression",
    maps: "Cartes et difficulté",
    locked: "Verrouillé",
    collection: "Collection",
    medals: "Médailles",
    goods: "Objets rares",
    records: "Records récents",
    hard: "Difficile",
    hell: "Infernal",
    success: "Évacuation réussie",
    failed: "Évacuation échouée",
    exploreTime: "Temps d'exploration",
    empty: "Aucune donnée",
    page: "Page",
    more: "Plus",
  },
  vi: {
    title: "Mê Cung Bí Ẩn",
    season: "Mùa",
    seasonLevel: "Cấp mùa",
    seasonGoal: "Mục tiêu mùa",
    stage: "Giai đoạn",
    seasonCurrency: "Tiền mùa",
    remaining: "còn lại",
    weekly: "Mục tiêu tuần",
    refresh: "Làm mới sau",
    progress: "Tiến độ",
    maps: "Bản đồ & độ khó",
    locked: "Chưa mở",
    collection: "Bộ sưu tập",
    medals: "Huy chương",
    goods: "Vật phẩm quý",
    records: "Lịch sử gần đây",
    hard: "Khó",
    hell: "Luyện ngục",
    success: "Rút lui thành công",
    failed: "Rút lui thất bại",
    exploreTime: "Thời gian khám phá",
    empty: "Không có dữ liệu",
    page: "Trang",
    more: "Thêm",
  },
};

function labels(locale: string): MazeCopy {
  return { ...EN, ...(COPY[normalizeZzzLocale(locale)] ?? {}) };
}
function rr(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 10,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}
function write(
  ctx: SKRSContext2D,
  locale: string,
  value: unknown,
  x: number,
  y: number,
  size = 22,
  color = "#f2f3f2",
  align: CanvasTextAlign = "left",
  numeric = false,
) {
  ctx.font = `${size}px ${numeric ? getZzzOfficialNumberFont(locale) : getZzzOfficialFont(locale)}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(String(value ?? "-"), x, y);
}
function writeFitted(
  ctx: SKRSContext2D,
  locale: string,
  value: unknown,
  x: number,
  y: number,
  maximumWidth: number,
  size = 22,
  color = "#f2f3f2",
  align: CanvasTextAlign = "left",
  numeric = false,
) {
  ctx.font = `${size}px ${numeric ? getZzzOfficialNumberFont(locale) : getZzzOfficialFont(locale)}`;
  let text = String(value ?? "-");
  while (text.length > 1 && ctx.measureText(text).width > maximumWidth)
    text = `${text.slice(0, -2)}…`;
  write(ctx, locale, text, x, y, size, color, align, numeric);
}

function fitTextLines(
  ctx: SKRSContext2D,
  locale: string,
  value: unknown,
  maximumWidth: number,
  size: number,
  maximumLines = 2,
): string[] {
  ctx.font = `${size}px ${getZzzOfficialFont(locale)}`;
  const characters = Array.from(String(value ?? "-"));
  const lines: string[] = [""];
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index]!;
    const lineIndex = lines.length - 1;
    const candidate = `${lines[lineIndex]}${character}`;
    if (ctx.measureText(candidate).width <= maximumWidth) {
      lines[lineIndex] = candidate;
      continue;
    }
    if (lines.length < maximumLines) {
      lines.push(character);
      continue;
    }
    let finalLine = `${lines[lineIndex]}${characters.slice(index).join("")}`;
    while (
      finalLine.length > 1 &&
      ctx.measureText(`${finalLine}…`).width > maximumWidth
    )
      finalLine = finalLine.slice(0, -1);
    lines[lineIndex] = `${finalLine}…`;
    break;
  }
  return lines.filter(Boolean);
}

function drawRightIconValue(
  ctx: SKRSContext2D,
  locale: string,
  image: Image,
  value: unknown,
  rightX: number,
  centerY: number,
  fontSize = 16,
  iconSize = 18,
  gap = 8,
): void {
  const text = String(value ?? "-");
  ctx.font = `${fontSize}px ${getZzzOfficialNumberFont(locale)}`;
  const rects = rightAlignedIconValueRects(
    rightX,
    ctx.measureText(text).width,
    iconSize,
    gap,
  );
  ctx.drawImage(
    image,
    rects.icon.x,
    centerY - iconSize / 2,
    iconSize,
    iconSize,
  );
  write(ctx, locale, text, rightX, centerY, fontSize, "#fff", "right", true);
}

function drawQuantityBadge(
  ctx: SKRSContext2D,
  locale: string,
  value: string | number,
  rightX: number,
  topY: number,
  unlocked: boolean,
): void {
  const text = `×${value}`;
  ctx.font = `15px ${getZzzOfficialNumberFont(locale)}`;
  const width = Math.min(
    78,
    Math.max(42, Math.ceil(ctx.measureText(text).width) + 16),
  );
  rr(ctx, rightX - width, topY, width, 27, 8);
  ctx.fillStyle = unlocked ? "rgba(8,10,10,.92)" : "rgba(8,10,10,.72)";
  ctx.fill();
  ctx.strokeStyle = unlocked ? "rgba(255,213,71,.55)" : "rgba(255,255,255,.18)";
  ctx.lineWidth = 1;
  ctx.stroke();
  write(
    ctx,
    locale,
    text,
    rightX - width / 2,
    topY + 14,
    15,
    unlocked ? "#fff" : "#8a8d8b",
    "center",
    true,
  );
}
function durationSeconds(value: unknown, locale: string): string {
  const total = Math.max(0, Number(value ?? 0));
  if (!total) return "-";
  const d = Math.floor(total / 86400),
    h = Math.floor((total % 86400) / 3600),
    m = Math.floor((total % 3600) / 60);
  const lang = normalizeZzzLocale(locale);
  if (lang === "tw") return d ? `${d}天 ${h}小時` : `${h}小時 ${m}分`;
  if (lang === "cn") return d ? `${d}天 ${h}小时` : `${h}小时 ${m}分`;
  if (lang === "jp") return d ? `${d}日 ${h}時間` : `${h}時間 ${m}分`;
  if (lang === "kr") return d ? `${d}일 ${h}시간` : `${h}시간 ${m}분`;
  if (lang === "fr") return d ? `${d} j ${h} h` : `${h} h ${m} min`;
  if (lang === "vi") return d ? `${d} ngày ${h} giờ` : `${h} giờ ${m} phút`;
  return d ? `${d}d ${h}h` : `${h}h ${m}m`;
}
function durationMs(value: unknown, locale: string): string {
  if (value && typeof value === "object") {
    const clock = value as Record<string, unknown>;
    return durationSeconds(
      Number(clock.day ?? 0) * 86400 +
        Number(clock.hour ?? 0) * 3600 +
        Number(clock.minute ?? 0) * 60 +
        Number(clock.second ?? 0),
      locale,
    );
  }
  return durationSeconds(Number(value ?? 0) / 1000, locale);
}
function displayNumber(value: unknown): string {
  if (typeof value === "string" && !Number.isFinite(Number(value)))
    return value;
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString() : "-";
}
function difficultyValue(value: unknown): number {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  if (raw === "HELL" || raw === "INFERNO") return 2;
  if (raw === "HARD") return 1;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}
async function safeImage(source: unknown): Promise<Image | null> {
  if (!source) return null;
  try {
    return await loadImage(String(source));
  } catch {
    return null;
  }
}
function arrayAt<T>(...values: unknown[]): T[] {
  return (values.find(Array.isArray) as T[] | undefined) ?? [];
}

export interface NormalizedMysteryMazeData {
  season: MysteryMazeSeason;
  maps: MysteryMazeMap[];
  medalSummary: MysteryMazeCollectionGroup<MysteryMazeMedal>;
  goodsSummary: MysteryMazeCollectionGroup<MysteryMazeGoods>;
  medals: MysteryMazeMedal[];
  goods: MysteryMazeGoods[];
  records: MysteryMazeRecord[];
}
export function normalizeMysteryMazeData(
  abstract: MysteryMazeAbstract = {},
  detail: MysteryMazeDetail = {},
): NormalizedMysteryMazeData {
  const legacyCollection = (abstract.collect_data ?? {}) as Record<
    string,
    unknown
  >;
  const collection = abstract.collection_data ?? legacyCollection;
  const medals = ((collection as Record<string, unknown>).medal_data ??
    (collection as Record<string, unknown>).medals ??
    {}) as MysteryMazeCollectionGroup<MysteryMazeMedal>;
  const goods = ((collection as Record<string, unknown>).goods_data ??
    (collection as Record<string, unknown>).collection_list ??
    (collection as Record<string, unknown>).goods ??
    {}) as MysteryMazeCollectionGroup<MysteryMazeGoods>;
  return {
    season: abstract.season_data ?? abstract.season ?? {},
    maps: arrayAt<MysteryMazeMap>(
      abstract.map_list,
      detail.map_list,
      detail.maps,
    ),
    medalSummary: medals,
    goodsSummary: goods,
    medals: arrayAt<MysteryMazeMedal>(medals.list, medals.medal_list),
    goods: arrayAt<MysteryMazeGoods>(
      goods.list,
      goods.goods_list,
      goods.collection_list,
    ),
    records: arrayAt<MysteryMazeRecord>(
      detail.record_list,
      detail.records,
      detail.challenge_record_list,
    ),
  };
}

async function canvasFor(height: number) {
  const canvas = createCanvas(WIDTH, height),
    ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawZeroPageBackground(ctx, WIDTH, height, await loadZeroPageBackground());
  return { canvas, ctx };
}
function panel(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accent = false,
) {
  rr(ctx, x, y, w, h);
  ctx.fillStyle = "rgba(12,15,16,.91)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (accent) {
    ctx.fillStyle = "#f1d547";
    ctx.fillRect(x + 14, y, Math.min(160, w * 0.3), 3);
  }
}
async function header(
  ctx: SKRSContext2D,
  options: MazeRenderOptions,
  title: string,
  page?: string,
) {
  panel(ctx, MARGIN, 24, 948, 108, true);
  const avatar = await safeImage(options.abstract.avatar_icon);
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(89, 96, 22, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 67, 74, 44, 44);
    ctx.restore();
  }
  write(ctx, options.locale, title, 72, 60, 34);
  write(
    ctx,
    options.locale,
    options.abstract.nick_name || labels(options.locale).proxy,
    avatar ? 116 : 72,
    101,
    18,
    "#b9bcba",
  );
  write(
    ctx,
    options.locale,
    `UID ${options.uid}`,
    972,
    58,
    17,
    "#b9bcba",
    "right",
    true,
  );
  if (page)
    write(ctx, options.locale, page, 972, 101, 17, "#858987", "right", true);
}
function formatLeavePercent(value: unknown): string {
  return `${(Number(value ?? 0) / 100).toFixed(2)}%`;
}

async function drawOverview(
  options: MazeRenderOptions,
  data: NormalizedMysteryMazeData,
): Promise<Buffer> {
  const copy = labels(options.locale),
    maps = data.maps,
    height = 704 + maps.length * 50;
  const { canvas, ctx } = await canvasFor(height);
  await header(ctx, options, copy.title);
  const [infoBg, weeklyBg, seasonCoin, fund, clock, mapA, mapB] =
    await Promise.all([
      loadImage(assets.info),
      loadImage(assets.weekly),
      loadImage(assets.seasonCoin),
      loadImage(assets.coin),
      loadImage(assets.clock),
      loadImage(assets.map1),
      loadImage(assets.map2),
    ]);
  const season = data.season;
  ctx.drawImage(infoBg, 48, 152, 464, 174);
  ctx.drawImage(weeklyBg, 532, 152, 464, 174);
  write(
    ctx,
    options.locale,
    `${copy.season} ${season.cur_season_id || 1}`,
    119,
    180,
    16,
    "#fff",
    "center",
  );
  write(
    ctx,
    options.locale,
    season.season_level || 0,
    119,
    238,
    70,
    "#252727",
    "center",
    true,
  );
  write(
    ctx,
    options.locale,
    copy.seasonLevel,
    119,
    298,
    16,
    "#313434",
    "center",
  );
  write(ctx, options.locale, copy.seasonGoal, 210, 187, 18);
  write(
    ctx,
    options.locale,
    `${copy.stage} ${season.season_stage || 0}`,
    210,
    222,
    28,
    "#ffde00",
    "left",
    true,
  );
  write(
    ctx,
    options.locale,
    `${season.season_quest?.cur_quest || 0}/${season.season_quest?.max_quest || 0}`,
    490,
    222,
    17,
    "#fff",
    "right",
    true,
  );
  ctx.drawImage(seasonCoin, 210, 259, 24, 24);
  write(ctx, options.locale, copy.seasonCurrency, 242, 271, 16);
  write(
    ctx,
    options.locale,
    `${season.season_coin?.cur_coin || 0}/${season.season_coin?.max_coin || 0}`,
    490,
    271,
    16,
    "#fff",
    "right",
    true,
  );
  ctx.drawImage(clock, 210, 289, 21, 21);
  write(
    ctx,
    options.locale,
    `${copy.remaining} ${durationSeconds(season.refresh_time, options.locale)}`,
    239,
    300,
    15,
    "#b4b8b0",
  );
  write(ctx, options.locale, copy.weekly, 554, 181, 20);
  write(
    ctx,
    options.locale,
    `${copy.refresh} ${durationSeconds(options.abstract.refresh_time, options.locale)}`,
    554,
    209,
    15,
    "#b8b9b7",
  );
  const cur = Number(options.abstract.abyss_duty?.cur_duty ?? 0),
    max = Number(options.abstract.abyss_duty?.max_duty ?? 0);
  write(ctx, options.locale, copy.progress, 972, 181, 16, "#f2f3f2", "right");
  write(
    ctx,
    options.locale,
    `${max ? Math.floor((cur / max) * 100) : 0}%`,
    972,
    209,
    23,
    "#ffde00",
    "right",
    true,
  );
  const weekly: Array<[string, unknown, boolean]> = [
    [copy.dennies, options.abstract.collect_total_value || 0, true],
    [copy.rareGoods, options.abstract.big_red_num || "-", false],
    [copy.millionExit, options.abstract.millions_evacuations || "-", false],
  ];
  weekly.forEach(([label, value, icon], index) => {
    const y = 244 + index * 27;
    writeFitted(ctx, options.locale, label, 554, y, 260, 16);
    const displayValue = value === "0" ? "-" : value;
    if (icon)
      drawRightIconValue(
        ctx,
        options.locale,
        fund,
        displayValue,
        972,
        y,
        16,
        22,
      );
    else
      write(
        ctx,
        options.locale,
        displayValue,
        972,
        y,
        16,
        "#fff",
        "right",
        true,
      );
  });
  write(ctx, options.locale, copy.maps, 48, 372, 28);
  panel(ctx, 48, 405, 948, 48);
  write(ctx, options.locale, copy.hellMaps, 68, 429, 18);
  write(
    ctx,
    options.locale,
    copy.successRate,
    678,
    429,
    18,
    "#f2f3f2",
    "center",
  );
  write(ctx, options.locale, copy.maxValue, 974, 429, 18, "#f2f3f2", "right");
  maps.forEach((map, index) => {
    const y = 466 + index * 50;
    ctx.drawImage(index % 2 ? mapB : mapA, 56, y, 932, 40);
    writeFitted(
      ctx,
      options.locale,
      map.map_name || `${copy.maps} ${map.map_id}`,
      72,
      y + 20,
      540,
      18,
    );
    if (map.hell_unlock !== false && map.unlock !== false) {
      const challenged = map.is_challenge === true;
      write(
        ctx,
        options.locale,
        challenged
          ? formatLeavePercent(map.leave_percent ?? map.success_rate)
          : "-",
        678,
        y + 20,
        18,
        "#fff",
        "center",
        true,
      );
      write(
        ctx,
        options.locale,
        challenged ? displayNumber(map.max_price ?? map.max_value) : "-",
        974,
        y + 20,
        20,
        "#fff",
        "right",
        true,
      );
    } else
      write(
        ctx,
        options.locale,
        copy.locked,
        974,
        y + 20,
        17,
        "#909391",
        "right",
      );
  });
  const footerY = 486 + maps.length * 50;
  panel(ctx, 48, footerY, 948, 170, true);
  write(
    ctx,
    options.locale,
    `${copy.maxFloor} ${options.abstract.max_rank || "-"}`,
    72,
    footerY + 34,
    22,
    "#ffde00",
    "left",
    true,
  );
  write(ctx, options.locale, copy.collection, 72, footerY + 74, 22);
  write(
    ctx,
    options.locale,
    `${copy.medals}  ${data.medalSummary.cur || 0}/${data.medalSummary.total || data.medals.length}`,
    72,
    footerY + 112,
    17,
    "#b9bbb9",
  );
  write(
    ctx,
    options.locale,
    `${copy.goods}  ${data.goodsSummary.cur || 0}/${data.goodsSummary.total || data.goods.length}`,
    520,
    footerY + 112,
    17,
    "#b9bbb9",
  );
  return canvas.toBuffer("image/png");
}

function recordDate(
  value:
    MysteryMazeRecord["start_time"] | MysteryMazeRecord["challenge_time_data"],
): string {
  if (!value) return "-";
  if (typeof value === "string") return value;
  const p = (v: unknown) => String(Number(v ?? 0)).padStart(2, "0");
  return `${value.year || 0}/${p(value.month)}/${p(value.day)} ${p(value.hour)}:${p(value.minute)}`;
}
type CollectionItem =
  | { kind: "medal"; id: string; name?: string; icon?: string; unlock: boolean }
  | {
      kind: "goods";
      id: string;
      name?: string;
      icon?: string;
      unlock: boolean;
      number?: string | number;
      rarity?: string | number;
    };
function collectionItems(data: NormalizedMysteryMazeData): CollectionItem[] {
  return [
    ...data.medals.map((item, index) => ({
      kind: "medal" as const,
      id: String(item.medal_id ?? `medal-${index}`),
      name: item.name,
      icon: item.medal_icon,
      unlock: item.unlock !== false,
    })),
    ...data.goods.map((item, index) => ({
      kind: "goods" as const,
      id: String(item.goods_id ?? `goods-${index}`),
      name: item.name,
      icon: item.goods_icon,
      unlock: item.unlock !== false,
      number: item.number,
      rarity: item.rarity,
    })),
  ];
}
async function drawCollectionPage(
  options: MazeRenderOptions,
  items: CollectionItem[],
  page: number,
  pages: number,
): Promise<Buffer> {
  const copy = labels(options.locale);
  const layout = MYSTERY_MAZE_LAYOUT.collection;
  const rows = Math.max(1, Math.ceil(items.length / layout.columns));
  const height =
    layout.startY + rows * layout.cardHeight + (rows - 1) * layout.rowGap + 38;
  const { canvas, ctx } = await canvasFor(height);
  await header(
    ctx,
    options,
    `${copy.title}｜${copy.collection}`,
    `${copy.page} ${page + 1} / ${pages}`,
  );
  if (!items.length) {
    panel(ctx, 48, 158, 948, 130);
    write(ctx, options.locale, copy.empty, 522, 223, 24, "#929593", "center");
    return canvas.toBuffer("image/png");
  }
  const [gainBg, lockedIcon, icons] = await Promise.all([
    loadImage(assets.gain),
    loadImage(assets.locked),
    Promise.all(items.map((item) => safeImage(item.icon))),
  ]);
  items.forEach((item, index) => {
    const x =
        layout.startX +
        (index % layout.columns) * (layout.cardWidth + layout.columnGap),
      y =
        layout.startY +
        Math.floor(index / layout.columns) *
          (layout.cardHeight + layout.rowGap);
    panel(ctx, x, y, layout.cardWidth, layout.cardHeight, item.unlock);
    if (item.kind === "goods") ctx.drawImage(gainBg, x + 32.5, y + 8, 160, 160);
    if (icons[index])
      ctx.drawImage(
        icons[index]!,
        x + (layout.cardWidth - 136) / 2,
        y + 18,
        136,
        136,
      );
    if (!item.unlock) {
      ctx.fillStyle = "rgba(0,0,0,.62)";
      rr(ctx, x + 27, y + 8, 171, 160, 10);
      ctx.fill();
      ctx.drawImage(lockedIcon, x + 86.5, y + 62, 52, 52);
    }
    const nameLines = fitTextLines(
      ctx,
      options.locale,
      item.name || (item.kind === "medal" ? copy.medals : copy.goods),
      layout.cardWidth - 32,
      16,
      2,
    );
    const firstLineY = y + (nameLines.length > 1 ? 176 : 187);
    nameLines.forEach((line, lineIndex) =>
      write(
        ctx,
        options.locale,
        line,
        x + 16,
        firstLineY + lineIndex * 21,
        16,
        item.unlock ? "#d0d2d0" : "#8a8d8b",
      ),
    );
    if (item.kind === "goods" && item.number !== undefined)
      drawQuantityBadge(
        ctx,
        options.locale,
        item.number,
        x + layout.cardWidth - 12,
        y + 12,
        item.unlock,
      );
  });
  return canvas.toBuffer("image/png");
}

function rarity(value: unknown): GtCardRank {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "S" || Number(value) >= 5) return "S";
  if (raw === "B" || (Number(value) <= 3 && Number(value) > 0)) return "B";
  return "A";
}
async function drawRecordPage(
  options: MazeRenderOptions,
  records: MysteryMazeRecord[],
  page: number,
  pages: number,
): Promise<Buffer> {
  const copy = labels(options.locale);
  const layout = MYSTERY_MAZE_LAYOUT.record;
  const rowPitch = layout.cardHeight + layout.rowGap;
  const height =
    layout.startY +
    Math.max(1, records.length) * layout.cardHeight +
    Math.max(0, records.length - 1) * layout.rowGap +
    34;
  const { canvas, ctx } = await canvasFor(height);
  await header(
    ctx,
    options,
    `${copy.title}｜${copy.records}`,
    `${copy.page} ${page + 1} / ${pages}`,
  );
  if (!records.length) {
    panel(ctx, 48, 158, 948, 130);
    write(ctx, options.locale, copy.empty, 522, 223, 24, "#929593", "center");
    return canvas.toBuffer("image/png");
  }
  const [recordBg, coin, gainBg, gainMore, gtAssets] = await Promise.all([
    loadImage(assets.record),
    loadImage(assets.coin),
    loadImage(assets.gain),
    loadImage(assets.gainMore),
    loadGtCardAssets(),
  ]);
  for (let index = 0; index < records.length; index++) {
    const record = records[index]!,
      y = layout.startY + index * rowPitch;
    ctx.drawImage(
      recordBg,
      layout.cardX,
      y,
      layout.cardWidth,
      layout.cardHeight,
    );
    writeFitted(
      ctx,
      options.locale,
      record.map_name || copy.unknownMap,
      66,
      y + 30,
      610,
      22,
    );
    write(
      ctx,
      options.locale,
      recordDate(record.start_time ?? record.challenge_time_data),
      978,
      y + 30,
      16,
      "#b6b8b6",
      "right",
      true,
    );
    const difficult = difficultyValue(
      record.difficult ?? record.difficulty ?? record.difficulty_value,
    );
    write(
      ctx,
      options.locale,
      difficult > 1 ? copy.hell : copy.hard,
      978,
      y + 61,
      16,
      "#ffde00",
      "right",
    );
    const success =
      record.is_success === true ||
      String(record.result).toLowerCase().includes("success");
    writeFitted(
      ctx,
      options.locale,
      success ? copy.success : copy.failed,
      67,
      y + 89,
      layout.info.width,
      28,
      success ? "#e9d288" : "#ababab",
    );
    writeFitted(
      ctx,
      options.locale,
      `${copy.exploreTime}  ${durationMs(record.challenge_time ?? record.duration, options.locale)}`,
      67,
      y + 130,
      layout.info.width,
      17,
      "#d4d5d3",
    );
    ctx.drawImage(coin, 67, y + 155, 26, 26);
    write(
      ctx,
      options.locale,
      displayNumber(record.material_total_value ?? record.total_value),
      101,
      y + 168,
      23,
      "#fff",
      "left",
      true,
    );
    const avatars = arrayAt<MysteryMazeAvatar>(
      record.avatar_list,
      record.role_list,
    ).slice(0, 4);
    const avatarSize = 80;
    const avatarGap = 8;
    const avatarY = y + 83;
    const preparedAvatars = await Promise.all(
      avatars.map(async (avatar) => {
        const item: GtCardItem = {
          id: String(avatar.id ?? ""),
          rarity: rarity(avatar.rarity),
          elementType: avatar.element_type,
          subElementType: avatar.sub_element_type,
          profession: avatar.avatar_profession,
        };
        const [art, metadata] = await Promise.all([
          safeGtCardImage(
            avatar.role_square_url ?? avatar.icon_url ?? avatar.icon,
          ),
          loadGtCardMetadataImages(item),
        ]);
        return { avatar, item, images: { art, ...metadata } };
      }),
    );
    preparedAvatars.forEach(({ avatar, item, images }, avatarIndex) => {
      const x = layout.team.x + avatarIndex * (avatarSize + avatarGap);
      drawGtCard(
        ctx,
        item,
        "character",
        x,
        avatarY,
        avatarSize,
        images,
        gtAssets,
      );
      if (images.element)
        ctx.drawImage(images.element, x + 58, avatarY + 58, 20, 20);
      if (images.profession)
        ctx.drawImage(images.profession, x + 5, avatarY + 58, 20, 20);
      drawMindscapeBadge(
        ctx,
        avatar.rank,
        x,
        avatarY,
        avatarSize,
        getZzzOfficialNumberFont(options.locale),
      );
    });
    const gains = success
      ? arrayAt<MysteryMazeGain>(record.item_list, record.gain_list)
      : [];
    const shownGains = gains.slice(0, 3),
      gainIcons = await Promise.all(
        shownGains.map((item) => safeImage(item.icon_url ?? item.icon)),
      );
    gainIcons.forEach((icon, gainIndex) => {
      const x = layout.rewards.x + gainIndex * 66;
      ctx.drawImage(gainBg, x, y + 91, 60, 60);
      if (icon) ctx.drawImage(icon, x + 5, y + 96, 50, 50);
    });
    if (gains.length > 3) {
      const moreX = layout.rewards.x + 3 * 66;
      ctx.drawImage(gainMore, moreX, y + 91, 60, 60);
      write(
        ctx,
        options.locale,
        copy.more,
        moreX + 30,
        y + 166,
        13,
        "#b9bbb9",
        "center",
      );
    }
  }
  return canvas.toBuffer("image/png");
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}
export async function renderMysteryMaze(
  options: MazeRenderOptions,
): Promise<MysteryMazeRenderedPage[]> {
  const data = normalizeMysteryMazeData(
    options.abstract ?? {},
    options.detail ?? {},
  );
  const pages: MysteryMazeRenderedPage[] = [
    {
      kind: "overview",
      page: 0,
      pages: 1,
      buffer: await drawOverview(options, data),
    },
  ];
  const groupedCollection = chunks(collectionItems(data), 20);
  if (!groupedCollection.length) groupedCollection.push([]);
  for (let i = 0; i < groupedCollection.length; i++)
    pages.push({
      kind: "collection",
      page: i,
      pages: groupedCollection.length,
      buffer: await drawCollectionPage(
        options,
        groupedCollection[i]!,
        i,
        groupedCollection.length,
      ),
    });
  const recordPages = chunks(data.records, 4);
  if (!recordPages.length) recordPages.push([]);
  for (let i = 0; i < recordPages.length; i++)
    pages.push({
      kind: "records",
      page: i,
      pages: recordPages.length,
      buffer: await drawRecordPage(
        options,
        recordPages[i]!,
        i,
        recordPages.length,
      ),
    });
  return pages;
}
