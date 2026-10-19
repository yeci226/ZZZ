import { simulate } from "../src/utilities/zzz/combat/engine.js";
import { validateScenario } from "../src/utilities/zzz/combat/validation.js";
import {
  exportRotation,
  importRotation,
} from "../src/utilities/zzz/combat/rotation.js";
import { testActor, testScenario } from "./fixtures/combat.js";
import type { DamageSpec } from "../src/utilities/zzz/combat/types.js";

test("kill mode stops at the lethal event and reports effective damage and overkill separately", () => {
  const s = testScenario();
  s.mode = "kill";
  s.enemy.hp = 750;
  const r = simulate(s);
  expect(r.mode).toBe("kill");
  expect(r.meanDamage).toBe(1000);
  expect(r.meanEffectiveDamage).toBe(750);
  expect(r.meanOverkill).toBe(250);
  expect(r.meanDps).toBe(750);
  expect(r.kill).toEqual({
    rate: 1,
    meanTimeMs: 1000,
    p10TimeMs: 1000,
    p90TimeMs: 1000,
    meanRemainingHp: 0,
  });
  expect(r.trace).toMatchObject({
    elapsedMs: 1000,
    killed: true,
    remainingHp: 0,
    effectiveDamage: 750,
    overkill: 250,
  });
  expect(
    r.trace.events
      .filter((e) => e.kind === "damage")
      .map((e) => [e.amount, e.effectiveAmount, e.overkill]),
  ).toEqual([
    [500, 500, 0],
    [500, 250, 250],
  ]);
  expect(r.trace.events.every((e) => e.atMs <= 1000)).toBe(true);
});

test("zero-time kills have null DPS, while failed kills keep the horizon and remaining HP", () => {
  const s = testScenario();
  s.mode = "kill";
  s.enemy.hp = 100;
  expect(simulate(s)).toMatchObject({
    meanDps: null,
    kill: { rate: 1, meanTimeMs: 0 },
  });
  s.enemy.hp = 100_000;
  expect(simulate(s)).toMatchObject({
    meanDps: 500,
    kill: {
      rate: 0,
      meanTimeMs: null,
      p10TimeMs: null,
      p90TimeMs: null,
      meanRemainingHp: 85_000,
    },
    trace: { elapsedMs: 30_000, killed: false },
  });
  s.mode = "fixed-duration";
  expect(simulate(s)).toMatchObject({
    meanDamage: 15_000,
    meanOverkill: 0,
    trace: { remainingHp: null },
  });
});

test("kill-time statistics exclude failed trials rather than substituting the horizon", () => {
  const s = testScenario();
  s.mode = "kill";
  s.enemy.hp = 750;
  s.trials = 100;
  s.loop = false;
  const a = s.team[0];
  a.panel.critRate = 50;
  a.panel.critDmg = 100;
  a.actions.basic.hits[0].atMs = 1000;
  const r = simulate(s);
  expect(r.kill.rate).toBeGreaterThan(0.3);
  expect(r.kill.rate).toBeLessThan(0.7);
  expect(r.kill.meanTimeMs).toBe(1000);
  expect(r.kill.p10TimeMs).toBe(1000);
  expect(r.kill.p90TimeMs).toBe(1000);
  expect(r.kill.meanRemainingHp).toBeCloseTo(250 * (1 - r.kill.rate));
  expect(simulate(s)).toEqual(r);
});

test("authored timed invulnerability and HP phases affect the next hit and are logged", () => {
  const s = testScenario();
  s.loop = false;
  const a = s.team[0];
  a.actions.basic.durationMs = 4000;
  a.actions.basic.hits = [0, 1000, 2000, 3000].map((atMs) => ({
    ...a.actions.basic.hits[0],
    atMs,
  }));
  s.enemy.phases = [
    {
      id: "immune",
      sources: ["test://timing"],
      atMs: 1000,
      invulnerable: true,
    },
    {
      id: "open",
      sources: ["test://timing"],
      atMs: 2000,
      invulnerable: false,
      defense: 0,
    },
  ];
  expect(
    simulate(s)
      .trace.events.filter((e) => e.kind === "damage")
      .map((e) => e.amount),
  ).toEqual([500, 0, 1000, 1000]);
  s.mode = "kill";
  s.enemy.hp = 2000;
  s.enemy.phases = [
    { id: "second", sources: ["test://hp"], hpRatio: 0.75, defense: 0 },
  ];
  const r = simulate(s);
  expect(
    r.trace.events.filter((e) => e.kind === "damage").map((e) => e.amount),
  ).toEqual([500, 1000, 1000]);
  expect(r.trace.events.find((e) => e.kind === "phase")).toMatchObject({
    atMs: 0,
    detail: "second",
  });
});

