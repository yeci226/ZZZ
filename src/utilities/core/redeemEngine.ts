import { createHash } from "node:crypto";

export const REDEEM_POLICY = {
  concurrency: 3, globalGap: 1000, accountGap: 10000, timeout: 10000,
  retryDelays: [30000, 90000], retryCycle: 15 * 60000, maxRetry: 6 * 3600000,
  invalidRetry: 24 * 3600000,
};
export type Outcome = "success" | "already" | "invalid" | "auth" | "retry" | "unknown";
export interface Code { code: string; [key: string]: any }
export interface Reply { retcode?: number; message?: string; httpStatus?: number; retryAfter?: number }
export function classifyRedeem(r: Reply): Outcome {
  if (r.httpStatus === 429 || (r.httpStatus ?? 0) >= 500) return "retry";
  if (r.httpStatus && (r.httpStatus < 200 || r.httpStatus >= 300)) return "unknown";
  if (r.retcode === 0) return "success";
  if ([-2017, -2018].includes(r.retcode!)) return "already";
  if ([-2001, -2006, -2003].includes(r.retcode!)) return "invalid";
  if ([-100, -1071].includes(r.retcode!)) return "auth";
  if ([-502, -1048].includes(r.retcode!) || r.httpStatus === 0) return "retry";
  return "unknown";
}
export function normalizeCodes(value: unknown): Code[] {
  if (!Array.isArray(value)) throw new Error("Invalid redeem code source");
  const codes = new Map<string, Code>();
  for (const item of value) {
    if (!item || typeof item.code !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(item.code.trim())) {
      throw new Error("Invalid redeem code entry");
    }
    const code = item.code.trim().toUpperCase();
    codes.set(code, { code, rewards: item.rewards, rewardIcons: item.rewardIcons });
  }
  return [...codes.values()];
}
export function safeRedeemMessage(value: unknown): string {
  return String(value ?? "").replace(/https?:\/\/\S+/g, "[url]")
    .replace(/(?:cookie|token|stoken|ltoken|authorization|password)[\w-]*\s*[:=]\s*[^\s;,]+/gi, "[redacted]")
    .replace(/[\r\n]/g, " ").slice(0, 180);
}
export async function exchangeCode(url: string, init: RequestInit): Promise<Reply> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REDEEM_POLICY.timeout) });
    const header = response.headers.get("retry-after");
    const retryAfter = header ? (Number.isFinite(Number(header)) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
    const body = await response.json().catch(() => ({})) as any;
    return { httpStatus: response.status, retcode: body.retcode, message: safeRedeemMessage(body.message),
      retryAfter: Number.isFinite(retryAfter) ? Math.max(0, retryAfter) : 0 };
  } catch (e: any) {
    return { httpStatus: 0, message: safeRedeemMessage(e?.name || "Network error") };
  }
}

