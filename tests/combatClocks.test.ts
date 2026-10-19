import { simulate } from "../src/utilities/zzz/combat/engine.js";
import { compareImportedPanel } from "../src/utilities/zzz/combat/damage.js";
import { testActor, testScenario } from "./fixtures/combat.js";
import type { Buff, DamageSpec } from "../src/utilities/zzz/combat/types.js";

function pausedScenario() {
  const s = testScenario();
  s.trials = 1;
  s.loop = false;
  const action = s.team[0].actions.basic;
  action.clock = "animation";
  action.durationMs = 3500;
  action.clockPauses = [{ startMs: 500, durationMs: 2000 }];
  return s;
}

test("a global pause freezes already queued combat events while animation hits continue", () => {
  const s = pausedScenario(),
    b = testActor("backline");
  b.kind = "bangboo";
  b.actions.basic.durationMs = 10_000;
  b.actions.basic.hits[0].atMs = 1000;
  s.bangboo = b;
  let r = simulate(s);
  expect(
    r.trace.events.find((e) => e.kind === "damage" && e.actor === b.id),
  ).toMatchObject({ atMs: 1000, animationAtMs: 3000 });
  expect(r.trace.animationElapsedMs).toBe(32_000);
  expect(r.durationMs).toBe(30_000);
  b.actions.basic.clock = "animation";
  r = simulate(s);
  expect(
    r.trace.events.find((e) => e.kind === "damage" && e.actor === b.id),
  ).toMatchObject({ atMs: 500, animationAtMs: 1000 });
});

test("buff expiry uses the authored clock and reports coverage in both clock domains", () => {
  const s = pausedScenario(),
    a = s.team[0];
  const buff: Buff = {
    id: "combat",
    target: "self",
    stat: "atk",
    mode: "flat",
    value: 1000,
    durationMs: 1000,
    maxStacks: 1,
    stacking: "refresh",
  };
  a.initialBuffs = [buff, { ...buff, id: "animation", clock: "animation" }];
  a.actions.basic.hits = [750, 1250, 3000].map((atMs) => ({
    ...a.actions.basic.hits[0],
    atMs,
  }));
  const r = simulate(s);
  expect(
    r.trace.events
      .filter((e) => e.kind === "damage")
      .map((e) => [e.atMs, e.animationAtMs, e.amount]),
  ).toEqual([
    [500, 750, 1500],
    [500, 1250, 1000],
    [1000, 3000, 500],
  ]);
  expect(r.trace.buffUptimeMs).toEqual({
    "test_a/combat/test_a": 1000,
    "test_a/animation/test_a": 500,
  });
  expect(r.trace.buffAnimationUptimeMs).toEqual({
    "test_a/combat/test_a": 3000,
    "test_a/animation/test_a": 1000,
  });
});

test("combat regeneration freezes globally and animation regeneration integrates through buff expiry", () => {
  const s = pausedScenario(),
    a = s.team[0];
  a.resources.energy.regenStat = "energyRegen";
  a.resources.heat = {
    initial: 0,
    max: 100,
    regenPerSecond: 0,
    regenStat: "energyRegen",
    regenClock: "animation",
  };
  a.initialBuffs = [
    {
      id: "regen",
      target: "self",
      stat: "energyRegen",
      mode: "flat",
      value: 1,
      durationMs: 1000,
      clock: "animation",
      maxStacks: 1,
      stacking: "refresh",
    },
  ];
  const r = simulate(s);
  expect(r.trace.finalResources.test_a).toEqual({ energy: 30.5, heat: 33 });
  const inside = r.trace.events.filter(
    (e) => e.kind === "resource" && e.animationAtMs === 1000,
  );
  expect(inside.some((e) => e.resource === "energy")).toBe(false);
  expect(inside.find((e) => e.resource === "heat")).toMatchObject({
    atMs: 500,
    value: 2,
  });
});

