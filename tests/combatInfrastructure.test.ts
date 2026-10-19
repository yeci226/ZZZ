import { EventEmitter } from "node:events";
import { CombatJobs } from "../src/utilities/zzz/combat/jobs.js";
import { CombatPlans, scenarioKey } from "../src/utilities/zzz/combat/plans.js";
import { testScenario } from "./fixtures/combat.js";
import { simulate } from "../src/utilities/zzz/combat/engine.js";
import { combatText } from "../src/utilities/zzz/combat/copy.js";
import { buildCombatEntry, handleCombatInteraction } from "../src/utilities/zzz/combat/workbench.js";

function memoryDB() {
  const values = new Map<string, any>();
  return {get: async (key: string) => structuredClone(values.get(key)), set: async (key: string, value: any) => {values.set(key, structuredClone(value));}, delete: async (key: string) => {values.delete(key);}};
}
class TestWorker extends EventEmitter { terminate = jest.fn(async () => 0); }
test("worker queue limits parallelism, checks owner, and cancels queued jobs without starting them", async () => {
  const workers: TestWorker[] = [];
  const jobs = new CombatJobs(1, 3, 1000, () => {const w = new TestWorker(); workers.push(w); return w as any;});
  const a = jobs.submit("1", testScenario()), b = jobs.submit("2", testScenario());
  const cancellation = expect(b.promise).rejects.toThrow("cancelled");
  expect(workers).toHaveLength(1); expect(() => jobs.submit("1", testScenario())).toThrow("already");
  b.cancel(); await cancellation;
  const result = simulate(testScenario()); workers[0].emit("message", {type: "result", result});
  await expect(a.promise).resolves.toEqual(result); expect(workers[0].terminate).toHaveBeenCalledTimes(1); expect(workers).toHaveLength(1);
});
test("worker crash, startup failure and timeout never return partial results", async () => {
  const w = new TestWorker(), jobs = new CombatJobs(1, 2, 20, () => w as any);
  const job = jobs.submit("1", testScenario()); w.emit("exit", 1); await expect(job.promise).rejects.toThrow("exited");
  const timeout = jobs.submit("2", testScenario()); await expect(timeout.promise).rejects.toThrow("timed out");
  const failed = new CombatJobs(1, 1, 100, () => {throw new Error("start failed");});
  await expect(failed.submit("3", testScenario()).promise).rejects.toThrow("start failed");
});
test("saved plans enforce owner and revision; cache keys match engine and export removes owner metadata", async () => {
  const store = new CombatPlans(memoryDB()), scenario = testScenario(); const plan = await store.create("123", scenario);
  await expect(store.get(plan.id, "124")).rejects.toThrow("unavailable");
  const first = store.update(plan.id, "123", 1, p => {p.name = "updated";});
  const stale = expect(store.update(plan.id, "123", 1, p => {p.name = "stale";})).rejects.toThrow("changed");
  await first; await stale;
  const exported = store.export(plan); expect(JSON.parse(exported).owner).toBeUndefined(); expect(store.parse(exported).scenario).toEqual(scenario);
  const result = simulate(scenario); expect(result.fingerprint).toBe(scenarioKey(scenario)); await store.cache(result); expect(await store.cached(scenario)).toEqual(result);
  scenario.seed++; expect(await store.cached(scenario)).toBeNull();
});
test("seven locales contain every workbench label and production entries remain hidden", async () => {
  for (const locale of ["tw", "cn", "en", "jp", "kr", "fr", "vi"]) expect(Object.values(combatText(locale)).every(s => typeof s === "string" && s.length > 0)).toBe(true);
  expect(buildCombatEntry("123", "tw", [{id: 1011}])).toEqual([]);
  const interaction = {customId: "zcombat:open:invented", locale: "zh-TW", user: {id: "123"}, reply: jest.fn()} as any;
  await handleCombatInteraction(interaction, memoryDB()); expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({content: combatText("tw").unverified}));
});