// Same SQLite connection as quick.db; one row per UID/code avoids dotted-key
// read/modify/write races with Cookie refresh and manual redemption in other shards.
export class RedeemStore {
  sql: any;
  private legacyTable: string | null;
  constructor(db: any) {
    this.sql = db.driver.database;
    this.legacyTable = typeof db.tableName === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(db.tableName) ? db.tableName : null;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS auto_redeem_v2 (
      uid TEXT NOT NULL, code TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      round INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0, error_code INTEGER, notify INTEGER NOT NULL DEFAULT 0,
      notify_at INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(uid,code));
      CREATE INDEX IF NOT EXISTS auto_redeem_due ON auto_redeem_v2(updated_at,uid,code) WHERE status NOT IN ('success','already');
      CREATE INDEX IF NOT EXISTS auto_redeem_notify ON auto_redeem_v2(notify,notify_at);
      CREATE TABLE IF NOT EXISTS auto_redeem_accounts (
        uid TEXT PRIMARY KEY, next_at INTEGER NOT NULL DEFAULT 0, refresh_at INTEGER NOT NULL DEFAULT 0);`);
    // Older releases queued known claimed codes for an audit. They must never be redeemed again.
    this.sql.prepare("UPDATE auto_redeem_v2 SET status='already',next_at=0,round=0,notify=0 WHERE status='legacy'").run();
  }
  rows(uid: string): any[] { return this.sql.prepare("SELECT * FROM auto_redeem_v2 WHERE uid=?").all(uid); }
  seed(uid: string, owner: string, codes: Code[], legacy: string[] = []) {
    this.sql.transaction(() => {
      this.sql.prepare("UPDATE auto_redeem_v2 SET active=0 WHERE uid=?").run(uid);
      const claimed = new Set(legacy.map(code => code.trim().toUpperCase()));
      const put = this.sql.prepare(`INSERT INTO auto_redeem_v2(uid,code,owner,payload,status,updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(uid,code) DO UPDATE SET owner=excluded.owner,payload=excluded.payload,active=1,
          status=CASE WHEN excluded.status='already' AND auto_redeem_v2.status<>'success' THEN 'already' ELSE auto_redeem_v2.status END`);
      for (const code of codes) put.run(uid, code.code, owner, JSON.stringify(code), claimed.has(code.code) ? "already" : "pending", 0);
    })();
  }
  record(uid: string, code: Code, reply: Reply, notify = false, now = Date.now()) {
    const outcome = classifyRedeem(reply);
    const old = this.rows(uid).find(r => r.code === code.code);
    // An official completed result is monotonic, including late manual/automatic responses.
    if (old?.status === "success" || old?.status === "already") return;
    const attempts = (old?.attempts ?? 0) + 1;
    const round = (old?.round ?? 0) + 1;
    let next = 0;
    let nextRound = 0;
    const retryAfter = reply.retryAfter ?? 0;
    if (outcome === "invalid") next = now + REDEEM_POLICY.invalidRetry;
    else if (outcome === "auth") next = now + REDEEM_POLICY.maxRetry;
    else if (outcome === "retry" && round < 3 && retryAfter <= 90000) {
      next = now + Math.max(REDEEM_POLICY.retryDelays[round - 1]!, retryAfter);
      nextRound = round;
    } else if (outcome === "retry" || outcome === "unknown") {
      next = now + Math.max(retryAfter, Math.min(REDEEM_POLICY.maxRetry,
        REDEEM_POLICY.retryCycle * 2 ** Math.min(5, Math.floor((attempts - 1) / 3))));
    }
    this.sql.prepare(`INSERT INTO auto_redeem_v2(uid,code,payload,status,attempts,round,next_at,updated_at,error_code,notify)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(uid,code) DO UPDATE SET
      status=excluded.status,attempts=excluded.attempts,round=excluded.round,next_at=excluded.next_at,
      updated_at=excluded.updated_at,error_code=excluded.error_code,notify=MAX(notify,excluded.notify) WHERE status NOT IN ('success','already')`)
      .run(uid, code.code, JSON.stringify(code), outcome, attempts, nextRound, next, now,
        reply.retcode ?? null, Number(notify && outcome === "success"));
    if ((outcome === "success" || outcome === "already") && this.legacyTable) {
      const table = this.legacyTable;
      this.sql.transaction(() => {
        const row = this.sql.prepare(`SELECT json FROM ${table} WHERE ID=?`).get(uid);
        const value = row ? JSON.parse(row.json) : {};
        value.redeemedCodes = [...new Set([...(Array.isArray(value.redeemedCodes) ? value.redeemedCodes : []), code.code])];
        this.sql.prepare(`INSERT INTO ${table}(ID,json) VALUES(?,?) ON CONFLICT(ID) DO UPDATE SET json=excluded.json`)
          .run(uid, JSON.stringify(value));
      })();
    }
  }
  due(now: number): any[] {
    return this.sql.prepare(`SELECT r.* FROM auto_redeem_v2 r LEFT JOIN auto_redeem_accounts a ON a.uid=r.uid
      WHERE owner<>'' AND status NOT IN ('success','already') AND (status NOT IN ('invalid','legacy') OR active=1)
      AND r.next_at<=? AND COALESCE(a.next_at,0)<=? ORDER BY updated_at,uid,code LIMIT 100`).all(now, now);
  }
  cooldown(uid: string, next: number) {
    this.sql.prepare(`INSERT INTO auto_redeem_accounts(uid,next_at) VALUES(?,?)
      ON CONFLICT(uid) DO UPDATE SET next_at=MAX(next_at,excluded.next_at)`).run(uid, next);
  }
  canRefresh(uid: string, now: number): boolean {
    return this.sql.transaction(() => {
      const old = this.sql.prepare("SELECT refresh_at FROM auto_redeem_accounts WHERE uid=?").get(uid);
      if (old?.refresh_at && now - old.refresh_at < REDEEM_POLICY.retryCycle) return false;
      this.sql.prepare(`INSERT INTO auto_redeem_accounts(uid,refresh_at) VALUES(?,?)
        ON CONFLICT(uid) DO UPDATE SET refresh_at=excluded.refresh_at`).run(uid, now);
      return true;
    })();
  }
  claimed(uid: string, legacy: string[]): string[] {
    const codes = new Set(legacy.map(code => code.trim().toUpperCase()));
    for (const r of this.rows(uid)) {
      if (["success", "already"].includes(r.status)) codes.add(r.code);
    }
    return [...codes];
  }
}
/** Shared persisted cooldown: public codes and private Mimo codes cannot race. */
export function reserveRedeemSlot(store: RedeemStore, uid: string, now = Date.now()): boolean {
  return store.sql.transaction(() => {
    const row = store.sql.prepare("SELECT next_at FROM auto_redeem_accounts WHERE uid=?").get(uid);
    if (row?.next_at > now) return false;
    store.cooldown(uid, now + REDEEM_POLICY.accountGap); return true;
  })();
}
const stores = new WeakMap<object, RedeemStore>();
export function redeemStore(db: any): RedeemStore {
  let store = stores.get(db);
  if (!store) { store = new RedeemStore(db); stores.set(db, store); }
  return store;
}
export async function recordedRedeemCodes(db: any, uid: string): Promise<string[]> {
  return redeemStore(db).claimed(uid, (await db.get(`${uid}.redeemedCodes`)) || []);
}
export function recordManualRedeem(db: any, uid: string, code: string, reply: Reply) {
  redeemStore(db).record(uid, { code: code.toUpperCase() }, reply);
}

interface Adapter {
  db: any;
  codes(): Promise<Code[]>;
  accounts(userId: string): Promise<any[]>;
  exchange(account: any, code: Code): Promise<Reply>;
  prepare(userId: string, uid: string, force: boolean): Promise<any | null>;
  authRecovered(uid: string): Promise<boolean>;
  notify(userId: string, account: any, config: any, codes: Code[], nonce: string): Promise<"sent" | "disabled">;
  log(message: string): void;
}
export class RedeemEngine {
  store: RedeemStore;
  private busy = new Set<string>();
  private notifying = new Set<string>();
  private configs: Record<string, any> = {};
  private discovering = false;
  private discoverAgain = false;
  private nextRequest = 0;
  private requestGate: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private adapter: Adapter, private now = Date.now) { this.store = redeemStore(adapter.db); }
  async tick(discover = true) {
    if (this.discovering) { this.discoverAgain ||= discover; return; }
    this.discovering = true;
    try {
      this.configs = Object.fromEntries(Object.entries((await this.adapter.db.get("autoRedeem")) || {}).filter(([, config]) => config && (config as any).enabled !== false));
      for (const { owner } of this.store.sql.prepare("SELECT DISTINCT owner FROM auto_redeem_v2 WHERE owner<>''").all()) {
        if (!this.configs[owner]) this.store.sql.prepare("UPDATE auto_redeem_v2 SET owner='' WHERE owner=?").run(owner);
      }
      if (discover) {
        const codes = normalizeCodes(await this.adapter.codes());
        this.adapter.log(`發現碼清單: ${codes.map(c => c.code).join(", ")}`);
        const seen = new Set<string>();
        for (const owner of Object.keys(this.configs)) {
          for (const account of await this.adapter.accounts(owner)) {
            if (!account?.uid || !account.cookie || seen.has(String(account.uid))) continue;
            seen.add(String(account.uid));
            // Import claimed history as terminal; only genuinely new codes enter the queue.
            this.store.seed(String(account.uid), owner, codes, (await this.adapter.db.get(`${account.uid}.redeemedCodes`)) || []);
          }
        }
      }
      const auth = this.store.sql.prepare("SELECT DISTINCT uid FROM auto_redeem_v2 WHERE status='auth'").all();
      for (const { uid } of auth) if (await this.adapter.authRecovered(uid)) {
        this.store.sql.prepare("UPDATE auto_redeem_v2 SET status='pending',next_at=0,round=0 WHERE uid=? AND status='auth'").run(uid);
      }
      const summary = this.store.sql.prepare("SELECT status,COUNT(*) count,MIN(updated_at) oldest FROM auto_redeem_v2 GROUP BY status").all();
      this.adapter.log(`兌換佇列: ${JSON.stringify(summary)}`);
    } finally {
      this.discovering = false; this.pump();
      if (this.discoverAgain) {
        this.discoverAgain = false;
        void this.tick(true).catch(e => this.adapter.log(`來源重查失敗: ${safeRedeemMessage(e?.message)}`));
      }
    }
  }
  stop() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
  private pump() {
    this.stop();
    const now = this.now();
    const due = this.store.due(now);
    for (const row of due) {
      if (this.busy.size >= REDEEM_POLICY.concurrency || now < this.nextRequest) break;
      if (this.busy.has(row.uid) || this.notifying.has(row.uid) || !this.configs[row.owner]) continue;
      this.busy.add(row.uid);
      this.nextRequest = now + REDEEM_POLICY.globalGap;
      void this.attempt(row).catch(e => this.adapter.log(`執行失敗: ${safeRedeemMessage(e?.message)}`)).finally(() => {
        this.busy.delete(row.uid); this.pump();
      });
    }
    const owners = this.store.sql.prepare("SELECT DISTINCT uid,owner FROM auto_redeem_v2 WHERE notify=1 AND notify_at<=?").all(now);
    for (const { uid, owner } of owners) {
      if (this.notifying.size >= REDEEM_POLICY.concurrency) break;
      if (this.busy.has(uid) || this.notifying.has(uid) || !this.configs[owner]) continue;
      const rows = this.store.rows(uid);
      if (rows.some(r => !["success", "already", "invalid", "auth"].includes(r.status) && (r.round > 0 || r.next_at <= now))) continue;
      this.notifying.add(uid);
      void this.deliver(uid, owner).catch(e => this.adapter.log(`通知失敗: ${safeRedeemMessage(e?.message)}`)).finally(() => {
        this.notifying.delete(uid);
      });
    }
    this.timer = setTimeout(() => this.pump(), REDEEM_POLICY.globalGap);
    this.timer.unref?.();
  }
  private async attempt(row: any) {
    const { uid, owner } = row;
    try {
      const config = await this.adapter.db.get(`autoRedeem.${owner}`);
      if (!config || config.enabled === false) { delete this.configs[owner]; return; }
      const history: string[] = (await this.adapter.db.get(`${uid}.redeemedCodes`)) || [];
      if (history.some(code => code.trim().toUpperCase() === row.code)) {
        this.store.record(uid, JSON.parse(row.payload), { retcode: -2017 }, false, this.now());
        return;
      }
      const account = await this.adapter.prepare(owner, uid, false);
      if (!account) {
        this.store.record(uid, JSON.parse(row.payload), { retcode: -100 }, false, this.now());
        return;
      }
      const gate = this.requestGate.then(async () => {
        const delay = Math.max(0, this.nextRequest - this.now());
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        this.nextRequest = this.now() + REDEEM_POLICY.globalGap;
      });
      this.requestGate = gate.catch(() => {});
      await gate;
      if (!reserveRedeemSlot(this.store, uid, this.now())) return;
      const reply = await this.adapter.exchange(account, JSON.parse(row.payload));
      const outcome = classifyRedeem(reply);
      this.store.record(uid, JSON.parse(row.payload), reply, true, this.now());
      this.adapter.log(`UID ${uid} 碼 ${row.code}: ${outcome} HTTP=${reply.httpStatus ?? 0} retcode=${reply.retcode ?? "none"} ${safeRedeemMessage(reply.message)}`);
      if (outcome === "auth") {
        if (this.store.canRefresh(uid, this.now()) && await this.adapter.prepare(owner, uid, true)) {
          this.store.sql.prepare("UPDATE auto_redeem_v2 SET status='pending',next_at=?,round=0 WHERE uid=? AND status='auth'")
            .run(this.now() + REDEEM_POLICY.accountGap, uid);
        }
      } else if (outcome === "retry" && (reply.httpStatus === 429 || reply.retcode === -502 || reply.retcode === -1048)) {
        const saved = this.store.rows(uid).find(r => r.code === row.code);
        this.store.cooldown(uid, saved.next_at);
        this.nextRequest = Math.max(this.nextRequest, this.now() + Math.max(10000, reply.retryAfter ?? 0));
      }
    } catch (e: any) {
      this.store.record(uid, JSON.parse(row.payload), { httpStatus: 0 }, false, this.now());
      this.adapter.log(`UID ${uid} 碼 ${row.code}: ${safeRedeemMessage(e?.message)}`);
    } finally { this.store.cooldown(uid, this.now() + REDEEM_POLICY.accountGap); }
  }
  private async deliver(uid: string, owner: string) {
    const pending = this.store.rows(uid).filter(r => r.notify);
    const codes = pending.map(r => JSON.parse(r.payload));
    // Persist retry time before I/O; notification failure must never replay the exchange.
    this.store.sql.prepare("UPDATE auto_redeem_v2 SET notify_at=? WHERE uid=? AND notify=1").run(this.now() + 60000, uid);
    const config = await this.adapter.db.get(`autoRedeem.${owner}`);
    if (!config || config.enabled === false) return;
    const account = (await this.adapter.accounts(owner)).find(a => String(a?.uid) === uid);
    if (!account) return;
    const nonce = createHash("sha256").update(`${uid}:${pending.map(r => `${r.code}:${r.updated_at}`).sort().join(",")}`).digest("hex").slice(0, 24);
    await this.adapter.notify(owner, account, config, codes, nonce);
    const done = this.store.sql.prepare("UPDATE auto_redeem_v2 SET notify=0 WHERE uid=? AND code=? AND updated_at=?");
    this.store.sql.transaction(() => { for (const r of pending) done.run(uid, r.code, r.updated_at); })();
    this.adapter.log(`UID ${uid} 本輪成功通知已處理: ${codes.map(c => c.code).join(", ")}`);
  }
}
