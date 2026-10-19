import { calculateDamage, reconstructPanel, compareImportedPanel } from "../src/utilities/zzz/combat/damage.js";
import { simulate } from "../src/utilities/zzz/combat/engine.js";
import { importRotation, exportRotation, defaultRotation } from "../src/utilities/zzz/combat/rotation.js";
import { combatReleased, loadCombatRelease, releaseIssues } from "../src/utilities/zzz/combat/release.js";
import { testActor, testScenario } from "./fixtures/combat.js";

test("hand-computed defense and crit values match the event totals; end time is exclusive", () => {
  const s = testScenario(), actor = s.team[0], damage = actor.actions.basic.hits[0].damage;
  actor.panel.critRate = 50; actor.panel.critDmg = 100;
  expect(calculateDamage(actor, damage, s.enemy, false)).toMatchObject({nonCritical: 500, critical: 1000, expected: 750});
  actor.panel.critRate = 0;
  const r = simulate(s);
  expect(r.meanDamage).toBe(15_000); expect(r.meanDps).toBe(500);
  expect(r.trace.events.filter(e => e.kind === "damage")).toHaveLength(30);
  expect(r.trace.events.reduce((n, e) => n + (e.amount ?? 0), 0)).toBe(r.trace.total);
  expect(r.perSecond.reduce((n, v) => n + v, 0)).toBeCloseTo(r.meanDamage);
});
test("identical inputs are reproducible; hypothetical changes get new fingerprints", () => {
  const s = testScenario(); s.team[0].panel.critRate = 50;
  expect(simulate(s)).toEqual(simulate(s)); const key = simulate(s).fingerprint;
  s.team[0].panel.atk = 1100; expect(simulate(s).fingerprint).not.toBe(key);
});
test("buff expires before hits at the exact boundary and cannot compound percentages", () => {
  const s = testScenario(); s.loop = false;
  const a = s.team[0]; a.actions.basic.buffs = [{id: "atk", target: "self", stat: "atk", value: 100, mode: "percent", durationMs: 1000, maxStacks: 1, stacking: "refresh"}];
  a.actions.basic.hits = [0, 1000].map(atMs => ({...a.actions.basic.hits[0], atMs}));
  const damage = simulate(s).trace.events.filter(e => e.kind === "damage");
  expect(damage.map(e => e.amount)).toEqual([1000, 500]);
});
test("resource and actor legality is enforced; waiting and explicit switching permit actions", () => {
  const s = testScenario(); s.team[0].actions.basic.cost = {energy: 5};
  expect(() => simulate(s)).toThrow("step 1");
  s.rotation.unshift({type: "wait", ms: 5000}); s.loop = false;
  expect(simulate(s).meanDamage).toBe(500);
  s.team.push(testActor("test_b")); s.rotation = [{type: "action", actor: "test_b", action: "basic"}];
  expect(() => simulate(s)).toThrow("active actor");
  s.rotation.unshift({type: "switch", actor: "test_b"}); expect(simulate(s).trace.events.find(e => e.kind === "damage")?.atMs).toBe(100);
});
test("stun begins after the triggering hit and recovers before boundary hits", () => {
  const s = testScenario(); s.loop = false; const a = s.team[0];
  a.actions.basic.durationMs = 4000;
  a.actions.basic.hits = [0, 1000, 3000].map((atMs, i) => ({...a.actions.basic.hits[0], atMs, daze: i === 0 ? 100 : 0}));
  expect(simulate(s).trace.events.filter(e => e.kind === "damage").map(e => e.amount)).toEqual([500, 750, 500]);
});
test("clock pauses use authored combat offsets, while bangboo acts independently", () => {
  const s = testScenario(); s.loop = false; const a = s.team[0];
  a.actions.basic.durationMs = 2000; a.actions.basic.clockPauses = [{startMs: 500, durationMs: 1000}]; a.actions.basic.hits[0].atMs = 2000;
  const b = testActor("boo"); b.kind = "bangboo"; b.actions.basic.durationMs = 5000; s.bangboo = b;
  const r = simulate(s); expect(r.trace.events.find(e => e.actor === a.id && e.kind === "damage")?.atMs).toBe(1000);
  expect(r.byActor.boo).toBe(3000);
});
test("enemy events enable dodge/assist conditions only during their authored windows", () => {
  const s = testScenario(); s.loop = false; s.team[0].actions.basic.requires = {incoming: true};
  expect(() => simulate(s)).toThrow(); s.incoming = [{atMs: 0, windowMs: 100}]; expect(simulate(s).meanDamage).toBe(500);
});
test("anomaly and disorder attribute damage to contributing actors and invalidate old ticks", () => {
  const s = testScenario(); s.loop = false;
  const spec = {kind: "anomaly" as const, element: "fire" as const, basis: "atk" as const, multiplier: 1, canCrit: false, domainMultiplier: 1};
  s.enemy.anomaly.fire = {threshold: 100, durationMs: 5000, tickMs: 1000, trigger: "periodic", maxProcs: 5, disorder: {...spec, multiplier: 1}};
  s.enemy.anomaly.ice = {...s.enemy.anomaly.fire, trigger: "immediate", maxProcs: 1, disorder: {...spec, element: "ice"}};
  const a = s.team[0]; a.actions.basic.durationMs = 3000;
  a.actions.basic.hits = [{...a.actions.basic.hits[0], anomaly: {element: "fire", buildup: 100, damage: spec}},
    {...a.actions.basic.hits[0], atMs: 1500, anomaly: {element: "ice", buildup: 100, damage: {...spec, element: "ice"}}}];
  const r = simulate(s);
  expect(r.trace.events.some(e => e.kind === "disorder")).toBe(true);
  expect(r.trace.events.filter(e => e.action === "anomaly-fire").map(e => e.atMs)).toEqual([0, 1000]);
  expect(Object.values(r.byActor).reduce((n, v) => n + v, 0)).toBeCloseTo(r.meanDamage);
});
test("no busy loop, oversized repeat, unknown action or unsupported model is accepted", () => {
  const s = testScenario(); s.rotation = [{type: "action", actor: "test_a", action: "basic", when: {stunned: true}}];
  expect(() => simulate(s)).toThrow("advance time");
  expect(() => importRotation(JSON.stringify({schemaVersion: 1, steps: [{type: "action", actor: "test_a", action: "unknown"}]}), s.team)).toThrow();
  s.team[0].provenance.unsupported = ["timing"]; expect(() => simulate(s)).toThrow("Unverified");
});
test("panel reconstruction never reuses imported final values; import mismatches are visible", () => {
  const a = testActor(); const p = reconstructPanel({base: a.panel, percentages: {atk: 50}, additions: {atk: 100}});
  expect(p.atk).toBe(1600); expect(compareImportedPanel(p, {atk: 1700})).toEqual(["atk"]);
  const steps = defaultRotation([a]); expect(importRotation(exportRotation(steps), [a])).toEqual(steps);
});
test("element bonuses apply only to matching hits; regen buffs integrate across their exact expiry", () => {
  const s = testScenario(); s.loop = false; const a = s.team[0]; a.elementBonuses = {fire: 100};
  expect(calculateDamage(a, a.actions.basic.hits[0].damage, s.enemy, false).nonCritical).toBe(500);
  expect(calculateDamage(a, {...a.actions.basic.hits[0].damage, element: "fire"}, s.enemy, false).nonCritical).toBe(1000);
  a.resources.energy.regenStat = "energyRegen";
  a.actions.buff = {...a.actions.basic, id: "buff", buffs: [{id: "regen", target: "self", stat: "energyRegen", value: 1, mode: "flat", durationMs: 500, maxStacks: 1, stacking: "refresh"}], hits: []};
  a.actions.basic.cost = {energy: 1.5};
  s.rotation = [{type: "action", actor: a.id, action: "buff"}, {type: "action", actor: a.id, action: "basic"}];
  expect(simulate(s).meanDamage).toBe(500);
});
test("unfinished actual game data cannot enable the joint production release", () => {
  const release = loadCombatRelease(); expect(releaseIssues(release).length).toBeGreaterThan(0);
  expect(combatReleased()).toBe(false); release.enabled = true;
  expect(releaseIssues(release)).toContain("Unverified engine:timing");
});
