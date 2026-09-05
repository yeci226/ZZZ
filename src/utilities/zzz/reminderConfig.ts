import type { NotificationDestinationConfig } from "../core/notificationDestination.js";

export type EnergyReminderMode = "time" | "amount" | "off";

export interface NoteReminderConfig extends NotificationDestinationConfig {
  enabled: boolean;
  tag: boolean;
  energyMode: EnergyReminderMode;
  /** Minutes for time mode, charge amount for amount mode. */
  energyValue: number;
  vitalityEnabled: boolean;
  cardSignEnabled: boolean;
  vhsEnabled: boolean;
  bountyEnabled: boolean;
  weeklyEnabled: boolean;
  eventEnabled: boolean;
  dailyHours: number;
  weeklyHours: number;
  weeklyTarget: number;
  eventHours: number;
}

export const DEFAULT_NOTE_REMINDER_CONFIG: NoteReminderConfig = {
  enabled: true,
  notificationEnabled: true,
  notifyType: "channel",
  tag: true,
  energyMode: "time",
  energyValue: 60,
  vitalityEnabled: true,
  cardSignEnabled: true,
  vhsEnabled: true,
  bountyEnabled: true,
  weeklyEnabled: true,
  eventEnabled: true,
  dailyHours: 3,
  weeklyHours: 24,
  weeklyTarget: 1100,
  eventHours: 24,
};

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function normalizeNoteReminderConfig(raw: unknown): NoteReminderConfig {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const mode = value.energyMode === "amount" || value.energyMode === "off" ? value.energyMode : "time";
  return {
    ...DEFAULT_NOTE_REMINDER_CONFIG,
    ...value,
    enabled: value.enabled !== false,
    notificationEnabled: value.notificationEnabled !== false,
    notifyType: value.notifyType === "dm" ? "dm" : "channel",
    tag: value.tag !== false,
    energyMode: mode,
    energyValue: numberInRange(value.energyValue, mode === "amount" ? 200 : 60, mode === "amount" ? 1 : 15, mode === "amount" ? 240 : 720),
    dailyHours: numberInRange(value.dailyHours, 3, 1, 12),
    weeklyHours: numberInRange(value.weeklyHours, 24, 1, 168),
    weeklyTarget: numberInRange(value.weeklyTarget, 1100, 1, 2100),
    eventHours: numberInRange(value.eventHours, 24, 1, 168),
  } as NoteReminderConfig;
}

