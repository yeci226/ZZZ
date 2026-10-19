export interface DailyInfo {
  total_sign_day: number;
  today?: string | undefined;
  is_sign: boolean;
  month_last_day?: boolean;
  sign_cnt_missed?: number;
  short_sign_day?: number;
}
export interface DailyAward {
  name: string;
  cnt: number;
  icon?: string;
}
export interface DailyRewards {
  month: number;
  now?: string;
  awards: DailyAward[];
}
interface DailyClient {
  info(): Promise<DailyInfo>;
  claim(): Promise<{ code: number; status?: string; info: DailyInfo }>;
  rewards(): Promise<DailyRewards>;
}

async function bounded<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Daily request timed out")),
          8000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function validDailyDate(today?: string): boolean {
  return (
    typeof today === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(today) &&
    Number.isFinite(Date.parse(today)) &&
    new Date(today).toISOString().slice(0, 10) === today
  );
}

export function normalizeDailyInfo(
  before: DailyInfo,
  after: DailyInfo,
): DailyInfo {
  if (!validDailyDate(before.today) || before.today !== after.today)
    return after;
  return {
    ...after,
    is_sign: true,
    total_sign_day: Math.max(after.total_sign_day, before.total_sign_day + 1),
  };
}

export function dailyAwardAt(
  info: DailyInfo,
  rewards: DailyRewards,
  offset = 0,
): DailyAward | undefined {
  if (
    !validDailyDate(info.today) ||
    !Number.isInteger(info.total_sign_day) ||
    info.total_sign_day < 1
  )
    return;
  const date = new Date(info.today!);
  if (rewards.month !== date.getUTCMonth() + 1) return;
  if (rewards.now !== undefined) {
    const timestamp = Number(rewards.now) * 1000;
    if (!Number.isFinite(timestamp)) return;
    const tableDate = new Date(timestamp + 8 * 60 * 60 * 1000);
    if (
      !Number.isFinite(tableDate.getTime()) ||
      tableDate.toISOString().slice(0, 7) !== info.today!.slice(0, 7)
    )
      return;
  }
  const target = new Date(date);
  target.setUTCDate(date.getUTCDate() + offset);
  if (
    target.getUTCMonth() !== date.getUTCMonth() ||
    target.getUTCFullYear() !== date.getUTCFullYear()
  )
    return;
  const award = rewards.awards?.[info.total_sign_day - 1 + offset];
  if (
    !award ||
    typeof award.name !== "string" ||
    !award.name.trim() ||
    !Number.isFinite(award.cnt) ||
    award.cnt <= 0
  )
    return;
  return award;
}

/** Status reads can lag behind a successful or concurrent sign-in. */
async function confirmDailySignIn(
  daily: DailyClient,
): Promise<DailyInfo | null> {
  for (const delay of [0, 500, 1500]) {
    if (delay) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    const info = await bounded(daily.info()).catch(() => null);
    if (info?.is_sign && validDailyDate(info.today)) return info;
  }
  return null;
}

/** Claim once; failures in the SDK's follow-up reads must not cause another POST. */
export async function resolveDailySignIn(daily: DailyClient) {
  const before = await bounded(daily.info());
  let info = before;
  let status: "success" | "already_signed" = "already_signed";
  if (!before.is_sign) {
    let claim;
    try {
      claim = await bounded(daily.claim());
    } catch (error) {
      // The SDK posts first, then reads info/rewards. Confirm the outcome read-only.
      const confirmed = await confirmDailySignIn(daily);
      if (!confirmed) throw error;
      info = confirmed;
    }
    if (claim) {
      if (claim.code !== 0 && claim.code !== -5003) {
        throw Object.assign(
          new Error(
            `${claim.status || "Daily claim failed"} (Code: ${claim.code})`,
          ),
          { code: claim.code },
        );
      }
      status = claim.code === 0 ? "success" : "already_signed";
      info = claim.info;
      if (status === "success" && info) info = normalizeDailyInfo(before, info);
      if (
        !validDailyDate(info?.today) ||
        info.today !== before.today ||
        !info.is_sign
      ) {
        const confirmed = await confirmDailySignIn(daily);
        if (!confirmed)
          throw new Error(
            "Daily sign-in outcome could not be confirmed for the current date",
          );
        info = confirmed;
      }
    }
  }
  if (
    !validDailyDate(info.today) ||
    !Number.isInteger(info.total_sign_day) ||
    info.total_sign_day < 1
  ) {
    info = await bounded(daily.info());
    if (
      !info.is_sign ||
      !validDailyDate(info.today) ||
      !Number.isInteger(info.total_sign_day) ||
      info.total_sign_day < 1
    )
      throw new Error("Daily sign-in state is incomplete; retry status later");
  }
  const month = Number(info.today!.slice(5, 7));
  let rewards: DailyRewards = { month, awards: [] };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const candidate = await bounded(daily.rewards());
      if (dailyAwardAt(info, candidate)) {
        rewards = candidate;
        break;
      }
    } catch {
      /* Reward availability must not change a confirmed sign-in result. */
    }
  }
  return { info, rewards, status, reward: { month } };
}
