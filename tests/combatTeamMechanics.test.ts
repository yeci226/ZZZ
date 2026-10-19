import { simulate } from "../src/utilities/zzz/combat/engine.js";
import { calculateDamage } from "../src/utilities/zzz/combat/damage.js";
import {
  loadReferenceTeam,
  skillMultiplier,
} from "../src/utilities/zzz/combat/referenceSkills.js";
import {
  aliceEntryBuff,
  alicePhysicalAnomalyEffect,
  burniceAfterburnDamage,
  remielleEntryBuff,
  RemielleVoidflares,
} from "../src/utilities/zzz/combat/referenceTeamMechanics.js";
import { testActor, testScenario } from "./fixtures/combat.js";
import type { DamageSpec } from "../src/utilities/zzz/combat/types.js";

test("official reference tables distinguish skill and core levels without implying verified timing", () => {
  const refs = loadReferenceTeam();
  expect(refs.map((r) => r.id)).toEqual(["1581", "1401", "1171"]);
  expect(
    refs.every((r) => !r.runtimeReady && /^[a-f0-9]{64}$/.test(r.sha256)),
  ).toBe(true);
  expect(
    skillMultiplier(refs[0], "普通攻擊：垂虹", "傷害倍率", 12),
  ).toBeCloseTo(3.908);
  expect(
    skillMultiplier(
      refs[1],
      "核心被動：劍心雙虹",
      "愛麗絲觸發[強擊]時，物理異常積蓄效率提升",
      7,
    ),
  ).toBe(0.25);
  expect(burniceAfterburnDamage(refs[2], 7, true).multiplier).toBe(3.5);
  expect(() =>
    skillMultiplier(refs[0], "普通攻擊：垂虹", "獲得浮輝", 12),
  ).toThrow("unit");
});
test("sourced entry passives use initial stats, thresholds and caps exactly once", () => {
  expect(remielleEntryBuff(3988, 3).value).toBeCloseTo(1595.2);
  expect(remielleEntryBuff(5000, 3).value).toBe(1600);
  expect(remielleEntryBuff(3000, 2).value).toBe(360);
  expect(aliceEntryBuff(139).value).toBe(0);
  expect(aliceEntryBuff(170).value).toBe(48);
  const s = testScenario();
  s.team.push(testActor("support"));
  s.team[1].initialBuffs = [remielleEntryBuff(1000, 3)];
  expect(simulate(s).meanDamage).toBe(21_000);
});
test("afterburn's AP bonus is evaluated per hit and caps independently from other bonuses", () => {
  const s = testScenario(),
    a = s.team[0],
    spec = burniceAfterburnDamage(loadReferenceTeam()[2], 7, false);
  a.panel.anomalyProficiency = 200;
  a.panel.damageBonus = 50;
  expect(calculateDamage(a, spec, s.enemy, false).nonCritical).toBeCloseTo(
    1000 * 3.5 * 1.7 * 0.5,
  );
  a.panel.anomalyProficiency = 400;
  expect(calculateDamage(a, spec, s.enemy, false).bonus).toBeCloseTo(1.8);
});
test("ally hit passives respect cooldown, costs, off-field state and cannot self-chain", () => {
  const s = testScenario(),
    support = testActor("support");
  s.team.push(support);
  support.resources.heat = { initial: 24, max: 100, regenPerSecond: 0 };
  support.actions.afterburn = {
    ...support.actions.basic,
    id: "afterburn",
    execution: "trigger",
    cost: { heat: 8 },
  };
  support.triggers = [
    {
      id: "afterburn",
      event: "hit",
      source: "ally",
      offFieldOnly: true,
      cooldownMs: 1500,
      action: "afterburn",
    },
  ];
  const r = simulate(s);
  expect(
    r.trace.events
      .filter((e) => e.kind === "damage" && e.actor === support.id)
      .map((e) => e.atMs),
  ).toEqual([0, 2000, 4000]);
  expect(r.byActor.support).toBe(1500);
  expect(r.byActor.test_a).toBe(15_000);
  s.rotation = [
    { type: "switch", actor: support.id },
    { type: "action", actor: support.id, action: "afterburn" },
  ];
  expect(() => simulate(s)).toThrow("passive-only");
});
test("overfilling an anomaly gauge cannot dilute earlier contributors and weighted breakdowns reconcile", () => {
  const s = testScenario();
  s.loop = false;
  const a = s.team[0],
    b = testActor("test_b");
  s.team.push(b);
  b.panel.atk = 2000;
  const anomaly: DamageSpec = {
    kind: "anomaly",
    element: "physical",
    basis: "atk",
    multiplier: 1,
    canCrit: false,
    domainMultiplier: 1,
  };
  s.enemy.anomaly.physical = {
    threshold: 100,
    durationMs: 10_000,
    tickMs: 1000,
    maxProcs: 1,
    trigger: "immediate",
    disorder: anomaly,
  };
  a.actions.basic.hits[0].anomaly = {
    element: "physical",
    buildup: 90,
    damage: anomaly,
  };
  b.actions.basic.hits[0].anomaly = {
    element: "physical",
    buildup: 100,
    damage: anomaly,
  };
  s.rotation = [
    { type: "action", actor: a.id, action: "basic" },
    { type: "switch", actor: b.id },
    { type: "action", actor: b.id, action: "basic" },
  ];
  const events = simulate(s).trace.events.filter(
    (e) => e.action === "anomaly-physical",
  );
  expect(events.map((e) => e.amount)).toEqual([450, 100]);
  for (const event of events)
    expect(event.amount).toBeCloseTo(
      event.breakdown!.nonCritical * event.weight!,
    );
});
test("forced physical anomaly can disorder physical while preserving natural buildup progress", () => {
  const s = testScenario();
  s.loop = false;
  const a = s.team[0];
  const anomaly: DamageSpec = {
    kind: "anomaly",
    element: "physical",
    basis: "atk",
    multiplier: 1,
    canCrit: false,
    domainMultiplier: 1,
  };
  s.enemy.anomaly.physical = {
    threshold: 100,
    durationMs: 10_000,
    tickMs: 1000,
    maxProcs: 1,
    trigger: "immediate",
    disorder: anomaly,
  };
  const base = a.actions.basic.hits[0];
  a.actions.basic.durationMs = 4000;
  a.actions.basic.hits = [
    {
      ...base,
      atMs: 0,
      anomaly: { element: "physical", buildup: 100, damage: anomaly },
    },
    {
      ...base,
      atMs: 1000,
      anomaly: { element: "physical", buildup: 40, damage: anomaly },
    },
    {
      ...base,
      atMs: 2000,
      forcedAnomaly: { element: "physical", key: "polarized", damage: anomaly },
    },
    {
      ...base,
      atMs: 3000,
      anomaly: { element: "physical", buildup: 60, damage: anomaly },
    },
  ];
  const events = simulate(s).trace.events;
  expect(
    events.filter((e) => e.kind === "anomaly").map((e) => [e.atMs, e.detail]),
  ).toEqual([
    [0, "physical"],
    [2000, "polarized"],
    [3000, "physical"],
  ]);
  expect(events.filter((e) => e.kind === "disorder")).toHaveLength(2);
});
test("Voidflare storage retains the newest three strengths and resets explicitly", () => {
  const storage = new RemielleVoidflares();
  [100, 200, 300, 400].forEach((n) => storage.add(n));
  expect(storage.snapshot()).toEqual([200, 300, 400]);
  const copy = storage.snapshot() as number[];
  copy.push(900);
  expect(storage.snapshot()).toHaveLength(3);
  storage.clear();
  expect(storage.snapshot()).toEqual([]);
});
test("Alice's follow-up copies the physical anomaly snapshot, stops on replacement, and adds remaining-time disorder scaling", () => {
  const s = testScenario();
  s.loop = false;
  const a = s.team[0],
    alice = testActor("alice");
  s.team.push(alice);
  alice.panel.atk = 9999;
  alice.anomalyEffects = [alicePhysicalAnomalyEffect()];
  const anomaly: DamageSpec = {
    kind: "anomaly",
    element: "physical",
    basis: "atk",
    multiplier: 1,
    canCrit: false,
    domainMultiplier: 1,
  };
  s.enemy.anomaly.physical = {
    threshold: 100,
    durationMs: 10_000,
    tickMs: 1000,
    maxProcs: 1,
    trigger: "immediate",
    disorder: anomaly,
  };
  s.enemy.anomaly.fire = {
    ...s.enemy.anomaly.physical,
    disorder: { ...anomaly, element: "fire" },
  };
  const base = a.actions.basic.hits[0];
  a.actions.basic.durationMs = 4000;
  a.actions.basic.hits = [
    {
      ...base,
      anomaly: { element: "physical", buildup: 100, damage: anomaly },
    },
    {
      ...base,
      atMs: 2500,
      anomaly: {
        element: "fire",
        buildup: 100,
        damage: { ...anomaly, element: "fire" },
      },
    },
  ];
  const r = simulate(s),
    copies = r.trace.events.filter(
      (e) => e.action === "alice-assault-followup",
    );
  expect(copies.map((e) => [e.atMs, e.amount, e.actor, e.sourceActor])).toEqual(
    [
      [950, 12.5, "alice", a.id],
      [1900, 12.5, "alice", a.id],
    ],
  );
  expect(r.byActor.alice).toBe(25);
  expect(
    r.trace.events.find((e) => e.action === "disorder-physical")?.amount,
  ).toBeCloseTo(500 * (1 + 7.5 * 0.18));
});