test("initial active actor and sparse resources override authored defaults without mutating builds", () => {
  const s = testScenario(),
    b = testActor("second");
  s.team.push(b);
  s.loop = false;
  b.actions.basic.cost = { energy: 5 };
  s.rotation = [{ type: "action", actor: b.id, action: "basic" }];
  s.initialState = { activeActor: b.id, resources: { [b.id]: { energy: 10 } } };
  const r = simulate(s);
  expect(r.byActor.second).toBe(500);
  expect(
    r.trace.events.find((e) => e.kind === "resource" && e.detail === "cost"),
  ).toMatchObject({ actor: b.id, value: 5, delta: -5 });
  expect(b.resources.energy.initial).toBe(0);
  expect(r.trace.finalResources.second.energy).toBe(35);
  s.initialState.resources.second.energy = 9999;
  expect(() => simulate(s)).toThrow("initial resource override");
});

test("wait behavior resumes exactly when regeneration or authored incoming events make the action legal", () => {
  const s = testScenario();
  s.loop = false;
  s.team[0].actions.basic.cost = { energy: 5 };
  s.rotation = [
    {
      type: "action",
      actor: "test_a",
      action: "basic",
      onUnavailable: "wait",
      maxWaitMs: 6000,
    },
  ];
  expect(simulate(s).trace.events.find((e) => e.kind === "damage")?.atMs).toBe(
    5000,
  );
  expect(importRotation(exportRotation(s.rotation), s.team)).toEqual(
    s.rotation,
  );
  s.team[0].actions.basic.requires = { incoming: true };
  s.incoming = [{ atMs: 5500, windowMs: 100 }];
  expect(simulate(s).trace.events.find((e) => e.kind === "damage")?.atMs).toBe(
    5500,
  );
  if (s.rotation[0].type !== "action") throw new Error("Expected action");
  s.rotation[0] = { ...s.rotation[0], maxWaitMs: 4000 };
  expect(() => simulate(s)).toThrow("wait limit");
  s.rotation[0] = { ...s.rotation[0], maxWaitMs: 30_000 };
  s.incoming = [];
  expect(() => simulate(s)).toThrow("combat horizon");
});

test("explicit skip and error behavior are preserved instead of inventing replacement actions", () => {
  const s = testScenario();
  s.loop = false;
  s.team[0].actions.basic.cost = { energy: 5 };
  s.rotation = [
    { type: "action", actor: "test_a", action: "basic", onUnavailable: "skip" },
  ];
  expect(simulate(s).meanDamage).toBe(0);
  if (s.rotation[0].type !== "action") throw new Error("Expected action");
  s.rotation[0] = {
    ...s.rotation[0],
    onUnavailable: "error",
    when: { resource: { name: "energy", atLeast: 5 } },
  };
  expect(() => simulate(s)).toThrow("Rotation step 1");
});

test("buff uptime counts union of stacks and integrates resource regeneration through expiry to the horizon", () => {
  const s = testScenario();
  s.loop = false;
  const a = s.team[0];
  a.resources.energy.regenStat = "energyRegen";
  a.actions.basic.buffs = [
    {
      id: "regen",
      target: "self",
      stat: "energyRegen",
      mode: "flat",
      value: 1,
      durationMs: 500,
      maxStacks: 2,
      stacking: "independent",
    },
  ];
  const r = simulate(s);
  expect(r.trace.buffUptimeMs["test_a/regen/test_a"]).toBe(500);
  expect(r.buffUptime["test_a/regen/test_a"]).toBeCloseTo(500 / 30_000);
  expect(r.trace.finalResources.test_a.energy).toBe(30.5);
  expect(
    r.trace.events
      .filter((e) => e.kind === "resource")
      .reduce((sum, e) => sum + (e.delta ?? 0), 0),
  ).toBe(30.5);
});

