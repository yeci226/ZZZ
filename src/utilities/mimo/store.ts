import { randomUUID } from "node:crypto";
import type { MimoOffer } from "./api.js";
import type { ZZZRedeemCardPayload } from "../canvas/redeemCard.js";
export interface MimoConfig {
  owner: string; ltuid: string; uid: string; enabled: boolean; order: string[];
  notifyType: "dm" | "channel" | "off"; channelId?: string; guildId?: string; tag: boolean;
  revision: number; nextAt: number; lastAt?: number; points?: number; reason?: string;
}
export interface MimoPurchase { id: string; ltuid: string; owner: string; uid: string; version: number; offer: MimoOffer; beforeCodes: string[]; at: number; code?: string; status: "purchasing" | "pending" | "success" | "already" | "invalid" | "rejected"; attempts: number; nextAt: number }
export function defaultMimoConfig(owner: string, ltuid: string, uid: string): MimoConfig { return { owner, ltuid, uid, enabled: false, order: ["polychrome"], notifyType: "dm", tag: false, revision: 0, nextAt: 0 }; }
export class MimoStore {
  constructor(readonly sql: any) {
    sql.exec(`CREATE TABLE IF NOT EXISTS mimo_configs (ltuid TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mimo_purchases (id TEXT PRIMARY KEY, ltuid TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS mimo_purchase_account ON mimo_purchases(ltuid);
      CREATE TABLE IF NOT EXISTS mimo_results (id TEXT PRIMARY KEY, ltuid TEXT NOT NULL, owner TEXT NOT NULL, created_at INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mimo_leases (ltuid TEXT PRIMARY KEY, until_at INTEGER NOT NULL);`);
  }
  get(ltuid: string): MimoConfig | undefined { const row = this.sql.prepare("SELECT data FROM mimo_configs WHERE ltuid=?").get(ltuid); return row ? JSON.parse(row.data) : undefined; }
  configs(): MimoConfig[] { return this.sql.prepare("SELECT data FROM mimo_configs").all().map((r: any) => JSON.parse(r.data)); }
  save(config: MimoConfig, fields: (keyof MimoConfig)[], expected: MimoConfig): MimoConfig {
    return this.sql.transaction(() => {
      const current = this.get(config.ltuid) || defaultMimoConfig(config.owner, config.ltuid, config.uid);
      if (current.owner !== config.owner) throw new Error("mimo_owned");
      for (const key of fields) if (JSON.stringify(current[key]) !== JSON.stringify(expected[key])) throw new Error("settings_conflict");
      const next = { ...current, revision: current.revision + 1 };
      for (const key of fields) (next as any)[key] = config[key];
      this.putConfig(next); return next;
    })();
  }
  putConfig(config: MimoConfig) { this.sql.prepare("INSERT INTO mimo_configs VALUES(?,?,?) ON CONFLICT(ltuid) DO UPDATE SET data=excluded.data").run(config.ltuid, config.owner, JSON.stringify(config)); }
  state(ltuid: string, patch: Partial<Pick<MimoConfig, "nextAt" | "lastAt" | "points" | "reason" | "enabled" | "notifyType">>) { this.sql.transaction(() => { const c = this.get(ltuid); if (c) this.putConfig({ ...c, ...patch }); })(); }
  lease(ltuid: string, now = Date.now()): boolean { return this.sql.transaction(() => {
    const old = this.sql.prepare("SELECT until_at FROM mimo_leases WHERE ltuid=?").get(ltuid);
    if (old && old.until_at > now) return false;
    this.sql.prepare("INSERT INTO mimo_leases VALUES(?,?) ON CONFLICT(ltuid) DO UPDATE SET until_at=excluded.until_at").run(ltuid, now + 300000); return true;
  })(); }
  renew(ltuid: string) { this.sql.prepare("UPDATE mimo_leases SET until_at=? WHERE ltuid=?").run(Date.now() + 300000, ltuid); }
  unlock(ltuid: string) { this.sql.prepare("DELETE FROM mimo_leases WHERE ltuid=?").run(ltuid); }
  purchases(ltuid: string): MimoPurchase[] { return this.sql.prepare("SELECT data FROM mimo_purchases WHERE ltuid=?").all(ltuid).map((r: any) => JSON.parse(r.data)); }
  begin(config: MimoConfig, version: number, offer: MimoOffer, beforeCodes: string[]): MimoPurchase {
    const p: MimoPurchase = { id: randomUUID(), ltuid: config.ltuid, owner: config.owner, uid: config.uid, version, offer, beforeCodes, at: Date.now(), status: "purchasing", attempts: 0, nextAt: 0 }; this.purchase(p); return p;
  }
  purchase(p: MimoPurchase) { this.sql.prepare("INSERT INTO mimo_purchases VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(p.id, p.ltuid, JSON.stringify(p)); }
  result(config: MimoConfig, payload: ZZZRedeemCardPayload, reason?: string) {
    const at = Date.now(), id = randomUUID();
    // Store no private code in notification payloads.
    const safe = structuredClone(payload); for (const a of safe.accounts) for (const c of a.codes) c.code = "";
    this.sql.prepare("INSERT INTO mimo_results VALUES(?,?,?,?,?,?)").run(id, config.ltuid, config.owner, at, config.notifyType === "off" ? 1 : 0, JSON.stringify({ payload: safe, reason }));
    return id;
  }
  results(ltuid: string, pending = false): any[] { return this.sql.prepare(`SELECT * FROM mimo_results WHERE ltuid=? ${pending ? "AND sent=0" : ""} ORDER BY created_at DESC LIMIT 20`).all(ltuid).map((r: any) => ({ ...r, ...JSON.parse(r.data) })); }
  delivered(id: string) { this.sql.prepare("UPDATE mimo_results SET sent=1 WHERE id=?").run(id); }
}
