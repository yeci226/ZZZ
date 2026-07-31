export interface DailySignInInfoLike {
  total_sign_day: number;
  short_sign_day?: number;
  sign_cnt_missed?: number;
  today?: string;
  month_last_day?: boolean;
}

export interface DailySignInPresentation<T> {
  signedDays: number;
  missedDays: number;
  daysInMonth: number;
  todayReward?: T;
  tomorrowReward?: T;
}

function getDaysInMonth(today?: string): number {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(today ?? "");
  if (!match) return 31;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
}

export function buildDailySignInPresentation<T>(
  info: DailySignInInfoLike,
  awards: T[],
): DailySignInPresentation<T> {
  const signedDays = Math.max(0, Math.floor(Number(info.total_sign_day) || 0));
  const daysInMonth = getDaysInMonth(info.today);
  const todayReward = signedDays > 0 ? awards[signedDays - 1] : undefined;
  const tomorrowReward =
    info.month_last_day || signedDays >= awards.length
      ? undefined
      : awards[signedDays];

  return {
    signedDays,
    missedDays: Math.max(0, Math.floor(Number(info.sign_cnt_missed) || 0)),
    daysInMonth,
    todayReward,
    tomorrowReward,
  };
}
