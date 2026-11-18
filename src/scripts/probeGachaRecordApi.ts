// One-off probe for HoYoLAB's Signal Search statistics API (event/nap_gacha_record).
// Read-only: three GET endpoints, plus the same badge login the disc leaderboard already performs.
// Writes redacted payloads to disk so the response contract can be designed against real data.
//
//   ZZZ_PROBE_OWNER_ID=<discord id> npx tsx src/scripts/probeGachaRecordApi.ts
//
// Optional: ZZZ_PROBE_ACCOUNT_INDEX (default 0), ZZZ_PROBE_LANG (default zh-tw), ZZZ_PROBE_OUTPUT (default ./gacha-api-probe)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { QuickDB } from "quick.db";
import { getLegacyAccountAtIndex } from "../utilities/accountStore.js";
import { resolveZzzRegion } from "../utilities/zzz/region.js";

const HOST = "https://sg-act-public-api.hoyolab.com";
const BASE = `${HOST}/event/nap_gacha_record`;
const EVENT_COOKIES = ["e_nap_token", "e_lrsag", "SERVERID", "SERVERCORSID"];
const GACHA_TYPES: Array<[number, string]> = [
  [2, "character_up"], [102, "character_return"], [3, "weapon_up"], [103, "weapon_return"], [1, "standard"], [5, "bangboo"],
];
const SENSITIVE_KEY = /uid|account|nick|role_id|mid|token|cookie|head_icon|avatar_url|game_head|email|mobile/i;