test("passive cooldowns can continue in animation time during a global combat pause", () => {
  const s = pausedScenario(),
    a = s.team[0],
    support = testActor("support");
  s.team.push(support);
  a.actions.basic.clockPauses = [{ startMs: 100, durationMs: 2000 }];
  a.actions.basic.hits = [0, 500, 1000, 1500, 2000, 2500].map((atMs) => ({
    ...a.actions.basic.hits[0],
    atMs,
  }));
  support.actions.passive = {
    ...support.actions.basic,
    id: "passive",
    execution: "trigger",
  };
  support.triggers = [
    {
      id: "passive",
      event: "hit",
      source: "ally",
      cooldownMs: 1000,
      cooldownClock: "animation",
      action: "passive",
    },
  ];
  const hits = () =>
    simulate(s)
      .trace.events.filter((e) => e.kind === "damage" && e.actor === support.id)
      .map((e) => [e.atMs, e.animationAtMs]);
  expect(hits()).toEqual([
    [0, 0],
    [100, 1000],
    [100, 2000],
  ]);
  support.triggers[0].cooldownClock = "combat";
  expect(hits()).toEqual([[0, 0]]);
});

test("stun duration and anomaly tick intervals obey their own clocks", () => {
  const s = pausedScenario(),
    a = s.team[0];
  a.actions.basic.hits = [
    { ...a.actions.basic.hits[0], atMs: 0, daze: 100 },
    { ...a.actions.basic.hits[0], atMs: 1500 },
  ];
  s.enemy.stunDurationMs = 1000;
  expect(
    simulate(s)
      .trace.events.filter((e) => e.kind === "damage")
      .map((e) => e.amount),
  ).toEqual([500, 750]);
  s.enemy.stunClock = "animation";
  expect(
    simulate(s)
      .trace.events.filter((e) => e.kind === "damage")
      .map((e) => e.amount),
  ).toEqual([500, 500]);
  const spec: DamageSpec = {
    kind: "anomaly",
    element: "fire",
    basis: "atk",
    multiplier: 1,
    domainMultiplier: 1,
    canCrit: false,
  };
  a.actions.basic.hits = [
    {
      ...a.actions.basic.hits[0],
      daze: 0,
      anomaly: { element: "fire", buildup: 100, damage: spec },
    },
  ];
  s.enemy.anomaly.fire = {
    threshold: 100,
    durationMs: 2500,
    durationClock: "animation",
    tickMs: 1000,
    tickClock: "animation",
    trigger: "periodic",
    maxProcs: 3,
    disorder: spec,
  };
  const ticks = () =>
    simulate(s)
      .trace.events.filter((e) => e.action === "anomaly-fire")
      .map((e) => [e.atMs, e.animationAtMs]);
  expect(ticks()).toEqual([
    [0, 0],
    [500, 1000],
    [500, 2000],
  ]);
  s.enemy.anomaly.fire.tickClock = "combat";
  expect(ticks()).toEqual([[0, 0]]);
});

test("overlapping pauses form a global union and cancelling cuts current and future pause spans", () => {
  const s = pausedScenario(),
    a = s.team[0],
    support = testActor("support");
  s.team.push(support);
  a.actions.basic.clockPauses = [{ startMs: 100, durationMs: 1000 }];
  support.actions.pause = {
    ...support.actions.basic,
    id: "pause",
    execution: "trigger",
    clock: "animation",
    durationMs: 2000,
    clockPauses: [{ startMs: 0, durationMs: 1500 }],
    hits: [],
  };
  support.triggers = [
    {
      id: "pause",
      event: "hit",
      source: "ally",
      cooldownMs: 10000,
      action: "pause",
    },
  ];
  expect(simulate(s).trace.animationElapsedMs).toBe(31_500);
  s.team = [a];
  a.actions.basic.clockPauses = [
    { startMs: 500, durationMs: 500 },
    { startMs: 1500, durationMs: 500 },
  ];
  a.actions.basic.cancelWindows = [
    {
      startMs: 800,
      endMs: 900,
      pendingHits: "retain-marked",
      refund: {},
      sources: ["test://cancel"],
    },
  ];
  a.actions.basic.hits = [
    { ...a.actions.basic.hits[0], atMs: 2500, persistsAfterCancel: true },
  ];
  s.rotation = [
    { type: "action", actor: a.id, action: "basic", cancelAtMs: 800 },
  ];
  const r = simulate(s);
  expect(r.trace.animationElapsedMs).toBe(30_300);
  expect(
    r.trace.events
      .filter((e) => e.kind === "pause")
      .map((e) => e.animationAtMs),
  ).toEqual([500]);
  expect(
    r.trace.events
      .filter((e) => e.kind === "resume")
      .map((e) => e.animationAtMs),
  ).toEqual([800]);
  expect(r.trace.events.find((e) => e.kind === "damage")).toMatchObject({
    atMs: 2200,
    animationAtMs: 2500,
  });
});

