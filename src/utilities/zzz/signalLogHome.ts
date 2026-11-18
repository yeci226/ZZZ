import { join } from "node:path";
import { loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { GACHA_CATEGORY_ORDER } from "./gachaAnalysis.js";
import { drawGtCard, loadGtCardAssets } from "./gtCardRenderer.js";
import { signalCategoryText, signalText } from "./recordText.js";
import type { GachaStatCategory } from "./gachaStatApi.js";
import type { SignalChannelModel, SignalLogModel, SignalTickets } from "./signalLogModel.js";
import {
  CONTENT_WIDTH,
  CONTENT_X,
  createScaledCanvas,
  drawGlassCard,
  drawPaper,
  drawPityPill,
  drawUpTag,
  fitLocaleText,
  IMAGE_DIR,
  localeText,
  MIN_IMAGE_HEIGHT,
  NUMBER_FONT,
  numberText,
  PAGE_MARGIN,
  PAPER,
  pityTone,
  prepareSCard,
  WIDTH,
} from "./signalLogPaper.js";
import { drawPoster, resolvePosterSubject } from "./signalLogPoster.js";
import type { SignalLogImageInput } from "./signalLogRenderer.js";

const TICKET_HEIGHT = 66;
const FULL_ROW = 94;
const EMPTY_ROW = 44;
const ROW_GAP = 9;
const BLOCK_GAP = 10;
const FOOTER_HEIGHT = 42;
const EXTRA_WIDTH = 164;
const TRACK = "#e4ddd3";
const RED = "#d9473b";
const ASSET_DIR = join(IMAGE_DIR, "zzz", "official-record");
const ORDER = GACHA_CATEGORY_ORDER as GachaStatCategory[];

/** Image height for the home page; never below the minimum. */
export function homeHeight(model: SignalLogModel): number {
  const rows = ORDER.reduce(
    (sum, category) => sum + (model.channels[category].hasRecords ? FULL_ROW : EMPTY_ROW), 0,
  ) + ROW_GAP * (GACHA_CATEGORY_ORDER.length - 1);
  const tickets = model.tickets ? TICKET_HEIGHT + BLOCK_GAP : 0;
  return Math.max(MIN_IMAGE_HEIGHT, PAGE_MARGIN + tickets + rows + FOOTER_HEIGHT);
}

type TicketKey = "monochrome" | "polychrome" | "encrypted" | "original" | "boopon";

function ticketDefs(tickets: SignalTickets, locale?: string): Array<{ key: TicketKey; label: string; value: string }> {
  const copy = signalText(locale);
  const format = (value: number) => value.toLocaleString("en-US");
  const cells: Array<{ key: TicketKey; label: string; value: string }> = [];
  if (tickets.monochrome !== null) cells.push({ key: "monochrome", label: copy.monochrome, value: format(tickets.monochrome) });
  cells.push(
    { key: "polychrome", label: copy.polychrome, value: format(tickets.polychrome) },
    { key: "encrypted", label: copy.encrypted, value: format(tickets.encrypted) },
    { key: "original", label: copy.original, value: format(tickets.original) },
    { key: "boopon", label: copy.boopon, value: format(tickets.boopon) },
  );
  return cells;
}

export function ticketCells(tickets: SignalTickets, locale?: string): Array<{ label: string; value: string }> {
  return ticketDefs(tickets, locale).map(({ label, value }) => ({ label, value }));
}

async function tryImage(path: string): Promise<Image | null> {
  try { return await loadImage(path); } catch { return null; }
}

async function loadTicketIcons(): Promise<Record<TicketKey, Image | null>> {
  const [monochrome, polychrome, encrypted, original, boopon] = await Promise.all([
    tryImage(join(ASSET_DIR, "icon-film-summary.06b22800.png")),
    tryImage(join(ASSET_DIR, "icon-feilin-summary.8643ebfe.png")),
    tryImage(join(IMAGE_DIR, "icons", "gacha", "character.png")),
    tryImage(join(ASSET_DIR, "icon-origin-master.1b749a67.png")),
    tryImage(join(ASSET_DIR, "icon-bangboo-summary.3b54ed6e.png")),
  ]);
  return { monochrome, polychrome, encrypted, original, boopon };
}

function numberWidth(ctx: SKRSContext2D, value: string, size: number): number {
  ctx.font = `${size}px ${NUMBER_FONT}`;
  return ctx.measureText(value).width;
}

function drawBar(ctx: SKRSContext2D, x: number, y: number, width: number, value: number, max: number, color: string): void {
  const height = 11;
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

function drawGuaranteeTag(ctx: SKRSContext2D, locale: string | undefined, value: string, left: number, centerY: number, filled: boolean): void {
  const size = 13;
  const width = fitLocaleText(ctx, locale, value, size, true).width + size * 1.4;
  const height = size * 1.9;
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
}

async function drawTicketRow(
  ctx: SKRSContext2D, tickets: SignalTickets, locale: string | undefined, accent: string, y: number,
): Promise<void> {
  const copy = signalText(locale);
  const icons = await loadTicketIcons();
  const cells = ticketDefs(tickets, locale);
  const totalWidth = CONTENT_WIDTH - EXTRA_WIDTH - ROW_GAP;
  drawGlassCard(ctx, CONTENT_X, y, totalWidth, TICKET_HEIGHT, { radius: 12 });
  const cell = totalWidth / cells.length;
  cells.forEach((item, index) => {
    const x = CONTENT_X + index * cell;
    const icon = icons[item.key];
    const textX = icon ? x + 44 : x + 12;
    if (icon) ctx.drawImage(icon, x + 10, y + (TICKET_HEIGHT - 28) / 2, 28, 28);
    localeText(ctx, locale, item.label, textX, y + 22, 12, PAPER.muted, { maxWidth: x + cell - 6 - textX });
    numberText(ctx, item.value, textX, y + 46, 19, PAPER.ink);
    if (index) {
      ctx.fillStyle = PAPER.line;
      ctx.fillRect(x, y + 14, 1, TICKET_HEIGHT - 28);
    }
  });
  const extraX = CONTENT_X + totalWidth + ROW_GAP;
  drawGlassCard(ctx, extraX, y, EXTRA_WIDTH, TICKET_HEIGHT, { border: accent, radius: 12 });
  localeText(ctx, locale, copy.pullsAvailable, extraX + 14, y + 22, 12, PAPER.muted, { maxWidth: EXTRA_WIDTH - 28 });
  const value = tickets.pullsAvailable.toLocaleString("en-US");
  numberText(ctx, value, extraX + 14, y + 46, 24, accent);
  localeText(ctx, locale, copy.pullUnit, extraX + 19 + numberWidth(ctx, value, 24), y + 48, 14, PAPER.muted);
}

async function drawChannelRow(
  ctx: SKRSContext2D,
  channel: SignalChannelModel,
  locale: string | undefined,
  y: number,
  assets: Awaited<ReturnType<typeof loadGtCardAssets>>,
): Promise<void> {
  const copy = signalText(locale);
  const left = CONTENT_X;
  const right = CONTENT_X + CONTENT_WIDTH;
  const name = signalCategoryText(locale, channel.category);
  if (!channel.hasRecords) {
    drawGlassCard(ctx, left, y, CONTENT_WIDTH, EMPTY_ROW, { radius: 12 });
    localeText(ctx, locale, name, left + 18, y + EMPTY_ROW / 2, 17, PAPER.muted, { bold: true, maxWidth: 220 });
    localeText(ctx, locale, copy.empty, right - 18, y + EMPTY_ROW / 2, 14, PAPER.muted, { align: "right", maxWidth: 200 });
    return;
  }
  drawGlassCard(ctx, left, y, CONTENT_WIDTH, FULL_ROW, { radius: 12 });
  localeText(ctx, locale, name, left + 18, y + 31, 22, PAPER.ink, { bold: true, maxWidth: 150 });
  const total = channel.total.toLocaleString("en-US");
  const totalWidth = numberWidth(ctx, total, 17);
  numberText(ctx, total, left + 18, y + 66, 17, PAPER.muted);
  localeText(ctx, locale, copy.sCountOf.replace("{n}", String(channel.sCount)), left + 24 + totalWidth, y + 67, 13, PAPER.muted, { maxWidth: 138 - totalWidth });

  const px = left + 172;
  const pity = channel.currentPity;
  const color = pityTone(pity, channel.hardPity);
  if (pity === null) {
    numberText(ctx, "—", px, y + 36, 40, PAPER.muted);
  } else {
    const pityWidth = numberWidth(ctx, String(pity), 40);
    numberText(ctx, pity, px, y + 36, 40, color);
    const hardText = `/${channel.hardPity}`;
    numberText(ctx, hardText, px + pityWidth + 4, y + 43, 18, PAPER.muted);
    if (channel.limited && channel.guaranteed !== null) {
      const tagX = px + pityWidth + numberWidth(ctx, hardText, 18) + 16;
      drawGuaranteeTag(ctx, locale, channel.guaranteed ? copy.bigGuarantee : copy.smallGuarantee, tagX, y + 37, channel.guaranteed);
    }
    drawBar(ctx, px, y + 68, 196, pity, channel.hardPity, color);
  }

  const recent = channel.entries.slice(0, 4);
  const cards = await Promise.all(recent.map((entry) => prepareSCard(entry)));
  const size = 52;
  const step = 68;
  let cx = right - 16 - step * recent.length + (step - size);
  recent.forEach((entry, index) => {
    const card = cards[index]!;
    drawGtCard(ctx, card.item, card.kind, cx, y + 9, size, card.images, assets);
    if (channel.limited && entry.isUp === true) drawUpTag(ctx, cx + size + 5, y + 4, 11);
    drawPityPill(ctx, cx, y + 65, size, 21, entry.pity === null ? "—" : String(entry.pity), pityTone(entry.pity, channel.hardPity));
    cx += step;
  });
}

function formatParts(value: string | null | undefined, withDay: boolean): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return withDay ? `${parts.year}/${parts.month}/${parts.day} ${hour}:${parts.minute}` : `${parts.year}/${parts.month}`;
}

function footerText(input: SignalLogImageInput): { text: string; color: string } | null {
  const copy = signalText(input.locale);
  let earliest: string | null = null;
  for (const category of ORDER) {
    const value = input.model.channels[category].firstRecordAt;
    if (value && !Number.isNaN(Date.parse(value)) && (earliest === null || Date.parse(value) < Date.parse(earliest))) earliest = value;
  }
  const since = formatParts(earliest, false);
  const parts: string[] = [];
  if (since) parts.push(copy.recordsSince.replace("{date}", since));
  if (input.stale) return { text: [...parts, copy.syncFailed].join(" · "), color: RED };
  const updated = formatParts(input.archivedAt, true);
  if (updated) parts.push(`${copy.updatedAt} ${updated}`);
  return parts.length ? { text: parts.join(" · "), color: PAPER.muted } : null;
}

export async function renderSignalHome(input: SignalLogImageInput): Promise<Buffer> {
  const locale = input.locale;
  const copy = signalText(locale);
  const model = input.model;
  const height = homeHeight(model);
  const subject = resolvePosterSubject({ view: "home", model, category: input.category });
  const { canvas, ctx } = createScaledCanvas(height);
  drawPaper(ctx, height);
  await drawPoster(ctx, height, {
    subject, title: copy.homeTitle, chip: copy.allChannels,
    playerName: input.playerName ?? "", uid: input.uid, locale,
  });

  let y = PAGE_MARGIN;
  if (model.tickets) {
    await drawTicketRow(ctx, model.tickets, locale, subject.accent, y);
    y += TICKET_HEIGHT + BLOCK_GAP;
  }
  const assets = await loadGtCardAssets();
  for (const category of ORDER) {
    const channel = model.channels[category];
    await drawChannelRow(ctx, channel, locale, y, assets);
    y += (channel.hasRecords ? FULL_ROW : EMPTY_ROW) + ROW_GAP;
  }

  const footer = footerText(input);
  if (footer) localeText(ctx, locale, footer.text, WIDTH - PAGE_MARGIN - 6, height - 22, 13, footer.color, { align: "right" });
  return canvas.toBuffer("image/png");
}
