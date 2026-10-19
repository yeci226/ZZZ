import type { Element } from "./stats.js";
import type { ClockDomain } from "./clocks.js";

export type CombatStat =
  | "hp"
  | "atk"
  | "def"
  | "critRate"
  | "critDmg"
  | "impact"
  | "anomalyProficiency"
  | "anomalyMastery"
  | "energyRegen"
  | "penRatio"
  | "penFlat"
  | "damageBonus"
  | "resIgnore"
  | "defReduction"
  | "vulnerability";
export type Panel = Record<CombatStat, number>;
export interface Resource {
  initial: number;
  max: number;
  regenPerSecond: number;
  regenStat?: "energyRegen";
  regenClock?: ClockDomain;
}
export interface Condition {
  resource?: { name: string; atLeast: number };
  stunned?: boolean;
  incoming?: boolean;
}
export interface Buff {
  id: string;
  target: "self" | "team";
  stat: CombatStat;
  value: number;
  mode: "flat" | "percent";
  durationMs: number;
  clock?: ClockDomain;
  maxStacks: number;
  /** Independent expiry for each stack; refresh replaces the oldest stack. */
  stacking: "refresh" | "independent";
}
export interface DamageSpec {
  kind: "direct" | "anomaly" | "sheer";
  /** Reporting classification is independent of the mathematical damage domain. */
  category?: DamageCategory;
  element: Element;
  basis: "atk" | "hp" | "def" | "anomalyProficiency";
  multiplier: number;
  canCrit: boolean;
  /** Explicit source-verified multipliers for non-standard damage domains. */
  domainMultiplier?: number;
  /** Additive damage bonus in percentage points, evaluated at the hit's stat snapshot. */
  bonusFromStat?: { stat: CombatStat; scale: number; cap: number };
}
export interface Hit {
  atMs: number;
  clock?: ClockDomain;
  /** Survives authored cancellation only when its window permits marked hits. */
  persistsAfterCancel?: boolean;
  damage: DamageSpec;
  daze: number;
  resourceGain?: Record<string, number>;
  buffs?: Buff[];
  critBuffs?: Buff[];
  anomaly?: { element: Element; buildup: number; damage: DamageSpec };
  /** A separate anomaly identity can disorder with the same element without consuming its gauge. */
  forcedAnomaly?: { element: Element; key: string; damage: DamageSpec };
}
export interface ActionModel {
  id: string;
  name: string;
  execution?: "manual" | "trigger";
  durationMs: number;
  /** Defaults to combat; legacy models with clockPauses use animation offsets. */
  clock?: ClockDomain;
  /** Only authored pauses stop the combat clock; no guessed animation timing. */
  clockPauses?: { startMs: number; durationMs: number }[];
  cancelWindows?: {
    startMs: number;
    endMs: number;
    pendingHits: "cancel" | "retain-marked";
    refund: Record<string, number>;
    sources: string[];
  }[];
  cooldownMs: number;
  cooldownClock?: ClockDomain;
  requires?: Condition;
  cost: Record<string, number>;
  buffs?: Buff[];
  hits: Hit[];
}
export interface BuildSnapshot {
  id: string;
  name: string;
  kind: "agent" | "bangboo";
  level: number;
  cinema: number;
  modelVersion: string;
  /** Already reconstructed out-of-combat panel, never a blindly reused final API panel. */
  panel: Panel;
  elementBonuses?: Partial<Record<Element, number>>;
  levelCoefficient: number;
  resources: Record<string, Resource>;
  actions: Record<string, ActionModel>;
  defaultPriority: string[];
  initialBuffs?: Buff[];
  anomalyEffects?: {
    id: string;
    element: Element;
    /** Copies of the active anomaly's snapshotted damage, credited to this actor. */
    periodicCopy?: {
      intervalMs: number;
      multiplier: number;
      clock?: ClockDomain;
    };
    /** Add to the disorder's base multiplier for each remaining second. */
    disorderBonus?: { perSecond: number; cap: number };
  }[];
  triggers?: {
    id: string;
    event: "hit" | "anomaly" | "disorder";
    source: "self" | "ally" | "team";
    element?: Element;
    offFieldOnly?: boolean;
    cooldownMs: number;
    cooldownClock?: ClockDomain;
    action: string;
  }[];
  provenance: { sources: string[]; verified: boolean; unsupported: string[] };
}
export interface EnemyModel {
  hp?: number;
  shield?: EnemyShield;
  level: number;
  defense: number;
  resistance: Record<Element, number>;
  stunThreshold: number;
  stunDurationMs: number;
  stunClock?: ClockDomain;
  stunMultiplier: number;
  /** Authored changes; omitted properties retain their previous value. */
  phases?: EnemyPhase[];
  anomaly: Partial<
    Record<
      Element,
      {
        threshold: number;
        durationMs: number;
        durationClock?: ClockDomain;
        tickMs: number;
        tickClock?: ClockDomain;
        trigger: "immediate" | "periodic" | "onHit";
        maxProcs: number;
        disorder: DamageSpec;
        buildupWeighting?: "threshold" | "fullHit";
      }
    >
  >;
}
export interface EnemyPhase {
  id: string;
  sources: string[];
  /** Exactly one trigger; HP thresholds are only meaningful in kill mode. */
  atMs?: number;
  clock?: ClockDomain;
  hpRatio?: number;
  defense?: number;
  resistance?: Partial<Record<Element, number>>;
  invulnerable?: boolean;
  /** Replaces the current pool; hp=0 removes it. */
  shield?: EnemyShield;
}
export interface EnemyShield {
  /** Authored 1:1 absorption of post-mitigation damage before HP. */
  hp: number;
  sources: string[];
}
export type DamageCategory =
  "direct" | "anomaly" | "disorder" | "sheer" | "special";
