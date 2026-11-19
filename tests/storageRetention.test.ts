import { RedeemEngine, RedeemStore } from "../src/utilities/core/redeemEngine";
import { MimoStore, defaultMimoConfig } from "../src/utilities/mimo/store";
import { MimoEngine, type MimoAdapter } from "../src/utilities/mimo/engine";
import { listGloballyEnabledOwners } from "../src/utilities/zzz/gachaArchiveMaintenance";

const DAY = 24 * 3600000;

function sqlite(): any {
  // Real SQLite even when this Windows checkout lacks native better-sqlite3 bindings.
  try { const SQLite = require("better-sqlite3"); return new SQLite(":memory:"); }
  catch {
    const { DatabaseSync } = require("node:sqlite"); const sql: any = new DatabaseSync(":memory:");
    sql.transaction = (fn: any) => () => { sql.exec("BEGIN IMMEDIATE"); try { const value = fn(); sql.exec("COMMIT"); return value; } catch (e) { sql.exec("ROLLBACK"); throw e; } };
    return sql;
  }
}

describe("redeem queue retention", () => {
  const invalid = { retcode: -2001 };
  function store() { return new RedeemStore({ driver: { database: sqlite() } }); }

  test("prune only removes inactive, old, permanently invalid rows", () => {
    const s = store(), t0 = 1_000_000;
    s.seed("1", "user", [{ code: "OLD" }, { code: "RECENT" }, { code: "LISTED" }, { code: "DONE" }, { code: "WAIT" }]);
    s.record("1", { code: "OLD" }, invalid, false, t0);
    s.record("1", { code: "RECENT" }, invalid, false, t0 + 20 * DAY);
    s.record("1", { code: "LISTED" }, invalid, false, t0);
    s.record("1", { code: "DONE" }, { retcode: 0 }, false, t0);
    s.record("1", { code: "WAIT" }, { httpStatus: 500 }, false, t0);
    // LISTED stays on the public list; every other code has left it.
    s.seed("1", "user", [{ code: "LISTED" }]);
    expect(s.prune(t0 + 31 * DAY)).toBe(1);
    const left = Object.fromEntries(s.rows("1").map(r => [r.code, r.status]));
    expect(left).toEqual({ RECENT: "invalid", LISTED: "invalid", DONE: "success", WAIT: "retry" });
  });

  test("due() is satisfied by the narrowed partial index and ignores dead rows", () => {
    const s = store();
    s.seed("1", "user", [{ code: "DEAD" }, { code: "ALIVE" }, { code: "PENDING" }]);
    s.record("1", { code: "DEAD" }, invalid, false, 10);
    s.record("1", { code: "ALIVE" }, invalid, false, 10);
    s.seed("1", "user", [{ code: "ALIVE" }, { code: "PENDING" }]);
    const later = 10 + 24 * 3600000 + 1;
    expect(s.due(later).map(r => r.code).sort()).toEqual(["ALIVE", "PENDING"]);
    const names = s.sql.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((r: any) => r.name);
    expect(names).toContain("auto_redeem_due2");
    expect(names).not.toContain("auto_redeem_due");
    // Same text as RedeemStore.due(); keep in sync.
    const plan = s.sql.prepare(`EXPLAIN QUERY PLAN SELECT r.* FROM auto_redeem_v2 r LEFT JOIN auto_redeem_accounts a ON a.uid=r.uid
      WHERE owner<>'' AND status NOT IN ('success','already') AND (status NOT IN ('invalid','legacy') OR active=1)
      AND r.next_at<=? AND COALESCE(a.next_at,0)<=? ORDER BY updated_at,uid,code LIMIT 100`).all(1, 1).map((r: any) => r.detail).join("\n");
    expect(plan).toContain("auto_redeem_due2");
    expect(plan).not.toMatch(/USE TEMP B-TREE FOR ORDER BY/);
  });

  function engine(now: () => number) {
    const db: any = { driver: { database: sqlite() }, get: jest.fn(async (key: string) => key === "autoRedeem" ? { user: { channelId: "c" } } : undefined) };
    const adapter: any = { db, codes: jest.fn(async () => []), accounts: jest.fn(async () => []), exchange: jest.fn(), prepare: jest.fn(),
      authRecovered: jest.fn(async () => false), notify: jest.fn(), log: jest.fn() };
    const e = new RedeemEngine(adapter, now);
    return { e, adapter };
  }
  const summaries = (adapter: any) => adapter.log.mock.calls.filter((c: any[]) => String(c[0]).startsWith("兌換佇列")).length;

  test("queue summary is logged only when it changed", async () => {
    const { e, adapter } = engine(() => 5000);
    try {
      await e.tick(false); await e.tick(false); await e.tick(false);
      expect(summaries(adapter)).toBe(1);
      e.store.seed("1", "user", [{ code: "NEW" }]);
      await e.tick(false); await e.tick(false);
      expect(summaries(adapter)).toBe(2);
    } finally { e.stop(); }
  });

  test("tick prunes at most once an hour", async () => {
    let now = 40 * DAY;
    const { e } = engine(() => now);
    const addDead = (code: string) => {
      e.store.seed("1", "user", [{ code }]); e.store.record("1", { code }, invalid, false, 1);
      e.store.seed("1", "user", []);
    };
    try {
      addDead("A"); await e.tick(false);
      expect(e.store.rows("1")).toHaveLength(0);
      addDead("B"); now += 30 * 60000; await e.tick(false);
      expect(e.store.rows("1")).toHaveLength(1);
      now += 31 * 60000; await e.tick(false);
      expect(e.store.rows("1")).toHaveLength(0);
    } finally { e.stop(); }
  });
});

