import type { SKRSContext2D } from "@napi-rs/canvas";
import type { SignalChannelModel } from "./signalLogModel.js";
import { signalText } from "./recordText.js";
import {
  CONTENT_WIDTH,
  CONTENT_X,
  drawGlassCard,
  fitLocaleText,
  localeText,
  NUMBER_FONT,
  numberText,
  PAGE_MARGIN,
  PAPER,
  pityTone,
  WIDTH,
} from "./signalLogPaper.js";

const PITY_HEIGHT = 84;
const TILE_HEIGHT = 78;
const BLOCK_GAP = 10;
const TILE_GAP = 9;
const TRACK = "#e4ddd3";
const RED = "#d9473b";

/** Pity card 84 + gap 10 + stat tiles 78. */
export const STATUS_HEIGHT = 172;

export interface StatusTile { label: string; value: string; unit: string }

export function statusTiles(channel: SignalChannelModel, locale?: string): StatusTile[] {
  const copy = signalText(locale);
  const total: StatusTile = { label: copy.total, value: channel.total.toLocaleString("en-US"), unit: "" };
  const average: StatusTile = channel.averageS === null
    ? { label: copy.averageSShort, value: "—", unit: "" }
    : { label: copy.averageSShort, value: String(channel.averageS), unit: copy.pullUnit };
  if (!channel.limited) return [total, average, { label: copy.sCount, value: String(channel.sCount), unit: "" }];
  const upCost: StatusTile = channel.averageUpCost === null
    ? { label: copy.averageUpCost, value: "—", unit: "" }
    : { label: copy.averageUpCost, value: String(Math.round(channel.averageUpCost)), unit: copy.pullUnit };
  return [total, average, { label: copy.upOverS, value: `${channel.upCount ?? 0}/${channel.sCount}`, unit: "" }, upCost];
}

/** Pill tag whose right edge sits at `right`; returns its width. */
function drawTag(ctx: SKRSContext2D, locale: string | undefined, value: string, right: number, centerY: number, filled: boolean): number {
  const size = 15;
  const width = fitLocaleText(ctx, locale, value, size, true).width + size * 1.4;
  const height = size * 1.9;
  const left = right - width;
  ctx.beginPath();
  ctx.roundRect(left, centerY - height / 2, width, height, height / 2);
  if (filled) {
    ctx.fillStyle = RED;
    ctx.fill();
  } else {
    ctx.strokeStyle = PAPER.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  localeText(ctx, locale, value, left + width / 2, centerY + 1, size, filled ? "#ffffff" : PAPER.muted, { align: "center", bold: true });
  return width;
}

function drawBar(ctx: SKRSContext2D, x: number, y: number, width: number, value: number, max: number, color: string): void {
  const height = 12;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fillStyle = TRACK;
  ctx.fill();
  if (value <= 0) return;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(height, Math.min(width, value / max * width)), height, height / 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function numberWidth(ctx: SKRSContext2D, value: string, size: number): number {
  ctx.font = `${size}px ${NUMBER_FONT}`;
  return ctx.measureText(value).width;
}

export function drawChannelStatus(
  ctx: SKRSContext2D,
  input: { channel: SignalChannelModel; locale?: string; accent: string; y: number },
): void {
  const { channel, locale, accent } = input;
  const copy = signalText(locale);
  const left = CONTENT_X;
  const right = CONTENT_X + CONTENT_WIDTH;
  let y = input.y;

  // Pity card
  drawGlassCard(ctx, left, y, CONTENT_WIDTH, PITY_HEIGHT, { border: accent, radius: 12 });
  const caption = channel.pityEstimated ? `${copy.pityNow} · ${copy.estimated}` : copy.pityNow;
  localeText(ctx, locale, caption, left + 18, y + 22, 14, PAPER.muted);
  const pity = channel.currentPity;
  const color = pityTone(pity, channel.hardPity);
  numberText(ctx, pity === null ? "—" : pity, left + 18, y + 54, 44, color);
  if (pity !== null) {
    const pityWidth = numberWidth(ctx, String(pity), 44);
    const hardText = `/${channel.hardPity}`;
    numberText(ctx, hardText, left + 23 + pityWidth, y + 61, 20, PAPER.muted);
    const hardWidth = numberWidth(ctx, hardText, 20);
    const barX = left + 23 + pityWidth + hardWidth + 22;
    let barRight = right - 18;
    if (channel.guaranteed !== null) {
      const label = channel.guaranteed ? copy.bigGuarantee : copy.smallGuarantee;
      barRight -= drawTag(ctx, locale, label, right - 18, y + 54, channel.guaranteed) + 16;
    }
    drawBar(ctx, barX, y + 48, Math.max(0, barRight - barX), pity, channel.hardPity, color);
    const toHard = channel.toHardPity ?? Math.max(0, channel.hardPity - pity);
    localeText(ctx, locale, copy.toHardPity.replace("{n}", String(toHard)), barRight, y + 22, 13, PAPER.muted, { align: "right" });
  }
  y += PITY_HEIGHT + BLOCK_GAP;

  // Stat tiles
  const tiles = statusTiles(channel, locale);
  const tileWidth = (CONTENT_WIDTH - TILE_GAP * (tiles.length - 1)) / tiles.length;
  tiles.forEach((tile, index) => {
    const x = left + index * (tileWidth + TILE_GAP);
    drawGlassCard(ctx, x, y, tileWidth, TILE_HEIGHT, { radius: 12 });
    localeText(ctx, locale, tile.label, x + 14, y + 21, 14, PAPER.muted, { maxWidth: tileWidth - 28 });
    numberText(ctx, tile.value, x + 14, y + 52, 30, PAPER.ink);
    if (tile.unit) {
      localeText(ctx, locale, tile.unit, x + 19 + numberWidth(ctx, tile.value, 30), y + 56, 14, PAPER.muted);
    }
  });
}

export function sinceMonth(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" })
    .format(date).replace("-", "/");
}

export interface ChannelFooterParts { since: string | null; page: string; stale: boolean }

/** Texts of the shared channel footer: records-since (null when unknown), page label and the stale flag. */
export function channelFooterParts(input: {
  locale?: string;
  firstRecordAt: string | null;
  page: number;
  pageCount: number;
  stale?: boolean;
}): ChannelFooterParts {
  const copy = signalText(input.locale);
  const since = sinceMonth(input.firstRecordAt);
  return {
    since: since ? copy.recordsSince.replace("{date}", since) : null,
    page: copy.pageOf.replace("{page}", String(input.page + 1)).replace("{pages}", String(input.pageCount)),
    stale: input.stale === true,
  };
}

/** Right-aligned footer of the channel views: `<records since | sync failed> · <page>`. */
export function drawChannelFooter(
  ctx: SKRSContext2D,
  input: { locale?: string; height: number; channel: SignalChannelModel; page: number; pageCount: number; stale?: boolean },
): void {
  const { locale } = input;
  const parts = channelFooterParts({
    locale, firstRecordAt: input.channel.firstRecordAt, page: input.page, pageCount: input.pageCount, stale: input.stale,
  });
  const y = input.height - 22;
  let right = WIDTH - PAGE_MARGIN - 6;
  right -= localeText(ctx, locale, parts.page, right, y, 13, PAPER.muted, { align: "right" });
  const lead = parts.stale ? signalText(locale).syncFailed : parts.since;
  if (!lead) return;
  right -= localeText(ctx, locale, " · ", right, y, 13, PAPER.muted, { align: "right" });
  localeText(ctx, locale, lead, right, y, 13, parts.stale ? RED : PAPER.muted, { align: "right", bold: parts.stale });
}
