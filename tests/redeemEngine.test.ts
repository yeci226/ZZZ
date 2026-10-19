import { RedeemEngine, RedeemStore, classifyRedeem, normalizeCodes, exchangeCode, recordedRedeemCodes } from "../src/utilities/core/redeemEngine";

function database() {
  // Exercise real SQLite locally even when this Windows checkout lacks native bindings.
  let sql: any;
  try { const SQLite = require("better-sqlite3"); sql = new SQLite(":memory:"); }
  catch {
    const { DatabaseSync } = require("node:sqlite"); sql = new DatabaseSync(":memory:");
    sql.transaction = (fn: any) => () => { sql.exec("BEGIN IMMEDIATE"); try { const value = fn(); sql.exec("COMMIT"); return value; } catch (e) { sql.exec("ROLLBACK"); throw e; } };
  }
  const values: any = { autoRedeem: { user: { channelId: "channel" } } };
  return { driver: { database: sql }, get: jest.fn(async (key: string) => key === "autoRedeem.user" ? values.autoRedeem.user : values[key]), values };
}
function setup(codes = ["A", "B"]) {
  const db = database();
  const adapter: any = {
    db, codes: jest.fn(async () => codes.map(code => ({ code }))),
    accounts: jest.fn(async () => [{ uid: "80001", cookie: "test-cookie" }]),
    exchange: jest.fn(async () => ({ retcode: 0 })),
    prepare: jest.fn(async () => ({ uid: "80001", cookie: "test-cookie" })),
    authRecovered: jest.fn(async () => false), notify: jest.fn(async () => "sent"), log: jest.fn(),
  };
  const engine = new RedeemEngine(adapter);
  return { db, adapter, engine };
}