describe("mimo result retention", () => {
  function setup() {
    const sql = sqlite(), store = new MimoStore(sql);
    const add = (ltuid: string, at: number, sent: boolean) => sql.prepare("INSERT INTO mimo_results VALUES(?,?,?,?,?,?)")
      .run(`${ltuid}-${at}-${sent}`, ltuid, "u", at, sent ? 1 : 0, JSON.stringify({ payload: {} }));
    return { sql, store, add };
  }

  test("prune removes only delivered results older than 30 days and never purchases", () => {
    const { sql, store, add } = setup(), now = 100 * DAY;
    add("h", now - 40 * DAY, true); add("h", now - 40 * DAY, false); add("h", now - 5 * DAY, true);
    store.purchase({ id: "p", ltuid: "h", owner: "u", uid: "1", version: 1, offer: {} as any, beforeCodes: [], at: 0, status: "pending", attempts: 0, nextAt: 0 });
    expect(store.prune(now)).toBe(1);
    expect(sql.prepare("SELECT sent,created_at FROM mimo_results ORDER BY created_at").all().map((r: any) => [r.sent, r.created_at]))
      .toEqual([[0, now - 40 * DAY], [1, now - 5 * DAY]]);
    expect(store.purchases("h")).toHaveLength(1);
  });

  test("pending lookup and result queries use indexes", () => {
    const { sql, store, add } = setup();
    add("a", 1, false); add("b", 2, true);
    expect([...store.pendingLtuids()]).toEqual(["a"]);
    const plan = (q: string, ...args: any[]) => sql.prepare(`EXPLAIN QUERY PLAN ${q}`).all(...args).map((r: any) => r.detail).join("\n");
    expect(plan("SELECT * FROM mimo_results WHERE ltuid=? AND sent=0 ORDER BY created_at DESC LIMIT 20", "a")).toContain("mimo_results_pending");
    expect(plan("SELECT DISTINCT ltuid FROM mimo_results WHERE sent=0")).toContain("mimo_results_pending");
    expect(plan("SELECT * FROM mimo_results WHERE ltuid=? ORDER BY created_at DESC LIMIT 20", "a")).toContain("mimo_results_ltuid");
  });

  test("tick queries results only for configs with an undelivered result and still delivers them", async () => {
    const { store, add } = setup();
    for (const id of ["a", "b", "c"]) store.putConfig({ ...defaultMimoConfig("u", id, "1"), enabled: false });
    add("b", 1, false);
    const notify = jest.fn(async () => {});
    const adapter = { notify } as unknown as MimoAdapter;
    const results = jest.spyOn(store, "results");
    await new MimoEngine(store, adapter).tick();
    expect(results.mock.calls.map(c => c[0])).toEqual(["b"]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.pendingLtuids().size).toBe(0);
  });
});

describe("globally enabled gacha owners", () => {
  test("uses a targeted json query instead of db.all()", async () => {
    const sql = sqlite();
    sql.exec("CREATE TABLE json (ID TEXT PRIMARY KEY, json TEXT)");
    const put = sql.prepare("INSERT INTO json VALUES(?,?)");
    put.run("on", JSON.stringify({ gachaWeeklyArchive: true }));
    put.run("off", JSON.stringify({ gachaWeeklyArchive: false }));
    put.run("str", JSON.stringify({ gachaWeeklyArchive: "true" }));
    put.run("num", JSON.stringify({ gachaWeeklyArchive: 1 }));
    put.run("none", JSON.stringify({ other: 1 }));
    put.run("array", JSON.stringify([1, 2]));
    put.run("broken", "{not json");
    const db = { driver: { database: sql }, tableName: "json", all: jest.fn(async () => { throw new Error("must not be called"); }) };
    await expect(listGloballyEnabledOwners(db)).resolves.toEqual(["on"]);
    expect(db.all).not.toHaveBeenCalled();
  });

  test("falls back to db.all() when the handle query fails", async () => {
    const sql = sqlite(); // no table: the targeted query throws
    const db = { driver: { database: sql }, tableName: "json", all: jest.fn(async () => [{ id: "x", value: { gachaWeeklyArchive: true } }]) };
    await expect(listGloballyEnabledOwners(db)).resolves.toEqual(["x"]);
    expect(db.all).toHaveBeenCalledTimes(1);
  });
});
