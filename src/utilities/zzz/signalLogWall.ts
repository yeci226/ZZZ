import type { SKRSContext2D } from "@napi-rs/canvas";
import { drawGtCard, loadGtCardAssets, type GtCardAssets } from "./gtCardRenderer.js";
import { signalCategoryText, signalText } from "./recordText.js";
import type { SignalSEntry } from "./signalLogModel.js";
import { wallPageCount, WALL_PAGE_SIZE } from "./signalLogPagination.js";
import {
  CONTENT_WIDTH,
  CONTENT_X,
  createScaledCanvas,
  drawGlassCard,
  drawPaper,
  drawPityPill,
  drawUpTag,
  localeText,
  numberText,
  PAGE_MARGIN,
  PAPER,
  pityTone,
  prepareSCard,
  WIDTH,
} from "./signalLogPaper.js";
import { drawPoster, resolvePosterSubject } from "./signalLogPoster.js";
import { drawChannelFooter, drawChannelStatus, STATUS_HEIGHT } from "./signalLogStatus.js";
import type { SignalLogImageInput } from "./signalLogRenderer.js";

export const S_CELL = { columns: 7, gap: 9, avatar: 76, pill: 27, height: 126 } as const;

const SECTION_HEIGHT = 44;
const FOOTER_HEIGHT = 42;
const BLOCK_GAP = 10;

/** Image height for a wall page with `rows` grid rows (clamped to 3..5). */
export function wallHeight(rows: number): number {
  const count = Math.min(5, Math.max(3, rows));
  return PAGE_MARGIN + STATUS_HEIGHT + BLOCK_GAP + SECTION_HEIGHT + count * S_CELL.height + (count - 1) * S_CELL.gap + FOOTER_HEIGHT;
}

export function drawSCell(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  entry: SignalSEntry,
  hardPity: number,
  limited: boolean,
  card: Awaited<ReturnType<typeof prepareSCard>>,
  assets: GtCardAssets,
): void {
  const avatarX = x + (width - S_CELL.avatar) / 2;
  drawGlassCard(ctx, x, y, width, S_CELL.height, { radius: 12 });
  drawGtCard(ctx, card.item, card.kind, avatarX, y + 7, S_CELL.avatar, card.images, assets);
  if (limited && entry.isUp === true) drawUpTag(ctx, avatarX + S_CELL.avatar + 7, y + 3, 14);
  drawPityPill(
    ctx, x + 9, y + S_CELL.avatar + 14, width - 18, S_CELL.pill,
    entry.pity === null ? "—" : String(entry.pity), pityTone(entry.pity, hardPity),
  );
}

export function drawLiveCell(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  pity: number,
  hardPity: number,
  accent: string,
): void {
  const avatarX = x + (width - S_CELL.avatar) / 2;
  drawGlassCard(ctx, x, y, width, S_CELL.height, { border: accent, radius: 12 });
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(avatarX, y + 7, S_CELL.avatar, S_CELL.avatar, 10);
  ctx.stroke();
  ctx.restore();
  numberText(ctx, "?", x + width / 2, y + 7 + S_CELL.avatar / 2 + 2, 38, accent, "center");
  drawPityPill(ctx, x + 9, y + S_CELL.avatar + 14, width - 18, S_CELL.pill, String(pity), pityTone(pity, hardPity));
}

export async function renderSignalWall(input: SignalLogImageInput): Promise<Buffer> {
  const locale = input.locale;
  const copy = signalText(locale);
  const channel = input.model.channels[input.category];
  const live = channel.currentPity !== null;
  const pages = wallPageCount(channel.entries.length, live);
  const page = Math.min(pages - 1, Math.max(0, Math.trunc(input.page) || 0));
  const hasLiveCell = live && page === 0;
  const start = live ? (page === 0 ? 0 : page * WALL_PAGE_SIZE - 1) : page * WALL_PAGE_SIZE;
  const take = hasLiveCell ? WALL_PAGE_SIZE - 1 : WALL_PAGE_SIZE;
  const slice = channel.entries.slice(start, start + take);
  const slots = slice.length + (hasLiveCell ? 1 : 0);
  const height = wallHeight(Math.ceil(slots / S_CELL.columns));

  const subject = resolvePosterSubject({ view: "wall", model: input.model, category: input.category });
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

  const titleWidth = localeText(ctx, locale, copy.sRecords, CONTENT_X + 6, y + 21, 21, PAPER.ink, { bold: true });
  numberText(ctx, channel.sCount, CONTENT_X + 15 + titleWidth, y + 22, 19, PAPER.muted);
  localeText(ctx, locale, copy.newestFirst, WIDTH - PAGE_MARGIN - 6, y + 22, 13, PAPER.muted, { align: "right" });
  y += SECTION_HEIGHT;

  if (slots === 0) {
    drawGlassCard(ctx, CONTENT_X, y, CONTENT_WIDTH, S_CELL.height, { radius: 12 });
    localeText(ctx, locale, copy.noS, CONTENT_X + CONTENT_WIDTH / 2, y + S_CELL.height / 2, 18, PAPER.muted, {
      align: "center", maxWidth: CONTENT_WIDTH - 40,
    });
  } else {
    const cellWidth = (CONTENT_WIDTH - S_CELL.gap * (S_CELL.columns - 1)) / S_CELL.columns;
    const assets = await loadGtCardAssets();
    const cards = await Promise.all(slice.map((entry) => prepareSCard(entry)));
    for (let index = 0; index < slots; index++) {
      const x = CONTENT_X + (index % S_CELL.columns) * (cellWidth + S_CELL.gap);
      const cy = y + Math.floor(index / S_CELL.columns) * (S_CELL.height + S_CELL.gap);
      if (hasLiveCell && index === 0) {
        drawLiveCell(ctx, x, cy, cellWidth, channel.currentPity!, channel.hardPity, accent);
        continue;
      }
      const at = hasLiveCell ? index - 1 : index;
      drawSCell(ctx, x, cy, cellWidth, slice[at]!, channel.hardPity, channel.limited, cards[at]!, assets);
    }
  }

  drawChannelFooter(ctx, { locale, height, channel, page, pageCount: pages, stale: input.stale });
  return canvas.toBuffer("image/png");
}