test("waiting can resume on animation resource gain and incoming events while the combat clock is stopped", () => {
  const s = pausedScenario(),
    a = s.team[0],
    support = testActor("support");
  s.team.push(support);
  a.actions.basic.clockPauses = [];
  a.actions.basic.durationMs = 500;
  a.resources.energy.regenClock = "animation";
  a.actions.follow = {
    ...a.actions.basic,
    id: "follow",
    cost: { energy: 1 },
    requires: { incoming: true },
  };
  support.actions.pause = {
    ...support.actions.basic,
    id: "pause",
    execution: "trigger",
    clock: "animation",
    durationMs: 3000,
    clockPauses: [{ startMs: 0, durationMs: 2500 }],
    hits: [],
  };
  support.triggers = [
    {
      id: "pause",
      event: "hit",
      source: "ally",
      cooldownMs: 10000,
      action: "pause",
    },
  ];
  s.incoming = [{ atMs: 1000, windowMs: 100, clock: "animation" }];
  s.rotation = [
    { type: "action", actor: a.id, action: "basic" },
    { type: "action", actor: a.id, action: "follow", onUnavailable: "wait" },
  ];
  expect(
    simulate(s).trace.events.find(
      (e) => e.kind === "damage" && e.action === "follow",
    ),
  ).toMatchObject({ atMs: 0, animationAtMs: 1000 });
});

test("combat horizon remains exclusive and a kill during a freeze keeps both elapsed times", () => {
  const s = pausedScenario(),
    a = s.team[0];
  a.actions.basic.durationMs = 30_000;
  a.actions.basic.hits = [
    { ...a.actions.basic.hits[0], atMs: 30_000 },
    { ...a.actions.basic.hits[0], atMs: 30_000, clock: "combat" },
  ];
  expect(
    simulate(s)
      .trace.events.filter((e) => e.kind === "damage")
      .map((e) => [e.atMs, e.animationAtMs]),
  ).toEqual([[28_000, 30_000]]);
  a.actions.basic.hits = [{ ...a.actions.basic.hits[0], atMs: 1000 }];
  s.mode = "kill";
  s.enemy.hp = 100;
  const r = simulate(s);
  expect(r.trace).toMatchObject({
    elapsedMs: 500,
    animationElapsedMs: 1000,
    killed: true,
  });
  expect(r.meanDps).toBe(200);
  expect(r.kill.meanTimeMs).toBe(500);
});

test("clock domains are validated instead of silently using a fallback", () => {
  const s = pausedScenario();
  (s.team[0].resources.energy as any).regenClock = "wall";
  expect(() => simulate(s)).toThrow("Unknown clock domain");
});

test("panel tolerance follows stat precision even when a decimal display ends in .0", () => {
  const panel = testActor().panel;
  panel.energyRegen = 1.2;
  panel.critRate = 21.2;
  panel.penRatio = 21.2;
  expect(
    compareImportedPanel(panel, { energyRegen: 2, critRate: 22, penRatio: 22 }),
  ).toEqual(["energyRegen", "critRate", "penRatio"]);
  expect(
    compareImportedPanel(panel, {
      energyRegen: 1.21,
      critRate: 21.3,
      penRatio: 21.3,
      atk: 1001,
    }),
  ).toEqual([]);
  expect(
    compareImportedPanel(panel, { energyRegen: 1.22, critRate: 21.31 }),
  ).toEqual(["energyRegen", "critRate"]);
});

test("an animation-clock enemy phase beyond the combat duration still runs before the delayed combat deadline", () => {
  const s = pausedScenario();
  s.enemy.phases = [
    {
      id: "late-animation",
      atMs: 31_000,
      clock: "animation",
      sources: ["test://animation-phase"],
      invulnerable: true,
    },
  ];
  const phase = simulate(s).trace.events.find((e) => e.kind === "phase");
  expect(phase).toMatchObject({ atMs: 29_000, animationAtMs: 31_000 });
});
