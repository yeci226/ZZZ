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

async function getClient(): Promise<any | null> {
  if (_client) return _client;
  const cfg = getConfig();
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_SERVICE_ROLE_KEY) {
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

/** Fetch all unconsumed pending logins for this Discord user (ZZZ only). */
export async function fetchPendingLogins(
  discordUserId: string,
): Promise<PendingLoginRow[]> {
  const sb = await getClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("pending_logins")
    .select("id, discord_id, ltuid_v2, encrypted_cookies, hoyo_account, enriched, created_at")
    .eq("discord_id", discordUserId)
    .eq("bot_id", "zzz")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) {
    logger.error(`fetchPendingLogins: ${error.message}`);
    return [];
  }
  return (data ?? []) as PendingLoginRow[];
}

/** Mark a row consumed so the next pull won't see it again. */
export async function markConsumed(id: number): Promise<void> {
  const sb = await getClient();
  if (!sb) return;
  const { error } = await sb
    .from("pending_logins")
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) logger.warn(`markConsumed(${id}): ${error.message}`);
}

export { decryptString };