test("anomaly contributions settle atomically at lethal HP without actor-order bias", () => {
  const s = testScenario();
  s.loop = false;
  s.mode = "kill";
  s.enemy.hp = 400;
  const a = s.team[0],
    b = testActor("second");
  s.team.push(b);
  b.panel.atk = 2000;
  const spec: DamageSpec = {
    kind: "anomaly",
    element: "physical",
    basis: "atk",
    multiplier: 1,
    domainMultiplier: 1,
    canCrit: false,
  };
  s.enemy.anomaly.physical = {
    threshold: 100,
    durationMs: 1000,
    tickMs: 1000,
    maxProcs: 1,
    trigger: "immediate",
    disorder: spec,
  };
  for (const actor of s.team) {
    actor.actions.basic.hits[0].damage.multiplier = 0;
    actor.actions.basic.hits[0].anomaly = {
      element: "physical",
      buildup: 50,
      damage: spec,
    };
  }
  s.rotation = [
    { type: "action", actor: a.id, action: "basic" },
    { type: "switch", actor: b.id },
    { type: "action", actor: b.id, action: "basic" },
  ];
  const r = simulate(s),
    events = r.trace.events.filter((e) => e.action === "anomaly-physical");
  expect(events.map((e) => e.amount)).toEqual([250, 500]);
  expect(events.map((e) => e.effectiveAmount)).toEqual([400 / 3, 800 / 3]);
  expect(r.meanEffectiveDamage).toBe(400);
  expect(r.meanOverkill).toBe(350);
  expect(r.byCategory.anomaly).toBe(750);
  expect(Object.values(r.byCategory).reduce((sum, n) => sum + n, 0)).toBe(
    r.meanDamage,
  );
});

test("scenario validation rejects missing HP, unsourced phases, ambiguous triggers, and unknown initial states", () => {
  const s = testScenario();
  s.mode = "kill";
  expect(() => validateScenario(s)).toThrow("enemy hp");
  s.enemy.hp = 100;
  s.enemy.phases = [{ id: "x", atMs: 0, sources: [] }];
  expect(() => validateScenario(s)).toThrow("sources");
  s.enemy.phases[0] = { id: "x", atMs: 0, hpRatio: 0.5, sources: ["test"] };
  expect(() => validateScenario(s)).toThrow("exactly one");
  s.enemy.phases = [];
  s.initialState = { activeActor: "missing", resources: {} };
  expect(() => validateScenario(s)).toThrow("active actor");
});

test("comparison identity freezes the scenario while permitting equipment changes", () => {
  const s = testScenario(),
    baseline = simulate(s);
  s.team[0].panel.atk += 100;
  expect(simulate(s).comparisonFingerprint).toBe(
    baseline.comparisonFingerprint,
  );
  expect(simulate(s).fingerprint).not.toBe(baseline.fingerprint);
  s.enemy.defense += 100;
  expect(simulate(s).comparisonFingerprint).not.toBe(
    baseline.comparisonFingerprint,
  );
});

test("authored cancellation keeps only marked pending hits and applies explicit refunds without resetting cooldown", () => {
  const s = testScenario();
  s.loop = false;
  const a = s.team[0],
    base = structuredClone(a.actions.basic.hits[0]);
  a.resources.energy.initial = 10;
  a.resources.energy.regenPerSecond = 0;
  a.actions.basic.durationMs = 3000;
  a.actions.basic.cooldownMs = 5000;
  a.actions.basic.cost = { energy: 10 };
  a.actions.basic.cancelWindows = [
    {
      startMs: 1000,
      endMs: 1500,
      pendingHits: "retain-marked",
      refund: { energy: 4 },
      sources: ["test://cancel"],
    },
  ];
  a.actions.basic.hits = [
    { ...base, atMs: 500 },
    { ...base, atMs: 1000 },
    { ...base, atMs: 2000, persistsAfterCancel: true },
    { ...base, atMs: 2500 },
  ];
  s.rotation = [
    { type: "action", actor: a.id, action: "basic", cancelAtMs: 1000 },
  ];
  const r = simulate(s);
  expect(
    r.trace.events.filter((e) => e.kind === "damage").map((e) => e.atMs),
  ).toEqual([500, 2000]);
  expect(r.trace.events.find((e) => e.kind === "cancel")).toMatchObject({
    atMs: 1000,
    detail: "retain-marked",
  });
  expect(
    r.trace.events.find((e) => e.detail === "cancel-refund"),
  ).toMatchObject({ atMs: 1000, delta: 4, value: 4 });
  expect(r.trace.finalResources.test_a.energy).toBe(4);
  s.rotation.push({ type: "action", actor: a.id, action: "basic" });
  expect(() => simulate(s)).toThrow("Rotation step 2");
  s.rotation = [
    { type: "action", actor: a.id, action: "basic", cancelAtMs: 999 },
  ];
  expect(() => simulate(s)).toThrow("authored windows");
  a.actions.basic.cancelWindows[0].refund.energy = 11;
  expect(() => simulate(s)).toThrow("cancel refund");
});

