/**
 * Web-login finalizer (ZZZ).
 *
 * `drainPendingLogins` pulls unconsumed rows from Supabase (queued by the
 * web-login Next.js app) and routes each row to one of three paths:
 *
 *   1. `bindFromEnriched` — row has `enriched` payload AND a card for ZZZ
 *      (game_id = 8). Fast path: no Hoyolab API call. Writes a rich
 *      Character row with level/cover/stats from the card.
 *
 *   2. `bindHoyolabOnly` — row has `enriched` but no ZZZ card. Stores the
 *      Hoyolab record (with cookie) and zero characters. No DM. No counted
 *      slot against the 5-account limit.
 *
 *   3. `bindCookieToUser` — legacy fallback for rows without `enriched`.
 *      Calls `getAllGameRoles`.
 */
import { client } from "../index.js";
import Logger from "./core/logger.js";
import { getAllGameRoles, updateAccountInfo } from "./utilities.js";
import { upsertHoyolab, upsertCharacter, type Character } from "./accountStore.js";
import { getConfig } from "./core/config.js";
import {
  fetchPendingLogins,
  markConsumed,
  decryptString,
  type EnrichedGameCard,
} from "./core/supabase.js";

const logger = new Logger("WebLogin");

const ZZZ_GAME_ID = 8;

export interface BindResult {
  ok: boolean;
  message: string;
  bound?: Array<{ uid: string; nickname: string }>;
}

async function isDevUser(discordUserId: string): Promise<boolean> {
  try {
    return (getConfig().DEVIDS ?? []).includes(discordUserId);
  } catch {
    return false;
  }
}

async function notifyBound(
  discordUserId: string,
  bound: Array<{ uid: string; nickname: string }>,
): Promise<void> {
  if (bound.length === 0) return;
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
}

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

  const isDev = await isDevUser(discordUserId);
  const existing: any[] = (await client.db.get(`${discordUserId}.account`)) ?? [];
  const existingUids = new Set(existing.map((a: any) => String(a.uid)));

  const bound: Array<{ uid: string; nickname: string }> = [];
  for (const role of zzzRoles) {
    const uidStr = String(role.uid);
    const isUpdate = existingUids.has(uidStr);
    if (!isUpdate && !isDev) {
      const current: any[] = (await client.db.get(`${discordUserId}.account`)) ?? [];
      if (current.length >= 5) {
        logger.warn(`[bind] account cap reached, skipping uid=${uidStr}`);
        continue;
      }
    }
    try {
      await updateAccountInfo(discordUserId, {
        uid: role.uid,
        cookie: cookieStr,
        nickname: role.nickname,
      });
      logger.info(`[bind] updateAccountInfo OK uid=${uidStr} (${isUpdate ? "update" : "new"})`);
    } catch (e: any) {
      logger.error(`[bind] updateAccountInfo FAILED uid=${uidStr}: ${e?.message ?? e}`);
      throw e;
    }
    bound.push({ uid: uidStr, nickname: role.nickname });
  }

  if (bound.length === 0) {
    return { ok: false, message: "account cap reached, no accounts bound" };
  }

  logger.success(`[bind] DONE user=${discordUserId} bound=${bound.length}`);
  await notifyBound(discordUserId, bound);

  return { ok: true, message: `bound ${bound.length} account(s)`, bound };
}

export const handleWebhookLogin = bindCookieToUser;
export type WebhookLoginResult = BindResult;

export async function bindFromEnriched(
  discordUserId: string,
  ltuid_v2: string,
  cookieStr: string,
  card: EnrichedGameCard,
  fetchedAt: string,
): Promise<BindResult> {
  logger.info(
    `[bindFromEnriched] start user=${discordUserId} uid=${card.game_role_id} ltuid=${ltuid_v2}`,
  );
  const uidStr = String(card.game_role_id);

  // Account-limit semantics: only enforce when adding a NEW slot.
  const isDev = await isDevUser(discordUserId);
  const existing: any[] = (await client.db.get(`${discordUserId}.account`)) ?? [];
  const isNew = !existing.some((a: any) => String(a.uid) === uidStr);
  if (isNew && !isDev && existing.length >= 5) {
    logger.warn(`[bindFromEnriched] account cap reached, skipping uid=${uidStr}`);
    return { ok: false, message: "account cap reached" };
  }

  const cover = card.background_image_v2 || card.background_image || undefined;
  const character: Character = {
    uid: uidStr,
    nickname: card.nickname ?? null,
    region: card.region ?? null,
    lastUpdate: new Date().toISOString(),
    invalid: false,
    level: card.level,
    region_name: card.region_name,
    cover,
    logo: card.logo,
    game_name: card.game_name,
    stats: (card.data ?? []).slice(0, 4),
    enrichedAt: fetchedAt,
  };

  await upsertHoyolab(client.db as any, discordUserId, {
    ltuid_v2,
    cookie: cookieStr,
    hoyolabName: null,
  });
  await upsertCharacter(client.db as any, discordUserId, ltuid_v2, character);
  logger.info(`[bindFromEnriched] OK uid=${uidStr} new=${isNew}`);

  const bound = [{ uid: uidStr, nickname: card.nickname }];
  await notifyBound(discordUserId, bound);

  return { ok: true, message: "bound from enriched", bound };
}

export async function bindHoyolabOnly(
  discordUserId: string,
  ltuid_v2: string,
  cookieStr: string,
): Promise<void> {
  logger.info(
    `[bindHoyolabOnly] storing hoyolab record (no ZZZ card) user=${discordUserId} ltuid=${ltuid_v2}`,
  );
  await upsertHoyolab(client.db as any, discordUserId, {
    ltuid_v2,
    cookie: cookieStr,
    hoyolabName: null,
  });
  // No character row, no DM, no slot consumed.
}

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
    } catch (e: any) {
      logger.error(`[drain] decrypt FAILED row=${row.id}: ${e?.message ?? e}`);
      await markConsumed(row.id);
      continue;
    }

    const enriched = row.enriched;
    const card = enriched?.cards.find((c) => c.game_id === ZZZ_GAME_ID) ?? null;

    try {
      if (card && enriched) {
        logger.info(`[drain] route=enriched row=${row.id}`);
        const res = await bindFromEnriched(
          discordUserId,
          row.ltuid_v2,
          cookieStr,
          card,
          enriched.fetched_at,
        );
        if (res.ok && res.bound) allBound.push(...res.bound);
      } else if (enriched) {
        logger.info(`[drain] route=hoyolabOnly row=${row.id} (no ZZZ card in enriched)`);
        await bindHoyolabOnly(discordUserId, row.ltuid_v2, cookieStr);
      } else {
        logger.info(`[drain] route=legacy row=${row.id} (no enriched payload)`);
        const res = await bindCookieToUser(discordUserId, cookieStr);
        if (res.ok && res.bound) allBound.push(...res.bound);
      }
    } catch (e: any) {
      logger.error(`[drain] bind FAILED row=${row.id}: ${e?.message ?? e}`);
    }
    await markConsumed(row.id);
    logger.info(`[drain] markConsumed row=${row.id}`);
  }
  logger.info(`[drain] done user=${discordUserId} totalBound=${allBound.length}`);
  return allBound;
}
