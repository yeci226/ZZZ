import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { join } from "node:path";
import { getZzzOfficialFont, getZzzOfficialNumberFont, normalizeZzzLocale } from "./canvasFonts.js";
import {
  drawZeroPageBackground,
  loadZeroPageBackground,
} from "./zeroPageBackground.js";
import { noteText } from "./recordText.js";

const ASSET_DIR = join(".", "src", "assets", "images", "zzz", "official-record");

export type ReminderItemKey =
  | "energy" | "vitality" | "cardSign" | "vhs" | "bounty" | "weekly"
  | `event:${string}`;

export interface NoteRenderOptions {
  uid: string;
  playerName?: string | null;
  locale?: string;
  note: any;
  calendar?: any;
  highlighted?: Iterable<ReminderItemKey>;
  now?: number;
}

type NoteTone = "complete" | "energy" | "daily" | "weekly" | "event" | "action" | "neutral";

const NOTE_COLORS: Record<NoteTone | "label" | "secondary" | "surface", string> = {
  complete: "#7D7F80",
  energy: "#2CACF1",
  daily: "#FFDE00",
  weekly: "#F1AD3D",
  event: "#FF4483",
  action: "#FFDE00",
  neutral: "#FFFFFF",
  label: "#D9DBDD",
  secondary: "#7D7F80",
  surface: "#161817",
};

function progressTone(currentValue: unknown, maxValue: unknown, activeTone: NoteTone = "neutral"): NoteTone {
  const current = Number(currentValue) || 0;
  const max = Number(maxValue) || 0;
  return max > 0 && current >= max ? "complete" : activeTone;
}

function metricTone(key: ReminderItemKey, note: any): NoteTone {
  if (key === "vitality") return progressTone(note?.vitality?.current, note?.vitality?.max, "daily");
  if (key === "cardSign") return String(note?.card_sign) === "CardSignDone" ? "complete" : "daily";
  if (key === "vhs") return "daily";
  if (key === "bounty") return progressTone(note?.bounty_commission?.num, note?.bounty_commission?.total, "weekly");
  if (key === "weekly") return progressTone(note?.weekly_task?.cur_point, note?.weekly_task?.max_point, "weekly");
  return "neutral";
}

function eventTone(event: any): NoteTone {
  const state = String(event?.state ?? "");
  if (state === "STATE_COMPLETED") return "complete";
  const current = Number(event?.monochrome_got_cnt ?? 0);
  const max = Number(event?.monochrome_cnt ?? 0);
  return max > 0 && current >= max ? "complete" : "event";
}

function roundedRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

function fitText(ctx: SKRSContext2D, value: unknown, maxWidth: number): string {
  const original = String(value ?? "");
  if (ctx.measureText(original).width <= maxWidth) return original;
  let output = original;
  while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
  return `${output}…`;
}

function secondsLabel(secondsValue: unknown, locale?: string): string {
  let seconds = Math.max(0, Number(secondsValue) || 0);
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const labels = noteText(locale);
  const compact = ["tw", "cn", "jp", "kr"].includes(normalizeZzzLocale(locale));
  const parts: string[] = [];
  if (days) parts.push(`${days}${labels.day}`);
  if (hours || days) parts.push(`${compact ? String(hours).padStart(2, "0") : hours}${labels.hour}`);
  if (!days && minutes) parts.push(`${compact ? String(minutes).padStart(2, "0") : minutes}${labels.minute}`);
  return parts.join(compact ? "" : " ") || labels.lessMinute;
}

function unixCountdown(timestamp: unknown, now: number): number {
  const value = Number(timestamp) || 0;
  return value <= 0 ? 0 : Math.max(0, value - Math.floor(now / 1000));
}

function countdownSeconds(value: unknown, now: number): number {
  const amount = Number(value) || 0;
  return amount > Math.floor(now / 1000) / 2 ? unixCountdown(amount, now) : Math.max(0, amount);
}

function activityList(calendar: any): any[] {
  if (Array.isArray(calendar?.activity_list)) return calendar.activity_list;
  if (Array.isArray(calendar?.list)) return calendar.list;
  return [];
}

