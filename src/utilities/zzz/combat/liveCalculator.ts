import { burniceAwakening } from "./awakening.js";
import { calculateDamage } from "./damage.js";
import { type LiveBuild } from "./liveBuild.js";
import {
  loadReferenceTeam,
  skillMultiplier,
  type SkillReference,
} from "./referenceSkills.js";
import { aliceEntryBuff, remielleEntryBuff } from "./referenceTeamMechanics.js";
import { ELEMENTS, finite, integer, record, type Element } from "./stats.js";
import type { DamageSpec, Panel } from "./types.js";

export const LIVE_CALCULATOR_VERSION = "live-reference-1";
export const FORMULA_SOURCE =
  "https://github.com/ZSim-Dev/ZSim/blob/e248e9f149a6b889290579d8e673e132be9bde31/zsim/sim_progress/ScheduledEvent/Calculator.py";
export const ANOMALY_SOURCE =
  "https://github.com/ZSim-Dev/ZSim/blob/e248e9f149a6b889290579d8e673e132be9bde31/zsim/sim_progress/ScheduledEvent/CalAnomaly.py";

export interface DamageConditions {
  phase: boolean;
  signatureActive: boolean;
  phantom: boolean;
  remielleDisc: boolean;
  huntStacks: number;
  fangedMetal: boolean;
  compilerStacks: number;
  chaosJazz: boolean;
}
export const DEFAULT_DAMAGE_CONDITIONS: Readonly<DamageConditions> =
  Object.freeze({
    phase: false,
    signatureActive: false,
    phantom: false,
    remielleDisc: true,
    huntStacks: 3,
    fangedMetal: false,
    compilerStacks: 0,
    chaosJazz: true,
  });
export function parseDamageConditions(input: unknown = {}): DamageConditions {
  const raw = record(input),
    result = { ...DEFAULT_DAMAGE_CONDITIONS };
  for (const key of Object.keys(raw)) {
    if (!Object.hasOwn(result, key))
      throw new Error(`Unknown combat condition: ${key}`);
    if (key === "huntStacks" || key === "compilerStacks")
      result[key] = integer(raw[key], key, 0, 3);
    else {
      if (typeof raw[key] !== "boolean")
        throw new Error(`Invalid combat condition: ${key}`);
      (result as unknown as Record<string, unknown>)[key] = raw[key];
    }
  }
  return result;
}
export interface CalculationTarget {
  defense: number;
  resistance: number;
  stunned: boolean;
  stunMultiplier: number;
}
export function parseCalculationTarget(input: unknown): CalculationTarget {
  const t = record(input);
  if (typeof t.stunned !== "boolean")
    throw new Error("Specify the target's stun state");
  return {
    defense: finite(t.defense, "enemy defense", 0, 1e6),
    resistance: finite(t.resistance, "enemy resistance", -100, 100),
    stunned: t.stunned,
    stunMultiplier: finite(t.stunMultiplier, "stun multiplier", 1, 10),
  };
}

export interface ReferenceAttack {
  id: string;
  name: string;
  element: Element;
  category: "direct" | "assist" | "ex" | "anomaly";
  spec: DamageSpec;
  level: number;
  source: string;
  note?: string;
}
const skillTypes: Record<string, string> = {
  普通攻擊: "0",
  特殊技: "1",
  閃避: "2",
  連攜技: "3",
  核心技: "5",
  支援技: "6",
};
const hasSet = (a: LiveBuild, id: string) =>
  a.sets.some((s) => s.id === id && s.pieces >= 4);

/** Deliberately bounded reference coverage, never advertised as a complete battle adapter. */
export function assertReferenceCoverage(a: LiveBuild): void {
  const cinemas: Record<string, number> = { "1581": 2, "1401": 0, "1171": 0 };
  if (!Object.hasOwn(cinemas, a.id))
    throw new Error(
      `Character is not supported by the live calculator: ${a.name}`,
    );
  if (a.cinema > cinemas[a.id])
    throw new Error(
      `This character's cinema effects have not been implemented: ${a.name}`,
    );
  if (a.level !== 60)
    throw new Error(
      "The current reference calculator supports level 60 builds only",
    );
  if (a.awakening && a.id !== "1171")
    throw new Error("This character's awakening is not supported");
  const weapons: Record<string, { id: string; refinement: number }> = {
    "1581": { id: "14158", refinement: 1 },
    "1401": { id: "14126", refinement: 1 },
    "1171": { id: "14118", refinement: 2 },
  };
  const expected = weapons[a.id];
  if (
    a.weapon &&
    (a.weapon.id !== expected.id || a.weapon.refinement !== expected.refinement)
  )
    throw new Error(
      `W-Engine/refinement effects not supported: ${a.weapon.name}`,
    );
  const sets = new Set(["34100", "31300", "32600", "33000", "31800", "33400"]);
  for (const s of a.sets) {
    if (!sets.has(s.id))
      throw new Error(`Drive disc set not supported: ${s.name}`);
    if (s.pieces >= 4 && !["34100", "32600", "31800"].includes(s.id))
      throw new Error(`Four-piece effect not supported: ${s.name}`);
  }
}

