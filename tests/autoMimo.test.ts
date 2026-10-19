import Database from "better-sqlite3";
import { MimoApi, MimoApiError, chooseOffer, type MimoOffer } from "../src/utilities/mimo/api";
import { MimoStore, defaultMimoConfig } from "../src/utilities/mimo/store";
import { MimoEngine, type MimoAdapter } from "../src/utilities/mimo/engine";
import { saveSettingGroup } from "../src/utilities/settings/patch";
import { identifyReward, parseRewardText, rewardName } from "../src/utilities/mimo/rewards";
const offer = (kind = "polychrome", patch: Partial<MimoOffer> = {}): MimoOffer => ({ award_id: kind === "polychrome" ? 1 : 2, name: kind === "polychrome" ? "Polychrome ×60" : "Denny ×20000", icon: "", cost: 100, stock: 10, status: 1, user_count: 0, kind: kind as any, reward: { name: kind === "polychrome" ? "Polychrome" : "Denny", kind, quantity: 60 }, ...patch });
function environment() {
  const sql = new Database(":memory:"), store = new MimoStore(sql);
  const config = { ...defaultMimoConfig("u", "h", "1300000001"), enabled: true };
  store.putConfig(config);
  let bought = false;
  const api = {
    game: jest.fn(async () => ({ game_id: 8, version_id: 1, point: bought ? 0 : 100, start_time: "0", end_time: "9999999999" })),
    tasks: jest.fn(async () => [] as any[]), shop: jest.fn(async () => [offer("polychrome", { status: bought ? 3 : 1 })]),
    finish: jest.fn(async () => {}), claim: jest.fn(async () => {}), history: jest.fn(async () => [] as any[]),
    buy: jest.fn(async () => { bought = true; return "PRIVATE123"; }),
  };
  const adapter: MimoAdapter = { account: jest.fn(async () => ({ cookie: "not-a-real-cookie", nickname: "test", uid: config.uid })), api: () => api,
    refresh: jest.fn(async () => false), redeem: jest.fn(async () => "success"), locale: async () => "tw", notify: jest.fn(async () => {}) };
  return { sql, store, config, api, adapter, engine: new MimoEngine(store, adapter) };
}
describe("Mimo priorities", () => {
  test("reserves for higher priority even when a cheap lower reward is affordable", () => {
    expect(chooseOffer(["polychrome", "dennies"], [offer(), offer("dennies", { cost: 1 })], 50)).toEqual({ reason: "waiting" });
    expect(chooseOffer(["polychrome", "dennies"], [offer("polychrome", { status: 4, stock: 0 }), offer("dennies")], 100)).toEqual({ reason: "waiting" });
  });
  test("moves down only after personal quota is reached and excludes unselected rewards", () => {
    expect(chooseOffer(["polychrome", "dennies"], [offer("polychrome", { status: 3 }), offer("dennies")], 100).offer?.kind).toBe("dennies");
    expect(chooseOffer(["polychrome"], [offer("dennies")], 100).offer).toBeUndefined();
  });
  test("prefers value per point without inventing quantities", () => {
    const value = offer("polychrome", { award_id: 3, cost: 100, reward: { name: "Polychrome", quantity: 120 } });
    expect(chooseOffer(["polychrome"], [offer(), value], 100).offer?.award_id).toBe(3);
    expect(parseRewardText("Unknown reward").quantity).toBeUndefined();
    expect(parseRewardText("20,000 Denny").quantity).toBe(20000);
    expect(rewardName("polychrome", "jp")).toBe("ポリクローム");
    expect(identifyReward("菲林 ×60")).toBe("polychrome");
  });
});
describe("Mimo API validation", () => {
  const fetcher = (data: any) => jest.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => data })) as unknown as typeof fetch;
  test("accepts real task fields and rejects old status conventions", async () => {
    await expect(new MimoApi("secret", fetcher({ retcode: 0, data: { task_list: [{ task_id: 1, task_name: "visit", task_type: 2, status: 2 }] } }), false).tasks(1)).resolves.toHaveLength(1);
    await expect(new MimoApi("secret", fetcher({ retcode: 0, data: { task_list: [{ task_id: 1, task_type: 2, status: 0 }] } }), false).tasks(1)).rejects.toThrow("format");
    await expect(new MimoApi("secret", fetcher({ retcode: 0, data: { list: [] } }), false).tasks(1)).rejects.toThrow("format");
  });
  test("does not treat unauthenticated empty lists as success", async () => {
    await expect(new MimoApi("secret", fetcher({ retcode: 0, data: { list: [], is_login: false } }), false).game()).rejects.toThrow("auth");
    await expect(new MimoApi("secret", fetcher({ retcode: -100, message: "sensitive", data: null }), false).tasks(1)).rejects.toThrow("auth");
  });
  test("rejects HTML and honors Retry-After", async () => {
    const html = jest.fn(async () => ({ ok: true, json: async () => { throw new Error("private HTML"); } })) as any;
    await expect(new MimoApi("secret", html, false).tasks(1)).rejects.toThrow("format");
    const limited = jest.fn(async () => ({ status: 429, headers: new Headers({ "retry-after": "60" }) })) as any;
    await expect(new MimoApi("secret", limited, false).tasks(1)).rejects.toMatchObject({ kind: "rate", retryAfter: 60000 });
  });
});
describe("Mimo durable workflow", () => {
  test("persists private code before redeeming and never puts it in result payload", async () => {
    const e = environment();
    (e.adapter.redeem as jest.Mock).mockImplementation(async () => { expect(e.store.purchases("h")[0]).toMatchObject({ code: "PRIVATE123", status: "pending" }); return "success"; });
    await e.engine.tick();
    expect(e.api.buy).toHaveBeenCalledTimes(1);
    expect(e.store.purchases("h")[0].status).toBe("success");
    expect(JSON.stringify(e.store.results("h"))).not.toContain("PRIVATE123");
    e.store.state("h", { nextAt: 0 }); await e.engine.tick(); expect(e.api.buy).toHaveBeenCalledTimes(1); e.sql.close();
  });
  test("finishes only safe task types, then claims all completed tasks", async () => {
    const e = environment(); e.api.shop.mockResolvedValue([]);
    let finished = false;
    e.api.tasks.mockImplementation(async () => [
      { task_id: 1, task_type: 2, status: finished ? 1 : 2 }, { task_id: 2, task_type: 16, status: 2 },
      { task_id: 3, task_type: 3, status: 2 }, { task_id: 4, task_type: 999, status: 2 }, { task_id: 5, task_type: 16, status: 1 }, { task_id: 6, task_type: 1, status: 3 },
    ]);
    e.api.finish.mockImplementation(async () => { finished = true; });
    await e.engine.tick(); expect(e.api.finish.mock.calls).toEqual([[1, 1]]); expect(e.api.claim.mock.calls).toEqual([[1, 1], [1, 5]]); e.sql.close();
  });
  test("unknown purchase result blocks new purchases until reconciled", async () => {
    const e = environment(); e.api.buy.mockRejectedValue(new MimoApiError("network"));
    await e.engine.tick(); expect(e.store.get("h")?.reason).toBe("uncertain");
    e.store.state("h", { nextAt: 0 }); await e.engine.tick(); expect(e.api.buy).toHaveBeenCalledTimes(1);
    e.api.history.mockResolvedValue([{ exchange_code: "RECOVERED", desc: "Polychrome ×60", created_at: Math.ceil(Date.now() / 1000), point_type: 4, point: 100 }]);
    e.api.shop.mockResolvedValue([offer("polychrome", { status: 3 })]); e.store.state("h", { nextAt: 0 });
    await e.engine.tick(); expect(e.store.purchases("h")[0]).toMatchObject({ code: "RECOVERED", status: "success" }); e.sql.close();
  });
  test("pending redemption resumes after restart without buying again", async () => {
    const e = environment(); (e.adapter.redeem as jest.Mock).mockResolvedValue("retry");
    await e.engine.tick(); const p = e.store.purchases("h")[0]; expect(p.status).toBe("pending");
    p.nextAt = 0; e.store.purchase(p); e.store.state("h", { nextAt: 0 }); (e.adapter.redeem as jest.Mock).mockResolvedValue("success");
    await new MimoEngine(e.store, e.adapter).tick(); expect(e.api.buy).toHaveBeenCalledTimes(1); expect(e.store.purchases("h")[0].status).toBe("success"); e.sql.close();
  });
  test("authentication suspends only the affected subscription", async () => {
    const e = environment(); e.api.game.mockRejectedValue(new MimoApiError("auth")); await e.engine.tick();
    expect(e.store.get("h")).toMatchObject({ enabled: false, reason: "auth" }); expect(e.api.buy).not.toHaveBeenCalled(); e.sql.close();
  });
  test("conflicts and concurrent leases cannot overwrite or double-spend", () => {
    const e = environment(); expect(e.store.lease("h")).toBe(true); expect(e.store.lease("h")).toBe(false);
    const first = e.store.save({ ...e.config, order: ["dennies"] }, ["order"], e.config);
    expect(() => e.store.save({ ...e.config, order: ["polychrome"] }, ["order"], e.config)).toThrow("settings_conflict");
    expect(e.store.save({ ...e.config, tag: true }, ["tag"], e.config).order).toEqual(first.order);
    expect(() => e.store.save({ ...e.config, owner: "other" }, ["uid"], e.config)).toThrow("mimo_owned"); e.sql.close();
  });
  test("saved disabled subscription cannot buy, and missing binding stops it", async () => {
    const e = environment(); e.store.state("h", { enabled: false }); await e.engine.tick(); expect(e.api.game).not.toHaveBeenCalled();
    e.store.state("h", { enabled: true }); (e.adapter.account as jest.Mock).mockResolvedValue(null); await e.engine.tick(); expect(e.api.buy).not.toHaveBeenCalled(); e.sql.close();
  });
});
test("single-item settings merge unrelated changes and reject same-field conflict", async () => {
  let current = { a: 1, b: 2 };
  const db = { get: async () => structuredClone(current), set: async (_k: string, v: any) => { current = v; } };
  await saveSettingGroup(db, "key", { a: 1, b: 0 }, { a: 3, b: 0 }, ["a"], v => v as any);
  expect(current).toEqual({ a: 3, b: 2 });
  await expect(saveSettingGroup(db, "key", { a: 1, b: 0 }, { a: 4, b: 0 }, ["a"], v => v as any)).rejects.toThrow("settings_conflict");
});

test("one Mimo purchase preserves every reward in a bundle", async () => {
  const e = environment();
  const rewards = [{ kind: "polychrome", name: "Polychrome", quantity: 60 }, { kind: "dennies", name: "Denny", quantity: 20000 }];
  e.api.shop.mockImplementation(async () => [offer("polychrome", { status: e.api.buy.mock.calls.length ? 3 : 1, rewards })]);
  await e.engine.tick();
  expect(e.api.buy).toHaveBeenCalledTimes(1);
  const result = e.store.results("h")[0].payload.accounts[0];
  expect(result.codes).toHaveLength(1);
  expect(result.codes[0].rewardDetails).toEqual(rewards);
  expect(result.codes[0].status).toBe("success");
  e.sql.close();
});