export type SimulationMode = "fixed-duration" | "kill";
export type RotationStep =
  | {
      type: "action";
      actor: string;
      action: string;
      when?: Condition;
      onUnavailable?: "skip" | "wait" | "error";
      maxWaitMs?: number;
      /** Time in the action's clock; must fall inside an authored cancellation window. */
      cancelAtMs?: number;
    }
  | { type: "switch"; actor: string }
  | { type: "wait"; ms: number }
  | { type: "repeat"; count: number; steps: RotationStep[] };
export interface SimulationScenario {
  schemaVersion: 1;
  modelVersion: string;
  mode?: SimulationMode;
  gameDataVersion?: string;
  rotationVersion?: string;
  initialState?: {
    activeActor: string;
    resources: Record<string, Record<string, number>>;
  };
  durationMs: number;
  team: BuildSnapshot[];
  bangboo?: BuildSnapshot;
  enemy: EnemyModel;
  rotation: RotationStep[];
  loop: boolean;
  incoming: { atMs: number; windowMs: number; clock?: ClockDomain }[];
  switchMs: number;
  seed: number;
  trials: number;
}
export interface DamageBreakdown {
  basis: number;
  multiplier: number;
  bonus: number;
  defense: number;
  resistance: number;
  vulnerability: number;
  stun: number;
  domain: number;
  nonCritical: number;
  critical: number;
  expected: number;
}
export interface CombatEvent {
  atMs: number;
  animationAtMs?: number;
  /** All contribution rows of one visible damage event share this deterministic ID. */
  damageEventId?: string;
  kind:
    | "action"
    | "damage"
    | "buff"
    | "switch"
    | "incoming"
    | "stun"
    | "recover"
    | "anomaly"
    | "disorder"
    | "resource"
    | "phase"
    | "cancel"
    | "shield-break"
    | "pause"
    | "resume";
  actor?: string;
  action?: string;
  amount?: number;
  critical?: boolean;
  detail?: string;
  breakdown?: DamageBreakdown;
  /** Contribution weight applied after the displayed damage multipliers. */
  weight?: number;
  sourceActor?: string;
  triggerActor?: string;
  element?: Element;
  category?: DamageCategory;
  effectiveAmount?: number;
  overkill?: number;
  shieldAmount?: number;
  resource?: string;
  value?: number;
  delta?: number;
}
export interface TrialResult {
  seed: number;
  total: number;
  byActor: Record<string, number>;
  byAction: Record<string, number>;
  perSecond: number[];
  events: CombatEvent[];
  elapsedMs: number;
  animationElapsedMs: number;
  killed: boolean;
  remainingHp: number | null;
  effectiveDamage: number;
  overkill: number;
  shieldDamage: number;
  remainingShield: number;
  byCategory: Record<DamageCategory, number>;
  buffUptimeMs: Record<string, number>;
  buffAnimationUptimeMs: Record<string, number>;
  finalResources: Record<string, Record<string, number>>;
}
export interface SimulationResult {
  schemaVersion: 1;
  engineVersion: string;
  fingerprint: string;
  comparisonFingerprint: string;
  mode: SimulationMode;
  modelVersion: string;
  durationMs: number;
  trials: number;
  meanDamage: number;
  meanDps: number | null;
  p10: number;
  p90: number;
  byActor: Record<string, number>;
  byAction: Record<string, number>;
  perSecond: number[];
  byCategory: Record<DamageCategory, number>;
  meanEffectiveDamage: number;
  meanOverkill: number;
  meanShieldDamage: number;
  buffUptime: Record<string, number>;
  kill: {
    rate: number;
    meanTimeMs: number | null;
    p10TimeMs: number | null;
    p90TimeMs: number | null;
    meanRemainingHp: number | null;
  };
  /** The first seed's complete trace; summaries are across all trials. */
  trace: TrialResult;
}