export function referenceAttacks(
  a: LiveBuild,
  refs: SkillReference[] = loadReferenceTeam(),
): ReferenceAttack[] {
  assertReferenceCoverage(a);
  const ref = refs.find((r) => r.id === a.id);
  if (!ref) throw new Error("Missing skill coefficient reference");
  const element =
    a.id === "1581" ? "luminous" : a.id === "1401" ? "physical" : "fire";
  const result: ReferenceAttack[] = [];
  ref.tables.forEach((table, ti) => {
    const level = a.skills[skillTypes[table.category]];
    if (!level) throw new Error(`Missing ${table.category} skill level`);
    table.rows.forEach((row, ri) => {
      // A continuous/mixed-element total is not a single hit; no guessed split or tick count.
      if (!/傷害倍率$/.test(row.name) || /持續|最大/.test(row.name)) return;
      if (
        a.id === "1171" &&
        [
          "普通攻擊：熾焰直調式",
          "閃避反擊：搖盪閃",
          "快速支援：提神特飲",
        ].includes(table.skill)
      )
        return;
      const ex = table.skill.startsWith("強化特殊技");
      const assist =
        table.category === "支援技" ||
        (a.id === "1171" &&
          a.awakening >= 1 &&
          table.skill === "普通攻擊：熾焰攪拌式");
      const spec: DamageSpec = {
        kind: "direct",
        element,
        basis: "atk",
        canCrit: true,
        multiplier: skillMultiplier(ref, table.skill, row.name, level),
      };
      result.push({
        id: `skill-${ti}-${ri}`,
        name: `${table.skill} · ${row.name}`,
        element,
        category: ex ? "ex" : assist ? "assist" : "direct",
        spec,
        level,
        source: ref.url,
        note: "僅此倍率段的直傷；異常、追加攻擊與其他倍率段另計",
      });
    });
  });
  if (a.id === "1171") {
    const level = a.skills["5"];
    result.push({
      id: "afterburn",
      name: "餘燼 · 單次",
      element: "fire",
      category: "assist",
      level,
      source: ref.url,
      spec: {
        kind: "direct",
        element: "fire",
        basis: "atk",
        canCrit: true,
        multiplier: skillMultiplier(
          ref,
          "核心被動：燃油特調",
          "[餘燼]效果對目標造成火屬性傷害",
          level,
        ),
        bonusFromStat: { stat: "anomalyProficiency", scale: 0.1, cap: 30 },
      },
      note: "次數須符合燃點、灼傷與觸發間隔；此頁不自動排程",
    });
    result.push({
      id: "burn-tick",
      name: "灼燒 · 單次跳傷",
      element: "fire",
      category: "anomaly",
      level: 60,
      source: ANOMALY_SOURCE,
      spec: {
        kind: "anomaly",
        element: "fire",
        basis: "atk",
        canCrit: false,
        multiplier: 0.5,
        domainMultiplier: 2,
      },
      note: "以柏妮思獨立貢獻的異常快照計算，未計異化；不是完整灼燒總傷",
    });
  }
  if (a.id === "1401")
    for (const [id, name] of [
      ["assault", "強擊"],
      ["polar-assault", "極性強擊"],
    ]) {
      result.push({
        id,
        name: `${name} · 單次`,
        element: "physical",
        category: "anomaly",
        level: 60,
        source: ANOMALY_SOURCE,
        spec: {
          kind: "anomaly",
          element: "physical",
          basis: "atk",
          canCrit: false,
          multiplier: 7.13,
          domainMultiplier: 2,
        },
        note: "以愛麗絲獨立貢獻的異常快照計算；未計異化、紊亂及後續追加傷害",
      });
    }
  return result;
}

