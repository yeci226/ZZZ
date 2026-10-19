import { finite } from "./stats.js";
import type {
  BuildSnapshot,
  CombatStat,
  DamageBreakdown,
  DamageSpec,
  EnemyModel,
  Panel,
} from "./types.js";

export const PANEL_STATS: CombatStat[] = [
  "hp",
  "atk",
  "def",
  "critRate",
  "critDmg",
  "impact",
  "anomalyProficiency",
  "anomalyMastery",
  "energyRegen",
  "penRatio",
  "penFlat",
  "damageBonus",
  "resIgnore",
  "defReduction",
  "vulnerability",
];
export interface PanelComponents {
  base: Panel;
  additions: Partial<Record<CombatStat, number>>;
  percentages: Partial<Record<CombatStat, number>>;
}
/** Each percentage applies only to its authored base, never to API final values. */
export function reconstructPanel(parts: PanelComponents): Panel {
  const panel = {} as Panel;
  for (const key of PANEL_STATS) {
    const base = finite(parts.base[key], key);
    const pct = finite(
      parts.percentages[key] ?? 0,
      `${key} percent`,
      -100,
      100_000,
    );
    const flat = finite(
      parts.additions[key] ?? 0,
      `${key} flat`,
      -100_000,
      10_000_000,
    );
    panel[key] = Math.max(0, base * (1 + pct / 100) + flat);
  }
  return panel;
}
export function compareImportedPanel(
  panel: Panel,
  displayed: Partial<Panel>,
): string[] {
  const integerStats: CombatStat[] = [
    "hp",
    "atk",
    "def",
    "impact",
    "anomalyProficiency",
    "anomalyMastery",
    "penFlat",
  ];
  return Object.entries(displayed)
    .filter(([key, raw]) => {
      if (!PANEL_STATS.includes(key as CombatStat)) return true;
      const value = Number(raw),
        actual = panel[key as CombatStat];
      // Precision follows the stat, including values whose displayed decimal is .0.
      const precision =
        key === "energyRegen"
          ? 0.01
          : integerStats.includes(key as CombatStat)
            ? 1
            : 0.1;
      return (
        !Number.isFinite(value) || Math.abs(actual - value) > precision + 1e-9
      );
    })
    .map(([key]) => key);
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export function calculateDamage(
  actor: Pick<BuildSnapshot, "panel" | "levelCoefficient" | "elementBonuses">,
  damage: DamageSpec,
  enemy: EnemyModel,
  stunned: boolean,
): DamageBreakdown {
  const p = actor.panel;
  if (!["direct", "anomaly", "sheer"].includes(damage.kind))
    throw new Error("Unsupported damage domain");
  const level = finite(actor.levelCoefficient, "level coefficient", 0.001);
  const basis = finite(p[damage.basis], "damage basis");
  const multiplier = finite(damage.multiplier, "damage multiplier");
  const effectiveDefense = Math.max(
    0,
    enemy.defense *
      (1 - clamp(p.defReduction / 100, 0, 1)) *
      (1 - clamp(p.penRatio / 100, 0, 1)) -
      p.penFlat,
  );
  const defense =
    damage.kind === "sheer" ? 1 : level / (level + effectiveDefense);
  const resistance = clamp(
    1 - (enemy.resistance[damage.element] - p.resIgnore) / 100,
    0.01,
    2,
  );
  const scalingBonus = damage.bonusFromStat
    ? Math.min(
        damage.bonusFromStat.cap,
        Math.max(0, p[damage.bonusFromStat.stat] * damage.bonusFromStat.scale),
      )
    : 0;
  const bonus = Math.max(
    0,
    1 +
      (p.damageBonus +
        (actor.elementBonuses?.[damage.element] ?? 0) +
        scalingBonus) /
        100,
  );
  const vulnerability = Math.max(0, 1 + p.vulnerability / 100);
  const stun = stunned ? enemy.stunMultiplier : 1;
  // The model must explicitly supply anomaly level/special-domain factors.
  if (damage.kind !== "direct" && damage.domainMultiplier === undefined)
    throw new Error("Missing damage domain model");
  const domain =
    finite(damage.domainMultiplier ?? 1, "damage domain multiplier") *
    (damage.kind === "anomaly" ? Math.max(0, p.anomalyProficiency) / 100 : 1);
  const nonCritical =
    basis *
    multiplier *
    bonus *
    defense *
    resistance *
    vulnerability *
    stun *
    domain;
  const critical =
    nonCritical * (damage.canCrit ? 1 + Math.max(0, p.critDmg) / 100 : 1);
  const expected =
    nonCritical + (critical - nonCritical) * clamp(p.critRate / 100, 0, 1);
  if (![nonCritical, critical, expected].every(Number.isFinite))
    throw new Error("Non-finite damage");
  return {
    basis,
    multiplier,
    bonus,
    defense,
    resistance,
    vulnerability,
    stun,
    domain,
    nonCritical,
    critical,
    expected,
  };
}