describe("persistent auto redeem", () => {
  const engines: RedeemEngine[] = [];
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(1000000); });
  afterEach(() => { for (const engine of engines) engine.stop(); engines.length = 0; jest.useRealTimers(); });
  const track = (s: ReturnType<typeof setup>) => { engines.push(s.engine); return s; };

  test("disabled saved settings do not discover, exchange or notify", async () => {
    const { engine, adapter, db } = track(setup());
    db.values.autoRedeem.user.enabled = false;
    engine.store.seed("80001", "user", [{ code: "PENDING" }]);
    await engine.tick(); await jest.advanceTimersByTimeAsync(25000);
    expect(adapter.accounts).not.toHaveBeenCalled();
    expect(adapter.exchange).not.toHaveBeenCalled();
    expect(adapter.notify).not.toHaveBeenCalled();
  });
  test("all new codes finish before one success card; next discovery never redeems again", async () => {
    const { engine, adapter } = track(setup());
    await engine.tick(); await jest.advanceTimersByTimeAsync(25000);
    expect(adapter.exchange).toHaveBeenCalledTimes(2);
    expect(adapter.notify).toHaveBeenCalledTimes(1);
    expect(adapter.notify.mock.calls[0][3].map((c: any) => c.code)).toEqual(["A", "B"]);
    await engine.tick(); await jest.advanceTimersByTimeAsync(20000);
    expect(adapter.exchange).toHaveBeenCalledTimes(2);
  });
  test("existing claimed history causes ZERO exchanges and ZERO success notifications", async () => {
    const { engine, adapter, db } = track(setup(["OLD1", "OLD2"]));
    db.values["80001.redeemedCodes"] = ["old1", "OLD2"];
    await engine.tick(); await jest.advanceTimersByTimeAsync(30000);
    expect(adapter.exchange).not.toHaveBeenCalled();
    expect(adapter.prepare).not.toHaveBeenCalled();
    expect(adapter.notify).not.toHaveBeenCalled();
    expect(engine.store.rows("80001").every(r => r.status === "already")).toBe(true);
  });
  test("old and new codes together produce one card containing only all new successes", async () => {
    const { engine, adapter, db } = track(setup(["OLD1", "NEW1", "OLD2", "NEW2"]));
    db.values["80001.redeemedCodes"] = ["OLD1", "OLD2"];
    await engine.tick(); await jest.advanceTimersByTimeAsync(5000);
    expect(adapter.notify).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(20000);
    expect(adapter.exchange.mock.calls.map((call: any) => call[1].code)).toEqual(["NEW1", "NEW2"]);
    expect(adapter.notify).toHaveBeenCalledTimes(1);
    expect(adapter.notify.mock.calls[0][3].map((c: any) => c.code)).toEqual(["NEW1", "NEW2"]);
  });
  test("the rejected legacy audit is cancelled on restart without notifications", async () => {
    const { engine, adapter } = track(setup(["OLD"]));
    engine.store.seed("80001", "user", [{ code: "OLD" }]);
    engine.store.sql.prepare("UPDATE auto_redeem_v2 SET status='legacy',notify=1").run();
    // A new database wrapper models a fresh process and recreates the store.
    const db = { ...adapter.db };
    const restarted = new RedeemEngine({ ...adapter, db }); engines.push(restarted);
    await restarted.tick(false); await jest.advanceTimersByTimeAsync(20000);
    expect(adapter.exchange).not.toHaveBeenCalled();
    expect(adapter.notify).not.toHaveBeenCalled();
  });
  test("already claimed is silent, invalid is distinct and can be rechecked", async () => {
    const { engine, adapter } = track(setup());
    adapter.exchange.mockResolvedValueOnce({ retcode: -2017 }).mockResolvedValueOnce({ retcode: -2006 });
    await engine.tick(); await jest.advanceTimersByTimeAsync(25000);
    expect(adapter.notify).not.toHaveBeenCalled();
    const rows = engine.store.rows("80001");
    expect(rows.map(r => r.status)).toEqual(["already", "invalid"]);
    expect(engine.store.claimed("80001", [])).toEqual(["A"]);
    expect(engine.store.due(Date.now() + 24 * 3600000).map(r => r.code)).toEqual(["B"]);
    engine.store.seed("80001", "user", [{ code: "A" }]);
    expect(engine.store.due(Date.now() + 24 * 3600000)).toEqual([]);
  });
  test("temporary failure retries in the round and keeps earlier successes", async () => {
    const { engine, adapter } = track(setup());
    adapter.exchange.mockResolvedValueOnce({ retcode: 0 }).mockResolvedValueOnce({ httpStatus: 0 }).mockResolvedValueOnce({ retcode: 0 });
    await engine.tick(); await jest.advanceTimersByTimeAsync(25000);
    expect(adapter.notify).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(30000);
    expect(adapter.notify).toHaveBeenCalledTimes(1);
    expect(adapter.notify.mock.calls[0][3]).toHaveLength(2);
  });
  test("exhausted retries notify successes, leave the failed code due in 15 minutes", async () => {
    const { engine, adapter } = track(setup());
    adapter.exchange.mockImplementation(async (_: any, c: any) => c.code === "A" ? { retcode: 0 } : { httpStatus: 0 });
    await engine.tick(); await jest.advanceTimersByTimeAsync(160000);
    expect(adapter.exchange).toHaveBeenCalledTimes(4);
    expect(adapter.notify).toHaveBeenCalledTimes(1);
    const b = engine.store.rows("80001").find(r => r.code === "B");
    expect(b.round).toBe(0); expect(b.next_at).toBeGreaterThan(Date.now());
    adapter.exchange.mockResolvedValue({ retcode: 0 });
    await jest.advanceTimersByTimeAsync(15 * 60000);
    expect(adapter.notify).toHaveBeenCalledTimes(2);
  });
  test("network ambiguity followed by official already claimed terminates silently", async () => {
    const { engine, adapter } = track(setup(["A"]));
    adapter.exchange.mockResolvedValueOnce({ httpStatus: 0 }).mockResolvedValueOnce({ retcode: -2018 });
    await engine.tick(); await jest.advanceTimersByTimeAsync(40000);
    expect(engine.store.rows("80001")[0].status).toBe("already");
    expect(adapter.notify).not.toHaveBeenCalled();
  });
  test("notification failure survives restart without exchanging again", async () => {
    const { engine, adapter } = track(setup(["A"]));
    adapter.notify.mockRejectedValueOnce(new Error("temporary Discord failure"));
    await engine.tick(); await jest.advanceTimersByTimeAsync(10000); engine.stop();
    const restarted = new RedeemEngine(adapter); engines.push(restarted);
    await restarted.tick(false); await jest.advanceTimersByTimeAsync(65000);
    expect(adapter.exchange).toHaveBeenCalledTimes(1);
    expect(adapter.notify).toHaveBeenCalledTimes(2);
    expect(adapter.notify.mock.calls[0][4]).toBe(adapter.notify.mock.calls[1][4]);
    expect(restarted.store.rows("80001")[0].notify).toBe(0);
  });
  test("authentication failure refreshes once and resumes with updated account", async () => {
    const { engine, adapter } = track(setup(["A"]));
    adapter.exchange.mockResolvedValueOnce({ retcode: -100 }).mockResolvedValueOnce({ retcode: 0 });
    await engine.tick(); await jest.advanceTimersByTimeAsync(25000);
    expect(adapter.prepare.mock.calls.filter((c: any) => c[2])).toHaveLength(1);
    expect(adapter.notify).toHaveBeenCalledTimes(1);
  });
  test("authentication failures retain earlier success; login recovery wakes blocked work", async () => {
    const { engine, adapter } = track(setup());
    adapter.exchange.mockResolvedValueOnce({ retcode: 0 }).mockResolvedValueOnce({ retcode: -100 });
    adapter.prepare.mockImplementation(async (_: any, __: any, force: boolean) => force ? null : { uid: "80001" });
    await engine.tick(); await jest.advanceTimersByTimeAsync(25000);
    expect(adapter.notify).toHaveBeenCalledTimes(1);
    expect(engine.store.rows("80001")[1].status).toBe("auth");
    adapter.authRecovered.mockResolvedValue(true);
    await engine.tick(false); await jest.advanceTimersByTimeAsync(15000);
    expect(adapter.notify).toHaveBeenCalledTimes(2);
  });
  test("unknown errors and long Retry-After never become claimed", () => {
    const { engine } = track(setup()); const s = engine.store;
    s.seed("u", "user", [{ code: "A" }, { code: "B" }]);
    s.record("u", { code: "A" }, { retcode: -999, message: "OK" }, true, Date.now());
    s.record("u", { code: "B" }, { httpStatus: 429, retryAfter: 3600000 }, true, Date.now());
    expect(s.claimed("u", [])).toEqual([]);
    expect(s.rows("u")[1].next_at).toBe(Date.now() + 3600000);
  });
  test("manual and auto results merge without reverting terminal results or auth data", async () => {
    const { db, engine } = track(setup());
    db.values["80001.redeemedCodes"] = ["OLD", "WRONGLY-INVALID"];
    const other = new RedeemStore(db);
    engine.store.seed("80001", "user", [{ code: "WRONGLY-INVALID" }]);
    other.record("80001", { code: "MANUAL" }, { retcode: 0 });
    engine.store.record("80001", { code: "AUTO" }, { retcode: 0 }, true);
    other.record("80001", { code: "AUTO" }, { retcode: -100 });
    expect(await recordedRedeemCodes(db, "80001")).toEqual(expect.arrayContaining(["OLD", "MANUAL", "AUTO"]));
    expect(await recordedRedeemCodes(db, "80001")).toContain("WRONGLY-INVALID");
    expect(engine.store.rows("80001").find(r => r.code === "AUTO").notify).toBe(1);
  });
  test("source failure preserves pending work, duplicate ticks do not duplicate attempts", async () => {
    const { engine, adapter } = track(setup());
    await engine.tick(); adapter.codes.mockRejectedValue(new Error("source down"));
    await expect(engine.tick()).rejects.toThrow("source down");
    await Promise.all([engine.tick(false), engine.tick(false)]);
    await jest.advanceTimersByTimeAsync(25000);
    expect(adapter.exchange).toHaveBeenCalledTimes(2);
  });
  test("disabled notification still redeems; disabled subscription stops future requests", async () => {
    const { engine, adapter, db } = track(setup());
    adapter.notify.mockResolvedValue("disabled");
    await engine.tick(); await jest.advanceTimersByTimeAsync(5000);
    delete db.values.autoRedeem.user;
    await jest.advanceTimersByTimeAsync(25000);
    expect(adapter.exchange).toHaveBeenCalledTimes(1);
  });
  test("batch of accounts progresses while one account cools down", async () => {
    const { engine, adapter, db } = track(setup(["A"]));
    db.values.autoRedeem = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`user${i}`, {}]));
    db.get.mockImplementation(async (key: string) => key === "autoRedeem" ? db.values.autoRedeem : key.startsWith("autoRedeem.") ? {} : null);
    adapter.accounts.mockImplementation(async (owner: string) => [{ uid: owner, cookie: "test" }]);
    adapter.prepare.mockImplementation(async (_: string, uid: string) => ({ uid }));
    const starts: number[] = [];
    adapter.exchange.mockImplementation(async (a: any) => { starts.push(Date.now()); return a.uid === "user0" ? { httpStatus: 0 } : { retcode: 0 }; });
    await engine.tick(); await jest.advanceTimersByTimeAsync(30000);
    expect(adapter.exchange.mock.calls.length).toBeGreaterThanOrEqual(20);
    expect(starts.every((t, i) => i === 0 || t - starts[i - 1]! >= 1000)).toBe(true);
    expect(adapter.notify.mock.calls.length).toBe(19);
  });
  test("unsubscribed owners cannot fill the due query and starve active users", async () => {
    const { engine, adapter } = track(setup(["NEW"]));
    for (let i = 0; i < 150; i++) engine.store.seed(`orphan${i}`, "disabled-user", [{ code: "OLD" }]);
    await engine.tick(); await jest.advanceTimersByTimeAsync(5000);
    expect(adapter.exchange).toHaveBeenCalledTimes(1);
    expect(adapter.notify).toHaveBeenCalledTimes(1);
  });
  test("slow requests respect the worker bound and per-account request gap", async () => {
    const { engine, adapter, db } = track(setup());
    db.values.autoRedeem = { user0: {}, user1: {}, user2: {}, user3: {} };
    db.get.mockImplementation(async (key: string) => key === "autoRedeem" ? db.values.autoRedeem : key.startsWith("autoRedeem.") ? {} : null);
    adapter.accounts.mockImplementation(async (owner: string) => [{ uid: owner, cookie: "test" }]);
    adapter.prepare.mockImplementation(async (_: string, uid: string) => ({ uid }));
    let busy = 0, maximum = 0;
    const starts = new Map<string, number[]>();
    adapter.exchange.mockImplementation(async (a: any) => {
      starts.set(a.uid, [...(starts.get(a.uid) || []), Date.now()]);
      busy++; maximum = Math.max(maximum, busy);
      await new Promise(resolve => setTimeout(resolve, 5000)); busy--;
      return { retcode: 0 };
    });
    await engine.tick(); await jest.advanceTimersByTimeAsync(60000);
    expect(maximum).toBe(3);
    expect(adapter.exchange).toHaveBeenCalledTimes(8);
    for (const values of starts.values()) expect(values[1]! - values[0]!).toBeGreaterThanOrEqual(10000);
    expect(adapter.notify).toHaveBeenCalledTimes(4);
  });
});

test("source validation and numeric official success", () => {
  expect(normalizeCodes([{ code: " a " }, { code: "A" }])).toEqual([{ code: "A", rewards: undefined, rewardIcons: undefined }]);
  expect(() => normalizeCodes({ codes: [] })).toThrow();
  expect(() => normalizeCodes([{ code: "x.y" }])).toThrow();
  expect(classifyRedeem({ retcode: -999, message: "OK" })).toBe("unknown");
  expect(classifyRedeem({ retcode: 0, httpStatus: 500 })).toBe("retry");
});
test("exchange has an abort signal and preserves HTTP/Retry-After", async () => {
  const original = global.fetch;
  global.fetch = jest.fn(async (_url: any, init: any) => {
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return { status: 429, headers: new Headers({ "retry-after": "120" }), json: async () => ({ retcode: -1048 }) } as Response;
  });
  try { expect(await exchangeCode("https://example.test", {})).toMatchObject({ httpStatus: 429, retryAfter: 120000 }); }
  finally { global.fetch = original; }
});
