/**
 * Supabase pull-side helpers for the ZZZ bot.
 *
 * Web-login (Next.js app) pushes finished logins to the
 * `pending_logins` table. The bot pulls unconsumed rows for a given
 * Discord user on command entry (e.g. /account, /profile), decrypts
 * the cookie, calls the existing bind logic, and marks the row consumed.
 *
 * This module is intentionally side-effect free: callers decide when
 * to invoke `drainPendingLogins`.
 */
import crypto from "node:crypto";
import { getConfig } from "./config.js";
import Logger from "./logger.js";

const logger = new Logger("Supabase");

let _client: any = null;
let _configurationWarningShown = false;

async function getClient(): Promise<any | null> {
  if (_client) return _client;
  const cfg = getConfig();
  const missing = [
    !cfg.SUPABASE_URL ? "SUPABASE_URL" : null,
    !cfg.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    !cfg.WEB_LOGIN_SESSION_SECRET ? "WEB_LOGIN_SESSION_SECRET" : null,
  ].filter((key): key is string => key !== null);
  if (missing.length > 0) {
    if (!_configurationWarningShown) {
      _configurationWarningShown = true;
      logger.error(
        `pending login sync disabled; missing configuration: ${missing.join(", ")}`,
      );
    }
    return null;
  }
  try {
    // dynamic import so the bot still boots if the package isn't installed yet
    const mod: any = await import("@supabase/supabase-js");
    _client = mod.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return _client;
  } catch (e: any) {
    logger.warn(
      `@supabase/supabase-js not installed — pending login pull disabled (${e?.message ?? e})`,
    );
    return null;
  }
}

/** AES-256-CBC, "ivHex:cipherHex" — must match web-login/lib/hoyoapi.ts */
function decryptString(encrypted: string): string {
  const cfg = getConfig();
  const secret = cfg.WEB_LOGIN_SESSION_SECRET ?? "";
  if (!secret) throw new Error("WEB_LOGIN_SESSION_SECRET not configured");
  const key = Buffer.from(secret.padEnd(32, "0").slice(0, 32));
  const [ivHex, encHex] = encrypted.split(":");
  if (!ivHex || !encHex) throw new Error("malformed encrypted cookie");
  const iv = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/**
 * Per-game card extracted from Hoyolab `getGameRecordCard` and persisted
 * by web-login. Mirror of `web-login/lib/enrichment-types.ts:EnrichedGameCard`.
 * Duplicated here (not shared) — bots are independent repos. Keep in sync
 * if the web-side shape changes.
 */
export interface EnrichedGameCard {
  game_id: number;
  game_role_id: string;
  nickname: string;
  level: number;
  region: string;
  region_name: string;
  game_name?: string;
  logo?: string;
  background_image?: string;
  background_image_v2?: string;
  data?: { name: string; value: string }[];
}

export interface EnrichedData {
  ltuid_v2: string;
  cards: EnrichedGameCard[];
  fetched_at: string;
}

export interface PendingLoginRow {
  id: number;
  discord_id: string;
  ltuid_v2: string;
  encrypted_cookies: string;
  hoyo_account: Record<string, unknown> | null;
  enriched: EnrichedData | null;
  created_at: string;
}

const BOT_ID = "zzz" as const;


export interface ClaimedLogin extends PendingLoginRow {
  owner:string;
  receipt:{attempts:number;roles?:Array<{uid:string;nickname:string;region?:string}>};
}
export async function claimPendingLogin(discordUserId?:string):Promise<ClaimedLogin|null> {
  const sb=await getClient();if(!sb)return null;
  const owner=crypto.randomUUID();
  const {data,error}=await sb.rpc('claim_web_login',{p_bot:BOT_ID,p_owner:owner,p_user:discordUserId??null});
  if(error)throw new Error('login_claim_failed');
  const row=data?.[0];if(!row)return null;
  return {...row,owner,receipt:row[`${BOT_ID}_result`]};
}
export async function renewPendingLogin(row:ClaimedLogin):Promise<boolean> {
  const sb=await getClient();if(!sb)return false;
  const {data,error}=await sb.rpc('renew_web_login',{p_bot:BOT_ID,p_id:row.id,p_owner:row.owner});
  if(error)throw new Error('login_renew_failed');return data===true;
}
export async function finishPendingLogin(row:ClaimedLogin,result:unknown):Promise<boolean> {
  const sb=await getClient();if(!sb)return false;
  const {data,error}=await sb.rpc('finish_web_login',{p_bot:BOT_ID,p_id:row.id,p_owner:row.owner,p_result:result});
  if(error)throw new Error('login_receipt_failed');return data===true;
}
export { decryptString };
