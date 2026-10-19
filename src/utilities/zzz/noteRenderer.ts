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

export interface ReminderAttention {
  level: "normal" | "soon" | "urgent";
  /** Null when the amount threshold is reached but the API provides no ETA. */
  remainingSeconds: number | null;
}

export interface NoteRenderOptions {
  uid: string;
  playerName?: string | null;
  locale?: string;
  note: any;
  calendar?: any;
  highlighted?: Iterable<ReminderItemKey>;
  attention?: Partial<Record<ReminderItemKey, ReminderAttention>>;
  now?: number;
}

type NoteTone = "complete" | "energy" | "daily" | "weekly" | "event" | "action" | "urgent" | "neutral";
type AttentionLevel = ReminderAttention["level"];

const NOTE_COLORS: Record<NoteTone | "label" | "secondary" | "surface", string> = {
  complete: "#7D7F80",
  energy: "#2CACF1",
  daily: "#FFDE00",
  weekly: "#F1AD3D",
  event: "#FF4483",
  action: "#FFDE00",
  urgent: "#FF805C",
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
  if (key === "vhs") return String(note?.vhs_sale?.sale_state) === "SaleStateDoing" ? "complete" : "daily";
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

function attentionColor(level: AttentionLevel): string {
  return level === "urgent" ? NOTE_COLORS.urgent : NOTE_COLORS.action;
}

function attentionDeadline(key: ReminderItemKey, attention: ReminderAttention, locale?: string): string {
  const labels = noteText(locale);
  if (attention.remainingSeconds === null) return labels.threshold;
  if (key === "energy" && attention.remainingSeconds <= 0) return labels.full;
  const suffix = key === "energy" ? labels.restores : key.startsWith("event:") ? labels.ends : labels.resets;
  return `${secondsLabel(attention.remainingSeconds, locale)}${suffix}`;
}

function drawAttentionBadge(ctx: SKRSContext2D, x: number, y: number, level: AttentionLevel, locale?: string): number {
  if (level === "normal") return 0;
  ctx.save();
  ctx.font = `20px ${getZzzOfficialFont(locale)}`;
  const label = level === "urgent" ? noteText(locale).urgent : noteText(locale).soon;
  const width = ctx.measureText(label).width + 20;
  ctx.fillStyle = attentionColor(level);
  roundedRect(ctx, x, y, width, 28, 6);
  ctx.fill();
  ctx.fillStyle = NOTE_COLORS.surface;
  ctx.fillText(label, x + 10, y + 21);
  ctx.restore();
  return width;
}

function drawCardFrame(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, level: AttentionLevel, dimmed: boolean): void {
  const highlighted = level !== "normal";
  ctx.save();
  ctx.globalAlpha = dimmed ? 0.62 : 1;
  roundedRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = NOTE_COLORS.surface;
  ctx.fill();
  ctx.lineWidth = level === "urgent" ? 5 : highlighted ? 3 : 2;
  ctx.strokeStyle = highlighted ? attentionColor(level) : "rgba(255,255,255,.16)";
  ctx.stroke();
  if (level === "urgent") {
    roundedRect(ctx, x + 8, y + 8, w - 16, h - 16, 12);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,128,92,.4)";
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
  level: AttentionLevel;
  dimmed: boolean;
  tone: NoteTone;
  reminderMode: boolean;
  locale?: string;
}): void {
  const highlighted = options.level !== "normal";
  const color = highlighted ? attentionColor(options.level)
    : options.reminderMode && options.tone !== "complete" ? NOTE_COLORS.label : NOTE_COLORS[options.tone];
  drawCardFrame(ctx, options.x, options.y, options.width, options.height, options.level, options.dimmed);
  ctx.save();
  ctx.globalAlpha = options.dimmed ? 0.62 : 1;
  ctx.fillStyle = NOTE_COLORS.label;
  ctx.font = `30px ${getZzzOfficialFont(options.locale)}`;
  ctx.fillText(fitText(ctx, options.label, options.width - 44), options.x + 22, options.y + 42);
  ctx.fillStyle = color;
  ctx.font = `44px ${getZzzOfficialNumberFont(options.locale)}`;
  ctx.fillText(fitText(ctx, options.value, options.width - 44), options.x + 22, options.y + 94);
  const badgeWidth = drawAttentionBadge(ctx, options.x + 22, options.y + options.height - 40, options.level, options.locale);
  if (options.detail) {
    ctx.fillStyle = highlighted ? color : NOTE_COLORS.secondary;
    ctx.font = `20px ${getZzzOfficialFont(options.locale)}`;
    ctx.textAlign = "right";
    ctx.fillText(fitText(ctx, options.detail, options.width - 44 - (badgeWidth ? badgeWidth + 12 : 0)), options.x + options.width - 22, options.y + options.height - 18);
    ctx.textAlign = "left";
  }
  ctx.globalAlpha = (options.dimmed ? 0.62 : 1) * 0.28;
  ctx.fillStyle = color;
  roundedRect(ctx, options.x + 22, options.y + options.height - 7, options.width - 44, 2, 1);
  ctx.fill();
  ctx.restore();
}

