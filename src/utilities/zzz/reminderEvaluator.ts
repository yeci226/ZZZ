import type { ReminderItemKey } from "./noteRenderer.js";
import type { NoteReminderConfig } from "./reminderConfig.js";

export interface ReminderTrigger {
  key: ReminderItemKey;
  cycle: string;
}

export interface ReminderEvaluation {
  triggers: ReminderTrigger[];
  energyCondition: boolean;
}

function secondsUntil(value: unknown, nowMs: number): number {
  const number = Number(value) || 0;
  if (number <= 0) return 0;
  // HoYoLAB uses both absolute Unix timestamps and duration fields.
  return number > 1_000_000_000 ? Math.max(0, number - Math.floor(nowMs / 1000)) : number;
}

function serverOffsetHours(region: unknown): number {
  const normalized = String(region ?? "").toLowerCase();
  if (normalized.includes("us")) return -5;
  if (normalized.includes("eu")) return 1;
  return 8;
}

function nextReset(nowMs: number, offsetHours: number, weekly: boolean): number {
  const shifted = new Date(nowMs + offsetHours * 3600_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  let resetShifted = Date.UTC(year, month, day, 4, 0, 0, 0);
  if (weekly) {
    const weekday = new Date(resetShifted).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    resetShifted -= daysSinceMonday * 86400_000;
    if (resetShifted <= nowMs + offsetHours * 3600_000) resetShifted += 7 * 86400_000;
  } else if (resetShifted <= nowMs + offsetHours * 3600_000) {
    resetShifted += 86400_000;
  }
  return resetShifted - offsetHours * 3600_000;
}

function cycleDate(timestampMs: number, offsetHours: number): string {
  return new Date(timestampMs + offsetHours * 3600_000).toISOString().slice(0, 10);
}

export function evaluateNoteReminder(
  note: any,
  calendar: any,
  config: NoteReminderConfig,
  context: { now?: number; region?: string } = {},
): ReminderEvaluation {
  const now = context.now ?? Date.now();
  const offset = serverOffsetHours(context.region);
  const dailyReset = nextReset(now, offset, false);
  const weeklyReset = nextReset(now, offset, true);
  const dailyNear = dailyReset - now <= config.dailyHours * 3600_000;
  const weeklyNearDefault = weeklyReset - now <= config.weeklyHours * 3600_000;
  const dailyCycle = cycleDate(dailyReset, offset);
  const weeklyCycle = cycleDate(weeklyReset, offset);
  const triggers: ReminderTrigger[] = [];

  const current = Number(note?.energy?.progress?.current ?? note?.energy?.current ?? 0);
  const max = Number(note?.energy?.progress?.max ?? note?.energy?.max ?? 0);
  const restore = Number(note?.energy?.restore ?? 0);
  const energyCondition = config.energyMode === "amount"
    ? current >= config.energyValue && current < max
    : config.energyMode === "time"
      ? current < max && restore > 0 && restore <= config.energyValue * 60
      : false;
  if (energyCondition) triggers.push({ key: "energy", cycle: "energy" });

  if (config.vitalityEnabled && dailyNear && Number(note?.vitality?.current ?? 0) < Number(note?.vitality?.max ?? 0)) {
    triggers.push({ key: "vitality", cycle: `daily:${dailyCycle}:vitality` });
  }
  if (config.cardSignEnabled && dailyNear && String(note?.card_sign) !== "CardSignDone") {
    triggers.push({ key: "cardSign", cycle: `daily:${dailyCycle}:cardSign` });
  }
  const saleState = String(note?.vhs_sale?.sale_state ?? "");
  const temple = note?.temple_running ?? {};
  const autoWork = temple?.auto_work;
  const templeNeedsAction = autoWork?.is_auto_work_running
    ? Boolean(autoWork.auto_work_ended)
    : [
        "ExpeditionStateEnd",
        "ExpeditionStateInCanSend",
      ].includes(String(temple?.expedition_state ?? ""))
      || String(temple?.bench_state ?? "") === "BenchStateCanProduce"
      || ["ShelveStateSoldOut", "ShelveStateCanSell"].includes(String(temple?.shelve_state ?? ""));
  if (config.vhsEnabled && dailyNear && (
    saleState === "SaleStateNo" || saleState === "SaleStateDone" || templeNeedsAction
  )) {
    triggers.push({ key: "vhs", cycle: `daily:${dailyCycle}:vhs` });
  }

  const bountyRefresh = secondsUntil(note?.bounty_commission?.refresh_time, now);
  const bountyNear = bountyRefresh > 0 ? bountyRefresh <= config.weeklyHours * 3600 : weeklyNearDefault;
  if (config.bountyEnabled && bountyNear && Number(note?.bounty_commission?.num ?? 0) < Number(note?.bounty_commission?.total ?? 0)) {
    triggers.push({ key: "bounty", cycle: `weekly:${weeklyCycle}:bounty` });
  }
  const weeklyRefresh = secondsUntil(note?.weekly_task?.refresh_time, now);
  const weeklyNear = weeklyRefresh > 0 ? weeklyRefresh <= config.weeklyHours * 3600 : weeklyNearDefault;
  if (config.weeklyEnabled && weeklyNear && Number(note?.weekly_task?.cur_point ?? 0) < config.weeklyTarget) {
    triggers.push({ key: "weekly", cycle: `weekly:${weeklyCycle}:points:${config.weeklyTarget}` });
  }

  const events = Array.isArray(calendar?.activity_list) ? calendar.activity_list : [];
  if (config.eventEnabled) {
    for (const event of events) {
      const state = String(event?.state ?? "");
      const total = Number(event?.monochrome_cnt ?? 0);
      const got = Number(event?.monochrome_got_cnt ?? 0);
      const remaining = secondsUntil(event?.left_end_ts, now);
      if (state === "STATE_IN_PROGRESS" && total > got && remaining > 0 && remaining <= config.eventHours * 3600) {
        const id = String(event.activity_id ?? event.id ?? "unknown");
        triggers.push({ key: `event:${id}`, cycle: `event:${id}:${String(event.left_end_ts ?? "")}` });
      }
    }
  }
  return { triggers, energyCondition };
}

export const __reminderEvaluatorInternals = { secondsUntil, nextReset, serverOffsetHours };
