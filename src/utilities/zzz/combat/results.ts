import type { SimulationResult, SimulationScenario } from "./types.js";

export interface ActorDamageSummary {
  id: string;
  name: string;
  damage: number;
  dps: number | null;
  share: number;
  actions: { id: string; name: string; damage: number }[];
}

export function damageSummary(
  result: SimulationResult,
  scenario: SimulationScenario,
): ActorDamageSummary[] {
  const seconds = result.durationMs / 1000;
  return [
    ...scenario.team,
    ...(scenario.bangboo ? [scenario.bangboo] : []),
  ].map((actor) => {
    const damage = result.byActor[actor.id] ?? 0;
    return {
      id: actor.id,
      name: actor.name,
      damage,
      // In kill mode an actor's mean damage divided by the horizon is not its DPS.
      // Per-actor trial denominators are deliberately not guessed from aggregate totals.
      dps: result.mode === "kill" ? null : damage / seconds,
      share: result.meanDamage > 0 ? damage / result.meanDamage : 0,
      actions: Object.entries(result.byAction)
        .filter(([key]) => key.startsWith(`${actor.id}/`))
        .map(([key, amount]) => {
          const id = key.slice(actor.id.length + 1);
          return { id, name: actor.actions[id]?.name ?? id, damage: amount };
        })
        .sort((a, b) => b.damage - a.damage),
    };
  });
}

export function compareDamage(
  current: SimulationResult,
  hypothetical: SimulationResult,
) {
  if (
    current.durationMs !== hypothetical.durationMs ||
    current.trials !== hypothetical.trials ||
    current.modelVersion !== hypothetical.modelVersion ||
    (current.mode ?? "fixed-duration") !==
      (hypothetical.mode ?? "fixed-duration") ||
    (current.comparisonFingerprint !== undefined &&
      hypothetical.comparisonFingerprint !== undefined &&
      current.comparisonFingerprint !== hypothetical.comparisonFingerprint)
  )
    throw new Error("Comparison settings differ");
  const delta = hypothetical.meanDamage - current.meanDamage;
  return {
    damage: delta,
    dps:
      hypothetical.meanDps === null || current.meanDps === null
        ? null
        : hypothetical.meanDps - current.meanDps,
    percent: current.meanDamage > 0 ? (delta / current.meanDamage) * 100 : null,
    killRate:
      current.kill && hypothetical.kill
        ? hypothetical.kill.rate - current.kill.rate
        : null,
    // Conditional means are not comparable when completion rates differ.
    killTimeMs:
      current.kill?.rate === 1 &&
      hypothetical.kill?.rate === 1 &&
      current.kill.meanTimeMs !== null &&
      hypothetical.kill.meanTimeMs !== null
        ? hypothetical.kill.meanTimeMs - current.kill.meanTimeMs
        : null,
  };
}
