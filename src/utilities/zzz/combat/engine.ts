import { DualClockQueue, type ClockDomain, type ClockState } from "./clocks.js";
import { calculateDamage } from "./damage.js";
import { hash } from "./scoring.js";
import { expandRotation } from "./rotation.js";
import { validateScenario } from "./validation.js";
import type { Element } from "./stats.js";
import type {
  ActionModel,
  Buff,
  BuildSnapshot,
  CombatEvent,
  Condition,
  DamageCategory,
  DamageSpec,
  EnemyPhase,
  Hit,
  Panel,
  SimulationResult,
  SimulationScenario,
  TrialResult,
} from "./types.js";

export const COMBAT_ENGINE_VERSION = "zzz-combat-experimental-5";
const categories = (): Record<DamageCategory, number> => ({
  direct: 0,
  anomaly: 0,
  disorder: 0,
  sheer: 0,
  special: 0,
});
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function actionClock(action: ActionModel): ClockDomain {
  return action.clock ?? (action.clockPauses?.length ? "animation" : "combat");
}
interface ActiveBuff {
  buff: Buff;
  source: string;
  targets: string[];
  expires: number;
  sequence: number;
}
interface Contribution {
  actor: BuildSnapshot;
  damage: DamageSpec;
  buildup: number;
}
interface AnomalyState {
  element: Element;
  key: string;
  contributions: Contribution[];
  expires: number;
  remaining: number;
  nextProc: number;
  token: number;
  initiator: BuildSnapshot;
}

