import type { SKRSContext2D } from "@napi-rs/canvas";
import { drawGtCard, loadGtCardAssets } from "./gtCardRenderer.js";
import { signalCategoryText, signalText } from "./recordText.js";
import { isLimitedCategory } from "./signalLogModel.js";
import { drawPoster, resolvePosterSubject } from "./signalLogPoster.js";
import { drawChannelFooter, drawChannelStatus, STATUS_HEIGHT } from "./signalLogStatus.js";
import { buildPityCycles, type PityCycle } from "./signalLogCycleData.js";
import { CYCLE_PAGE_SIZE } from "./signalLogPagination.js";
import {
  CONTENT_WIDTH as POSTER_CONTENT_WIDTH,
  CONTENT_X,
  createScaledCanvas,
  drawGlassCard,
  drawPaper,
  drawUpTag,
  gtCardKind,
  localeText,
  MIN_IMAGE_HEIGHT,
  numberText,
  PAGE_MARGIN,
  PAPER,
  pityTone,
  prepareSCard,
  WIDTH,
} from "./signalLogPaper.js";
import type { SignalLogImageInput } from "./signalLogRenderer.js";

export type CycleCell = "s" | "a" | "b" | "current" | "empty";

/** One cell per pull up to hardPity; an overlong cycle keeps its S in the last cell. */
export function cycleTrackCells(cycle: PityCycle, hardPity: number): CycleCell[] {
  const filled = Math.min(cycle.length, hardPity);
  const aPositions = new Set(cycle.aPositions);
  return Array.from({ length: hardPity }, (_, index) => {
    const pull = index + 1;
    if (pull > filled || pull <= cycle.unknownPulls) return "empty";
    if (!cycle.sRecord) return "current";
    if (pull === filled) return "s";
    return aPositions.has(pull) ? "a" : "b";
  });
}

function cellColor(cell: CycleCell, accent: string): string {
  if (cell === "s") return PAPER.s;
  if (cell === "a") return PAPER.a;
  if (cell === "b") return PAPER.b;
  if (cell === "current") return accent;
  return "rgba(232,225,215,.35)";
}

function drawOpenSlot(ctx: SKRSContext2D, x: number, y: number, size: number, accent: string): void {
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, size - 2, size - 2, 6);
  ctx.stroke();
  ctx.restore();
  numberText(ctx, "?", x + size / 2, y + size / 2 + 1, 22, accent, "center");
}

const P_SECTION_HEIGHT = 44;
const P_ROW_HEIGHT = 56;
const P_ROW_GAP = 8;
const P_FOOTER_HEIGHT = 42;
const P_BLOCK_GAP = 10;
const P_AVATAR = 44;

/** Pity cycles for the poster view, with the open cycle on the channel's live pity. */
export function posterPityCycles(input: Pick<SignalLogImageInput, "category" | "model" | "cycles">): PityCycle[] {
  const source = input.cycles;
  if (!source) throw new Error("cycles input missing");
  const channel = input.model.channels[input.category];
  return buildPityCycles(source.summary, source.pityEstimated, source.openCycleIsLive, channel.currentPity);
}

function drawPosterLegend(ctx: SKRSContext2D, locale: string | undefined, right: number, y: number): void {
  const copy = signalText(locale);
  let x = right;
  for (const [label, color] of [[copy.legendB, PAPER.b], [copy.legendA, PAPER.a], [copy.legendS, PAPER.s]] as const) {
    const width = localeText(ctx, locale, label, x, y, 13, PAPER.muted, { align: "right" });
    x -= width + 6;
    ctx.fillStyle = color;
    ctx.fillRect(x - 12, y - 6, 12, 12);
    x -= 12 + 14;
  }
}

