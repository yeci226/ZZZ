export interface DailySignInInfoLike {
  total_sign_day: number;
  short_sign_day?: number;
  sign_cnt_missed?: number;
  today?: string;
  month_last_day?: boolean;
  is_sign?: boolean;
}

export interface DailySignInPresentation<T> {
  signedDays: number;
  missedDays: number;
  daysInMonth: number;
  todayReward?: T;
  tomorrowReward?: T;
}

function toSignedDay(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

/**
 * The claim endpoint can acknowledge a successful sign-in before its follow-up
 * info request reflects the increment. Keep the official value when it is
 * newer, but never render fewer days than the claim just completed.
 */
export function normalizeSuccessfulDailyClaimInfo(
  beforeClaim: DailySignInInfoLike,
  afterClaim: DailySignInInfoLike,
): DailySignInInfoLike {
  const minimumSignedDays = toSignedDay(beforeClaim.total_sign_day) + 1;
  const reportedSignedDays = toSignedDay(afterClaim.total_sign_day);

  if (reportedSignedDays >= minimumSignedDays) return afterClaim;

  return {
    ...afterClaim,
    total_sign_day: minimumSignedDays,
    is_sign: true,
  };
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
