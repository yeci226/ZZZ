import { loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { join } from "node:path";
import {
  ELEMENT_ICON_FILE_BY_TYPE,
  SPECIAL_ELEMENT_BY_CHARACTER_ID,
} from "./elements.js";

const OFFICIAL_CARD_SIZE = 48;
export const GT_CARD_COMPACT_SIZE = 76;
export const GT_CARD_WEAPON_LINE_COLORS: Record<GtCardRank, string> = {
  S: "#ffb500",
  A: "#e900ff",
  B: "#20c7f4",
};
const ASSET_DIR = join(
  ".",
  "src",
  "assets",
  "images",
  "zzz",
  "official-record",
);
const ICON_DIR = join(".", "src", "assets", "images", "icons");

export type GtCardRank = "S" | "A" | "B";
export type GtCardKind = "character" | "weapon" | "bangboo" | "unknown";

export interface GtCardItem {
  id: string;
  rarity: GtCardRank;
  elementType?: number | null;
  subElementType?: number | null;
  profession?: unknown;
}

export interface GtCardImages {
  art: Image | null;
  element: Image | null;
  profession: Image | null;
}

export interface GtCardAssets {
  generic: Image | null;
  cardPattern: Image | null;
  rarityCorner: Image | null;
  rarity: Record<GtCardRank, Image | null>;
}

export interface MindscapeBadgeRect {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

export function mindscapeBadgeRect(
  x: number,
  y: number,
  avatarSize: number,
  rank: unknown,
): MindscapeBadgeRect | null {
  const numericRank = Math.trunc(Number(rank));
  if (!Number.isFinite(numericRank) || numericRank <= 0) return null;
  const size = Math.max(18, Math.round(avatarSize * 0.31));
  return {
    x: x + avatarSize - size + 2,
    y: y - 2,
    width: size,
    height: size,
    value: Math.min(6, numericRank),
  };
}

export function drawMindscapeBadge(
  ctx: SKRSContext2D,
  rank: unknown,
  x: number,
  y: number,
  avatarSize: number,
  font: string,
): MindscapeBadgeRect | null {
  const rect = mindscapeBadgeRect(x, y, avatarSize, rank);
  if (!rect) return null;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 6);
  ctx.fillStyle = "rgba(12,12,15,0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.52)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold ${Math.max(12, Math.round(rect.width * 0.62))}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    String(rect.value),
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
  );
  ctx.restore();
  return rect;
}

export const GT_CARD_OVERLAY = {
  avatarX: 3,
  avatarY: 3,
  avatarSize: 42,
  agentRarityX: 2,
  agentRarityY: 3,
  agentRaritySize: 16,
  weaponLineX: 3,
  weaponLineWidth: 42,
  weaponLineHeight: 2,
} as const;

export async function safeGtCardImage(source: unknown): Promise<Image | null> {
  if (!source) return null;
  try {
    return await loadImage(source as any);
  } catch {
    return null;
  }
}

let assetsPromise: Promise<GtCardAssets> | null = null;

export function loadGtCardAssets(): Promise<GtCardAssets> {
  assetsPromise ??= (async () => {
    const [generic, cardPattern, rarityCorner, rarityS, rarityA, rarityB] =
      await Promise.all([
        safeGtCardImage(join(ASSET_DIR, "card-base.9e2bc63d.png")),
        safeGtCardImage(join(ASSET_DIR, "gt-card-avatar-bg.inline.png")),
        safeGtCardImage(join(ASSET_DIR, "gt-card-rarity-corner.inline.png")),
        safeGtCardImage(join(ICON_DIR, "rank", "rarity-s-rank.png")),
        safeGtCardImage(join(ICON_DIR, "rank", "rarity-a-peloyis.png")),
        safeGtCardImage(join(ICON_DIR, "rank", "Rarity_B.png")),
      ]);
    return {
      generic,
      cardPattern,
      rarityCorner,
      rarity: { S: rarityS, A: rarityA, B: rarityB },
    };
  })();
  return assetsPromise;
}

function elementIconPath(item: GtCardItem): string | null {
  const special = SPECIAL_ELEMENT_BY_CHARACTER_ID[item.id];
  if (special) return join(ICON_DIR, "element", `${special}.webp`);
  const filename =
    item.elementType == null
      ? undefined
      : ELEMENT_ICON_FILE_BY_TYPE[item.elementType];
  return filename ? join(ICON_DIR, "element", filename) : null;
}