test("disorder triggering actor is distinct from the actor credited for the previous anomaly", () => {
  const s = testScenario();
  s.loop = false;
  const a = s.team[0],
    b = testActor("second");
  s.team.push(b);
  const spec: DamageSpec = {
    kind: "anomaly",
    element: "fire",
    basis: "atk",
    multiplier: 1,
    domainMultiplier: 1,
    canCrit: false,
  };
  s.enemy.anomaly.fire = {
    threshold: 100,
    durationMs: 10_000,
    tickMs: 1000,
    maxProcs: 1,
    trigger: "immediate",
    disorder: spec,
  };
  s.enemy.anomaly.physical = {
    ...s.enemy.anomaly.fire,
    disorder: { ...spec, element: "physical" },
  };
  a.actions.basic.hits[0].anomaly = {
    element: "fire",
    buildup: 100,
    damage: spec,
  };
  b.actions.basic.hits[0].anomaly = {
    element: "physical",
    buildup: 100,
    damage: { ...spec, element: "physical" },
  };
  s.rotation = [
    { type: "action", actor: a.id, action: "basic" },
    { type: "switch", actor: b.id },
    { type: "action", actor: b.id, action: "basic" },
  ];
  const r = simulate(s);
  expect(
    r.trace.events.find((e) => e.action === "disorder-fire"),
  ).toMatchObject({
    actor: a.id,
    sourceActor: a.id,
    triggerActor: b.id,
    category: "disorder",
  });
  expect(r.byCategory.disorder).toBe(500);
});

test("sourced shields absorb mitigated damage before HP and lethal hits reconcile shield, HP and overkill", () => {
  const s = testScenario();
  s.mode = "kill";
  s.enemy.hp = 600;
  s.enemy.shield = { hp: 750, sources: ["test://one-to-one-shield"] };
  const r = simulate(s);
  expect(r).toMatchObject({
    meanDamage: 1500,
    meanEffectiveDamage: 600,
    meanShieldDamage: 750,
    meanOverkill: 150,
    meanDps: 300,
  });
  expect(r.kill.meanTimeMs).toBe(2000);
  expect(r.trace).toMatchObject({
    remainingHp: 0,
    remainingShield: 0,
    shieldDamage: 750,
  });
  expect(
    r.trace.events
      .filter((e) => e.kind === "damage")
      .map((e) => [e.amount, e.shieldAmount, e.effectiveAmount, e.overkill]),
  ).toEqual([
    [500, 500, 0, 0],
    [500, 250, 250, 0],
    [500, 0, 350, 150],
  ]);
  expect(r.trace.events.find((e) => e.kind === "shield-break")).toMatchObject({
    atMs: 1000,
    triggerActor: "test_a",
  });
  expect(r.meanEffectiveDamage + r.meanShieldDamage + r.meanOverkill).toBe(
    r.meanDamage,
  );
});

test("invulnerability prevents shield damage and a sourced phase can replace a shield pool", () => {
  const s = testScenario();
  s.mode = "kill";
  s.enemy.hp = 10_000;
  s.loop = false;
  const a = s.team[0];
  a.actions.basic.durationMs = 4000;
  a.actions.basic.hits = [0, 1000, 2000, 3000].map((atMs) => ({
    ...a.actions.basic.hits[0],
    atMs,
  }));
  s.enemy.shield = { hp: 1000, sources: ["test://shield"] };
  s.enemy.phases = [
    { id: "immune", atMs: 0, invulnerable: true, sources: ["test://phase"] },
    { id: "open", atMs: 1000, invulnerable: false, sources: ["test://phase"] },
    {
      id: "new-shield",
      atMs: 2000,
      shield: { hp: 200, sources: ["test://shield"] },
      sources: ["test://phase"],
    },
  ];
  const r = simulate(s);
  expect(r.meanShieldDamage).toBe(700);
  expect(r.meanEffectiveDamage).toBe(800);
  expect(r.trace.remainingHp).toBe(9200);
  expect(
    r.trace.events.filter((e) => e.kind === "shield-break").map((e) => e.atMs),
  ).toEqual([2000]);
  expect(
    r.trace.events
      .filter((e) => e.kind === "damage")
      .map((e) => e.shieldAmount),
  ).toEqual([0, 500, 200, 0]);
});

test("fixed duration counts shield damage in total DPS while HP-only damage remains distinguishable", () => {
  const s = testScenario();
  s.enemy.shield = { hp: 1_000_000, sources: ["test://shield"] };
  const r = simulate(s);
  expect(r).toMatchObject({
    meanDamage: 15_000,
    meanDps: 500,
    meanEffectiveDamage: 0,
    meanShieldDamage: 15_000,
    meanOverkill: 0,
  });
  expect(r.trace.remainingShield).toBe(985_000);
  s.enemy.shield.sources = [];
  expect(() => simulate(s)).toThrow("Shield requires explicit sources");
});
