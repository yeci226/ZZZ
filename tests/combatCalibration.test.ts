import {
  compareCombatCapture,
  type CombatCapture,
} from "../src/utilities/zzz/combat/calibration.js";
import { simulate } from "../src/utilities/zzz/combat/engine.js";
import { testActor, testScenario } from "./fixtures/combat.js";
import type { DamageSpec } from "../src/utilities/zzz/combat/types.js";
const context = {
  gameVersion: "synthetic-game",
  modelVersion: "synthetic-1",
  scenarioFingerprint: "synthetic-capture",
};
/** Independent oracle: 30 × (1000 ATK × 1 × .5 DEF) at whole seconds. */
function capture(): CombatCapture {
  return {
    schemaVersion: 1,
    id: "synthetic-calibration-unit-test",
    ...context,
    source: {
      url: "https://example.invalid/synthetic-test-not-real-capture",
      sha256: "a".repeat(64),
      fps: 60,
    },
    displayPrecision: 1,
    clock: "combat",
    hits: Array.from({ length: 30 }, (_, i) => ({
      actor: "test_a",
      action: "basic",
      category: "direct",
      atMs: i * 1000,
      amount: 500,
      critical: false,
    })),
  };
}
test("independent capture oracle verifies counts, per-hit damage and timing without granting source verification", () => {
  const trial = simulate(testScenario()).trace,
    result = compareCombatCapture(trial, capture(), context);
  expect(result.passed).toBe(true);
  expect(result.requiresSourceReview).toBe(true);
  expect(result.checkedHits).toBe(30);
  expect(result.totalRelativeError).toBe(0);
});
test("matching total alone cannot hide missing hits, wrong timing, wrong crit or damage distribution", () => {
  const trial = simulate(testScenario()).trace;
  const timing = capture();
  timing.hits[1].atMs += 20;
  expect(
    compareCombatCapture(trial, timing, context).issues.some((i) =>
      i.reason.includes("frame"),
    ),
  ).toBe(true);
  const count = capture();
  count.hits.pop();
  count.hits[0].amount += 500;
  const result = compareCombatCapture(trial, count, context);
  expect(result.totalRelativeError).toBe(0);
  expect(result.passed).toBe(false);
  expect(result.issues.some((i) => i.reason.includes("count"))).toBe(true);
  const crit = capture();
  crit.hits[0].critical = true;
  expect(compareCombatCapture(trial, crit, context).issues[0].reason).toContain(
    "Critical",
  );
});
test("capture from another game version or without source hash cannot be used", () => {
  const trial = simulate(testScenario()).trace;
  expect(() =>
    compareCombatCapture(trial, capture(), {
      ...context,
      gameVersion: "different",
    }),
  ).toThrow("versions");
  const bad = capture();
  bad.source.sha256 = "";
  expect(() => compareCombatCapture(trial, bad, context)).toThrow("source");
});
test("video observations use the animation clock and cannot silently fall back to combat time", () => {
  const trial = simulate(testScenario()).trace;
  for (const event of trial.events) event.animationAtMs = event.atMs + 1000;
  const recording = capture();
  recording.clock = "animation";
  for (const hit of recording.hits) hit.atMs += 1000;
  expect(compareCombatCapture(trial, recording, context).passed).toBe(true);
  recording.clock = "combat";
  expect(compareCombatCapture(trial, recording, context).passed).toBe(false);
  recording.clock = "animation";
  delete trial.events.find((event) => event.kind === "damage")!.animationAtMs;
  expect(() => compareCombatCapture(trial, recording, context)).toThrow(
    "Missing animation timestamp",
  );
});

test("one visible anomaly number calibrates against all attribution rows without splitting the recording", () => {
  const scenario = testScenario();
  scenario.loop = false;
  scenario.trials = 1;
  const a = scenario.team[0],
    b = testActor("second");
  scenario.team.push(b);
  b.panel.atk = 2000;
  const damage: DamageSpec = {
    kind: "anomaly",
    element: "physical",
    basis: "atk",
    multiplier: 1,
    domainMultiplier: 1,
    canCrit: false,
  };
  scenario.enemy.anomaly.physical = {
    threshold: 100,
    durationMs: 1000,
    tickMs: 1000,
    maxProcs: 1,
    trigger: "immediate",
    disorder: damage,
  };
  for (const actor of scenario.team)
    actor.actions.basic.hits[0].anomaly = {
      element: "physical",
      buildup: 50,
      damage,
    };
  scenario.rotation = [
    { type: "action", actor: a.id, action: "basic" },
    { type: "switch", actor: b.id },
    { type: "action", actor: b.id, action: "basic" },
  ];
  const trial = simulate(scenario).trace,
    recording = capture();
  recording.hits = [
    {
      actor: a.id,
      action: "basic",
      category: "direct",
      atMs: 0,
      amount: 500,
      critical: false,
    },
    {
      actor: b.id,
      action: "basic",
      category: "direct",
      atMs: 1100,
      amount: 1000,
      critical: false,
    },
    {
      actors: [a.id, b.id],
      action: "anomaly-physical",
      category: "anomaly",
      atMs: 1100,
      amount: 750,
      critical: false,
    },
  ];
  const rows = trial.events.filter(
    (event) => event.action === "anomaly-physical",
  );
  expect(rows.map((event) => event.amount)).toEqual([250, 500]);
  expect(rows[0].damageEventId).toBe(rows[1].damageEventId);
  expect(compareCombatCapture(trial, recording, context)).toMatchObject({
    passed: true,
    predictedHits: 3,
    predictedAttributionRows: 4,
    observedHits: 3,
    checkedHits: 3,
    totalObserved: 2250,
    totalPredicted: 2250,
  });
  expect(
    simulate(scenario).trace.events.map((event) => event.damageEventId),
  ).toEqual(trial.events.map((event) => event.damageEventId));
  rows[1].animationAtMs! += 1;
  expect(() => compareCombatCapture(trial, recording, context)).toThrow(
    "inconsistent timing or identity",
  );
});

test("separate visible damage events at the same timestamp stay separate and old traces remain readable", () => {
  const scenario = testScenario();
  scenario.loop = false;
  scenario.trials = 1;
  const action = scenario.team[0].actions.basic;
  action.hits.push(structuredClone(action.hits[0]));
  const trial = simulate(scenario).trace,
    recording = capture();
  recording.hits = [recording.hits[0], structuredClone(recording.hits[0])];
  expect(compareCombatCapture(trial, recording, context)).toMatchObject({
    passed: true,
    predictedHits: 2,
  });
  const events = trial.events.filter((event) => event.kind === "damage");
  expect(events[0].damageEventId).not.toBe(events[1].damageEventId);
  for (const event of trial.events) delete event.damageEventId;
  expect(compareCombatCapture(trial, recording, context)).toMatchObject({
    passed: true,
    predictedHits: 2,
  });
});

test("capture attribution is explicit and duplicate or ambiguous contributor identities are rejected", () => {
  const trial = simulate(testScenario()).trace,
    recording = capture();
  recording.hits[0].actors = ["test_a"];
  expect(() => compareCombatCapture(trial, recording, context)).toThrow(
    "exclusively",
  );
  delete recording.hits[0].actor;
  recording.hits[0].actors = ["test_a", "test_a"];
  expect(() => compareCombatCapture(trial, recording, context)).toThrow(
    "Invalid capture identity",
  );
  recording.hits[0].actors = ["test_a"];
  expect(compareCombatCapture(trial, recording, context).passed).toBe(true);
});
