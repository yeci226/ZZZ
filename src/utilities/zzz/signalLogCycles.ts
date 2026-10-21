import type { SKRSContext2D } from "@napi-rs/canvas";
import { getZzzOfficialFont } from "./canvasFonts.js";
import { drawGtCard, loadGtCardAssets } from "./gtCardRenderer.js";
import { signalText } from "./recordText.js";
import { buildPityCycles, type PityCycle } from "./signalLogCycleData.js";
import { drawTopBadge, hasTopBadge, loadTopIcon, pageLabel } from "./signalLogOverview.js";
import { SIGNAL_LOG_PAGE_SIZE, signalLogPageCount } from "./signalLogPagination.js";
import {
  COMPACT_HERO_HEIGHT,
  createScaledCanvas,
  drawGlassCard,
  drawHeroBanner,
  drawPaper,
  numberText,
  PAPER,
  prepareGtCard,
  progressColor,
  resolveHeroArt,
  signalAccent,
  text,
  WIDTH,
} from "./signalLogPaper.js";
import type { SignalLogRenderInput } from "./signalLogRenderer.js";

const MARGIN = 16;
const HERO_HEIGHT = 150;
const GAP = 12;
const SECTION_HEIGHT = 48;
const ROW_HEIGHT = 64;
const ROW_GAP = 8;
const EMPTY_HEIGHT = 120;
const FOOTER_HEIGHT = 44;
const CONTENT_WIDTH = WIDTH - MARGIN * 2;
const TRACK_X = 72;
const TRACK_RIGHT = 160;
const TRACK_HEIGHT = 24;

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

function drawLegend(ctx: SKRSContext2D, input: SignalLogRenderInput, y: number): void {
  const copy = signalText(input.locale);
  let x = WIDTH - MARGIN - 8;
  for (const [label, color] of [[copy.legendB, PAPER.b], [copy.legendA, PAPER.a], [copy.legendS, PAPER.s]] as const) {
    ctx.font = `13px ${getZzzOfficialFont(input.locale)}`;
    const width = ctx.measureText(label).width;
    text(ctx, label, x, y, 13, PAPER.muted, "right");
    x -= width + 18;
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 6, 12, 12);
    x -= 16;
  }
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

export async function renderSignalCycles(input: SignalLogRenderInput): Promise<Buffer> {
  const all = buildPityCycles(input.summary, input.pityEstimated, input.openCycleIsLive);
  const cycles = all.slice(input.page * SIGNAL_LOG_PAGE_SIZE, (input.page + 1) * SIGNAL_LOG_PAGE_SIZE);
  const listHeight = cycles.length ? cycles.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP : EMPTY_HEIGHT;
  const art = await resolveHeroArt(input);
  const heroHeight = art ? HERO_HEIGHT : COMPACT_HERO_HEIGHT;
  const height = heroHeight + GAP + SECTION_HEIGHT + listHeight + FOOTER_HEIGHT;
  const { canvas, ctx } = createScaledCanvas(height);
  const copy = signalText(input.locale);
  const accent = signalAccent(input);
  const hard = input.summary.hardPity;
  drawPaper(ctx, height);
  await drawHeroBanner(ctx, input, heroHeight, copy.viewRecords, art);

  let y = heroHeight + GAP;
  ctx.font = `bold 22px ${getZzzOfficialFont(input.locale)}`;
  ctx.fillStyle = PAPER.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(copy.pityCycles, MARGIN + 8, y + 24);
  drawLegend(ctx, input, y + 25);
  y += SECTION_HEIGHT;

  if (!cycles.length) {
    drawGlassCard(ctx, MARGIN, y, CONTENT_WIDTH, EMPTY_HEIGHT);
    text(ctx, copy.noRecords, WIDTH / 2, y + EMPTY_HEIGHT / 2, 20, PAPER.muted, "center");
  } else {
    const cardAssets = await loadGtCardAssets();
    const [cards, top] = await Promise.all([
      Promise.all(cycles.map((cycle) => cycle.sRecord
        ? prepareGtCard(input, { id: String(cycle.sRecord.itemId ?? ""), itemType: cycle.sRecord.itemType, rarity: "S" })
        : null)),
      loadTopIcon(),
    ]);
    const trackWidth = CONTENT_WIDTH - TRACK_X - TRACK_RIGHT;
    const cellWidth = trackWidth / hard;
    cycles.forEach((cycle, index) => {
      const rowY = y + index * (ROW_HEIGHT + ROW_GAP);
      drawGlassCard(ctx, MARGIN, rowY, CONTENT_WIDTH, ROW_HEIGHT, { radius: 12 });
      const card = cards[index];
      if (card) drawGtCard(ctx, card.item, card.kind, MARGIN + 10, rowY + 8, 48, card.images, cardAssets);
      else drawOpenSlot(ctx, MARGIN + 10, rowY + 8, 48, accent);
      const trackX = MARGIN + TRACK_X;
      const trackY = rowY + (ROW_HEIGHT - TRACK_HEIGHT) / 2;
      cycleTrackCells(cycle, hard).forEach((cell, cellIndex) => {
        ctx.fillStyle = cellColor(cell, accent);
        ctx.fillRect(trackX + cellIndex * cellWidth, trackY, Math.max(1, cellWidth - 1), TRACK_HEIGHT);
      });
      const label = `${cycle.partial ? "~" : ""}${cycle.length}`;
      const color = cycle.sRecord ? progressColor(cycle.length, hard) : accent;
      const numberRight = MARGIN + CONTENT_WIDTH - 82;
      numberText(ctx, label, numberRight, rowY + ROW_HEIGHT / 2 + 2, 28, color, "right");
      if (cycle.sRecord && hasTopBadge(cycle.sRecord)) drawTopBadge(ctx, top, numberRight + 8, rowY + ROW_HEIGHT / 2);
    });
  }

  const pages = signalLogPageCount(input.summary, "records", input.pityEstimated, input.openCycleIsLive);
  text(ctx, pageLabel(input.locale, input.page, pages), WIDTH - MARGIN - 8, height - FOOTER_HEIGHT / 2, 13, PAPER.muted, "right");
  return canvas.toBuffer("image/png");
}
