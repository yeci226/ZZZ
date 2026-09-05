export interface DailyAuthStateDb {
  get<T = unknown>(
    key: string,
  ): Promise<T | null | undefined> | T | null | undefined;
  set<T = unknown>(key: string, value: T): Promise<unknown> | unknown;
  delete(key: string): Promise<unknown> | unknown;
}

export type InvalidScope = "none" | "redeem" | "general" | "both";

const probeKey = (userId: string, accountKey: string): string =>
  `${userId}.dailyAuth.account_${accountKey}.legacyInvalidProbeDone`;

/**
 * Return a stable account identifier for the passive daily-auth probe.
 * Only ltuid is persisted; the Cookie value itself is never written here.
 */
export function getDailyAuthAccountKey(cookie: string, uid: string): string {
  const match = cookie.match(/(?:^|;\s*)ltuid_v2=([^;\s]+)/i);
  return match?.[1] || `uid:${uid}`;
}

export function classifyInvalidScopes(
  generalInvalid: boolean,
  redeemInvalid: boolean,
): InvalidScope {
  if (generalInvalid && redeemInvalid) return "both";
  if (generalInvalid) return "general";
  if (redeemInvalid) return "redeem";
  return "none";
}

export async function hasLegacyInvalidProbeCompleted(
  db: DailyAuthStateDb,
  userId: string,
  accountKey: string,
): Promise<boolean> {
  return (await db.get(probeKey(userId, accountKey))) === true;
}

export async function markLegacyInvalidProbeCompleted(
  db: DailyAuthStateDb,
  userId: string,
  accountKey: string,
): Promise<void> {
  await db.set(probeKey(userId, accountKey), true);
}

export async function clearLegacyInvalidProbe(
  db: DailyAuthStateDb,
  userId: string,
  accountKey: string,
): Promise<void> {
  await db.delete(probeKey(userId, accountKey));
}