const ownerId = process.env.ZZZ_PROBE_OWNER_ID;
if (!ownerId) {
  process.stdout.write("SKIP: set ZZZ_PROBE_OWNER_ID to the Discord user id whose linked account should be probed.\n");
  process.exit(0);
}
const accountIndex = Math.max(0, Number(process.env.ZZZ_PROBE_ACCOUNT_INDEX) || 0);
const lang = process.env.ZZZ_PROBE_LANG || "zh-tw";
const output = process.env.ZZZ_PROBE_OUTPUT || join(process.cwd(), "gacha-api-probe");
const log = (line: string) => process.stdout.write(`${line}\n`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cookieJar(cookie: unknown): Map<string, string> {
  const jar = new Map<string, string>();
  if (typeof cookie === "string") {
    for (const part of cookie.split(";")) {
      const at = part.indexOf("=");
      if (at > 0) jar.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
    }
  } else if (cookie && typeof cookie === "object") {
    // hoyoapi stores these names in camelCase; HTTP needs the original snake_case names.
    const sdkNames = ["cookieToken", "accountId", "cookieTokenV2", "accountIdV2", "accountMidV2", "ltokenV2", "ltuidV2", "ltmidV2"];
    for (const [key, value] of Object.entries(cookie)) {
      if (typeof value !== "string" && typeof value !== "number") continue;
      jar.set(sdkNames.includes(key) ? key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`) : key, String(value));
    }
  }
  return jar;
}

function redact(value: unknown, secrets: string[]): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, SENSITIVE_KEY.test(key) && (typeof item === "string" || typeof item === "number") ? "<redacted>" : redact(item, secrets)]));
  }
  if (typeof value === "string" || typeof value === "number") {
    return secrets.includes(String(value)) ? "<redacted>" : value;
  }
  return value;
}

const db = new QuickDB();
try {
  // Reading an account can migrate legacy storage; this probe must never write to the bot's database.
  const readOnlyDb = { get: (key: string) => db.get(key), set: async () => undefined, delete: async () => undefined };
  const account = await getLegacyAccountAtIndex(readOnlyDb as any, ownerId, accountIndex);
  if (!account?.uid || !account.cookie || account.invalid === true) throw new Error("Probe account is unavailable or invalid");
  const uid = String(account.uid);
  const region = resolveZzzRegion(uid, account.region);
  const jar = cookieJar(account.cookie);
  if (!jar.size) throw new Error("Probe account has no usable cookie");
  const secrets = [uid, ...[...jar.values()].filter((value) => value.length >= 6)];

  const send = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, {
      ...init, redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json", "x-rpc-lang": lang, "x-rpc-language": lang,
        Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
        Origin: "https://act.hoyolab.com", Referer: "https://act.hoyolab.com/",
      },
    });
    const setNames: string[] = [];
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0] ?? "", at = pair.indexOf("=");
      if (at <= 0) continue;
      setNames.push(pair.slice(0, at));
      if (EVENT_COOKIES.includes(pair.slice(0, at))) jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    let body: any = null;
    try { body = await response.json(); } catch { /* non-JSON response */ }
    await sleep(300);
    return { status: response.status, retcode: body?.retcode, message: body?.message, data: body?.data, setNames };
  };
  const get = (path: string, params: Record<string, string | number> = {}) =>
    send(`${BASE}${path}?${new URLSearchParams({ uid, region, lang, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })}`);

  mkdirSync(output, { recursive: true });
  const save = (name: string, payload: unknown) =>
    writeFileSync(join(output, `${name}.json`), `${JSON.stringify(redact(payload, secrets), null, 2)}\n`);
  const summary: Record<string, unknown> = { lang, region, probedAt: new Date().toISOString() };

  // 1. Does a plain HoYoLAB cookie suffice?
  let index = await get("/api/zzz/index");
  summary.plainCookie = { status: index.status, retcode: index.retcode, message: index.message };
  log(`index with plain cookie: HTTP ${index.status}, retcode ${index.retcode} ${index.message ?? ""}`);

  // 2. If not, try the event badge login the cultivate tool needs.
  if (index.retcode !== 0) {
    for (const name of EVENT_COOKIES) jar.delete(name);
    const login = await send(`${HOST}/common/badge/v1/login/account`, {
      method: "POST", body: JSON.stringify({ game_biz: "nap_global", lang, region, uid }),
    });
    summary.badgeLogin = { status: login.status, retcode: login.retcode, message: login.message, setCookieNames: login.setNames };
    log(`badge login: HTTP ${login.status}, retcode ${login.retcode} ${login.message ?? ""}, set-cookie: ${login.setNames.join(", ") || "none"}`);
    index = await get("/api/zzz/index");
    summary.afterBadgeLogin = { status: index.status, retcode: index.retcode, message: index.message };
    log(`index after badge login: HTTP ${index.status}, retcode ${index.retcode} ${index.message ?? ""}`);
  }
  save("index", index);
  if (index.retcode !== 0) throw new Error(`index still rejected (retcode ${index.retcode})`);

  const data = index.data ?? {};
  log(`index keys: ${Object.keys(data).join(", ")}`);
  log(`total_gacha_count=${data.total_gacha_count} total_s_count=${data.total_s_count} cur_ver=${data.cur_ver}`);
  log(`tickets: ${(data.cur_tickets ?? []).map((t: any) => `${t.ticket_type}=${t.ticket_cnt}`).join(", ")}`);
  const typeStats: any[] = Array.isArray(data.type_stats) ? data.type_stats : [];
  for (const stat of typeStats) {
    log(`type_stats ${JSON.stringify(stat.gacha_type)}: total=${stat.total_count} s=${stat.s_count} up=${stat.up_count} avr_up=${stat.avr_up_count} `
      + `next_s_cur_times=${stat.next_s_cur_times} new_s_max_times=${stat.new_s_max_times} vers=[${(stat.has_data_vers ?? []).join(",")}]`);
  }

  // 3. Current and historical pools per channel.
  const poolLine = (pool: any) => {
    const records: any[] = Array.isArray(pool.cur_records) ? pool.cur_records : [];
    const first = records[0];
    return `  pool keys=[${Object.keys(pool).join(",")}] state=${pool.gacha_state} ver=${pool.ver ?? pool.version ?? "?"} `
      + `start=${pool.start_ts} end=${pool.end_ts} up_items=${(pool.cur_item_list ?? []).length} records=${records.length}`
      + (first ? ` record keys=[${Object.keys(first).join(",")}] sample=${JSON.stringify({ item_id: first.item_id, count: first.count, is_up: first.is_up, up_tag: first.up_tag, record_time: first.record_time })}` : "");
  };
  const channels: Record<string, unknown> = {};
  for (const [gachaType, label] of GACHA_TYPES) {
    const current = await get("/api/zzz/cur_pool_stat", { gacha_type: gachaType });
    save(`cur_pool_stat-${label}`, current);
    const currentList: any[] = Array.isArray(current.data?.list) ? current.data.list : [];
    log(`\n[${label}] cur_pool_stat: retcode ${current.retcode}, top keys=[${Object.keys(current.data ?? {}).join(",")}], pools=${currentList.length}`);
    for (const pool of currentList) log(poolLine(pool));

    // type_stats may identify the channel by number or by enum name; match either.
    const stat = typeStats.find((item) => Number(item.gacha_type) === gachaType
      || String(item.gacha_type).toUpperCase().includes(label.toUpperCase())
      || (label === "standard" && /PERMANENT|STANDARD/i.test(String(item.gacha_type))));
    const versions: string[] = (Array.isArray(stat?.has_data_vers) ? stat.has_data_vers : []).map(String);
    let historyPools = 0, historyRecords = 0, earliest = Number.POSITIVE_INFINITY;
    for (let offset = 0; offset < versions.length; offset += 8) {
      const chunk = versions.slice(offset, offset + 8);
      const history = await get("/api/zzz/hist_pool_stat", { gacha_type: gachaType, vers: chunk.join(",") });
      save(`hist_pool_stat-${label}-${offset / 8}`, history);
      const list: any[] = Array.isArray(history.data?.list) ? history.data.list : [];
      log(`[${label}] hist_pool_stat vers=${chunk.join(",")}: retcode ${history.retcode} ${history.message ?? ""}, pools=${list.length}`);
      if (offset === 0) for (const pool of list.slice(0, 2)) log(poolLine(pool));
      historyPools += list.length;
      for (const pool of list) for (const record of pool.cur_records ?? []) {
        historyRecords++;
        if (Number(record.record_time) > 0) earliest = Math.min(earliest, Number(record.record_time));
      }
    }
    const currentRecords = currentList.reduce((sum, pool) => sum + (pool.cur_records ?? []).length, 0);
    channels[label] = {
      statFound: !!stat, versions: versions.length, historyPools, historyRecords, currentRecords,
      sCountFromStats: stat?.s_count, earliestRecordTime: Number.isFinite(earliest) ? earliest : null,
    };
    log(`[${label}] S in pools: current ${currentRecords} + history ${historyRecords}; type_stats s_count=${stat?.s_count ?? "n/a"}; `
      + `earliest record_time=${Number.isFinite(earliest) ? `${earliest} (${new Date(earliest * (earliest < 1e11 ? 1000 : 1)).toISOString()})` : "n/a"}`);
  }
  summary.channels = channels;
  save("summary", summary);
  log(`\nPASS: redacted payloads written to ${output}`);
} catch (error: any) {
  process.stderr.write(`FAIL: ${String(error?.message || error).replace(/[\w-]{24,}/g, "<redacted>")}\n`);
  process.exitCode = 1;
} finally {
  await (db.driver as any).close?.();
}
