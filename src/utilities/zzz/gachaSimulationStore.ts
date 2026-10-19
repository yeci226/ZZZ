import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { defaultSimulationRules, newSimulationPreferences, simulationRulesId, validateSimulationRules, type SimulationPreferences, type SimulationRules } from "./gachaSimulationRules.js";
import {
  EMPTY_SIMULATION_STATE, SIMULATION_RULES_REVISION, simulatePulls,
  type SimulationBanner, type SimulationPool, type SimulationPull, type SimulationState,
} from "./gachaSimulationEngine.js";

export interface SimulationSession {
  id: string;
  ownerId: string;
  requestId: string;
  banner: SimulationBanner;
  pulls: SimulationPull[];
  state: SimulationState;
  createdAt: number;
  messageId?: string;
  finished: boolean;
  rulesRevision: string;
  gifHeight?: number;
  delivery?: SimulationDelivery;
  resultCheckAt?: number;
  resultVerifiedAt?: number;
  parentId?: string;
  continuationId?: string;
  rules?: SimulationRules;
  rulesId?: string;
  ruleVersion?: number;
  animation?: boolean;
}
export interface SimulationDrawOptions { rules: SimulationRules; ruleVersion?: number; animation?: boolean }
export interface SimulationPanel { id: string; ownerId: string; kind: string; value: any; updatedAt: number }
export interface SimulationDelivery {
  applicationId: string;
  channelId: string;
  guildId?: string | null;
  completeAt: number;
  attachmentLimit: number;
}
/** Separate from actual Signal Search archives; transactional across shards/processes. */
export class GachaSimulationStore {
  private db: Database.Database;
  constructor(filename = process.env.ZZZ_GACHA_SIMULATION_DB || path.resolve("data/zzz-gacha-simulation.sqlite")) {
    if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL"); this.db.pragma("busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS simulation_state (
        owner_id TEXT NOT NULL, pool TEXT NOT NULL, state_json TEXT NOT NULL,
        PRIMARY KEY(owner_id, pool)
      );
      CREATE TABLE IF NOT EXISTS simulation_inventory (
        owner_id TEXT NOT NULL, item_id TEXT NOT NULL, count INTEGER NOT NULL,
        PRIMARY KEY(owner_id, item_id)
      );
      CREATE TABLE IF NOT EXISTS simulation_session (
        id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL,
        created_at INTEGER NOT NULL, message_id TEXT, finished INTEGER NOT NULL DEFAULT 0,
        result_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS simulation_session_age ON simulation_session(created_at);
      CREATE INDEX IF NOT EXISTS simulation_session_owner ON simulation_session(owner_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS simulation_session_pending ON simulation_session(created_at)
        WHERE finished=0 AND message_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS simulation_session_unverified ON simulation_session(created_at)
        WHERE finished=1 AND message_id IS NOT NULL AND json_extract(result_json, '$.resultVerifiedAt') IS NULL;
      CREATE INDEX IF NOT EXISTS simulation_session_unsent_continuation ON simulation_session(created_at)
        WHERE message_id IS NULL AND json_extract(result_json, '$.parentId') IS NOT NULL;
      CREATE TABLE IF NOT EXISTS simulation_preferences (owner_id TEXT PRIMARY KEY, value_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS simulation_rules (owner_id TEXT NOT NULL, id TEXT NOT NULL, pool TEXT NOT NULL, version INTEGER NOT NULL, rules_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(owner_id,id,pool));
      CREATE TABLE IF NOT EXISTS simulation_custom_state (owner_id TEXT NOT NULL, pool TEXT NOT NULL, rules_id TEXT NOT NULL, state_json TEXT NOT NULL, PRIMARY KEY(owner_id,pool,rules_id));
      CREATE TABLE IF NOT EXISTS simulation_custom_inventory (owner_id TEXT NOT NULL, rules_id TEXT NOT NULL, item_id TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(owner_id,rules_id,item_id));
      CREATE TABLE IF NOT EXISTS simulation_panel (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS simulation_panel_owner ON simulation_panel(owner_id,kind,updated_at);
      CREATE TABLE IF NOT EXISTS simulation_job (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, status TEXT NOT NULL, started_at INTEGER NOT NULL);
    `);
  }
  close() { this.db.close(); }
  state(ownerId: string, pool: SimulationPool, rulesId = "game"): SimulationState {
    const row = (rulesId === "game" ? this.db.prepare("SELECT state_json FROM simulation_state WHERE owner_id=? AND pool=?").get(ownerId, pool) : this.db.prepare("SELECT state_json FROM simulation_custom_state WHERE owner_id=? AND pool=? AND rules_id=?").get(ownerId, pool, rulesId)) as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) : { ...EMPTY_SIMULATION_STATE };
  }
  private decode(row: any): SimulationSession | undefined {
    return row ? { ...JSON.parse(row.result_json), messageId: row.message_id || undefined, finished: !!row.finished } : undefined;
  }
  get(id: string): SimulationSession | undefined {
    return this.decode(this.db.prepare("SELECT * FROM simulation_session WHERE id=?").get(id));
  }
  byRequest(requestId: string): SimulationSession | undefined {
    return this.decode(this.db.prepare("SELECT * FROM simulation_session WHERE request_id=?").get(requestId));
  }
  preferences(ownerId: string): SimulationPreferences {
    const row = this.db.prepare("SELECT value_json FROM simulation_preferences WHERE owner_id=?").get(ownerId) as any;
    return row ? JSON.parse(row.value_json) : newSimulationPreferences();
  }
  savePreferences(ownerId: string, preferences: SimulationPreferences) {
    this.db.prepare("INSERT INTO simulation_preferences VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET value_json=excluded.value_json").run(ownerId, JSON.stringify(preferences));
  }
  rules(ownerId: string, pool: SimulationPool, id = "game"): { id: string; version: number; rules: SimulationRules } {
    if (id === "game") return { id, version: 0, rules: defaultSimulationRules(pool) };
    const row = this.db.prepare("SELECT version,rules_json FROM simulation_rules WHERE owner_id=? AND pool=? AND id=?").get(ownerId, pool, id) as any;
    if (!row) throw new Error("找不到這個規則版本。");
    return { id, version: row.version, rules: JSON.parse(row.rules_json) };
  }
  ruleVersions(ownerId: string, pool: SimulationPool) {
    const rows = this.db.prepare("SELECT id,version,rules_json FROM simulation_rules WHERE owner_id=? AND pool=? ORDER BY version DESC").all(ownerId, pool) as any[];
    return [this.rules(ownerId, pool), ...rows.map(row => ({ id: row.id as string, version: row.version as number, rules: JSON.parse(row.rules_json) as SimulationRules }))];
  }
  saveRules(ownerId: string, input: SimulationRules) {
    const rules = validateSimulationRules(input), id = simulationRulesId(rules);
    return this.db.transaction(() => {
      if (id !== "game") {
        const next = (this.db.prepare("SELECT COALESCE(MAX(version),0)+1 AS v FROM simulation_rules WHERE owner_id=? AND pool=?").get(ownerId, rules.pool) as any).v;
        this.db.prepare("INSERT OR IGNORE INTO simulation_rules VALUES(?,?,?,?,?,?)").run(ownerId, id, rules.pool, next, JSON.stringify(rules), Date.now());
      }
      return this.rules(ownerId, rules.pool, id);
    }).immediate();
  }
  history(ownerId: string): SimulationSession[] {
    return this.db.prepare("SELECT * FROM simulation_session WHERE owner_id=? ORDER BY created_at,id").all(ownerId).map(row => this.decode(row)!);
  }
  createPanel(ownerId: string, kind: string, value: any): SimulationPanel {
    const panel = { id: randomBytes(12).toString("hex"), ownerId, kind, value, updatedAt: Date.now() };
    this.db.prepare("INSERT INTO simulation_panel VALUES(?,?,?,?,?)").run(panel.id, ownerId, kind, JSON.stringify(value), panel.updatedAt); return panel;
  }
  panel(id: string, ownerId: string): SimulationPanel {
    const row = this.db.prepare("SELECT * FROM simulation_panel WHERE id=? AND owner_id=?").get(id, ownerId) as any;
    if (!row) throw new Error("這個面板不屬於你或已不存在，請重新開啟。");
    return { id: row.id, ownerId, kind: row.kind, value: JSON.parse(row.value_json), updatedAt: row.updated_at };
  }
  savePanel(panel: SimulationPanel) {
    this.db.prepare("UPDATE simulation_panel SET value_json=?,updated_at=? WHERE id=? AND owner_id=?").run(JSON.stringify(panel.value), Date.now(), panel.id, panel.ownerId);
  }
  lastPanel(ownerId: string, kind: string): SimulationPanel | undefined {
    const row = this.db.prepare("SELECT id FROM simulation_panel WHERE owner_id=? AND kind=? ORDER BY updated_at DESC LIMIT 1").get(ownerId, kind) as any;
    return row ? this.panel(row.id, ownerId) : undefined;
  }
  claimJob(id: string, ownerId: string) {
    this.db.transaction(() => {
      this.db.prepare("UPDATE simulation_job SET status='failed' WHERE status='running' AND started_at<?").run(Date.now() - 120_000);
      if (this.db.prepare("SELECT 1 FROM simulation_job WHERE owner_id=? AND status='running'").get(ownerId)) throw new Error("你已有試算執行中，請先等待或取消。");
      if ((this.db.prepare("SELECT COUNT(*) AS n FROM simulation_job WHERE status='running'").get() as any).n >= 2) throw new Error("兩個試算工作都在執行中，請稍後再試。");
      this.db.prepare("INSERT INTO simulation_job VALUES(?,?,'running',?) ON CONFLICT(id) DO UPDATE SET status='running',started_at=excluded.started_at").run(id, ownerId, Date.now());
    }).immediate();
  }
  jobStatus(id: string): string | undefined { return (this.db.prepare("SELECT status FROM simulation_job WHERE id=?").get(id) as any)?.status; }
  finishJob(id: string, status: "complete" | "cancelled" | "failed") { this.db.prepare("UPDATE simulation_job SET status=? WHERE id=? AND status='running'").run(status, id); }
  draw(ownerId: string, requestId: string, banner: SimulationBanner, count: 1 | 10, random?: () => number, now = Date.now(), options?: SimulationDrawOptions): SimulationSession {
    return this.db.transaction(() => {
      const duplicate = this.byRequest(requestId);
      if (duplicate) {
        if (duplicate.ownerId !== ownerId) throw new Error("這次調頻不屬於你。");
        return duplicate;
      }
      // Prevent rapid repeated clicks even when two different shard processes handle them.
      const recent = this.db.prepare("SELECT created_at FROM simulation_session WHERE owner_id=? ORDER BY created_at DESC LIMIT 1").get(ownerId) as { created_at: number } | undefined;
      if (recent && now - recent.created_at < 1500) throw new Error("操作太快，請稍候再抽。");
      const rules = validateSimulationRules(options?.rules ?? defaultSimulationRules(banner.pool)), rulesId = simulationRulesId(rules);
      const { state, pulls } = simulatePulls(banner, this.state(ownerId, banner.pool, rulesId), count, random, rules);
      for (const pull of pulls) {
        if (rulesId === "game") {
          pull.isNew = !this.db.prepare("SELECT 1 FROM simulation_inventory WHERE owner_id=? AND item_id=?").get(ownerId, pull.id);
          this.db.prepare(`INSERT INTO simulation_inventory VALUES(?,?,1) ON CONFLICT(owner_id,item_id) DO UPDATE SET count=count+1`).run(ownerId, pull.id);
        } else {
          pull.isNew = !this.db.prepare("SELECT 1 FROM simulation_custom_inventory WHERE owner_id=? AND rules_id=? AND item_id=?").get(ownerId, rulesId, pull.id);
          this.db.prepare("INSERT INTO simulation_custom_inventory VALUES(?,?,?,1) ON CONFLICT(owner_id,rules_id,item_id) DO UPDATE SET count=count+1").run(ownerId, rulesId, pull.id);
        }
      }
      const session: SimulationSession = {
        id: randomBytes(12).toString("hex"), ownerId, requestId, banner, pulls, state,
        createdAt: now, finished: false, rulesRevision: SIMULATION_RULES_REVISION,
        rules, rulesId, ruleVersion: options?.ruleVersion ?? 0, animation: options?.animation ?? true,
      };
      if (rulesId === "game") this.db.prepare(`INSERT INTO simulation_state VALUES(?,?,?)
        ON CONFLICT(owner_id,pool) DO UPDATE SET state_json=excluded.state_json`).run(ownerId, banner.pool, JSON.stringify(state));
      else this.db.prepare("INSERT INTO simulation_custom_state VALUES(?,?,?,?) ON CONFLICT(owner_id,pool,rules_id) DO UPDATE SET state_json=excluded.state_json").run(ownerId, banner.pool, rulesId, JSON.stringify(state));
      this.db.prepare("INSERT INTO simulation_session(id,request_id,owner_id,created_at,result_json) VALUES(?,?,?,?,?)")
        .run(session.id, requestId, ownerId, now, JSON.stringify(session));
      // Message buttons keep referencing this session indefinitely. Preserve its
      // banner snapshot and idempotency key across later draws and restarts.
      return session;
    }).immediate();
  }
  /** Both buttons consume the same parent exactly once, including across processes. */
  continueDraw(parentId: string, ownerId: string, requestId: string, count: 1 | 10,
    delivery?: SimulationDelivery, random?: () => number, now = Date.now()): SimulationSession | undefined {
    return this.db.transaction(() => {
      const parent = this.get(parentId);
      if (!parent || parent.ownerId !== ownerId) throw new Error("這次調頻不屬於你。");
      if (parent.continuationId) return undefined;
      if (!parent.finished) throw new Error("請先等待動畫結束，或按「跳過動畫」。");
      if (this.byRequest(requestId)) throw new Error("這次操作已處理。");
      const next = this.draw(ownerId, requestId, parent.banner, count, random, now, { rules: parent.rules ?? defaultSimulationRules(parent.banner.pool), ruleVersion: parent.ruleVersion, animation: parent.animation });
      next.parentId = parent.id;
      if (delivery) next.delivery = { ...delivery, completeAt: now + 60_000 };
      this.db.prepare("UPDATE simulation_session SET result_json=? WHERE id=?").run(JSON.stringify(next), next.id);
      this.db.prepare(`UPDATE simulation_session SET result_json=json_set(
        json_remove(result_json, '$.resultVerifiedAt'), '$.continuationId', ?, '$.resultCheckAt', ?) WHERE id=?`)
        .run(next.id, now + 30_000, parent.id);
      if (!parent.delivery && delivery) this.db.prepare(`UPDATE simulation_session SET
        result_json=json_set(result_json, '$.delivery', json(?)) WHERE id=?`).run(JSON.stringify(delivery), parent.id);
      return next;
    }).immediate();
  }
  pendingContinuations(applicationId: string, now = Date.now()): SimulationSession[] {
    return this.db.prepare(`SELECT * FROM simulation_session WHERE message_id IS NULL
      AND json_extract(result_json, '$.parentId') IS NOT NULL
      AND json_extract(result_json, '$.delivery.applicationId')=?
      AND json_extract(result_json, '$.delivery.completeAt')<=? ORDER BY created_at`)
      .all(applicationId, now).map(row => this.decode(row)!);
  }
  claimPendingContinuation(id: string, now = Date.now()): SimulationSession | undefined {
    return this.db.transaction(() => {
      const updated = this.db.prepare(`UPDATE simulation_session SET result_json=json_set(result_json, '$.delivery.completeAt', ?)
        WHERE id=? AND message_id IS NULL AND json_extract(result_json, '$.parentId') IS NOT NULL
        AND json_extract(result_json, '$.delivery.completeAt')<=?`).run(now + 60_000, id, now);
      return updated.changes ? this.get(id) : undefined;
    }).immediate();
  }
  attachMessage(id: string, messageId: string, delivery?: SimulationDelivery) {
    if (delivery) {
      this.db.prepare("UPDATE simulation_session SET message_id=?, result_json=json_set(result_json, '$.delivery', json(?)) WHERE id=?")
        .run(messageId, JSON.stringify(delivery), id);
    } else this.db.prepare("UPDATE simulation_session SET message_id=? WHERE id=?").run(messageId, id);
  }
  setGifHeight(id: string, height: number) {
    this.db.prepare("UPDATE simulation_session SET result_json=json_set(result_json, '$.gifHeight', ?) WHERE id=?").run(height, id);
  }
  setPlaybackCompleteAt(id: string, completeAt: number) {
    this.db.prepare(`UPDATE simulation_session SET result_json=json_set(result_json, '$.delivery.completeAt', ?)
      WHERE id=? AND finished=0 AND json_type(result_json, '$.delivery')='object'`).run(completeAt, id);
  }
  pendingResults(applicationId: string, now = Date.now()): SimulationSession[] {
    return this.db.prepare(`SELECT * FROM simulation_session
      WHERE finished=0 AND message_id IS NOT NULL
      AND json_extract(result_json, '$.delivery.applicationId')=?
      AND json_extract(result_json, '$.delivery.completeAt')<=?
      ORDER BY created_at`).all(applicationId, now)
      .map(row => this.decode(row)!);
  }
  pendingResultChecks(applicationId: string, now = Date.now()): SimulationSession[] {
    return this.db.prepare(`SELECT * FROM simulation_session
      WHERE finished=1 AND message_id IS NOT NULL AND json_extract(result_json, '$.resultVerifiedAt') IS NULL
      AND json_extract(result_json, '$.delivery.applicationId')=?
      AND COALESCE(json_extract(result_json, '$.resultCheckAt'), json_extract(result_json, '$.delivery.completeAt')+30000)<=?
      ORDER BY created_at`).all(applicationId, now).map(row => this.decode(row)!);
  }
  finish(id: string, now = Date.now()) {
    // A successful edit response is not proof that asynchronous media processing
    // left the result visible. Recheck Discord after that processing has settled.
    this.db.prepare(`UPDATE simulation_session SET finished=1,
      result_json=json_set(json_remove(result_json, '$.resultVerifiedAt'), '$.resultCheckAt', ?) WHERE id=?`)
      .run(now + 30_000, id);
  }
  confirmResult(id: string, now = Date.now()) {
    this.db.prepare(`UPDATE simulation_session SET
      result_json=json_set(result_json, '$.resultVerifiedAt', ?) WHERE id=? AND finished=1`).run(now, id);
  }
  reopenResult(id: string) {
    this.db.prepare(`UPDATE simulation_session SET finished=0,
      result_json=json_remove(result_json, '$.resultVerifiedAt', '$.resultCheckAt') WHERE id=?`).run(id);
  }
}

let singleton: GachaSimulationStore | undefined;
export const getGachaSimulationStore = () => singleton ??= new GachaSimulationStore();