function energyFullLabel(energy: any, now: number, locale?: string): string {
  const labels = noteText(locale);
  if (energy?.day_type && energy?.hour !== undefined) {
    const day = Number(energy.day_type) === 2 ? labels.tomorrow : labels.today;
    return `${day}${String(energy.hour).padStart(2, "0")}:${String(energy.minute ?? 0).padStart(2, "0")}${labels.fullSuffix}`;
  }
  const restore = Number(energy?.restore ?? 0);
  if (restore <= 0) return labels.full;
  const full = new Date(now + restore * 1000);
  const tomorrow = full.getDate() !== new Date(now).getDate();
  const hour = String(full.getHours()).padStart(2, "0");
  const minute = String(full.getMinutes()).padStart(2, "0");
  return `${tomorrow ? labels.tomorrow : labels.today}${hour}:${minute}${labels.fullSuffix}`;
}

function drawCardFrame(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, highlighted: boolean, dimmed: boolean): void {
  ctx.save();
  ctx.globalAlpha = dimmed ? 0.43 : 1;
  roundedRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = NOTE_COLORS.surface;
  ctx.fill();
  ctx.lineWidth = highlighted ? 5 : 2;
  ctx.strokeStyle = highlighted ? NOTE_COLORS.action : "rgba(255,255,255,.16)";
  ctx.stroke();
  if (highlighted) {
    roundedRect(ctx, x + 8, y + 8, w - 16, h - 16, 12);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,222,0,.48)";
    ctx.stroke();
  }
  ctx.restore();
}

function drawMetricCard(ctx: SKRSContext2D, options: {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  value: string;
  detail?: string;
  highlighted: boolean;
  dimmed: boolean;
  tone: NoteTone;
  locale?: string;
}): void {
  drawCardFrame(ctx, options.x, options.y, options.width, options.height, options.highlighted, options.dimmed);
  ctx.save();
  ctx.globalAlpha = options.dimmed ? 0.43 : 1;
  ctx.fillStyle = NOTE_COLORS.label;
  ctx.font = `30px ${getZzzOfficialFont(options.locale)}`;
  ctx.fillText(fitText(ctx, options.label, options.width - 44), options.x + 22, options.y + 42);
  ctx.fillStyle = options.highlighted ? NOTE_COLORS.action : NOTE_COLORS[options.tone];
  ctx.font = `44px ${getZzzOfficialNumberFont(options.locale)}`;
  ctx.fillText(fitText(ctx, options.value, options.width - 44), options.x + 22, options.y + 94);
  if (options.detail) {
    ctx.fillStyle = NOTE_COLORS.secondary;
    ctx.font = `20px ${getZzzOfficialFont(options.locale)}`;
    ctx.textAlign = "right";
    ctx.fillText(fitText(ctx, options.detail, options.width - 44), options.x + options.width - 22, options.y + options.height - 18);
    ctx.textAlign = "left";
  }
  ctx.globalAlpha = (options.dimmed ? 0.43 : 1) * 0.28;
  ctx.fillStyle = options.highlighted ? NOTE_COLORS.action : NOTE_COLORS[options.tone];
  roundedRect(ctx, options.x + 22, options.y + options.height - 7, options.width - 44, 2, 1);
  ctx.fill();
  ctx.restore();
}