export interface BattlePanel {
  panel: Panel;
  elementBonuses: LiveBuild["elementBonuses"];
  effects: string[];
  anomalyBonus: number;
  afterburnCooldownMs?: number;
}
export function buildBattlePanel(
  team: LiveBuild[],
  actorId: string,
  attack: ReferenceAttack,
  input: unknown = {},
): BattlePanel {
  if (
    !team.length ||
    team.length > 3 ||
    new Set(team.map((a) => a.id)).size !== team.length
  )
    throw new Error("Invalid team");
  team.forEach(assertReferenceCoverage);
  const a = team.find((a) => a.id === actorId);
  if (!a) throw new Error("Actor not in team");
  const state = parseDamageConditions(input);
  const panel = { ...a.displayed },
    elementBonuses = { ...a.elementBonuses },
    effects: string[] = [];
  const remielle = team.find((a) => a.id === "1581");
  let anomalyBonus = 0,
    afterburnCooldownMs: number | undefined;
  const add = (key: keyof Panel, amount: number, label: string) => {
    panel[key] += amount;
    effects.push(`${label} +${Number(amount.toFixed(3))}`);
  };
  // Official profile includes W-Engine main/sub stats and 2-piece bonuses, but not talents/4-piece passives.
  if (a.weapon?.id === "14158")
    add("anomalyProficiency", 96, "空羽復歸之詩 · 異常精通");
  if (a.weapon?.id === "14118") {
    add("atk", a.baseAttack * 0.15, "嵌合編譯器 · 基礎攻擊力 15%");
    if (state.compilerStacks)
      add(
        "anomalyProficiency",
        31 * state.compilerStacks,
        "嵌合編譯器 · 異常精通",
      );
  }
  if (a.weapon?.id === "14126" && state.huntStacks) {
    elementBonuses.physical =
      (elementBonuses.physical ?? 0) + 12 * state.huntStacks;
    effects.push(`淬鋒鉗刺 · 物理增傷 +${12 * state.huntStacks}%`);
  }
  if (hasSet(a, "31800")) {
    elementBonuses.fire = (elementBonuses.fire ?? 0) + 15;
    elementBonuses.electric = (elementBonuses.electric ?? 0) + 15;
    effects.push("混沌爵士四件 · 火／電增傷 +15%");
    if (state.chaosJazz && ["assist", "ex"].includes(attack.category))
      add("damageBonus", 20, "混沌爵士後場／餘效 · 招式增傷%");
  }
  if (hasSet(a, "34100") && state.remielleDisc) {
    add("anomalyProficiency", 50, "讖羽之誓四件 · 異常精通");
    if (a.id === "1581") anomalyBonus += 15;
  }
  if (hasSet(a, "32600") && state.fangedMetal)
    add("damageBonus", 35, "獠牙重金屬四件 · 增傷%");
  if (remielle) {
    if (team.length >= 2)
      add(
        "atk",
        remielleEntryBuff(remielle.displayed.atk, team.length).value,
        "芳菲之邀 · 攻擊力",
      );
    if (state.phase) add("damageBonus", 18, "相變時流 · 全隊增傷%");
    if (state.signatureActive && remielle.weapon?.id === "14158") {
      add("damageBonus", 30, "空羽復歸之詩 · 全隊增傷%");
      if (a.id === "1581") anomalyBonus += 20;
    }
    if (
      attack.category === "anomaly" &&
      state.phase &&
      remielle.cinema >= 1 &&
      a.id !== remielle.id
    ) {
      anomalyBonus += 10;
      effects.push("蕾米埃爾一影 · 屬性異常增傷 +10%");
    }
    if (attack.category === "anomaly" && state.phantom && remielle.cinema >= 2)
      add("penRatio", 15, "蕾米埃爾二影 · 異常傷害防禦忽視%");
  }
  if (a.id === "1401" && team.length >= 2)
    add(
      "anomalyProficiency",
      aliceEntryBuff(panel.anomalyMastery).value,
      "尋奇獵幽 · 異常精通",
    );
  if (a.id === "1171") {
    const awakening = burniceAwakening(a.awakening, a.displayed.energyRegen);
    afterburnCooldownMs = awakening.afterburnCooldownMs;
    if (a.awakening >= 2) {
      add("anomalyMastery", awakening.anomalyMastery, "沸點派對 · 異常掌控");
      add("damageBonus", awakening.damageBonus, "沸點派對 · 增傷%");
    }
  }
  return { panel, elementBonuses, effects, anomalyBonus, afterburnCooldownMs };
}