function professionIconPath(value: unknown): string | null {
  const raw = String(value ?? "").toUpperCase();
  const numeric: Record<string, string> = {
    "1": "attack",
    "2": "stun",
    "3": "anomaly",
    "4": "support",
    "5": "defense",
    "6": "rupture",
  };
  const key =
    numeric[raw] ??
    ["ATTACK", "STUN", "ANOMALY", "SUPPORT", "DEFENSE", "RUPTURE"]
      .find((name) => raw.includes(name))
      ?.toLowerCase();
  if (!key) return null;
  return join(
    ICON_DIR,
    "profession",
    `${key}.${key === "rupture" ? "webp" : "png"}`,
  );
}

export async function loadGtCardMetadataImages(
  item: GtCardItem,
): Promise<Pick<GtCardImages, "element" | "profession">> {
  const [element, profession] = await Promise.all([
    safeGtCardImage(elementIconPath(item)),
    safeGtCardImage(professionIconPath(item.profession)),
  ]);
  return { element, profession };
}

export function originalRatioPlacement(
  imageWidth: number,
  imageHeight: number,
  maxWidth: number,
  maxHeight: number,
  mode: "width" | "contain",
) {
  if (!(imageWidth > 0) || !(imageHeight > 0)) return null;
  const scale =
    mode === "width"
      ? maxWidth / imageWidth
      : Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const offsetX = mode === "contain" ? (maxWidth - width) / 2 : 0;
  const offsetY = mode === "contain" ? (maxHeight - height) / 2 : 0;
  return { x: offsetX, y: offsetY, width, height };
}

function drawAtOriginalRatio(
  ctx: SKRSContext2D,
  image: Image,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
): void {
  const placement = originalRatioPlacement(
    image.width,
    image.height,
    maxWidth,
    maxHeight,
    "width",
  );
  if (!placement) return;
  ctx.drawImage(
    image,
    x + placement.x,
    y + placement.y,
    placement.width,
    placement.height,
  );
}

function drawRarityCorner(
  ctx: SKRSContext2D,
  item: GtCardItem,
  assets: GtCardAssets,
): void {
  const x = GT_CARD_OVERLAY.agentRarityX;
  const y = GT_CARD_OVERLAY.agentRarityY;
  const size = GT_CARD_OVERLAY.agentRaritySize;
  if (assets.rarityCorner) ctx.drawImage(assets.rarityCorner, x, y, size, size);
  const rank = assets.rarity[item.rarity];
  if (rank) ctx.drawImage(rank, x + 1, y + 1, 12, 12);
}

function drawWeaponRarityLine(ctx: SKRSContext2D, item: GtCardItem): void {
  const lineY =
    GT_CARD_OVERLAY.avatarY +
    GT_CARD_OVERLAY.avatarSize -
    GT_CARD_OVERLAY.weaponLineHeight;
  ctx.beginPath();
  ctx.roundRect(
    GT_CARD_OVERLAY.weaponLineX,
    lineY,
    GT_CARD_OVERLAY.weaponLineWidth,
    GT_CARD_OVERLAY.weaponLineHeight,
    GT_CARD_OVERLAY.weaponLineHeight / 2,
  );
  ctx.fillStyle = GT_CARD_WEAPON_LINE_COLORS[item.rarity];
  ctx.fill();
}

export function drawGtCard(
  ctx: SKRSContext2D,
  item: GtCardItem,
  kind: GtCardKind,
  x: number,
  y: number,
  size: number,
  images: GtCardImages,
  assets: GtCardAssets,
): void {
  const scale = size / OFFICIAL_CARD_SIZE;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.roundRect(0, 0, OFFICIAL_CARD_SIZE, OFFICIAL_CARD_SIZE, 8);
  ctx.fillStyle = "#0a0a0a";
  ctx.fill();
  ctx.strokeStyle = "#333534";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const { avatarX, avatarY, avatarSize } = GT_CARD_OVERLAY;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, 6);
  ctx.clip();
  if (assets.cardPattern) ctx.drawImage(assets.cardPattern, 0, 0, 48, 48);
  const art = images.art ?? assets.generic;
  if (art)
    drawAtOriginalRatio(ctx, art, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, 6);
  ctx.clip();
  if (kind === "weapon") {
    drawWeaponRarityLine(ctx, item);
  } else {
    drawRarityCorner(ctx, item, assets);
  }
  ctx.restore();
  ctx.restore();
}

export const GT_CARD_PC_SIZE = OFFICIAL_CARD_SIZE;