export async function renderSignalCyclesPoster(input: SignalLogImageInput): Promise<Buffer> {
  const all = posterPityCycles(input);
  const source = input.cycles!;
  const locale = input.locale;
  const copy = signalText(locale);
  const channel = input.model.channels[input.category];
  const hard = channel.hardPity;
  const pages = Math.max(1, Math.ceil(all.length / CYCLE_PAGE_SIZE));
  const page = Math.min(pages - 1, Math.max(0, Math.trunc(input.page) || 0));
  const cycles = all.slice(page * CYCLE_PAGE_SIZE, (page + 1) * CYCLE_PAGE_SIZE);
  const listHeight = cycles.length ? cycles.length * (P_ROW_HEIGHT + P_ROW_GAP) - P_ROW_GAP : P_ROW_HEIGHT;
  const height = Math.max(MIN_IMAGE_HEIGHT, PAGE_MARGIN + STATUS_HEIGHT + P_BLOCK_GAP + P_SECTION_HEIGHT + listHeight + P_FOOTER_HEIGHT);

  const subject = resolvePosterSubject({ view: "cycles", model: input.model, category: input.category, banner: source.banner });
  const accent = subject.accent;
  const { canvas, ctx } = createScaledCanvas(height);
  drawPaper(ctx, height);
  await drawPoster(ctx, height, {
    subject, title: signalCategoryText(locale, input.category), chip: source.bannerLabel ?? copy.allRecords,
    playerName: input.playerName ?? "", uid: input.uid, locale,
  });

  let y = PAGE_MARGIN;
  drawChannelStatus(ctx, { channel, locale, accent, y });
  y += STATUS_HEIGHT + P_BLOCK_GAP;

  const right = WIDTH - PAGE_MARGIN - 6;
  localeText(ctx, locale, copy.pityCycles, CONTENT_X + 6, y + 21, 21, PAPER.ink, { bold: true });
  drawPosterLegend(ctx, locale, right, y + 22);
  y += P_SECTION_HEIGHT;

  if (!cycles.length) {
    drawGlassCard(ctx, CONTENT_X, y, POSTER_CONTENT_WIDTH, P_ROW_HEIGHT, { radius: 12 });
    localeText(ctx, locale, copy.noRecords, CONTENT_X + POSTER_CONTENT_WIDTH / 2, y + P_ROW_HEIGHT / 2, 18, PAPER.muted, {
      align: "center", maxWidth: POSTER_CONTENT_WIDTH - 40,
    });
  } else {
    const [assets, cards] = await Promise.all([
      loadGtCardAssets(),
      Promise.all(cycles.map((cycle) => cycle.sRecord
        ? prepareSCard({ itemId: String(cycle.sRecord.itemId ?? ""), kind: gtCardKind(cycle.sRecord.itemType, String(cycle.sRecord.itemId ?? "")) })
        : null)),
    ]);
    const limited = isLimitedCategory(input.category);
    const rowRight = CONTENT_X + POSTER_CONTENT_WIDTH;
    const trackX = CONTENT_X + P_AVATAR + 20;
    const cellWidth = (rowRight - 110 - trackX) / hard;
    const trackHeight = 22;
    cycles.forEach((cycle, index) => {
      const rowY = y + index * (P_ROW_HEIGHT + P_ROW_GAP);
      drawGlassCard(ctx, CONTENT_X, rowY, POSTER_CONTENT_WIDTH, P_ROW_HEIGHT, { radius: 12 });
      const card = cards[index];
      const avatarY = rowY + (P_ROW_HEIGHT - P_AVATAR) / 2;
      if (card) drawGtCard(ctx, card.item, card.kind, CONTENT_X + 8, avatarY, P_AVATAR, card.images, assets);
      else drawOpenSlot(ctx, CONTENT_X + 8, avatarY, P_AVATAR, accent);
      const trackY = rowY + (P_ROW_HEIGHT - trackHeight) / 2;
      cycleTrackCells(cycle, hard).forEach((cell, cellIndex) => {
        ctx.fillStyle = cellColor(cell, accent);
        ctx.fillRect(trackX + cellIndex * cellWidth, trackY, Math.max(1, cellWidth - 1), trackHeight);
      });
      const label = `${cycle.partial ? "~" : ""}${cycle.length}`;
      const color = cycle.sRecord ? pityTone(cycle.length, hard) : accent;
      numberText(ctx, label, rowRight - 68, rowY + P_ROW_HEIGHT / 2 + 1, 26, color, "right");
      if (limited && cycle.sRecord?.isUp === true) drawUpTag(ctx, rowRight - 14, rowY + P_ROW_HEIGHT / 2 - 8, 12);
    });
  }

  drawChannelFooter(ctx, { locale, height, channel, page, pageCount: pages, stale: input.stale });
  return canvas.toBuffer("image/png");
}
