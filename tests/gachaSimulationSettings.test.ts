import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { defaultSimulationRules, effectiveProbabilities, newSimulationPreferences, simulationRulesId, validateSimulationRules } from "../src/utilities/zzz/gachaSimulationRules.js";
import { EMPTY_SIMULATION_STATE, simulatePulls, type SimulationBanner } from "../src/utilities/zzz/gachaSimulationEngine.js";
import { GachaSimulationStore } from "../src/utilities/zzz/gachaSimulationStore.js";
import { configuredSimulationBanner, getSimulationCatalog, signalSelectionCandidates } from "../src/utilities/zzz/gachaSimulationCatalog.js";
import { analyzeSimulation, firstSignalCurves, guaranteedPlanBudget, remainingResources, resourceBudget, runBulkTrial, runResourcePlan, type ResourcePlan } from "../src/utilities/zzz/gachaSimulationAnalysis.js";

const banner: SimulationBanner = { id: "test", name: "測試", version: "3.2", pool: "character", startAt: "2026-09-01", endAt: "2026-10-01", featuredS: "up", featuredA: ["a"], standardS: ["off"], agentsA: ["a", "oa"], weaponsA: ["w"], weaponsB: ["b"] };
function custom(pool: "character" | "weapon" = "character") { const r = defaultSimulationRules(pool); r.mode = "custom"; r.s.base = 1; r.s.softStart = null; r.s.step = 0; r.a.base = 0; r.b = 0; return r; }
function plan(tapes = 3): ResourcePlan { return { seed: 42, rounds: 1000, resources: { monochrome: 0, polychrome: 0, tapes, reserve: 0 }, stages: [{ banner, rules: { ...custom(), s: { ...custom().s, up: 0 } }, target: 1, sinceS: 0, guaranteed: false }, { banner: { ...banner, id: "weapon", pool: "weapon", featuredS: "wu", standardS: ["wo"] }, rules: { ...custom("weapon"), s: { ...custom("weapon").s, up: 1 } }, target: 1, sinceS: 0, guaranteed: false }] }; }

describe("custom rules and progress isolation", () => {
  let dir: string, store: GachaSimulationStore;
  beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "gacha-settings-")); store = new GachaSimulationStore(path.join(dir, "test.sqlite")); });
  afterEach(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  it("normalizes numeric rules and rejects invalid rate sums and soft/hard bounds", () => {
    const r = custom();
    expect(simulationRulesId({ b: r.b, a: r.a, s: r.s, mode: r.mode, pool: r.pool, schemaVersion: 1 })).toBe(simulationRulesId(r));
    expect(() => validateSimulationRules({ ...r, b: .1 })).toThrow("100%");
    expect(() => validateSimulationRules({ ...r, s: { ...r.s, hard: 0 } })).toThrow("保底");
    expect(() => validateSimulationRules({ ...r, s: { ...r.s, softStart: 91, step: .1 } })).toThrow("軟保底");
    expect(() => validateSimulationRules({ ...r, mode: "game" })).toThrow("預設");
  });
  it("supports no A guarantee, gives S precedence, and records actual hazard", () => {
    const r = defaultSimulationRules("character"); r.mode = "custom"; r.a.hard = null;
    expect(simulatePulls(banner, EMPTY_SIMULATION_STATE, 10, () => .99, r).pulls.map(p => p.rank).join("")).toBe("BBBBBBBBBB");
    const p = effectiveProbabilities(defaultSimulationRules("character"), { sinceS: 89, sinceAOrHigher: 9 });
    expect(p).toEqual({ s: 1, a: 0, b: 0 });
    expect(simulatePulls(banner, { ...EMPTY_SIMULATION_STATE, sinceS: 73 }, 1, () => .99).pulls[0].probabilities?.s).toBeCloseTo(.066);
  });
  it("keeps legacy game state/inventory and custom versions separate, pinning continuation", () => {
    const original = store.draw("u", "game", banner, 1, () => .99, 0);
    const forced = custom(); forced.s.up = 1;
    const v = store.saveRules("u", forced);
    expect(store.saveRules("u", forced).version).toBe(v.version);
    const session = store.draw("u", "custom", banner, 1, () => 0, 2000, { rules: v.rules, ruleVersion: v.version, animation: false });
    expect(store.state("u", "character").total).toBe(1);
    expect(store.state("u", "character", v.id).total).toBe(1);
    expect(store.state("u", "weapon").total).toBe(0);
    store.finish(session.id);
    const prefs = store.preferences("u"); prefs.active.character = "game"; store.savePreferences("u", prefs);
    const next = store.continueDraw(session.id, "u", "next", 1, { applicationId: "app", channelId: "channel", guildId: "guild", attachmentLimit: 1e7, completeAt: 4000 }, () => 0, 4000);
    expect(next?.rulesId).toBe(v.id); expect(next?.animation).toBe(false);
    expect(next?.pulls[0].rank).toBe("S"); expect(next?.pulls[0].isNew).toBe(false);
    expect(store.state("u", "character").total).toBe(1);
    expect(store.continueDraw(session.id, "u", "again", 10, { applicationId: "app", channelId: "channel", guildId: "guild", attachmentLimit: 1e7, completeAt: Date.now() })).toBeUndefined();
    expect(analyzeSimulation(store.history("u"), { pool: "character", rulesId: "game" }).total).toBe(original.pulls.length);
    expect(() => store.rules("other", "character", v.id)).toThrow();
  });
  it("enforces ownership, one job per user, and two jobs globally with cancellation", () => {
    const panel = store.createPanel("u", "resource", {});
    expect(() => store.panel(panel.id, "other")).toThrow();
    store.claimJob(panel.id, "u"); expect(() => store.claimJob("j2", "u")).toThrow();
    store.claimJob("j2", "v"); expect(() => store.claimJob("j3", "w")).toThrow();
    store.finishJob(panel.id, "cancelled"); store.claimJob("j3", "w");
    store.finishJob(panel.id, "complete"); expect(store.jobStatus(panel.id)).toBe("cancelled");
  });
});

