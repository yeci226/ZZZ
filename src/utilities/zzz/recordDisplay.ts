export interface BattleRecordTime {
  year: number | string;
  month: number | string;
  day: number | string;
  hour: number | string;
  minute: number | string;
  second?: number | string;
}

const ENGLISH_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad(value: number | string | undefined): string {
  return String(Number(value ?? 0)).padStart(2, "0");
}

export function formatBattleRecordDate(
  time: Pick<BattleRecordTime, "month" | "day">,
  locale: string,
): string {
  const month = Number(time.month);
  const day = Number(time.day);
  if (locale === "tw" || locale === "zh-tw" || locale === "cn" || locale === "zh-cn") {
    return `${month}月${day}日`;
  }
  const monthLabel = ENGLISH_MONTHS[month - 1] ?? String(month);
  return `${monthLabel} ${day}`;
}

export function formatBattleRecordTime(
  challengeTime: BattleRecordTime | undefined,
  battleTime: number | undefined,
  locale: string,
): string | null {
  if (challengeTime) {
    const year = Number(challengeTime.year);
    const month = Number(challengeTime.month);
    const day = Number(challengeTime.day);
    const clock = `${pad(challengeTime.hour)}:${pad(challengeTime.minute)}:${pad(challengeTime.second)}`;

    if (locale === "tw" || locale === "zh-tw") {
      return `${year}年${month}月${day}日 ${clock}`;
    }
    if (locale === "cn" || locale === "zh-cn") {
      return `${year}年${month}月${day}日 ${clock}`;
    }

    const monthLabel = ENGLISH_MONTHS[month - 1] ?? String(month);
    return `${monthLabel} ${day}, ${year} ${clock}`;
  }

  const seconds = Number(battleTime ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60).toString().padStart(2, "0")}:${(
    wholeSeconds % 60
  )
    .toString()
    .padStart(2, "0")}`;
}

export interface DeadlyAssaultModeData {
  has_hard?: boolean;
  hard_list?: unknown[];
  [key: string]: unknown;
}

export function isDeadlyAssaultExtremeMode(
  data: DeadlyAssaultModeData,
): boolean {
  return data.has_hard === true && Array.isArray(data.hard_list) && data.hard_list.length > 0;
}

export function getDeadlyAssaultModeLabel(locale: string): string {
  if (locale === "tw" || locale === "zh-tw") return "絕境模式";
  if (locale === "cn" || locale === "zh-cn") return "绝境模式";
  return "Extreme Mode";
}

export function getClearTimeLabel(locale: string): string {
  if (locale === "tw" || locale === "zh-tw") return "過關時刻";
  if (locale === "cn" || locale === "zh-cn") return "过关时刻";
  return "Clear Time";
}
