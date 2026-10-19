import { randomInt } from "node:crypto";

/** Match the legacy scheduler's hour interpretation without moving existing users. */
export function scheduledDailyHour(config: { time?: unknown }): number {
  const hour = Number(config.time ?? 13);
  if (hour === 24) return 0;
  // Scheduler compares an integer current hour against the stored value.
  return Number.isFinite(hour) && hour >= 0 && hour <= 23
    ? Math.ceil(hour)
    : 13;
}

export function leastUsedDailyHour(rows: unknown, pick = randomInt): number {
  const counts = Array<number>(24).fill(0);
  if (rows && typeof rows === "object") {
    for (const config of Object.values(rows)) {
      if (config && typeof config === "object" && config.enabled !== false)
        counts[scheduledDailyHour(config)]++;
    }
  }
  const minimum = Math.min(...counts);
  const hours = counts.flatMap((count, hour) =>
    count === minimum ? [hour] : [],
  );
  return hours[pick(hours.length)];
}