describe("candidate eligibility", () => {
  it("allows six of nine from 3.1, but preserves historical banners and validates A UP", () => {
    const catalog = getSimulationCatalog(), latest = catalog.banners.find(b => b.pool === "character" && b.version === "3.2")!;
    const candidates = signalSelectionCandidates(latest, catalog), prefs = newSimulationPreferences();
    expect(candidates.s).toEqual(expect.arrayContaining(["1071", "1221", "1241"]));
    prefs.sCandidates.character = candidates.s.slice(-6);
    expect(configuredSimulationBanner(latest, prefs, catalog).standardS).toEqual(candidates.s.slice(-6));
    const historical = catalog.banners.find(b => b.pool === "character" && b.version === "1.0")!;
    expect(configuredSimulationBanner(historical, prefs, catalog).standardS).toEqual(historical.standardS);
    prefs.sCandidates.character = ["1071"];
    expect(() => configuredSimulationBanner(latest, prefs, catalog)).toThrow();
    prefs.sCandidates.character = candidates.s.slice(0, 6); prefs.aUp[latest.id] = ["missing", "missing"];
    expect(() => configuredSimulationBanner(latest, prefs, catalog)).toThrow();
  });
});

describe("independent resource estimates", () => {
  it("converts exactly and spends tapes first while preserving reserved monochrome", () => {
    const r = { monochrome: 170, polychrome: 149, tapes: 1, reserve: 10 };
    expect(resourceBudget(r)).toEqual({ pulls: 2, remainder: 149 });
    expect(remainingResources(r, 2)).toEqual({ monochrome: 159, polychrome: 0, tapes: 0, reserve: 10 });
    expect(resourceBudget({ ...r, monochrome: 10, polychrome: 159, tapes: 0 }).pulls).toBe(0);
    expect(resourceBudget({ ...r, monochrome: 10, polychrome: 160, tapes: 0 }).pulls).toBe(1);
    expect(() => resourceBudget({ ...r, reserve: 171 })).toThrow();
  });
  it("uses one shared budget, switches only when target met, and resets pity per pool", () => {
    const p = plan(3), original = JSON.stringify(p), result = runResourcePlan(p).scenarios[0];
    expect(result.successes.both).toBe(1000); expect(result.guaranteeBudget).toBe(3);
    expect(result.example?.events.map(e => [e.pool, e.up, e.pity])).toEqual([["character", false, 1], ["character", true, 1], ["weapon", true, 1]]);
    expect(JSON.stringify(p)).toBe(original);
    const short = runResourcePlan(plan(2)).scenarios[0];
    expect(short.successes.character).toBe(1000); expect(short.successes.weapon).toBe(0);
    expect(short.example?.remaining.tapes).toBe(0);
    const reverse = plan(2); reverse.stages.reverse();
    expect(runResourcePlan(reverse).scenarios[0].successes.weaponOnly).toBe(1000);
  });
  it("evaluates unknown guarantees separately and is deterministic with saved seeds", () => {
    const p = plan(2); p.stages.forEach(s => s.guaranteed = null);
    const result = runResourcePlan(p);
    expect(result.scenarios).toHaveLength(4);
    expect(result.scenarios.map(s => s.successes.both)).toEqual([0, 0, 1000, 1000]);
    expect(runResourcePlan(p)).toEqual(result);
  });
  it("handles skipped targets and impossible UP without inventing guaranteed success", () => {
    const p = plan(1); p.stages[0].target = 0;
    const r = runResourcePlan(p).scenarios[0]; expect(r.curve[0].character).toBe(1); expect(r.successes.both).toBe(1000);
    p.stages[0].target = 1; p.stages[0].rules.s.guarantee = false;
    expect(guaranteedPlanBudget(p.stages)).toBeNull();
    const impossible = runResourcePlan(p).scenarios[0]; expect(impossible.successes.both).toBe(0); expect(impossible.example?.events).toHaveLength(1);
  });
  it("computes conditional and cumulative curves including a lost first S", () => {
    const r = custom(); r.s.base = .5; r.b = .5; r.s.hard = null; r.s.up = .5;
    const points = firstSignalCurves(r, EMPTY_SIMULATION_STATE, 2);
    expect(points[0]).toEqual({ x: 1, hazard: .5, s: .5, up: .25 });
    expect(points[1].s).toBe(.75); expect(points[1].up).toBe(.5);
    expect(firstSignalCurves(r, { sinceS: 0, guaranteedS: true }, 1)[0].up).toBe(.5);
  });
  it("bulk trials do not mutate initial progress and exclude guaranteed wins", () => {
    const p = plan(), initial = { ...EMPTY_SIMULATION_STATE };
    const result = runBulkTrial({ banner, rules: p.stages[0].rules, initial, count: 1000, seed: 42 });
    expect(result.counts.S).toBe(1000); expect(result.up).toBe(500); expect(result.small).toBe(500); expect(result.won).toBe(0);
    expect(initial).toEqual(EMPTY_SIMULATION_STATE);
  });
});