export async function renderOfficialNote(options: NoteRenderOptions): Promise<Buffer[]> {
  const labels = noteText(options.locale);
  const highlights = new Set(options.highlighted ?? []);
  const reminderMode = highlights.size > 0;
  const events = activityList(options.calendar);
  const eventPages = events.length
    ? Array.from({ length: Math.ceil(events.length / 18) }, (_, index) => events.slice(index * 18, (index + 1) * 18))
    : [[]];
  const buffers: Buffer[] = [];
  const [pageBackground, batteryIcon, calendarBg, polychromeIcon] = await Promise.all([
    loadZeroPageBackground(),
    loadImage(join(ASSET_DIR, "battery-icon-pc.e09cdb50.png")),
    loadImage(join(ASSET_DIR, "event-calendar-module-bg-pc.aeddf0bf.png")),
    loadImage(join(ASSET_DIR, "icon-feilin-summary.8643ebfe.png")),
  ]);

  for (let pageIndex = 0; pageIndex < eventPages.length; pageIndex++) {
    const pageEvents = eventPages[pageIndex]!;
    const includeNote = pageIndex === 0;
    const topSectionHeight = includeNote ? 840 : 190;
    const eventHeight = pageEvents.length ? 98 + pageEvents.length * 132 : 0;
    const height = topSectionHeight + eventHeight + 64;
    const canvas = createCanvas(1044, height);
    const ctx = canvas.getContext("2d");
    drawZeroPageBackground(ctx, 1044, height, pageBackground);
    ctx.fillStyle = NOTE_COLORS.neutral;
    ctx.font = `48px ${getZzzOfficialFont(options.locale)}`;
    const playerPrefix = options.playerName ? `${options.playerName} ` : "";
    const heading = pageIndex ? `${playerPrefix}${labels.activity} ${pageIndex + 1}` : `${playerPrefix}${labels.title}`;
    ctx.fillText(fitText(ctx, heading, 720), 48, 112);
    ctx.fillStyle = NOTE_COLORS.secondary;
    ctx.font = `31px ${getZzzOfficialNumberFont(options.locale)}`;
    ctx.textAlign = "right";
    ctx.fillText(`UID ${options.uid}`, 996, 108);
    ctx.textAlign = "left";

    let y = 152;
    if (includeNote) {
      const current = Number(options.note?.energy?.progress?.current ?? options.note?.energy?.current ?? 0);
      const max = Number(options.note?.energy?.progress?.max ?? options.note?.energy?.max ?? 0);
      const highlighted = highlights.has("energy");
      drawCardFrame(ctx, 48, y, 948, 190, highlighted, reminderMode && !highlighted);
      ctx.save();
      ctx.globalAlpha = reminderMode && !highlighted ? 0.43 : 1;
      ctx.drawImage(batteryIcon, 70, y + 24, 140, 140);
      ctx.fillStyle = NOTE_COLORS.label;
      ctx.font = `31px ${getZzzOfficialFont(options.locale)}`;
      ctx.fillText(labels.energy, 226, y + 54);
      const energyTone = progressTone(current, max, "energy");
      ctx.fillStyle = highlighted ? NOTE_COLORS.action : NOTE_COLORS[energyTone];
      ctx.font = `72px ${getZzzOfficialNumberFont(options.locale)}`;
      ctx.fillText(`${current}`, 226, y + 127);
      ctx.fillStyle = NOTE_COLORS.secondary;
      ctx.font = `33px ${getZzzOfficialNumberFont(options.locale)}`;
      ctx.fillText(`/ ${max}`, 343, y + 126);
      ctx.font = `24px ${getZzzOfficialFont(options.locale)}`;
      ctx.fillStyle = highlighted ? NOTE_COLORS.action : NOTE_COLORS[energyTone];
      ctx.fillText(current >= max && max > 0 ? labels.full : energyFullLabel(options.note?.energy, options.now ?? Date.now(), options.locale), 620, y + 105);
      const energyRatio = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
      roundedRect(ctx, 620, y + 124, 330, 6, 3);
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.fill();
      if (energyRatio > 0) {
        roundedRect(ctx, 620, y + 124, Math.max(6, 330 * energyRatio), 6, 3);
        ctx.fillStyle = highlighted ? NOTE_COLORS.action : NOTE_COLORS[energyTone];
        ctx.fill();
      }
      ctx.restore();
      y += 214;

      const bountyRefresh = options.note?.bounty_commission?.refresh_time;
      const weeklyRefresh = options.note?.weekly_task?.refresh_time;
      const saleState = String(options.note?.vhs_sale?.sale_state ?? "");
      const metrics: Array<[ReminderItemKey, string, string, string?]> = [
        ["vitality", labels.vitality, `${Number(options.note?.vitality?.current ?? 0)} / ${Number(options.note?.vitality?.max ?? 0)}`],
        ["cardSign", labels.scratch, String(options.note?.card_sign) === "CardSignDone" ? labels.done : labels.notDone],
        ["vhs", labels.vhs, saleState === "SaleStateDoing" ? labels.doing : saleState === "SaleStateDone" ? labels.claim : labels.notDone],
        ["bounty", labels.bounty, `${Number(options.note?.bounty_commission?.num ?? 0)} / ${Number(options.note?.bounty_commission?.total ?? 0)}`, bountyRefresh ? `${secondsLabel(countdownSeconds(bountyRefresh, options.now ?? Date.now()), options.locale)}${labels.refresh}` : undefined],
        ["weekly", labels.weekly, `${Number(options.note?.weekly_task?.cur_point ?? 0)} / ${Number(options.note?.weekly_task?.max_point ?? 0)}`, weeklyRefresh ? `${secondsLabel(countdownSeconds(weeklyRefresh, options.now ?? Date.now()), options.locale)}${labels.refresh}` : undefined],
      ];
      metrics.forEach(([key, label, value, detail], index) => {
        const row = Math.floor(index / 2);
        const col = index % 2;
        const active = highlights.has(key);
        drawMetricCard(ctx, {
          x: 48 + col * 486,
          y: y + row * 158,
          width: index === 4 ? 948 : 462,
          height: 140,
          label,
          value,
          detail,
          highlighted: active,
          dimmed: reminderMode && !active,
          tone: metricTone(key, options.note),
          locale: options.locale,
        });
      });
      y += 480;
    }

    if (pageEvents.length) {
      ctx.fillStyle = NOTE_COLORS.neutral;
      ctx.font = `38px ${getZzzOfficialFont(options.locale)}`;
      ctx.fillText(labels.activity, 48, y + 46);
      y += 78;
      pageEvents.forEach((event: any) => {
        const key = `event:${String(event.activity_id ?? event.id ?? "unknown")}` as ReminderItemKey;
        const active = highlights.has(key);
        const dimmed = reminderMode && !active;
        const tone = eventTone(event);
        drawCardFrame(ctx, 48, y, 948, 112, active, dimmed);
        ctx.save();
        ctx.globalAlpha = dimmed ? 0.43 : 1;
        for (let x = 62; x < 982; x += 160) ctx.drawImage(calendarBg, x, y + 20, 160, 72);
        ctx.fillStyle = NOTE_COLORS.label;
        ctx.font = `27px ${getZzzOfficialFont(options.locale)}`;
        ctx.fillText(fitText(ctx, event.name ?? labels.activity, 520), 76, y + 46);
        ctx.fillStyle = active ? NOTE_COLORS.action : NOTE_COLORS[tone];
        ctx.drawImage(polychromeIcon, 72, y + 52, 50, 50);
        ctx.font = `27px ${getZzzOfficialNumberFont(options.locale)}`;
        ctx.fillText(`${Number(event.monochrome_got_cnt ?? 0)} / ${Number(event.monochrome_cnt ?? 0)}`, 130, y + 83);
        const state = String(event.state ?? "");
        const countdown = state === "STATE_NOT_START"
          ? countdownSeconds(event.left_start_ts, options.now ?? Date.now())
          : countdownSeconds(event.left_end_ts, options.now ?? Date.now());
        ctx.textAlign = "right";
        ctx.fillStyle = active ? NOTE_COLORS.action : NOTE_COLORS[tone];
        ctx.font = `31px ${getZzzOfficialFont(options.locale)}`;
        ctx.fillText(state === "STATE_COMPLETED" ? labels.done : `${secondsLabel(countdown, options.locale)}${state === "STATE_NOT_START" ? labels.opens : ""}`, 966, y + 67);
        ctx.textAlign = "left";
        ctx.restore();
        y += 132;
      });
    }
    buffers.push(canvas.toBuffer("image/png"));
  }
  return buffers;
}

export const __noteRendererInternals = {
  secondsLabel,
  unixCountdown,
  countdownSeconds,
  activityList,
  energyFullLabel,
  progressTone,
  metricTone,
  eventTone,
  NOTE_COLORS,
};
