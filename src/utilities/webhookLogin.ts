import { processLoginQueue, startLoginQueue, type LoginRole, type LoginResult, type BindOptions } from './loginQueue.js';
/** Resolve every server role on login; record cards only supply display metadata. */
import { client } from "../index.js";
import Logger from "./core/logger.js";
import { getAllGameRoles, updateAccountInfo, encryptCredential } from "./utilities.js";
import { upsertHoyolab, upsertCharacter, getLegacyAccounts, type Character } from "./accountStore.js";
import { getConfig } from "./core/config.js";
import {
  type EnrichedGameCard,
} from "./core/supabase.js";
import { exchangeStokenForCookies } from "./zzz/login.js";
import { clearRedeemCookieStateAfterLogin } from "./core/redeemCookieState.js";

const logger = new Logger("WebLogin");

const ZZZ_GAME_ID = 8;

/** Parse a cookie string into a key→value map. */
function parseCookieMap(cookieStr: string): Record<string, string> {
  return Object.fromEntries(
    cookieStr.split(";").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k!.trim(), v.join("=").trim()];
    }),
  );
}

/** Extract encrypted stoken + ltmid_v2 from a raw cookie string, for storage. */
function extractStokenFields(
  cookieStr: string,
): { stoken: string; ltmid_v2: string } | null {
  try {
    const m = parseCookieMap(cookieStr);
    const stoken = m["stoken"];
    const ltmid_v2 = m["ltmid_v2"] ?? m["account_mid_v2"] ?? m["mid"];
    if (!stoken || !ltmid_v2) return null;
    return { stoken: encryptCredential(stoken), ltmid_v2 };
  } catch {
    return null;
  }
}

export interface BindResult {
  ok: boolean;
  message: string;
  bound?: LoginRole[];
  skipped?: LoginRole[];
  code?: string;
}

async function isDevUser(discordUserId: string): Promise<boolean> {
  try {
    return (getConfig().DEVIDS ?? []).includes(discordUserId);
  } catch {
    return false;
  }
}

async function notifyBound(
  _discordUserId: string,
  _bound: Array<{ uid: string; nickname: string }>,
): Promise<void> {
  // No DM — account is available immediately on next command / autocomplete.
}

