import { finite, integer } from "./stats.js";
import { skillMultiplier, type SkillReference } from "./referenceSkills.js";
import type { Buff, BuildSnapshot, DamageSpec } from "./types.js";

/** Official additional ability. The caller supplies the pre-combat ATK, not a buffed panel. */
export function remielleEntryBuff(
  initialAtk: number,
  anomalyAgents: number,
): Buff {
  finite(initialAtk, "initial ATK", 0, 10_000_000);
  integer(anomalyAgents, "anomaly agents", 1, 3);
  return {
    id: "remielle-entry-atk",
    target: "team",
    stat: "atk",
    mode: "flat",
    value: Math.min(1600, initialAtk * [0, 0.06, 0.12, 0.4][anomalyAgents]),
    durationMs: 300_001,
    maxStacks: 1,
    stacking: "refresh",
  };
}

/** Initial conversion only; dynamic changes in mastery still need a character adapter. */
export function aliceEntryBuff(initialMastery: number): Buff {
  finite(initialMastery, "initial anomaly mastery", 0, 10_000_000);
  return {
    id: "alice-entry-proficiency",
    target: "self",
    stat: "anomalyProficiency",
    mode: "flat",
    value: Math.max(0, initialMastery - 140) * 1.6,
    durationMs: 300_001,
    maxStacks: 1,
    stacking: "refresh",
  };
}

export function alicePhysicalAnomalyEffect(): NonNullable<
  BuildSnapshot["anomalyEffects"]
>[number] {
  return {
    id: "alice-assault-followup",
    element: "physical",
    periodicCopy: { intervalMs: 950, multiplier: 0.025 },
    disorderBonus: { perSecond: 0.18, cap: 1.8 },
  };
}

/** Coefficient and AP damage bonus only. Heat/Scorched state and timings are separate models. */
export function burniceAfterburnDamage(
  reference: SkillReference,
  coreLevel: number,
  canCrit: boolean,
): DamageSpec {
  if (reference.id !== "1171")
    throw new Error("Expected Burnice skill reference");
  return {
    kind: "direct",
    element: "fire",
    basis: "atk",
    canCrit,
    multiplier: skillMultiplier(
      reference,
      "核心被動：燃油特調",
      "[餘燼]效果對目標造成火屬性傷害",
      coreLevel,
    ),
    bonusFromStat: { stat: "anomalyProficiency", scale: 0.1, cap: 30 },
  };
}

/** Storage contract from the core skill; anomaly strength itself must be separately validated. */
export class RemielleVoidflares {
  private values: number[] = [];
  add(strength: number): void {
    finite(strength, "anomaly strength", 0, 1e15);
    this.values.push(strength);
    this.values = this.values.slice(-3);
  }
  snapshot(): readonly number[] {
    return [...this.values];
  }
  clear(): void {
    this.values = [];
  }
}
