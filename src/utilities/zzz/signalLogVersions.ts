import type { SKRSContext2D } from "@napi-rs/canvas";
import { loadGtCardAssets } from "./gtCardRenderer.js";
import { signalCategoryText, signalText } from "./recordText.js";
import { UNCLASSIFIED_SEGMENT_KEY, type SignalSegment, type SignalSEntry } from "./signalLogModel.js";
import {
  CONTENT_WIDTH,
  CONTENT_X,
  createScaledCanvas,
  drawGlassCard,
  drawPaper,
  fitLocaleText,
  localeText,
  MIN_IMAGE_HEIGHT,
  PAGE_MARGIN,
  PAPER,
  prepareSCard,
  WIDTH,
} from "./signalLogPaper.js";
import { drawPoster, resolvePosterSubject } from "./signalLogPoster.js";
import { drawChannelFooter, drawChannelStatus, STATUS_HEIGHT } from "./signalLogStatus.js";
import { drawSCell, S_CELL } from "./signalLogWall.js";
import type { SignalLogImageInput } from "./signalLogRenderer.js";

/** Content height of a page: five wall rows, 5 x 126 + 4 x 9. */
export const VERSION_PAGE_BUDGET = 666;
export const SEGMENT_HEADER_HEIGHT = 34;
export const SEGMENT_GAP = 12;

const SECTION_HEIGHT = 44;
const FOOTER_HEIGHT = 42;
const BLOCK_GAP = 10;

export interface SegmentSlice { segment: SignalSegment; entries: SignalSEntry[]; continued: boolean }

export function sliceHeight(slice: SegmentSlice): number {
  const rows = Math.ceil(slice.entries.length / S_CELL.columns);
  return SEGMENT_HEADER_HEIGHT + (rows === 0 ? 0 : rows * S_CELL.height + (rows - 1) * S_CELL.gap);
}

/** Most rows that fit on an empty page next to one segment header. */
const MAX_ROWS = Math.floor((VERSION_PAGE_BUDGET - SEGMENT_HEADER_HEIGHT + S_CELL.gap) / (S_CELL.height + S_CELL.gap));

export function paginateSegments(segments: SignalSegment[]): SegmentSlice[][] {
  const pages: SegmentSlice[][] = [[]];
  let used = 0;
  for (const segment of segments) {
    let rest = segment.entries;
    let continued = false;
    for (;;) {
      const page = pages[pages.length - 1]!;
      const gap = page.length ? SEGMENT_GAP : 0;
      const slice: SegmentSlice = { segment, entries: rest, continued };
      const height = sliceHeight(slice);
      if (height <= VERSION_PAGE_BUDGET - used - gap) {
        page.push(slice);
        used += height + gap;
        break;
      }
      if (page.length) {
        pages.push([]);
        used = 0;
        continue;
      }
      const take = MAX_ROWS * S_CELL.columns;
      page.push({ segment, entries: rest.slice(0, take), continued });
      rest = rest.slice(take);
      continued = true;
      pages.push([]);
      used = 0;
    }
  }
  if (pages.length > 1 && pages[pages.length - 1]!.length === 0) pages.pop();
  return pages;
}

function dayOf(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit" })
    .format(date).replace("-", "/");
}

export function segmentTitle(segment: SignalSegment, _locale?: string): string {
  if (segment.key === UNCLASSIFIED_SEGMENT_KEY) return segment.upNames[0] ?? "";
  const start = dayOf(segment.startAt);
  const end = dayOf(segment.endAt);
  return [
    segment.version,
    segment.upNames.join("／"),
    start && end ? `${start}–${end}` : "",
  ].filter(Boolean).join("  ");
}

export function segmentSummary(segment: SignalSegment, limited: boolean, locale?: string): string {
  const copy = signalText(locale);
  const parts: string[] = [];
  if (segment.pulls !== null) parts.push(`${segment.pulls} ${copy.pullUnit}`);
  if (segment.entries.length === 0) {
    parts.push(copy.noSInVersion);
  } else {
    parts.push(copy.sCountOf.replace("{n}", String(segment.entries.length)));
    if (limited) parts.push(copy.upCountOf.replace("{n}", String(segment.entries.filter((entry) => entry.isUp === true).length)));
  }
  return parts.join(" · ");
}

