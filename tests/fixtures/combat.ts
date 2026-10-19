import type { BuildSnapshot, Panel, SimulationScenario } from "../../src/utilities/zzz/combat/types.js";
import { ELEMENTS } from "../../src/utilities/zzz/combat/stats.js";

/** Synthetic mechanics, deliberately not attributed to any game character. */
export function testActor(id = "test_a"): BuildSnapshot {
  const panel: Panel = {hp: 10_000, atk: 1000, def: 600, critRate: 0, critDmg: 50, impact: 100, anomalyProficiency: 100, anomalyMastery: 100, energyRegen: 1,
    penRatio: 0, penFlat: 0, damageBonus: 0, resIgnore: 0, defReduction: 0, vulnerability: 0};
  return {id, name: id, kind: "agent", level: 60, cinema: 0, modelVersion: "synthetic-1", panel, levelCoefficient: 1000,
    resources: {energy: {initial: 0, max: 100, regenPerSecond: 1}},
    actions: {basic: {id: "basic", name: "Synthetic basic", durationMs: 1000, cooldownMs: 0, cost: {}, hits: [{atMs: 0, damage: {kind: "direct", element: "physical", basis: "atk", multiplier: 1, canCrit: true}, daze: 0}]}},
    defaultPriority: ["basic"], provenance: {verified: true, sources: ["synthetic test fixture — not game data"], unsupported: []}};
}
export function testScenario(): SimulationScenario {
  return {schemaVersion: 1, modelVersion: "synthetic-1", durationMs: 30_000, team: [testActor()],
    enemy: {level: 70, defense: 1000, resistance: Object.fromEntries(ELEMENTS.map(e => [e, 0])) as any, stunThreshold: 100, stunDurationMs: 3000, stunMultiplier: 1.5, anomaly: {}},
    rotation: [{type: "action", actor: "test_a", action: "basic"}], loop: true, incoming: [], switchMs: 100, seed: 123, trials: 100};
}
