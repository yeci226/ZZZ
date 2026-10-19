import type { ReminderLocale } from "./reminderCopy.js";

export type ReminderDurationDefaultUnit = "minutes" | "hours";

const DURATION_TOKEN = /(\d+(?:[.,]\d+)?)\s*(minutes?|mins?|min|hours?|hrs?|hr|days?|day|heures?|heure|jours?|jour|phút|giờ|ngày|分鐘|分钟|小時|小时|時間|시간|天|日|일|分|분|h|m|d)/giu;

function unitMinutes(unit: string): number | null {
  const normalized = unit.toLocaleLowerCase();
  if (/^(?:minutes?|mins?|min|分鐘|分钟|分|분|phút|m)$/u.test(normalized)) return 1;
  if (/^(?:hours?|hrs?|hr|heures?|heure|小時|小时|時間|시간|giờ|h)$/u.test(normalized)) return 60;
  if (/^(?:days?|day|jours?|jour|天|日|일|ngày|d)$/u.test(normalized)) return 1440;
  return null;
}

/** Parse a localized duration and return a whole number of minutes. */
export function parseReminderDuration(
  value: string,
  defaultUnit: ReminderDurationDefaultUnit,
  minMinutes: number,
  maxMinutes: number,
): number | null {
  const input = value.normalize("NFKC").trim().toLocaleLowerCase();
  if (!input) return null;

  let totalMinutes = 0;
  if (/^\d+(?:[.,]\d+)?$/u.test(input)) {
    totalMinutes = Number(input.replace(",", ".")) * (defaultUnit === "hours" ? 60 : 1);
  } else {
    let cursor = 0;
    let matched = false;
    DURATION_TOKEN.lastIndex = 0;
    for (const match of input.matchAll(DURATION_TOKEN)) {
      const index = match.index ?? 0;
      if (input.slice(cursor, index).trim()) return null;
      const factor = unitMinutes(match[2] ?? "");
      if (factor === null) return null;
      totalMinutes += Number((match[1] ?? "").replace(",", ".")) * factor;
      cursor = index + match[0].length;
      matched = true;
    }
    if (!matched || input.slice(cursor).trim()) return null;
  }

  const rounded = Math.round(totalMinutes);
  if (!Number.isFinite(totalMinutes) || Math.abs(totalMinutes - rounded) > 1e-8) return null;
  return rounded >= minMinutes && rounded <= maxMinutes ? rounded : null;
}

function localizedUnit(locale: ReminderLocale, unit: "minute" | "hour" | "day", count: number): string {
  const units = {
    en: { minute: count === 1 ? "minute" : "minutes", hour: count === 1 ? "hour" : "hours", day: count === 1 ? "day" : "days" },
    tw: { minute: "分鐘", hour: "小時", day: "天" },
    cn: { minute: "分钟", hour: "小时", day: "天" },
    jp: { minute: "分", hour: "時間", day: "日" },
    kr: { minute: "분", hour: "시간", day: "일" },
    fr: { minute: count === 1 ? "minute" : "minutes", hour: count === 1 ? "heure" : "heures", day: count === 1 ? "jour" : "jours" },
    vi: { minute: "phút", hour: "giờ", day: "ngày" },
  } as const;
  return units[locale][unit];
}

function durationPart(value: number, unit: "minute" | "hour" | "day", locale: ReminderLocale): string {
  const spacer = locale === "jp" || locale === "kr" ? "" : " ";
  return `${value}${spacer}${localizedUnit(locale, unit, value)}`;
}

/** Format whole minutes using the most readable localized units. */
export function formatReminderDuration(totalMinutes: number, locale: ReminderLocale): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return durationPart(minutes / 1440, "day", locale);
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder === 0
      ? durationPart(hours, "hour", locale)
      : `${durationPart(hours, "hour", locale)} ${durationPart(remainder, "minute", locale)}`;
  }
  return durationPart(minutes, "minute", locale);
}