export async function renderOfficialNote(options: NoteRenderOptions): Promise<Buffer[]> {
  const labels = noteText(options.locale);
  const now = options.now ?? Date.now();
  const highlights = new Set(options.highlighted ?? []);
  const reminderMode = options.attention !== undefined || highlights.size > 0;
  const attentionLevel = (key: ReminderItemKey): AttentionLevel => options.attention
    ? options.attention[key]?.level ?? "normal"
    : highlights.has(key) ? "soon" : "normal";
  const events = activityList(options.calendar);
  const priorities = (Object.entries(options.attention ?? {}) as Array<[ReminderItemKey, ReminderAttention]>)
    .filter(([, item]) => item.level !== "normal")
    .sort(([, a], [, b]) => Number(b.level === "urgent") - Number(a.level === "urgent")
      || (a.remainingSeconds ?? Infinity) - (b.remainingSeconds ?? Infinity));
  const priority = priorities[0];
  const summaryHeight = priority ? 88 : 0;
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
    const topSectionHeight = (includeNote ? 840 : 190) + summaryHeight;
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
    if (priority) {
      const [key, attention] = priority;
      const names: Partial<Record<ReminderItemKey, string>> = {
        energy: labels.energy, vitality: labels.vitality, cardSign: labels.scratch,
        vhs: labels.vhs, bounty: labels.bounty, weekly: labels.weekly,
      };
      const event = events.find((item) => `event:${String(item.activity_id ?? item.id ?? "unknown")}` === key);
      const name = names[key] ?? event?.name ?? labels.activity;
      roundedRect(ctx, 48, y, 948, 64, 12);
      ctx.fillStyle = NOTE_COLORS.surface;
      ctx.fill();
      ctx.fillStyle = attentionColor(attention.level);
      ctx.fillRect(48, y + 12, 4, 40);
      ctx.font = `27px ${getZzzOfficialFont(options.locale)}`;
      const prefix = `${labels.priority} · `;
      ctx.fillText(prefix, 70, y + 42);
      const nameX = 70 + ctx.measureText(prefix).width;
      ctx.font = `24px ${getZzzOfficialFont(options.locale)}`;
      const deadline = attentionDeadline(key, attention, options.locale);
      const deadlineWidth = Math.min(440, ctx.measureText(deadline).width);
      ctx.textAlign = "right";
      ctx.fillText(fitText(ctx, deadline, 440), 974, y + 42);
      ctx.textAlign = "left";
      ctx.font = `27px ${getZzzOfficialFont(options.locale)}`;
      ctx.fillStyle = NOTE_COLORS.label;
      ctx.fillText(fitText(ctx, name, 974 - deadlineWidth - 24 - nameX), nameX, y + 42);
      y += summaryHeight;
    }
    if (includeNote) {
      const current = Number(options.note?.energy?.progress?.current ?? options.note?.energy?.current ?? 0);
      const max = Number(options.note?.energy?.progress?.max ?? options.note?.energy?.max ?? 0);
      const level = attentionLevel("energy");
      const highlighted = level !== "normal";
      const energyColor = highlighted ? attentionColor(level)
        : reminderMode ? NOTE_COLORS.label : NOTE_COLORS[progressTone(current, max, "energy")];
      drawCardFrame(ctx, 48, y, 948, 190, level, false);
      ctx.save();
      ctx.drawImage(batteryIcon, 70, y + 24, 140, 140);
      ctx.fillStyle = NOTE_COLORS.label;
      ctx.font = `31px ${getZzzOfficialFont(options.locale)}`;
      ctx.fillText(labels.energy, 226, y + 54);
      drawAttentionBadge(ctx, 226 + ctx.measureText(labels.energy).width + 18, y + 28, level, options.locale);
      ctx.fillStyle = energyColor;
      ctx.font = `72px ${getZzzOfficialNumberFont(options.locale)}`;
      ctx.fillText(`${current}`, 226, y + 127);
      ctx.fillStyle = NOTE_COLORS.secondary;
      ctx.font = `33px ${getZzzOfficialNumberFont(options.locale)}`;
      ctx.fillText(`/ ${max}`, 343, y + 126);
      ctx.font = `24px ${getZzzOfficialFont(options.locale)}`;
      const energyAttention = options.attention?.energy;
      if (energyAttention) {
        ctx.fillStyle = energyColor;
        ctx.fillText(fitText(ctx, attentionDeadline("energy", energyAttention, options.locale), 330), 620, y + 70);
      }
      ctx.fillStyle = energyAttention ? NOTE_COLORS.secondary : energyColor;
      const fullLabel = energyAttention?.remainingSeconds === null ? ""
        : current >= max && max > 0 ? labels.full : energyFullLabel(options.note?.energy, now, options.locale);
      ctx.fillText(fitText(ctx, fullLabel, 330), 620, y + 105);
      const energyRatio = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
      roundedRect(ctx, 620, y + 124, 330, 6, 3);
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.fill();
      if (energyRatio > 0) {
        roundedRect(ctx, 620, y + 124, Math.max(6, 330 * energyRatio), 6, 3);
        ctx.fillStyle = energyColor;
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
        ["bounty", labels.bounty, `${Number(options.note?.bounty_commission?.num ?? 0)} / ${Number(options.note?.bounty_commission?.total ?? 0)}`, bountyRefresh ? `${secondsLabel(countdownSeconds(bountyRefresh, now), options.locale)}${labels.refresh}` : undefined],
        ["weekly", labels.weekly, `${Number(options.note?.weekly_task?.cur_point ?? 0)} / ${Number(options.note?.weekly_task?.max_point ?? 0)}`, weeklyRefresh ? `${secondsLabel(countdownSeconds(weeklyRefresh, now), options.locale)}${labels.refresh}` : undefined],
      ];
      metrics.forEach(([key, label, value, detail], index) => {
        const row = Math.floor(index / 2);
        const col = index % 2;
        const level = attentionLevel(key);
        const tone = metricTone(key, options.note);
        const attention = options.attention?.[key];
        drawMetricCard(ctx, {
          x: 48 + col * 486,
          y: y + row * 158,
          width: index === 4 ? 948 : 462,
          height: 140,
          label,
          value,
          detail: attention ? attentionDeadline(key, attention, options.locale) : detail,
          level,
          dimmed: reminderMode && level === "normal" && tone === "complete",
          tone,
          reminderMode,
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
        const level = attentionLevel(key);
        const active = level !== "normal";
        const state = String(event.state ?? "");
        const tone = eventTone(event);
        const expired = state !== "STATE_NOT_START" && countdownSeconds(event.left_end_ts, now) <= 0;
        const dimmed = reminderMode && !active && (tone === "complete" || state !== "STATE_IN_PROGRESS" || expired);
        const color = active ? attentionColor(level) : reminderMode ? NOTE_COLORS.label : NOTE_COLORS[tone];
        drawCardFrame(ctx, 48, y, 948, 112, level, dimmed);
        ctx.save();
        ctx.globalAlpha = dimmed ? 0.62 : 1;
        for (let x = 62; x < 982; x += 160) ctx.drawImage(calendarBg, x, y + 20, 160, 72);
        ctx.fillStyle = NOTE_COLORS.label;
        ctx.font = `27px ${getZzzOfficialFont(options.locale)}`;
        ctx.fillText(fitText(ctx, event.name ?? labels.activity, 520), 76, y + 46);
        ctx.fillStyle = color;
        ctx.drawImage(polychromeIcon, 72, y + 52, 50, 50);
        ctx.font = `27px ${getZzzOfficialNumberFont(options.locale)}`;
        ctx.fillText(`${Number(event.monochrome_got_cnt ?? 0)} / ${Number(event.monochrome_cnt ?? 0)}`, 130, y + 83);
        const countdown = state === "STATE_NOT_START"
          ? countdownSeconds(event.left_start_ts, now)
          : countdownSeconds(event.left_end_ts, now);
        if (active) {
          ctx.font = `20px ${getZzzOfficialFont(options.locale)}`;
          const badgeWidth = ctx.measureText(level === "urgent" ? labels.urgent : labels.soon).width + 20;
          drawAttentionBadge(ctx, 966 - badgeWidth, y + 18, level, options.locale);
        }
        ctx.textAlign = "right";
        ctx.fillStyle = color;
        ctx.font = `31px ${getZzzOfficialFont(options.locale)}`;
        const countdownLabel = state === "STATE_COMPLETED" || (reminderMode && tone === "complete") ? labels.done
          : reminderMode && expired ? labels.ended
          : `${secondsLabel(countdown, options.locale)}${state === "STATE_NOT_START" ? labels.opens : reminderMode ? labels.ends : ""}`;
        ctx.fillText(fitText(ctx, countdownLabel, 344), 966, y + (active ? 86 : 67));
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
