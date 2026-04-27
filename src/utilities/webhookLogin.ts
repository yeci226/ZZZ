import { client } from "../index.js";
import Logger from "./core/logger.js";
import { getAllGameRoles, updateAccountInfo } from "./utilities.js";
import { getConfig } from "./core/config.js";
import {
  fetchPendingLogins,
  markConsumed,
  decryptString,
} from "./core/supabase.js";

const logger = new Logger("WebLogin");

const ZZZ_GAME_ID = 8;

export interface BindResult {
  ok: boolean;
  message: string;
  bound?: Array<{ uid: string; nickname: string }>;
}

/**
 * Bind ZZZ accounts attached to the given Hoyoverse cookie for a Discord user.
 *
 * Shared logic used by:
 *   - the legacy webhook server (kept for backward-compat / local testing)
 *   - the new Supabase pull path (`drainPendingLogins`)
 */
export async function bindCookieToUser(
  discordUserId: string,
  cookieStr: string,
): Promise<BindResult> {
  logger.info(`[bind] start user=${discordUserId} cookieLen=${cookieStr?.length ?? 0}`);
  if (!discordUserId || !cookieStr) {
    logger.warn(`[bind] missing discordUserId or cookie`);
    return { ok: false, message: "missing discordUserId or cookie" };
  }

  let roles: any[];
  try {
    roles = await getAllGameRoles(cookieStr);
    logger.info(`[bind] getAllGameRoles OK count=${roles?.length ?? 0}`);
  } catch (err: any) {
    logger.error(
      `[bind] getAllGameRoles FAILED user=${discordUserId}: ${err?.message ?? err}`,
    );
    return {
      ok: false,
      message: `failed to fetch game roles: ${err?.message ?? err}`,
    };
  }

  const zzzRoles = (roles ?? []).filter(
    (role: any) => role.gameId === ZZZ_GAME_ID,
  );
  logger.info(`[bind] zzzRoles=${zzzRoles.length} (gameId=${ZZZ_GAME_ID})`);

  if (zzzRoles.length === 0) {
    logger.warn(`[bind] no ZZZ characters on this Hoyolab account`);
    return {
      ok: false,
      message: "no ZZZ characters found on this Hoyolab account",
    };
  }

  let cfgDevIds: string[] = [];
  try {
    cfgDevIds = getConfig().DEVIDS ?? [];
  } catch {
    cfgDevIds = [];
  }
  const isDev = cfgDevIds.includes(discordUserId);

  const existing: any[] =
    (await client.db.get(`${discordUserId}.account`)) ?? [];
  const existingUids = new Set(existing.map((a: any) => String(a.uid)));
  logger.info(`[bind] existing accounts=${existing.length} uids=[${[...existingUids].join(",")}]`);

  const bound: Array<{ uid: string; nickname: string }> = [];
  for (const role of zzzRoles) {
    const uidStr = String(role.uid);
    const isUpdate = existingUids.has(uidStr);
    if (!isUpdate && !isDev) {
      const current: any[] =
        (await client.db.get(`${discordUserId}.account`)) ?? [];
      if (current.length >= 5) {
        logger.warn(
          `[bind] account cap reached, skipping uid=${uidStr}`,
        );
        continue;
      }
    }

    try {
      await updateAccountInfo(discordUserId, {
        uid: role.uid,
        cookie: cookieStr,
        nickname: role.nickname,
      });
      logger.info(`[bind] updateAccountInfo OK uid=${uidStr} nickname=${role.nickname} (${isUpdate ? "update" : "new"})`);
    } catch (e: any) {
      logger.error(`[bind] updateAccountInfo FAILED uid=${uidStr}: ${e?.message ?? e}`);
      throw e;
    }
    bound.push({ uid: uidStr, nickname: role.nickname });
  }

  if (bound.length === 0) {
    logger.warn(`[bind] nothing bound (cap reached on all roles)`);
    return { ok: false, message: "account cap reached, no accounts bound" };
  }

  logger.success(
    `[bind] DONE user=${discordUserId} bound=${bound.length}`,
  );

  // Best-effort DM
  try {
    const user = await client.users.fetch(discordUserId);
    const lines = bound.map((b) => `• ${b.nickname} (${b.uid})`).join("\n");
    await user.send(
      `✅ 你的《絕區零》帳號已透過網頁登入綁定成功：\n${lines}`,
    );
    logger.info(`[bind] DM sent to ${discordUserId}`);
  } catch (err: any) {
    logger.warn(
      `[bind] DM failed user=${discordUserId}: ${err?.message ?? err}`,
    );
  }

  return { ok: true, message: `bound ${bound.length} account(s)`, bound };
}

/** Back-compat alias for the old webhook server. */
export const handleWebhookLogin = bindCookieToUser;
export type WebhookLoginResult = BindResult;

/**
 * Pull any pending web-logins from Supabase for this user, bind them, and
 * mark consumed. Safe to call on every command entry — fast no-op when
 * nothing is pending or Supabase is not configured.
 *
 * Returns the list of newly-bound accounts so commands can show a
 * "✨ Linked X new account(s)" hint if they want.
 */
export async function drainPendingLogins(
  discordUserId: string,
): Promise<Array<{ uid: string; nickname: string }>> {
  logger.info(`[drain] start user=${discordUserId}`);
  let rows: Awaited<ReturnType<typeof fetchPendingLogins>>;
  try {
    rows = await fetchPendingLogins(discordUserId);
  } catch (e: any) {
    logger.warn(`[drain] fetchPendingLogins FAILED user=${discordUserId}: ${e?.message ?? e}`);
    return [];
  }
  logger.info(`[drain] fetched rows=${rows.length} user=${discordUserId}`);
  if (rows.length === 0) return [];

  const allBound: Array<{ uid: string; nickname: string }> = [];
  for (const row of rows) {
    logger.info(`[drain] processing row id=${row.id} ltuid=${row.ltuid_v2}`);
    let cookieStr: string;
    try {
      cookieStr = decryptString(row.encrypted_cookies);
      logger.info(`[drain] decrypt OK row=${row.id} cookieLen=${cookieStr.length}`);
    } catch (e: any) {
      logger.error(`[drain] decrypt FAILED row=${row.id}: ${e?.message ?? e}`);
      await markConsumed(row.id); // poison-pill: don't keep retrying
      continue;
    }
    const res = await bindCookieToUser(discordUserId, cookieStr);
    if (res.ok && res.bound) {
      logger.info(`[drain] bind OK row=${row.id} bound=${res.bound.length}`);
      allBound.push(...res.bound);
    } else {
      logger.warn(`[drain] bind NOT OK row=${row.id} message=${res.message}`);
    }
    await markConsumed(row.id);
    logger.info(`[drain] markConsumed row=${row.id}`);
  }
  logger.info(`[drain] done user=${discordUserId} totalBound=${allBound.length}`);
  return allBound;
}