export interface CalculationEntry {
  actor: string;
  attack: string;
  count: number;
  conditions?: Partial<DamageConditions>;
}
export function calculateLiveRotation(
  team: LiveBuild[],
  input: unknown,
  refs: SkillReference[] = loadReferenceTeam(),
) {
  const request = record(input),
    target = parseCalculationTarget(request.target),
    conditions = parseDamageConditions(request.conditions ?? {});
  if (
    !Array.isArray(request.entries) ||
    request.entries.length < 1 ||
    request.entries.length > 100
  )
    throw new Error("Use 1–100 calculation entries");
  const durationSeconds =
    request.durationSeconds === undefined || request.durationSeconds === null
      ? null
      : finite(request.durationSeconds, "manual duration", 0.1, 3600);
  const catalog = new Map(team.map((a) => [a.id, referenceAttacks(a, refs)]));
  const enemy = {
    level: 60,
    defense: target.defense,
    resistance: Object.fromEntries(
      ELEMENTS.map((e) => [e, target.resistance]),
    ) as Record<Element, number>,
    stunThreshold: 1,
    stunDurationMs: 1,
    stunMultiplier: target.stunMultiplier,
    anomaly: {},
  };
  const rows = request.entries.map((raw: unknown) => {
    const entry = record(raw);
    if (typeof entry.actor !== "string" || typeof entry.attack !== "string")
      throw new Error("Select an actor and attack");
    const attack = catalog.get(entry.actor)?.find((s) => s.id === entry.attack);
    if (!attack) throw new Error("Unsupported attack or coefficient row");
    const count = integer(entry.count, "attack count", 1, 10000);
    const merged = parseDamageConditions({
      ...conditions,
      ...record(entry.conditions ?? {}),
    });
    const stats = buildBattlePanel(team, entry.actor, attack, merged);
    const spec = { ...attack.spec };
    if (spec.kind === "anomaly")
      spec.domainMultiplier =
        (spec.domainMultiplier ?? 1) * (1 + stats.anomalyBonus / 100);
    const breakdown = calculateDamage(
      { ...stats, levelCoefficient: 794 },
      spec,
      enemy,
      target.stunned,
    );
    return {
      actor: entry.actor,
      attack: attack.id,
      name: attack.name,
      count,
      conditions: merged,
      stats,
      breakdown,
      expected: breakdown.expected * count,
      nonCritical: breakdown.nonCritical * count,
      critical: breakdown.critical * count,
      source: attack.source,
      note: attack.note,
    };
  });
  const total = rows.reduce((sum: number, r: any) => sum + r.expected, 0);
  const byActor = team.map((a) => ({
    id: a.id,
    name: a.name,
    damage: rows
      .filter((r: any) => r.actor === a.id)
      .reduce((sum: number, r: any) => sum + r.expected, 0),
  }));
  return {
    version: LIVE_CALCULATOR_VERSION,
    mode: "manual-reference" as const,
    completeSimulation: false,
    target,
    conditions,
    durationSeconds,
    rows,
    total,
    byActor,
    /** Explicitly a manual subtotal/time quotient, never a full combat DPS prediction. */
    modeledDps: durationSeconds === null ? null : total / durationSeconds,
    limitations: [
      "僅加總選定傷害項目；不代表完整隊伍傷害或自動循環 DPS",
      "命中次數、增益生效狀態及時長由使用者指定；未驗證能量、冷卻或動作是否合法",
      "未計蕾米埃爾異化／耀變、異常積蓄與貢獻分攤、紊亂及愛麗絲異常追加傷害",
      "柏妮思覺醒新增招式、混合屬性與持續噴射的命中分配尚未提供；不以零傷害代替",
    ],
    sources: [
      FORMULA_SOURCE,
      ANOMALY_SOURCE,
      ...new Set(rows.map((r: any) => r.source)),
    ],
    references: refs
      .filter((r) => team.some((a) => a.id === r.id))
      .map((r) => ({ id: r.id, sha256: r.sha256, fetchedAt: r.fetchedAt })),
    builds: team.map((a) => ({ id: a.id, fingerprint: a.fingerprint })),
  };
}
