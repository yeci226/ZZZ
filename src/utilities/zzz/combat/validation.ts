import {
  ELEMENTS,
  finite as finiteInput,
  integer as integerInput,
} from "./stats.js";
import { PANEL_STATS } from "./damage.js";
import { validateRotation } from "./rotation.js";
import type {
  Buff,
  BuildSnapshot,
  DamageSpec,
  EnemyShield,
  SimulationScenario,
} from "./types.js";

function finite(
  value: unknown,
  label: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
) {
  if (typeof value !== "number") throw new Error(`Expected numeric ${label}`);
  return finiteInput(value, label, min, max);
}
function integer(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "number") throw new Error(`Expected numeric ${label}`);
  return integerInput(value, label, min, max);
}
function validateClock(clock: unknown) {
  if (clock !== undefined && clock !== "combat" && clock !== "animation")
    throw new Error("Unknown clock domain");
}
function validateShield(shield: EnemyShield) {
  finite(shield.hp, "shield HP", 0, 1e15);
  if (
    !Array.isArray(shield.sources) ||
    !shield.sources.length ||
    shield.sources.some(
      (source) => typeof source !== "string" || !source.trim(),
    )
  )
    throw new Error("Shield requires explicit sources");
}

export function validateBuff(b: Buff) {
  validateClock(b.clock);
  if (
    !/^[a-zA-Z0-9:_-]{1,100}$/.test(b.id) ||
    !["self", "team"].includes(b.target) ||
    !PANEL_STATS.includes(b.stat) ||
    !["flat", "percent"].includes(b.mode) ||
    !["refresh", "independent"].includes(b.stacking)
  )
    throw new Error("Invalid buff model");
  finite(b.value, "buff value", -100_000, 100_000);
  integer(b.durationMs, "buff duration", 1, 3_600_000);
  integer(b.maxStacks, "buff stacks", 1, 100);
}
export function validateDamage(d: DamageSpec) {
  if (
    d.category !== undefined &&
    !["direct", "anomaly", "disorder", "sheer", "special"].includes(d.category)
  )
    throw new Error("Invalid damage category");
  if (
    !["direct", "anomaly", "sheer"].includes(d.kind) ||
    !ELEMENTS.includes(d.element) ||
    !["atk", "hp", "def", "anomalyProficiency"].includes(d.basis) ||
    typeof d.canCrit !== "boolean"
  )
    throw new Error("Unsupported damage specification");
  finite(d.multiplier, "damage multiplier", 0, 100_000);
  if (d.kind !== "direct" || d.domainMultiplier !== undefined)
    finite(d.domainMultiplier, "domain multiplier", 0, 100_000);
  if (d.bonusFromStat) {
    if (!PANEL_STATS.includes(d.bonusFromStat.stat))
      throw new Error("Unknown damage bonus stat");
    finite(d.bonusFromStat.scale, "damage bonus scale", 0, 100_000);
    finite(d.bonusFromStat.cap, "damage bonus cap", 0, 100_000);
  }
}
export function validateBuild(b: BuildSnapshot, modelVersion: string) {
  if (
    !/^[a-zA-Z0-9_-]{1,40}$/.test(b.id) ||
    !["agent", "bangboo"].includes(b.kind) ||
    typeof b.name !== "string" ||
    b.name.length > 100
  )
    throw new Error("Invalid actor identity");
  if (
    !b.provenance.verified ||
    !b.provenance.sources.length ||
    b.provenance.unsupported.length ||
    b.modelVersion !== modelVersion
  )
    throw new Error(`Unverified combat model: ${b.id}`);
  integer(b.level, "actor level", 1, 60);
  integer(b.cinema, "cinema", 0, 6);
  finite(b.levelCoefficient, "level coefficient", 0.001, 10_000);
  for (const stat of PANEL_STATS) finite(b.panel[stat], stat, -100, 10_000_000);
  for (const [el, value] of Object.entries(b.elementBonuses ?? {})) {
    if (!ELEMENTS.includes(el as any)) throw new Error("Unknown element bonus");
    finite(value, "element bonus", -100, 100_000);
  }
  for (const [name, r] of Object.entries(b.resources)) {
    validateClock(r.regenClock);
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name))
      throw new Error("Invalid resource name");
    finite(r.max, "max resource", 0, 100_000);
    finite(r.initial, "initial resource", 0, r.max);
    finite(r.regenPerSecond, "resource regen", 0, 100_000);
    if (r.regenStat !== undefined && r.regenStat !== "energyRegen")
      throw new Error("Unknown resource regeneration stat");
  }
  if (!Object.keys(b.actions).length || !b.defaultPriority.length)
    throw new Error("Missing action model");
  b.initialBuffs?.forEach(validateBuff);
  if (
    (b.anomalyEffects?.length ?? 0) > 100 ||
    new Set(b.anomalyEffects?.map((e) => e.id)).size !==
      (b.anomalyEffects?.length ?? 0)
  )
    throw new Error("Invalid anomaly effects");
  for (const effect of b.anomalyEffects ?? []) {
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(effect.id) ||
      !ELEMENTS.includes(effect.element) ||
      (!effect.periodicCopy && !effect.disorderBonus)
    )
      throw new Error("Invalid anomaly effect");
    if (effect.periodicCopy) {
      validateClock(effect.periodicCopy.clock);
      integer(effect.periodicCopy.intervalMs, "copy interval", 1, 300_000);
      finite(effect.periodicCopy.multiplier, "copy multiplier", 0, 1000);
    }
    if (effect.disorderBonus) {
      finite(effect.disorderBonus.perSecond, "disorder bonus", 0, 1000);
      finite(effect.disorderBonus.cap, "disorder cap", 0, 1000);
    }
  }
  for (const [id, a] of Object.entries(b.actions)) {
    validateClock(a.clock);
    validateClock(a.cooldownClock);
    if (id !== a.id || !/^[a-zA-Z0-9_-]{1,80}$/.test(id))
      throw new Error("Invalid action ID");
    if (
      a.execution !== undefined &&
      !["manual", "trigger"].includes(a.execution)
    )
      throw new Error("Invalid action execution mode");
    integer(a.durationMs, "action duration", 1, 300_000);
    integer(a.cooldownMs, "cooldown", 0, 300_000);
    let end = 0,
      paused = 0;
    for (const pause of a.clockPauses ?? []) {
      integer(pause.startMs, "pause start", end, a.durationMs);
      integer(
        pause.durationMs,
        "pause duration",
        1,
        a.durationMs - pause.startMs,
      );
      end = pause.startMs + pause.durationMs;
      paused += pause.durationMs;
    }
    if (paused >= a.durationMs)
      throw new Error("Action must advance combat time");
    let previousCancelEnd = 0;
    for (const window of a.cancelWindows ?? []) {
      integer(
        window.startMs,
        "cancel window start",
        previousCancelEnd + 1,
        a.durationMs - 1,
      );
      integer(
        window.endMs,
        "cancel window end",
        window.startMs,
        a.durationMs - 1,
      );
      previousCancelEnd = window.endMs;
      if (
        !["cancel", "retain-marked"].includes(window.pendingHits) ||
        !Array.isArray(window.sources) ||
        !window.sources.length ||
        window.sources.some(
          (source) => typeof source !== "string" || !source.trim(),
        )
      )
        throw new Error(
          "Cancellation requires authored hit policy and sources",
        );
      if (
        !window.refund ||
        typeof window.refund !== "object" ||
        Array.isArray(window.refund)
      )
        throw new Error("Cancellation requires an explicit refund policy");
      for (const [key, value] of Object.entries(window.refund)) {
        if (!Object.hasOwn(b.resources, key))
          throw new Error("Unknown cancel refund resource");
        finite(value, "cancel refund", 0, a.cost[key] ?? 0);
      }
      for (const endpoint of [window.startMs, window.endMs]) {
        const combatTime =
          endpoint -
          (a.clockPauses ?? []).reduce(
            (sum, pause) =>
              sum +
              Math.max(0, Math.min(pause.durationMs, endpoint - pause.startMs)),
            0,
          );
        if (a.clock !== "combat" && combatTime <= 0)
          throw new Error("Cancellation must advance combat time");
      }
    }
    for (const [key, amount] of Object.entries(a.cost)) {
      if (!Object.hasOwn(b.resources, key))
        throw new Error("Unknown cost resource");
      finite(amount, "resource cost", 0, b.resources[key].max);
    }
    if (
      a.requires?.resource &&
      !Object.hasOwn(b.resources, a.requires.resource.name)
    )
      throw new Error("Unknown condition resource");
    if (a.hits.length > 1000) throw new Error("Too many hits");
    a.buffs?.forEach(validateBuff);
    for (const h of a.hits) {
      validateClock(h.clock);
      if (
        h.persistsAfterCancel !== undefined &&
        typeof h.persistsAfterCancel !== "boolean"
      )
        throw new Error("Invalid persistent hit policy");
      integer(h.atMs, "hit time", 0, a.durationMs);
      finite(h.daze, "daze", 0, 1_000_000);
      validateDamage(h.damage);
      h.buffs?.forEach(validateBuff);
      h.critBuffs?.forEach(validateBuff);
      for (const [key, gain] of Object.entries(h.resourceGain ?? {})) {
        if (!Object.hasOwn(b.resources, key))
          throw new Error("Unknown gain resource");
        finite(gain, "resource gain", 0, 100_000);
      }
      if (h.anomaly) {
        if (!ELEMENTS.includes(h.anomaly.element))
          throw new Error("Unknown anomaly element");
        finite(h.anomaly.buildup, "buildup", 0, 1_000_000);
        validateDamage(h.anomaly.damage);
      }
      if (h.forcedAnomaly) {
        if (
          !ELEMENTS.includes(h.forcedAnomaly.element) ||
          !/^[a-zA-Z0-9_-]{1,80}$/.test(h.forcedAnomaly.key)
        )
          throw new Error("Invalid forced anomaly");
        validateDamage(h.forcedAnomaly.damage);
        if (h.forcedAnomaly.damage.element !== h.forcedAnomaly.element)
          throw new Error("Forced anomaly element mismatch");
      }
    }
  }
  if (
    b.defaultPriority.some(
      (id) =>
        !Object.hasOwn(b.actions, id) || b.actions[id].execution === "trigger",
    )
  )
    throw new Error("Invalid default rotation");
  if (
    (b.triggers?.length ?? 0) > 100 ||
    new Set(b.triggers?.map((t) => t.id)).size !== (b.triggers?.length ?? 0)
  )
    throw new Error("Invalid passive triggers");
  for (const trigger of b.triggers ?? []) {
    validateClock(trigger.cooldownClock);
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(trigger.id) ||
      !["hit", "anomaly", "disorder"].includes(trigger.event) ||
      !["self", "ally", "team"].includes(trigger.source) ||
      !Object.hasOwn(b.actions, trigger.action) ||
      (trigger.element !== undefined && !ELEMENTS.includes(trigger.element)) ||
      (trigger.offFieldOnly !== undefined &&
        typeof trigger.offFieldOnly !== "boolean")
    )
      throw new Error("Invalid passive trigger");
    integer(trigger.cooldownMs, "trigger cooldown", 1, 300_000);
  }
}
export function validateScenario(s: SimulationScenario): SimulationScenario {
  if (
    s.schemaVersion !== 1 ||
    typeof s.modelVersion !== "string" ||
    !s.modelVersion
  )
    throw new Error("Invalid scenario version");
  if (s.mode !== undefined && !["fixed-duration", "kill"].includes(s.mode))
    throw new Error("Invalid simulation mode");
  for (const version of [s.gameDataVersion, s.rotationVersion])
    if (
      version !== undefined &&
      (typeof version !== "string" || !version.trim() || version.length > 100)
    )
      throw new Error("Invalid data or rotation version");
  integer(s.durationMs, "combat duration", 30_000, 300_000);
  integer(s.trials, "trial count", 1, 100);
  integer(s.seed, "random seed", 0, 0xffffffff);
  integer(s.switchMs, "switch time", 1, 5000);
  if (
    !Array.isArray(s.team) ||
    s.team.length < 1 ||
    s.team.length > 3 ||
    s.team.some((a) => a.kind !== "agent")
  )
    throw new Error("Invalid team");
  const actors = [...s.team, ...(s.bangboo ? [s.bangboo] : [])];
  if (
    new Set(actors.map((a) => a.id)).size !== actors.length ||
    (s.bangboo && s.bangboo.kind !== "bangboo")
  )
    throw new Error("Invalid actor composition");
  actors.forEach((a) => validateBuild(a, s.modelVersion));
  if (s.initialState) {
    if (!s.team.some((a) => a.id === s.initialState!.activeActor))
      throw new Error("Initial active actor must belong to the team");
    if (
      !s.initialState.resources ||
      Array.isArray(s.initialState.resources) ||
      typeof s.initialState.resources !== "object"
    )
      throw new Error("Invalid initial resources");
    for (const [id, values] of Object.entries(s.initialState.resources)) {
      const actor = actors.find((a) => a.id === id);
      if (
        !actor ||
        !values ||
        Array.isArray(values) ||
        typeof values !== "object"
      )
        throw new Error("Unknown initial resource actor");
      for (const [key, value] of Object.entries(values)) {
        if (!Object.hasOwn(actor.resources, key))
          throw new Error("Unknown initial resource");
        finite(value, "initial resource override", 0, actor.resources[key].max);
      }
    }
  }
  if (typeof s.loop !== "boolean") throw new Error("Invalid loop flag");
  const e = s.enemy;
  validateClock(e.stunClock);
  if (e.shield) validateShield(e.shield);
  if (s.mode === "kill" || e.hp !== undefined)
    finite(e.hp, "enemy hp", 0.001, 1e15);
  integer(e.level, "enemy level", 1, 100);
  finite(e.defense, "enemy defense", 0, 1_000_000);
  for (const el of ELEMENTS) finite(e.resistance[el], "resistance", -100, 100);
  finite(e.stunThreshold, "stun threshold", 0.001, 1_000_000);
  integer(e.stunDurationMs, "stun duration", 1, 300_000);
  finite(e.stunMultiplier, "stun multiplier", 1, 100);
  if (
    e.phases !== undefined &&
    (!Array.isArray(e.phases) ||
      e.phases.length > 100 ||
      new Set(e.phases.map((p) => p.id)).size !== e.phases.length)
  )
    throw new Error("Invalid enemy phases");
  for (const phase of e.phases ?? []) {
    validateClock(phase.clock);
    if (phase.clock !== undefined && phase.atMs === undefined)
      throw new Error("A clock is only valid for timed enemy phases");
    if (phase.shield) validateShield(phase.shield);
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(phase.id) ||
      !Array.isArray(phase.sources) ||
      !phase.sources.length ||
      phase.sources.some(
        (source) => typeof source !== "string" || !source.trim(),
      )
    )
      throw new Error("Enemy phase requires identity and sources");
    if ((phase.atMs !== undefined) === (phase.hpRatio !== undefined))
      throw new Error("Enemy phase requires exactly one trigger");
    if (phase.atMs !== undefined)
      integer(
        phase.atMs,
        "enemy phase time",
        0,
        phase.clock === "animation" ? 3_600_000 - 1 : s.durationMs - 1,
      );
    if (phase.hpRatio !== undefined) {
      if (s.mode !== "kill") throw new Error("HP phases require kill mode");
      finite(phase.hpRatio, "phase HP ratio", 0, 1);
    }
    if (phase.defense !== undefined)
      finite(phase.defense, "phase defense", 0, 1_000_000);
    for (const [element, value] of Object.entries(phase.resistance ?? {})) {
      if (!ELEMENTS.includes(element as any))
        throw new Error("Unknown phase element");
      finite(value, "phase resistance", -100, 100);
    }
    if (
      phase.invulnerable !== undefined &&
      typeof phase.invulnerable !== "boolean"
    )
      throw new Error("Invalid invulnerable state");
  }
  for (const [el, model] of Object.entries(e.anomaly)) {
    if (!ELEMENTS.includes(el as any) || !model)
      throw new Error("Invalid anomaly target model");
    validateClock(model.durationClock);
    validateClock(model.tickClock);
    finite(model.threshold, "anomaly threshold", 0.001, 1_000_000);
    integer(model.durationMs, "anomaly duration", 1, 300_000);
    integer(model.tickMs, "anomaly interval", 1, 300_000);
    integer(model.maxProcs, "anomaly procs", 1, 1000);
    validateDamage(model.disorder);
    if (!["periodic", "immediate", "onHit"].includes(model.trigger))
      throw new Error("Unknown anomaly trigger");
    if (
      model.buildupWeighting !== undefined &&
      !["threshold", "fullHit"].includes(model.buildupWeighting)
    )
      throw new Error("Invalid anomaly weighting");
  }
  for (const actor of actors)
    for (const action of Object.values(actor.actions))
      for (const hit of action.hits) {
        for (const anomaly of [hit.anomaly, hit.forcedAnomaly])
          if (anomaly && !e.anomaly[anomaly.element])
            throw new Error(`Missing anomaly target model ${anomaly.element}`);
      }
  if (!Array.isArray(s.incoming) || s.incoming.length > 1000)
    throw new Error("Invalid incoming events");
  for (const event of s.incoming) {
    validateClock(event.clock);
    integer(
      event.atMs,
      "enemy event",
      0,
      event.clock === "animation" ? 3_600_000 - 1 : s.durationMs - 1,
    );
    integer(event.windowMs, "response window", 1, 10_000);
  }
  return {
    ...structuredClone(s),
    rotation: validateRotation(s.rotation, s.team),
  };
}
