export interface RedeemCookieDb {
  get<T = unknown>(
    key: string,
  ): Promise<T | null | undefined> | T | null | undefined;
  set<T = unknown>(key: string, value: T): Promise<unknown> | unknown;
  delete(key: string): Promise<unknown> | unknown;
}

export interface RedeemCookieState {
  invalid: boolean;
  needsCookieUpdate: boolean;
  lastRefreshAttempt: number | null;
  legacyMigrated: boolean;
}

const key = (uid: string, field: string) => `${uid}.${field}`;
const REDEEM_MIGRATION_MARKER = "redeemStateMigrated";

const stateQueues = new WeakMap<object, Map<string, Promise<void>>>();

async function withRedeemStateLock<T>(
  db: RedeemCookieDb,
  uid: string,
  task: () => Promise<T>,
): Promise<T> {
  const owner = db as object;
  const queues = stateQueues.get(owner) ?? new Map<string, Promise<void>>();
  stateQueues.set(owner, queues);

  const previous = queues.get(uid) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(() => task());
  const tracked = current.then(
    () => undefined,
    () => undefined,
  );
  queues.set(uid, tracked);

  try {
    return await current;
  } finally {
    if (queues.get(uid) === tracked) queues.delete(uid);
    if (queues.size === 0) stateQueues.delete(owner);
  }
}

function parseLastRefreshAttempt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getRedeemCookieState(
  db: RedeemCookieDb,
  uid: string,
): Promise<RedeemCookieState> {
  const [invalid, needsCookieUpdate, lastRefreshAttempt, legacyMigrated] =
    await Promise.all([
      db.get(key(uid, "redeemInvalid")),
      db.get(key(uid, "redeemNeedsCookieUpdate")),
      db.get(key(uid, "redeemLastCookieRefreshAttempt")),
      db.get(key(uid, REDEEM_MIGRATION_MARKER)),
    ]);

  return {
    invalid: invalid === true,
    needsCookieUpdate: needsCookieUpdate === true,
    lastRefreshAttempt: parseLastRefreshAttempt(lastRefreshAttempt),
    legacyMigrated: legacyMigrated === true,
  };
}

/**
 * Move the old shared refresh evidence into the redeem-only namespace once.
 *
 * The marker is deliberately written before deleting old keys: after a
 * successful migration, later redeem runs must never re-import stale general
 * Cookie evidence after a redeem-only recovery cleared its own state.
 * All nested writes are awaited one-by-one because quick.db performs
 * read-modify-write for dotted keys.
 */
export async function migrateLegacyRedeemCookieState(
  db: RedeemCookieDb,
  uid: string,
): Promise<void> {
  await withRedeemStateLock(db, uid, async () => {
    const state = await getRedeemCookieState(db, uid);
    if (state.legacyMigrated) return;

    const legacyInvalid = await db.get(key(uid, "cookieExpired"));
    const legacyNeedsCookieUpdate = await db.get(
      key(uid, "needsCookieUpdate"),
    );
    const legacyLastRefreshAttempt = await db.get(
      key(uid, "lastCookieRefreshAttempt"),
    );

    if (legacyInvalid === true) {
      await db.set(key(uid, "redeemInvalid"), true);
    }
    if (legacyNeedsCookieUpdate === true) {
      await db.set(key(uid, "redeemNeedsCookieUpdate"), true);
    }
    const parsedLastAttempt = parseLastRefreshAttempt(legacyLastRefreshAttempt);
    if (parsedLastAttempt !== null) {
      await db.set(key(uid, "redeemLastCookieRefreshAttempt"), parsedLastAttempt);
    }

    // Write the marker before removing legacy evidence. A later run can never
    // re-import those fields after the redeem state is intentionally cleared.
    await db.set(key(uid, REDEEM_MIGRATION_MARKER), true);

    await db.delete(key(uid, "cookieExpired"));
    await db.delete(key(uid, "needsCookieUpdate"));
    await db.delete(key(uid, "lastCookieRefreshAttempt"));
  });
}

export async function markRedeemTokenInvalid(
  db: RedeemCookieDb,
  uid: string,
  attemptedAt = Date.now(),
): Promise<void> {
  await withRedeemStateLock(db, uid, async () => {
    await db.set(key(uid, "redeemInvalid"), true);
    await db.delete(key(uid, "redeemNeedsCookieUpdate"));
    await db.set(key(uid, "redeemLastCookieRefreshAttempt"), attemptedAt);
  });
}

export async function setRedeemCookieInvalid(
  db: RedeemCookieDb,
  uid: string,
  invalid: boolean,
): Promise<void> {
  await db.set(key(uid, "redeemInvalid"), invalid);
}

export async function setRedeemNeedsCookieUpdate(
  db: RedeemCookieDb,
  uid: string,
  needsUpdate: boolean,
): Promise<void> {
  await db.set(key(uid, "redeemNeedsCookieUpdate"), needsUpdate);
}

export async function setRedeemRefreshAttempt(
  db: RedeemCookieDb,
  uid: string,
  at: number,
): Promise<void> {
  await db.set(key(uid, "redeemLastCookieRefreshAttempt"), at);
}

export async function clearRedeemCookieState(
  db: RedeemCookieDb,
  uid: string,
): Promise<void> {
  await db.delete(key(uid, "redeemInvalid"));
  await db.delete(key(uid, "redeemNeedsCookieUpdate"));
  await db.delete(key(uid, "redeemLastCookieRefreshAttempt"));
  await db.set(key(uid, REDEEM_MIGRATION_MARKER), true);
}
