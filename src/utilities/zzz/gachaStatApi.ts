import type { GachaChannelCategory } from "./gachaArchive.js";
import { normalizeGachaCategory } from "./gachaSync.js";
import { hoyolabCookieJar } from "./hoyolabCookie.js";

const BASE = "https://sg-act-public-api.hoyolab.com/event/nap_gacha_record/api/zzz";
const HISTORY_BATCH = 8;

export type GachaStatCategory = Exclude<GachaChannelCategory, "unknown">;
export const GACHA_STAT_TYPE_IDS: Record<GachaStatCategory, number> = {
  standard: 1, character_up: 2, weapon_up: 3, bangboo: 5, character_return: 102, weapon_return: 103,
};

export interface GachaStatRecord { itemId: string; name: string; icon: string; itemType: string; rarity: string; isUp: boolean; upTag: string; count: number; sort: number; recordTime: number }
export interface GachaStatPool { category: GachaStatCategory; version: string; state: "in_progress" | "ended" | "not_started" | "unknown"; startTs: number; endTs: number; upItems: GachaStatRecord[]; records: GachaStatRecord[] }
export interface GachaStatType { category: GachaStatCategory; totalCount: number; sCount: number; upCount: number; averageUp: number | null; currentPity: number; toHardPity: number; versions: string[] }
export interface GachaStatTickets { monochrome: number; polychrome: number; encrypted: number; original: number; boopon: number }
export interface GachaStatIndex { totalCount: number; totalS: number; currentVersion: string; tickets: GachaStatTickets; types: GachaStatType[] }
export interface GachaStatClient {
  index(): Promise<GachaStatIndex>;
  currentPools(category: GachaStatCategory): Promise<GachaStatPool[]>;
  historyPools(category: GachaStatCategory, versions: string[]): Promise<GachaStatPool[]>;
}

export class GachaStatError extends Error {
  readonly retcode: number | null;
  constructor(message: string, retcode: number | null = null) {
    super(message);
    this.name = "GachaStatError";
    this.retcode = retcode;
  }
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value: unknown): string => (value === undefined || value === null ? "" : String(value));

function mapRecord(raw: any): GachaStatRecord {
  return {
    itemId: text(raw?.item_id), name: text(raw?.name), icon: text(raw?.icon), itemType: text(raw?.item_type),
    rarity: text(raw?.rarity), isUp: raw?.is_up === true, upTag: text(raw?.up_tag),
    count: num(raw?.count), sort: num(raw?.sort), recordTime: num(raw?.record_time),
  };
}

function poolState(value: unknown): GachaStatPool["state"] {
  const raw = text(value).toUpperCase();
  if (raw.includes("IN_PROGRESS")) return "in_progress";
  if (raw.includes("ENDED")) return "ended";
  if (raw.includes("NOT_START")) return "not_started";
  return "unknown";
}

function mapPool(category: GachaStatCategory, raw: any): GachaStatPool {
  return {
    category, version: text(raw?.version), state: poolState(raw?.gacha_state),
    startTs: num(raw?.start_ts), endTs: num(raw?.end_ts),
    upItems: Array.isArray(raw?.cur_item_list) ? raw.cur_item_list.map(mapRecord) : [],
    records: Array.isArray(raw?.cur_records) ? raw.cur_records.map(mapRecord) : [],
  };
}

function mapTickets(list: unknown): GachaStatTickets {
  const tickets: GachaStatTickets = { monochrome: 0, polychrome: 0, encrypted: 0, original: 0, boopon: 0 };
  if (!Array.isArray(list)) return tickets;
  for (const ticket of list) {
    const type = text(ticket?.ticket_type).toUpperCase(), count = num(ticket?.ticket_cnt);
    // ENCRYPTED_MASTER_TAPE also contains MASTER_TAPE, so test it first.
    if (type.includes("ENCRYPTED")) tickets.encrypted = count;
    else if (type.includes("MASTER_TAPE")) tickets.original = count;
    else if (type.includes("MONOCHROME")) tickets.monochrome = count;
    else if (type.includes("POLYCHROME")) tickets.polychrome = count;
    else if (type.includes("BOOPON")) tickets.boopon = count;
  }
  return tickets;
}

function mapType(raw: any): GachaStatType[] {
  const category = normalizeGachaCategory(raw?.gacha_type);
  if (category === "unknown") return [];
  const average = Number(raw?.avr_up_count);
  return [{
    category, totalCount: num(raw?.total_count), sCount: num(raw?.s_count), upCount: num(raw?.up_count),
    averageUp: Number.isFinite(average) && average !== 0 ? average : null,
    currentPity: num(raw?.next_s_cur_times), toHardPity: num(raw?.new_s_max_times),
    versions: Array.isArray(raw?.has_data_vers) ? raw.has_data_vers.map(text) : [],
  }];
}

export function createGachaStatClient(
  client: { uid?: unknown; region?: unknown; lang?: unknown; cookie?: unknown },
  fetcher: typeof fetch = fetch,
): GachaStatClient | undefined {
  const uid = String(client.uid || ""), region = String(client.region || ""), lang = String(client.lang || "en-us");
  if (!/^\d{10}$/.test(uid) || !/^prod_gf_(us|eu|jp|sg)$/.test(region)) return undefined;
  const jar = hoyolabCookieJar(client.cookie);
  if (!jar.size) return undefined;
  const cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");

  const get = async (path: string, extra: Record<string, string> = {}): Promise<any> => {
    const query = new URLSearchParams({ uid, region, lang, ...extra });
    const response = await fetcher(`${BASE}/${path}?${query}`, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(8_000),
      headers: { "x-rpc-lang": lang, "x-rpc-language": lang, Cookie: cookie, Origin: "https://act.hoyolab.com", Referer: "https://act.hoyolab.com/" },
    });
    if (!response.ok) throw new GachaStatError("Signal statistics unavailable");
    const result: any = await response.json();
    if (result?.retcode !== 0) {
      const retcode = Number(result?.retcode);
      throw new GachaStatError("Signal statistics rejected", Number.isFinite(retcode) ? retcode : null);
    }
    return result.data;
  };

  return {
    async index() {
      const data = await get("index");
      return {
        totalCount: num(data?.total_gacha_count), totalS: num(data?.total_s_count), currentVersion: text(data?.cur_ver),
        tickets: mapTickets(data?.cur_tickets),
        types: Array.isArray(data?.type_stats) ? data.type_stats.flatMap(mapType) : [],
      };
    },
    async currentPools(category) {
      const data = await get("cur_pool_stat", { gacha_type: String(GACHA_STAT_TYPE_IDS[category]) });
      return Array.isArray(data?.list) ? data.list.map((pool: any) => mapPool(category, pool)) : [];
    },
    async historyPools(category, versions) {
      const pools: GachaStatPool[] = [];
      for (let at = 0; at < versions.length; at += HISTORY_BATCH) {
        const data = await get("hist_pool_stat", {
          gacha_type: String(GACHA_STAT_TYPE_IDS[category]), vers: versions.slice(at, at + HISTORY_BATCH).join(","),
        });
        if (Array.isArray(data?.list)) pools.push(...data.list.map((pool: any) => mapPool(category, pool)));
      }
      return pools;
    },
  };
}