export async function bindCookieToUser(
  discordUserId: string,
  cookieStr: string,
  hoyolabIcon?: string,
  options: BindOptions = {},
): Promise<BindResult> {
  logger.info(`[bind] start user=${discordUserId} cookieLen=${cookieStr?.length ?? 0}`);
  if (!discordUserId || !cookieStr) {
    logger.warn(`[bind] missing discordUserId or cookie`);
    return { ok: false, message: "missing discordUserId or cookie" };
  }

  // Exchange stoken → ltoken_v2 so that getAllGameRoles (hoyoapi) has a valid cookie.
  let apiCookie = cookieStr;
  try {
    const cookieMap = Object.fromEntries(
      cookieStr.split(";").map((p) => {
        const [k, ...v] = p.trim().split("=");
        return [k.trim(), v.join("=").trim()];
      }),
    );
    const stoken = cookieMap["stoken"];
    const ltuid_v2 = cookieMap["ltuid_v2"] ?? cookieMap["account_id_v2"];
    const ltmid_v2 = cookieMap["ltmid_v2"] ?? cookieMap["account_mid_v2"] ?? cookieMap["mid"];
    if (stoken && ltuid_v2 && ltmid_v2) {
      logger.info(`[bind] exchanging stoken for ltoken_v2…`);
      const newTokens = await exchangeStokenForCookies(stoken, ltuid_v2, ltmid_v2);
      apiCookie = [
        `stoken=${stoken}`,
        `ltuid_v2=${ltuid_v2}`,
        `ltoken_v2=${newTokens.ltoken_v2}`,
        `cookie_token_v2=${newTokens.cookie_token_v2}`,
        `ltmid_v2=${ltmid_v2}`,
        `account_id_v2=${ltuid_v2}`,
        `account_mid_v2=${ltmid_v2}`,
        `mid=${ltmid_v2}`,
      ].join("; ");
      logger.info(`[bind] stoken exchange OK`);
    }
  } catch (err: any) {
    logger.warn(`[bind] stoken exchange failed, falling back to raw cookie: ${err?.message ?? err}`);
  }

  let roles: any[];
  try {
    roles = await getAllGameRoles(apiCookie);
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
  const existing = await getLegacyAccounts(client.db as any, discordUserId);
  const existingUids = new Set(existing.map((a: any) => String(a.uid)));

  const bound: LoginRole[] = [...(options.alreadyBound ?? [])];
  const skipped: LoginRole[] = [];
  for (const role of zzzRoles) {
    const uidStr = String(role.uid);
    if(bound.some(r=>r.uid===uidStr)) continue;
    const isUpdate = existingUids.has(uidStr);
    if (!isUpdate && !isDev) {
      const current = await getLegacyAccounts(client.db as any, discordUserId);
      if (current.length >= 5) {
        skipped.push({uid:uidStr,nickname:role.nickname,region:role.region,error:"account_limit"});
        continue;
      }
    }
    try {
      options.assertLease?.();
      await updateAccountInfo(discordUserId, {
        uid: role.uid,
        cookie: apiCookie,
        nickname: role.nickname,
        region: role.region,
      });
      logger.info(`[bind] updateAccountInfo OK uid=${uidStr} (${isUpdate ? "update" : "new"})`);
    } catch (e: any) {
      logger.error(`[bind] updateAccountInfo FAILED uid=${uidStr}: ${e?.message ?? e}`);
      skipped.push({uid:uidStr,nickname:role.nickname,region:role.region,error:"save_failed"});
      continue;
    }
    bound.push({ uid: uidStr, nickname: role.nickname, region:role.region });
  }

  if (bound.length === 0) {
    return { ok:false,message:"no accounts bound",bound,skipped,code:skipped.every(r=>r.error==="account_limit")?"account_limit":"sync_error" };
  }

  // Patch stoken/ltmid_v2 onto the Hoyolab record so autoRefreshCookie can use it.
  const stokenPatch = extractStokenFields(apiCookie);
  const ltuid_v2 = parseCookieMap(apiCookie)["ltuid_v2"] ?? parseCookieMap(apiCookie)["account_id_v2"];
  if (ltuid_v2 && (stokenPatch || hoyolabIcon !== undefined)) {
    try {
      options.assertLease?.();
      await upsertHoyolab(client.db as any, discordUserId, {
        ltuid_v2,
        cookie: apiCookie,
        ...stokenPatch,
        ...(hoyolabIcon !== undefined ? { hoyolabIcon } : {}),
      });
      logger.info(`[bind] stoken stored for ltuid=${ltuid_v2}`);
    } catch (e: any) {
      logger.warn("[bind] credential save failed");
      return {ok:false,message:"credential save failed",bound,skipped,code:"sync_error"};
    }
  }

  logger.success(`[bind] DONE user=${discordUserId} bound=${bound.length}`);
  await notifyBound(discordUserId, bound);

  return { ok: true, message: `bound ${bound.length} account(s)`, bound, skipped, code:skipped.length?(skipped.every(r=>r.error==="account_limit")?"account_limit":"sync_error"):undefined };
}

export const handleWebhookLogin = bindCookieToUser;
export type WebhookLoginResult = BindResult;

export async function bindFromEnriched(
  discordUserId: string,
  ltuid_v2: string,
  cookieStr: string,
  card: EnrichedGameCard,
  fetchedAt: string,
  hoyolabIcon?: string,
): Promise<BindResult> {
  logger.info(
    `[bindFromEnriched] start user=${discordUserId} uid=${card.game_role_id} ltuid=${ltuid_v2}`,
  );
  const uidStr = String(card.game_role_id);

  // Account-limit semantics: only enforce when adding a NEW slot.
  const isDev = await isDevUser(discordUserId);
  const existing = await getLegacyAccounts(client.db as any, discordUserId);
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
    ...extractStokenFields(cookieStr),
    ...(hoyolabIcon !== undefined ? { hoyolabIcon } : {}),
  });
  await upsertCharacter(client.db as any, discordUserId, ltuid_v2, character);
  await clearRedeemCookieStateAfterLogin(client.db, uidStr, cookieStr);
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
    ...extractStokenFields(cookieStr),
  });
  // No character row, no DM, no slot consumed.
}


async function processRow(row: Parameters<Parameters<typeof processLoginQueue>[0]>[0], cookie:string, options:BindOptions):Promise<LoginResult> {
  const icon=typeof row.hoyo_account?.avatar_url==='string'?row.hoyo_account.avatar_url:undefined;
  const res=await bindCookieToUser(row.discord_id,cookie,icon,options);
  if(!res.ok && res.message==='no ZZZ characters found on this Hoyolab account') {
    options.assertLease?.(); await bindHoyolabOnly(row.discord_id,row.ltuid_v2,cookie);
    return {status:'no_roles',roles:[]};
  }
  const roles=res.bound??[];
  // Display metadata is optional; authentication and all server roles are authoritative.
  for(const card of row.enriched?.cards??[]) {
    if(card.game_id!==8||!roles.some(r=>r.uid===String(card.game_role_id)))continue;
    options.assertLease?.();
    try { await upsertCharacter(client.db as any,row.discord_id,row.ltuid_v2,{
      uid:String(card.game_role_id),nickname:card.nickname,region:card.region,lastUpdate:new Date().toISOString(),invalid:false,
      level:card.level,region_name:card.region_name,stats:(card.data??[]).slice(0,4),enrichedAt:row.enriched!.fetched_at,
      ...(card.logo?{logo:card.logo}:{}),...(card.game_name?{game_name:card.game_name}:{}),
      ...(card.background_image_v2||card.background_image?{cover:card.background_image_v2||card.background_image}:{})
    }); } catch { logger.warn('[WebLogin] optional display metadata unavailable'); }
  }
  return {status:res.ok&&!res.skipped?.length?'success':roles.length?'partial':'failed',roles,skipped:res.skipped,code:res.code??(!res.ok?'sync_error':undefined)};
}
export async function drainPendingLogins(discordUserId:string):Promise<LoginRole[]> {
  try{return await processLoginQueue(processRow,discordUserId);}catch{return [];}
}
export function startWebLoginSync(){startLoginQueue(processRow);}