function drawOngoingTag(ctx: SKRSContext2D, locale: string | undefined, label: string, x: number, y: number, accent: string): void {
  const width = fitLocaleText(ctx, locale, label, 12, true).width + 16;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(x, y - 10, width, 20, 10);
  ctx.fill();
  localeText(ctx, locale, label, x + width / 2, y + 1, 12, "#ffffff", { align: "center", bold: true });
}

export async function renderSignalVersions(input: SignalLogImageInput): Promise<Buffer> {
  const locale = input.locale;
  const copy = signalText(locale);
  const channel = input.model.channels[input.category];
  const pages = paginateSegments(channel.segments);
  const page = Math.min(pages.length - 1, Math.max(0, Math.trunc(input.page) || 0));
  const slices = pages[page]!;
  const contentHeight = slices.length
    ? slices.reduce((sum, slice) => sum + sliceHeight(slice), 0) + SEGMENT_GAP * (slices.length - 1)
    : S_CELL.height;
  const height = Math.max(MIN_IMAGE_HEIGHT, PAGE_MARGIN + STATUS_HEIGHT + BLOCK_GAP + SECTION_HEIGHT + contentHeight + FOOTER_HEIGHT);

  const subject = resolvePosterSubject({ view: "versions", model: input.model, category: input.category });
  const accent = subject.accent;
  const { canvas, ctx } = createScaledCanvas(height);
  drawPaper(ctx, height);
  await drawPoster(ctx, height, {
    subject, title: signalCategoryText(locale, input.category), chip: copy.allRecords,
    playerName: input.playerName ?? "", uid: input.uid, locale,
  });

  let y = PAGE_MARGIN;
  drawChannelStatus(ctx, { channel, locale, accent, y });
  y += STATUS_HEIGHT + BLOCK_GAP;

  const right = WIDTH - PAGE_MARGIN - 6;
  localeText(ctx, locale, copy.viewVersions, CONTENT_X + 6, y + 21, 21, PAPER.ink, { bold: true });
  y += SECTION_HEIGHT;

  if (slices.length === 0) {
    drawGlassCard(ctx, CONTENT_X, y, CONTENT_WIDTH, S_CELL.height, { radius: 12 });
    localeText(ctx, locale, copy.noRecords, CONTENT_X + CONTENT_WIDTH / 2, y + S_CELL.height / 2, 18, PAPER.muted, {
      align: "center", maxWidth: CONTENT_WIDTH - 40,
    });
  } else {
    const assets = await loadGtCardAssets();
    const cellWidth = (CONTENT_WIDTH - S_CELL.gap * (S_CELL.columns - 1)) / S_CELL.columns;
    for (const slice of slices) {
      const { segment } = slice;
      const cards = await Promise.all(slice.entries.map((entry) => prepareSCard(entry)));
      const midY = y + SEGMENT_HEADER_HEIGHT / 2 - 2;
      const summary = fitLocaleText(ctx, locale, segmentSummary(segment, channel.limited, locale), 14);
      localeText(ctx, locale, summary.text, right, midY, 14, PAPER.muted, { align: "right" });
      let titleText = segmentTitle(segment, locale);
      if (slice.continued) titleText += copy.continued;
      const tagWidth = segment.ongoing ? fitLocaleText(ctx, locale, copy.ongoing, 12, true).width + 16 + 8 : 0;
      const titleWidth = localeText(ctx, locale, titleText, CONTENT_X + 6, midY, 18, PAPER.ink, {
        bold: true, maxWidth: right - (CONTENT_X + 6) - summary.width - 16 - tagWidth,
      });
      if (segment.ongoing) drawOngoingTag(ctx, locale, copy.ongoing, CONTENT_X + 6 + titleWidth + 8, midY, accent);
      const gridY = y + SEGMENT_HEADER_HEIGHT;
      slice.entries.forEach((entry, index) => {
        const x = CONTENT_X + (index % S_CELL.columns) * (cellWidth + S_CELL.gap);
        const cy = gridY + Math.floor(index / S_CELL.columns) * (S_CELL.height + S_CELL.gap);
        drawSCell(ctx, x, cy, cellWidth, entry, channel.hardPity, channel.limited, cards[index]!, assets);
      });
      y += sliceHeight(slice) + SEGMENT_GAP;
    }
  }

  drawChannelFooter(ctx, { locale, height, channel, page, pageCount: pages.length, stale: input.stale });
  return canvas.toBuffer("image/png");
}