/** General event runner. Real-game availability is controlled by the verified model catalog. */
export function simulateTrial(
  s: SimulationScenario,
  seed: number,
  trace = true,
): TrialResult {
  const rng = random(seed),
    queue = new DualClockQueue();
  const actors = [...s.team, ...(s.bangboo ? [s.bangboo] : [])],
    lookup = new Map(actors.map((a) => [a.id, a]));
  const resources = new Map(
    actors.map((a) => [
      a.id,
      Object.fromEntries(
        Object.entries(a.resources).map(([k, r]) => [
          k,
          s.initialState?.resources[a.id]?.[k] ?? r.initial,
        ]),
      ),
    ]),
  );
  const cooldowns = new Map<string, number>(),
    triggerCooldowns = new Map<string, number>();
  const steps = expandRotation(s.rotation);
  let buffs: ActiveBuff[] = [],
    now = 0,
    animationNow = 0,
    sequence = 0,
    damageSequence = 0,
    active = s.initialState?.activeActor ?? s.team[0].id,
    stunUntil = -1,
    daze = 0,
    stepIndex = 0;
  const pauses = new Set<number>();
  const clockNow = (clock: ClockDomain = "combat") =>
    clock === "combat" ? now : animationNow;
  const incomingWindows: { until: number; clock: ClockDomain }[] = [];
  const incomingActive = () =>
    incomingWindows.some((window) => window.until > clockNow(window.clock));
  const stunned = () => clockNow(s.enemy.stunClock) < stunUntil;
  const mode = s.mode ?? "fixed-duration";
  const enemy = structuredClone(s.enemy);
  let invulnerable = false;
  const appliedPhases = new Set<string>();
  let pendingWait: { index: number; since: number } | undefined;
  let anomaly: AnomalyState | undefined,
    anomalyToken = 0;
  const buildup = new Map<Element, Contribution[]>();
  const result: TrialResult = {
    seed,
    total: 0,
    byActor: {},
    byAction: {},
    perSecond: Array(Math.ceil(s.durationMs / 1000)).fill(0),
    events: [],
    elapsedMs: s.durationMs,
    animationElapsedMs: s.durationMs,
    killed: false,
    remainingHp: mode === "kill" ? s.enemy.hp! : null,
    effectiveDamage: 0,
    overkill: 0,
    shieldDamage: 0,
    remainingShield: s.enemy.shield?.hp ?? 0,
    byCategory: categories(),
    buffUptimeMs: {},
    buffAnimationUptimeMs: {},
    finalResources: {},
  };
  const log = (e: Omit<CombatEvent, "atMs">) => {
    if (trace)
      result.events.push({ atMs: now, animationAtMs: animationNow, ...e });
  };
  const schedule = (
    time: number,
    priority: number,
    run: () => void,
    clock: ClockDomain = "combat",
  ) => {
    if (time < clockNow(clock) || !Number.isFinite(time))
      throw new Error("Invalid event time");
    if (clock === "animation" || time <= s.durationMs)
      queue.push({ time, priority, sequence: sequence++, run, clock });
  };
  const applyPhase = (phase: EnemyPhase) => {
    if (appliedPhases.has(phase.id)) return;
    appliedPhases.add(phase.id);
    if (phase.defense !== undefined) enemy.defense = phase.defense;
    Object.assign(enemy.resistance, phase.resistance);
    if (phase.invulnerable !== undefined) invulnerable = phase.invulnerable;
    if (phase.shield) result.remainingShield = phase.shield.hp;
    log({ kind: "phase", detail: phase.id });
  };
  const hpPhases = () => {
    if (result.remainingHp === null) return;
    for (const phase of enemy.phases ?? [])
      if (
        phase.hpRatio !== undefined &&
        result.remainingHp / s.enemy.hp! <= phase.hpRatio
      )
        applyPhase(phase);
  };
  const changeResource = (
    actor: BuildSnapshot,
    key: string,
    value: number,
    reason: string,
  ) => {
    const values = resources.get(actor.id)!;
    const next = Math.min(actor.resources[key].max, Math.max(0, value));
    const delta = next - values[key];
    values[key] = next;
    if (delta)
      log({
        kind: "resource",
        actor: actor.id,
        resource: key,
        value: next,
        delta,
        detail: reason,
      });
  };
  const panel = (actor: BuildSnapshot): Panel => {
    const p = { ...actor.panel };
    for (const b of buffs)
      if (b.expires > clockNow(b.buff.clock) && b.targets.includes(actor.id)) {
        p[b.buff.stat] +=
          b.buff.mode === "flat"
            ? b.buff.value
            : (actor.panel[b.buff.stat] * b.buff.value) / 100;
      }
    return p;
  };
  const apply = (actor: BuildSnapshot, additions?: Buff[]) => {
    for (const buff of additions ?? []) {
      buffs = buffs.filter((b) => b.expires > clockNow(b.buff.clock));
      const matching = buffs
        .filter((b) => b.source === actor.id && b.buff.id === buff.id)
        .sort((a, b) => a.sequence - b.sequence);
      if (
        matching.some(
          (entry) =>
            (entry.buff.clock ?? "combat") !== (buff.clock ?? "combat"),
        )
      )
        throw new Error("An active buff cannot change its clock domain");
      if (matching.length >= buff.maxStacks)
        buffs = buffs.filter((b) => b !== matching[0]);
      if (buff.stacking === "refresh")
        for (const b of matching)
          b.expires = clockNow(b.buff.clock) + buff.durationMs;
      buffs.push({
        buff,
        source: actor.id,
        targets: buff.target === "self" ? [actor.id] : s.team.map((a) => a.id),
        expires: clockNow(buff.clock) + buff.durationMs,
        sequence: sequence++,
      });
      schedule(
        clockNow(buff.clock) + buff.durationMs,
        0,
        () => {
          buffs = buffs.filter((b) => b.expires > clockNow(b.buff.clock));
        },
        buff.clock,
      );
      log({ kind: "buff", actor: actor.id, detail: buff.id });
    }
  };
  const matches = (actor: BuildSnapshot, when?: Condition): boolean =>
    !when ||
    ((when.stunned === undefined || when.stunned === stunned()) &&
      (when.incoming === undefined || when.incoming === incomingActive()) &&
      (!when.resource ||
        (resources.get(actor.id)![when.resource.name] ?? -1) >=
          when.resource.atLeast));
  const prepareDamage = (
    actor: BuildSnapshot,
    action: string,
    spec: DamageSpec,
    weight = 1,
    snapshot = false,
    creditedActor = actor.id,
    category: DamageCategory = spec.category ?? spec.kind,
    triggerActor = actor.id,
  ) => {
    const p = snapshot ? actor.panel : panel(actor);
    const breakdown = calculateDamage(
      { ...actor, panel: p },
      spec,
      enemy,
      stunned(),
    );
    const crit =
      !invulnerable &&
      spec.canCrit &&
      rng() < Math.min(1, Math.max(0, p.critRate / 100));
    const amount = invulnerable
      ? 0
      : (crit ? breakdown.critical : breakdown.nonCritical) * weight;
    return {
      actor,
      action,
      spec,
      weight,
      creditedActor,
      category,
      triggerActor,
      breakdown,
      crit,
      amount,
    };
  };
  // Contributions describe one actual damage event. Settle all against the same
  // target state, then apportion effective damage and overkill proportionally.
  const dealGroup = (packets: Parameters<typeof prepareDamage>[]) => {
    if (result.killed) return [];
    const damageEventId = `damage-${++damageSequence}`;
    const prepared = packets.map((packet) => prepareDamage(...packet));
    const total = prepared.reduce((sum, p) => sum + p.amount, 0);
    const shieldAmount = Math.min(result.remainingShield, total);
    const remainingDamage = total - shieldAmount;
    const effective =
      result.remainingHp === null
        ? remainingDamage
        : Math.min(result.remainingHp, remainingDamage);
    const ratio = total ? effective / total : 1;
    const shieldRatio = total ? shieldAmount / total : 0;
    const overkillRatio = total ? (remainingDamage - effective) / total : 0;
    for (const p of prepared) {
      const effectiveAmount = p.amount * ratio,
        absorbed = p.amount * shieldRatio,
        overkill = p.amount * overkillRatio;
      result.byCategory[p.category] += p.amount;
      result.byActor[p.creditedActor] =
        (result.byActor[p.creditedActor] ?? 0) + p.amount;
      const key = `${p.creditedActor}/${p.action}`;
      result.byAction[key] = (result.byAction[key] ?? 0) + p.amount;
      log({
        kind: "damage",
        damageEventId,
        actor: p.creditedActor,
        sourceActor: p.actor.id,
        action: p.action,
        amount: p.amount,
        critical: p.crit,
        breakdown: p.breakdown,
        weight: p.weight,
        category: p.category,
        element: p.spec.element,
        effectiveAmount,
        overkill,
        shieldAmount: absorbed,
        triggerActor: p.triggerActor,
        ...(invulnerable ? { detail: "invulnerable" } : {}),
      });
    }
    result.total += total;
    result.effectiveDamage += effective;
    result.overkill += remainingDamage - effective;
    result.shieldDamage += shieldAmount;
    if (result.remainingShield > 0) {
      result.remainingShield -= shieldAmount;
      if (result.remainingShield === 0)
        log({
          kind: "shield-break",
          triggerActor: prepared[0]?.triggerActor,
          value: 0,
        });
    }
    result.perSecond[Math.floor(now / 1000)] += total;
    if (result.remainingHp !== null) {
      result.remainingHp = Math.max(0, result.remainingHp - effective);
      if (result.remainingHp === 0) {
        result.killed = true;
        result.elapsedMs = now;
      }
    }
    if (!result.killed) hpPhases();
    return prepared.map((p) => p.crit);
  };
  const deal = (...packet: Parameters<typeof prepareDamage>) =>
    dealGroup([packet])[0] ?? false;
  const settle = (
    state: AnomalyState,
    disorder = false,
    triggerActor = state.initiator.id,
  ) => {
    const model = s.enemy.anomaly[state.element]!;
    const total = state.contributions.reduce((n, c) => n + c.buildup, 0);
    const disorderBonus = disorder
      ? actors
          .flatMap((a) => a.anomalyEffects ?? [])
          .filter((e) => e.element === state.element)
          .reduce(
            (sum, effect) =>
              sum +
              (effect.disorderBonus
                ? Math.min(
                    effect.disorderBonus.cap,
                    (Math.max(
                      0,
                      state.expires - clockNow(model.durationClock),
                    ) /
                      1000) *
                      effect.disorderBonus.perSecond,
                  )
                : 0),
            0,
          )
      : 0;
    dealGroup(
      state.contributions.map((c): Parameters<typeof prepareDamage> => [
        c.actor,
        disorder ? `disorder-${state.element}` : `anomaly-${state.element}`,
        disorder
          ? {
              ...model.disorder,
              multiplier:
                model.disorder.multiplier +
                c.damage.multiplier * state.remaining +
                disorderBonus,
            }
          : c.damage,
        c.buildup / total,
        true,
        c.actor.id,
        disorder ? "disorder" : (c.damage.category ?? "anomaly"),
        triggerActor,
      ]),
    );
    if (result.killed) return;
    if (disorder) {
      log({
        kind: "disorder",
        actor: state.initiator.id,
        triggerActor,
        detail: state.element,
      });
      emit("disorder", lookup.get(triggerActor)!, state.element);
    } else {
      state.remaining--;
      state.nextProc = clockNow(model.tickClock) + model.tickMs;
    }
  };
  const periodic = (state: AnomalyState) => {
    if (
      state.token !== anomaly?.token ||
      state.expires <=
        clockNow(s.enemy.anomaly[state.element]!.durationClock) ||
      state.remaining <= 0
    )
      return;
    settle(state);
    if (state.remaining > 0)
      schedule(
        clockNow(s.enemy.anomaly[state.element]!.tickClock) +
          s.enemy.anomaly[state.element]!.tickMs,
        2,
        () => periodic(state),
        s.enemy.anomaly[state.element]!.tickClock,
      );
  };
  const activateAnomaly = (
    actor: BuildSnapshot,
    element: Element,
    key: string,
    contributions: Contribution[],
  ) => {
    const model = s.enemy.anomaly[element]!;
    if (
      anomaly &&
      anomaly.expires >
        clockNow(s.enemy.anomaly[anomaly.element]!.durationClock) &&
      anomaly.key !== key
    )
      settle(anomaly, true, actor.id);
    if (result.killed) return;
    anomaly = {
      element,
      key,
      contributions,
      expires: clockNow(model.durationClock) + model.durationMs,
      remaining: model.maxProcs,
      nextProc: clockNow(model.tickClock),
      token: ++anomalyToken,
      initiator: actor,
    };
    log({ kind: "anomaly", actor: actor.id, detail: key });
    emit("anomaly", actor, element);
    const captured = anomaly;
    if (model.trigger === "immediate") settle(captured);
    else if (model.trigger === "periodic")
      schedule(
        clockNow(model.tickClock),
        2,
        () => periodic(captured),
        model.tickClock,
      );
    for (const owner of actors)
      for (const effect of owner.anomalyEffects ?? []) {
        const copy = effect.periodicCopy;
        if (effect.element !== element || !copy) continue;
        const tick = () => {
          if (
            anomaly?.token !== captured.token ||
            captured.expires <= clockNow(model.durationClock)
          )
            return;
          const total = captured.contributions.reduce(
            (sum, c) => sum + c.buildup,
            0,
          );
          dealGroup(
            captured.contributions.map(
              (c): Parameters<typeof prepareDamage> => [
                c.actor,
                effect.id,
                c.damage,
                (c.buildup / total) * copy.multiplier,
                true,
                owner.id,
                "special",
                captured.initiator.id,
              ],
            ),
          );
          schedule(clockNow(copy.clock) + copy.intervalMs, 2, tick, copy.clock);
        };
        schedule(clockNow(copy.clock) + copy.intervalMs, 2, tick, copy.clock);
      }
  };
  const buildAnomaly = (actor: BuildSnapshot, hit: Hit) => {
    const data = hit.anomaly;
    if (data && data.buildup > 0) {
      const model = s.enemy.anomaly[data.element]!,
        list = buildup.get(data.element) ?? [],
        p = panel(actor);
      const accumulated = list.reduce((n, c) => n + c.buildup, 0);
      const gained = (data.buildup * Math.max(0, p.anomalyMastery)) / 100;
      // Weighting policy is explicit so reference models can be calibrated independently.
      const amount =
        model.buildupWeighting === "fullHit"
          ? gained
          : Math.min(model.threshold - accumulated, gained);
      if (amount > 0)
        list.push({
          actor: {
            ...actor,
            panel: p,
            elementBonuses: { ...actor.elementBonuses },
          },
          damage: data.damage,
          buildup: amount,
        });
      buildup.set(data.element, list);
      if (accumulated + amount >= model.threshold) {
        buildup.delete(data.element);
        activateAnomaly(actor, data.element, data.element, list);
      }
    }
    if (hit.forcedAnomaly) {
      const forced = hit.forcedAnomaly;
      activateAnomaly(actor, forced.element, forced.key, [
        {
          actor: {
            ...actor,
            panel: panel(actor),
            elementBonuses: { ...actor.elementBonuses },
          },
          damage: forced.damage,
          buildup: 1,
        },
      ]);
    }
  };
  const hit = (
    actor: BuildSnapshot,
    action: ActionModel,
    h: Hit,
    triggered: boolean,
    triggerActor = actor.id,
  ) => {
    const blocked = invulnerable;
    const crit = deal(
      actor,
      action.id,
      h.damage,
      1,
      false,
      actor.id,
      h.damage.category ?? h.damage.kind,
      triggerActor,
    );
    if (result.killed || blocked) return;
    for (const [key, value] of Object.entries(h.resourceGain ?? {}))
      changeResource(actor, key, resources.get(actor.id)![key] + value, "gain");
    apply(actor, h.buffs);
    if (crit) apply(actor, h.critBuffs);
    if (
      anomaly &&
      anomaly.expires >
        clockNow(s.enemy.anomaly[anomaly.element]!.durationClock) &&
      anomaly.remaining > 0 &&
      anomaly.nextProc <=
        clockNow(s.enemy.anomaly[anomaly.element]!.tickClock) &&
      s.enemy.anomaly[anomaly.element]!.trigger === "onHit"
    )
      settle(anomaly);
    if (result.killed) return;
    buildAnomaly(actor, h);
    if (result.killed) return;
    // Passive damage cannot recursively trigger another on-hit passive at the same instant.
    if (!triggered) emit("hit", actor, h.damage.element);
    if (!stunned()) {
      daze += (h.daze * panel(actor).impact) / 100;
      if (daze >= s.enemy.stunThreshold) {
        daze = 0;
        stunUntil = clockNow(s.enemy.stunClock) + s.enemy.stunDurationMs;
        log({ kind: "stun" });
        schedule(
          stunUntil,
          0,
          () => log({ kind: "recover" }),
          s.enemy.stunClock,
        );
      }
    }
  };
  const available = (a: BuildSnapshot, action: ActionModel) =>
    matches(a, action.requires) &&
    (cooldowns.get(`${a.id}/${action.id}`) ?? 0) <=
      clockNow(action.cooldownClock) &&
    Object.entries(action.cost).every(
      ([key, cost]) => resources.get(a.id)![key] >= cost,
    );
  const startAction = (
    a: BuildSnapshot,
    action: ActionModel,
    triggered = false,
    triggerActor = a.id,
    cancelAtMs?: number,
  ): { at: number; clock: ClockDomain } => {
    for (const [key, cost] of Object.entries(action.cost))
      changeResource(a, key, resources.get(a.id)![key] - cost, "cost");
    cooldowns.set(
      `${a.id}/${action.id}`,
      clockNow(action.cooldownClock) + action.cooldownMs,
    );
    log({ kind: "action", actor: a.id, action: action.id });
    apply(a, action.buffs);
    const clock = actionClock(action),
      start = clockNow(clock),
      animationStart = animationNow;
    const window =
      cancelAtMs === undefined
        ? undefined
        : action.cancelWindows?.find(
            (entry) => cancelAtMs >= entry.startMs && cancelAtMs <= entry.endMs,
          );
    if (cancelAtMs !== undefined && !window)
      throw new Error("Cancellation is outside authored windows");
    const state = { cancelled: false, activePauses: new Set<number>() };
    const resume = (token: number) => {
      if (!state.activePauses.delete(token)) return;
      pauses.delete(token);
      log({ kind: "resume", actor: a.id, action: action.id });
    };
    for (const pause of action.clockPauses ?? []) {
      const token = sequence++;
      schedule(
        animationStart + pause.startMs,
        -20,
        () => {
          if (state.cancelled) return;
          pauses.add(token);
          state.activePauses.add(token);
          log({ kind: "pause", actor: a.id, action: action.id });
        },
        "animation",
      );
      schedule(
        animationStart + pause.startMs + pause.durationMs,
        -20,
        () => resume(token),
        "animation",
      );
    }
    for (const h of action.hits) {
      const hitClock = h.clock ?? clock;
      schedule(
        clockNow(hitClock) + h.atMs,
        2,
        () => {
          if (
            state.cancelled &&
            !(window?.pendingHits === "retain-marked" && h.persistsAfterCancel)
          )
            return;
          hit(a, action, h, triggered, triggerActor);
        },
        hitClock,
      );
    }
    if (cancelAtMs !== undefined && window)
      schedule(
        start + cancelAtMs,
        1,
        () => {
          state.cancelled = true;
          for (const token of state.activePauses) resume(token);
          for (const [key, amount] of Object.entries(window.refund))
            changeResource(
              a,
              key,
              resources.get(a.id)![key] + amount,
              "cancel-refund",
            );
          log({
            kind: "cancel",
            actor: a.id,
            action: action.id,
            detail: window.pendingHits,
          });
        },
        clock,
      );
    return { at: start + (cancelAtMs ?? action.durationMs), clock };
  };
  const emit = (
    event: "hit" | "anomaly" | "disorder",
    source: BuildSnapshot,
    element: Element,
  ) => {
    for (const owner of actors)
      for (const trigger of owner.triggers ?? []) {
        if (
          trigger.event !== event ||
          (trigger.element && trigger.element !== element) ||
          (trigger.source === "self" && source.id !== owner.id) ||
          (trigger.source === "ally" && source.id === owner.id) ||
          source.kind !== "agent" ||
          (trigger.offFieldOnly && active === owner.id)
        )
          continue;
        const key = `${owner.id}/${trigger.id}`,
          action = owner.actions[trigger.action];
        if (
          (triggerCooldowns.get(key) ?? 0) > clockNow(trigger.cooldownClock) ||
          !available(owner, action)
        )
          continue;
        triggerCooldowns.set(
          key,
          clockNow(trigger.cooldownClock) + trigger.cooldownMs,
        );
        startAction(owner, action, true, source.id);
      }
  };
  let decisionToken = 0;
  const decision = () => {
    const token = ++decisionToken;
    let inspected = 0;
    while (inspected++ <= steps.length) {
      if (stepIndex >= steps.length) {
        if (!s.loop) return;
        stepIndex = 0;
      }
      const index = stepIndex++,
        step = steps[index];
      if (step.type === "wait") {
        schedule(now + step.ms, 4, decision);
        return;
      }
      const actor = lookup.get(step.actor)!;
      if (step.type === "switch") {
        if (active === actor.id) continue;
        active = actor.id;
        log({ kind: "switch", actor: active });
        schedule(now + s.switchMs, 4, decision);
        return;
      }
      const action = actor.actions[step.action];
      const ready =
        active === actor.id &&
        matches(actor, step.when) &&
        available(actor, action);
      if (!ready) {
        const behavior = step.onUnavailable ?? (step.when ? "skip" : "error");
        if (behavior === "skip") {
          pendingWait = undefined;
          continue;
        }
        if (behavior === "wait" && active === actor.id) {
          pendingWait ??= { index, since: now };
          const deadline = pendingWait.since + (step.maxWaitMs ?? 30_000);
          if (now >= deadline)
            throw new Error(`Rotation step ${index + 1}: wait limit exceeded`);
          const next: Record<ClockDomain, number[]> = {
            combat: [deadline],
            animation: [],
          };
          for (const clock of ["combat", "animation"] as const) {
            const eventTime = queue.nextTime(clock, clockNow(clock));
            if (eventTime !== undefined) next[clock].push(eventTime);
          }
          const cooldown = cooldowns.get(`${actor.id}/${action.id}`) ?? 0;
          if (cooldown > clockNow(action.cooldownClock))
            next[action.cooldownClock ?? "combat"].push(cooldown);
          for (const condition of [step.when, action.requires]) {
            if (condition?.incoming !== undefined)
              for (const window of incomingWindows)
                if (window.until > clockNow(window.clock))
                  next[window.clock].push(window.until);
            if (condition?.stunned !== undefined && stunned())
              next[s.enemy.stunClock ?? "combat"].push(stunUntil);
          }
          const demands = { ...action.cost };
          for (const condition of [step.when, action.requires])
            if (condition?.resource)
              demands[condition.resource.name] = Math.max(
                demands[condition.resource.name] ?? 0,
                condition.resource.atLeast,
              );
          for (const [key, amount] of Object.entries(demands)) {
            const resource = actor.resources[key],
              clock = resource.regenClock ?? "combat";
            const rate = resource.regenStat
              ? Math.max(0, panel(actor)[resource.regenStat])
              : resource.regenPerSecond;
            const missing = amount - resources.get(actor.id)![key];
            if (missing > 0 && rate > 0 && amount <= resource.max)
              next[clock].push(
                clockNow(clock) +
                  Math.max(1, Math.ceil((missing / rate) * 1000)),
              );
          }
          stepIndex = index;
          for (const clock of ["combat", "animation"] as const)
            if (next[clock].length)
              schedule(
                Math.min(...next[clock]),
                4,
                () => {
                  if (token === decisionToken) decision();
                },
                clock,
              );
          return;
        }
        throw new Error(
          `Rotation step ${index + 1}: ${actor.id}/${action.id} cannot execute (active actor, resources, cooldown, or trigger)`,
        );
      }
      pendingWait = undefined;
      const completion = startAction(
        actor,
        action,
        false,
        actor.id,
        step.cancelAtMs,
      );
      schedule(completion.at, 4, decision, completion.clock);
      return;
    }
    throw new Error(
      "Rotation cannot advance time; add a wait or available fallback action",
    );
  };
  for (const actor of actors) apply(actor, actor.initialBuffs);
  for (const actor of actors)
    for (const [key, value] of Object.entries(resources.get(actor.id)!))
      log({
        kind: "resource",
        actor: actor.id,
        resource: key,
        value,
        delta: 0,
        detail: "initial",
      });
  for (const phase of enemy.phases ?? [])
    if (phase.atMs !== undefined)
      schedule(phase.atMs, 0, () => applyPhase(phase), phase.clock);
  hpPhases();
  for (const e of s.incoming)
    schedule(
      e.atMs,
      1,
      () => {
        incomingWindows.push({
          until: clockNow(e.clock) + e.windowMs,
          clock: e.clock ?? "combat",
        });
        log({ kind: "incoming" });
      },
      e.clock,
    );
  if (s.bangboo) {
    const b = s.bangboo;
    const act = () => {
      const action = b.defaultPriority
        .map((id) => b.actions[id])
        .find((a) => available(b, a));
      if (action) {
        const completion = startAction(b, action);
        schedule(completion.at, 3, act, completion.clock);
      } else schedule(now + 100, 3, act);
    };
    schedule(0, 3, act);
  }
  schedule(0, 4, decision);
  const advance = (at: ClockState) => {
    const dtMs = at.combat - now,
      animationDtMs = at.animation - animationNow;
    const keys = new Set<string>();
    for (const buff of buffs)
      if (buff.expires > clockNow(buff.buff.clock))
        for (const target of buff.targets)
          keys.add(`${buff.source}/${buff.buff.id}/${target}`);
    for (const key of keys) {
      result.buffUptimeMs[key] = (result.buffUptimeMs[key] ?? 0) + dtMs;
      result.buffAnimationUptimeMs[key] =
        (result.buffAnimationUptimeMs[key] ?? 0) + animationDtMs;
    }
    const changes: { actor: BuildSnapshot; key: string; value: number }[] = [];
    for (const actor of actors)
      for (const [key, resource] of Object.entries(actor.resources)) {
        const rate = resource.regenStat
          ? Math.max(0, panel(actor)[resource.regenStat])
          : resource.regenPerSecond;
        const elapsed =
          resource.regenClock === "animation" ? animationDtMs : dtMs;
        changes.push({
          actor,
          key,
          value: resources.get(actor.id)![key] + (elapsed / 1000) * rate,
        });
      }
    now = at.combat;
    animationNow = at.animation;
    for (const change of changes)
      changeResource(change.actor, change.key, change.value, "regen");
  };
  // The combat deadline participates in the same scheduler, before boundary hits.
  let finished = false;
  schedule(s.durationMs, -100, () => {
    finished = true;
  });
  let processed = 0;
  while (!finished) {
    const next = queue.pop(
      { combat: now, animation: animationNow },
      pauses.size > 0,
    );
    if (!next) throw new Error("Combat clock is paused without a resume event");
    if (++processed > 200_000)
      throw new Error("Simulation event limit exceeded");
    if (next.at.animation > 3_600_000)
      throw new Error("Animation duration limit exceeded");
    advance(next.at);
    next.event.run();
    if (result.killed) break;
  }
  if (!result.killed && pendingWait)
    throw new Error(
      `Rotation step ${pendingWait.index + 1}: wait exceeded combat horizon`,
    );
  result.animationElapsedMs = animationNow;
  result.finalResources = Object.fromEntries(resources);
  return result;
}
export function simulate(
  input: SimulationScenario,
  onProgress?: (completed: number, total: number) => void,
): SimulationResult {
  const s = validateScenario(input),
    totals: number[] = [],
    killTimes: number[] = [],
    byActor: Record<string, number> = {},
    byAction: Record<string, number> = {},
    byCategory = categories(),
    buffUptime: Record<string, number> = {};
  const mode = s.mode ?? "fixed-duration";
  const perSecond = Array(Math.ceil(s.durationMs / 1000)).fill(0);
  let trace: TrialResult | undefined,
    meanEffectiveDamage = 0,
    meanOverkill = 0,
    meanShieldDamage = 0,
    meanRemainingHp = 0,
    meanDps: number | null = 0;
  for (let i = 0; i < s.trials; i++) {
    const result = simulateTrial(
      s,
      (s.seed + Math.imul(i, 0x9e3779b9)) >>> 0,
      i === 0,
    );
    trace ??= result;
    totals.push(result.total);
    if (result.killed) killTimes.push(result.elapsedMs);
    meanEffectiveDamage += result.effectiveDamage / s.trials;
    meanOverkill += result.overkill / s.trials;
    meanShieldDamage += result.shieldDamage / s.trials;
    meanRemainingHp += (result.remainingHp ?? 0) / s.trials;
    if (result.elapsedMs === 0) meanDps = null;
    else if (meanDps !== null)
      meanDps +=
        (mode === "kill" ? result.effectiveDamage : result.total) /
        (result.elapsedMs / 1000) /
        s.trials;
    for (const [key, n] of Object.entries(result.byActor))
      byActor[key] = (byActor[key] ?? 0) + n / s.trials;
    for (const [key, n] of Object.entries(result.byAction))
      byAction[key] = (byAction[key] ?? 0) + n / s.trials;
    for (const key of Object.keys(byCategory) as DamageCategory[])
      byCategory[key] += result.byCategory[key] / s.trials;
    for (const [key, ms] of Object.entries(result.buffUptimeMs))
      buffUptime[key] =
        (buffUptime[key] ?? 0) +
        (result.elapsedMs ? ms / result.elapsedMs : 0) / s.trials;
    result.perSecond.forEach((n, index) => {
      perSecond[index] += n / s.trials;
    });
    onProgress?.(i + 1, s.trials);
  }
  const meanDamage = totals.reduce((a, b) => a + b, 0) / totals.length;
  totals.sort((a, b) => a - b);
  killTimes.sort((a, b) => a - b);
  const percentile = (values: number[], q: number): number => {
    const index = (values.length - 1) * q,
      lower = Math.floor(index);
    return (
      values[lower] +
      (values[Math.ceil(index)] - values[lower]) * (index - lower)
    );
  };
  const comparison = {
    ...s,
    mode,
    team: s.team.map((a) => a.id),
    bangboo: s.bangboo?.id,
  };
  return {
    schemaVersion: 1,
    engineVersion: COMBAT_ENGINE_VERSION,
    fingerprint: hash({ engine: COMBAT_ENGINE_VERSION, scenario: s }),
    comparisonFingerprint: hash({
      engine: COMBAT_ENGINE_VERSION,
      scenario: comparison,
    }),
    modelVersion: s.modelVersion,
    mode,
    durationMs: s.durationMs,
    trials: s.trials,
    meanDamage,
    meanDps,
    p10: percentile(totals, 0.1),
    p90: percentile(totals, 0.9),
    byActor,
    byAction,
    byCategory,
    meanEffectiveDamage,
    meanOverkill,
    meanShieldDamage,
    buffUptime,
    kill: {
      rate: killTimes.length / s.trials,
      meanTimeMs: killTimes.length
        ? killTimes.reduce((a, b) => a + b, 0) / killTimes.length
        : null,
      p10TimeMs: killTimes.length ? percentile(killTimes, 0.1) : null,
      p90TimeMs: killTimes.length ? percentile(killTimes, 0.9) : null,
      meanRemainingHp: mode === "kill" ? meanRemainingHp : null,
    },
    perSecond,
    trace: trace!,
  };
}
