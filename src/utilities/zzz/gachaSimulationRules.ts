import { createHash } from "node:crypto";
import type { SimulationPool, SimulationState } from "./gachaSimulationEngine.js";

export interface RankRule { base: number; softStart: number | null; step: number; hard: number | null; up: number; guarantee: boolean }
export interface SimulationRules { schemaVersion: 1; pool: SimulationPool; mode: "game" | "custom"; s: RankRule; a: RankRule; b: number }
export interface SimulationPreferences {
  active: Record<SimulationPool, string>;
  sCandidates: Record<SimulationPool, string[]>;
  aUp: Record<string, string[]>;
  animation: boolean;
}
export const newSimulationPreferences = (): SimulationPreferences => ({ active: { character: "game", weapon: "game" }, sCandidates: { character: [], weapon: [] }, aUp: {}, animation: true });
export function defaultSimulationRules(pool: SimulationPool): SimulationRules {
  const weapon = pool === "weapon";
  return { schemaVersion: 1, pool, mode: "game", s: { base: weapon ? .01 : .006, softStart: weapon ? 65 : 74, step: .06, hard: weapon ? 80 : 90, up: weapon ? .75 : .5, guarantee: true }, a: { base: weapon ? .15 : .094, softStart: null, step: 0, hard: 10, up: weapon ? .75 : .5, guarantee: true }, b: weapon ? .84 : .9 };
}
export function validateSimulationRules(input: SimulationRules): SimulationRules {
  if (!input || input.schemaVersion !== 1 || !["character", "weapon"].includes(input.pool) || !["game", "custom"].includes(input.mode)) throw new Error("規則格式不正確。");
  const rank = (r: RankRule): RankRule => r && ({ base: r.base, softStart: r.softStart, step: r.step, hard: r.hard, up: r.up, guarantee: r.guarantee });
  const rules: SimulationRules = { schemaVersion: 1, pool: input.pool, mode: input.mode, s: rank(input.s), a: rank(input.a), b: input.b };
  for (const [label, r] of [["S", rules.s], ["A", rules.a]] as const) {
    if (!r) throw new Error("缺少稀有度規則。");
    for (const field of ["base", "step", "up"] as const) {
      if (!Number.isFinite(r[field]) || r[field] < 0 || r[field] > 1) throw new Error(`${label} 機率必須介於 0～100%。`);
      r[field] = Math.round(r[field] * 1e6) / 1e6;
    }
    for (const field of ["softStart", "hard"] as const) if (r[field] !== null && (!Number.isInteger(r[field]) || r[field]! < 1 || r[field]! > 1000)) throw new Error(`${label} 保底抽數必須是 1～1,000，或填 0 關閉。`);
    if (r.softStart !== null && (r.step <= 0 || (r.hard !== null && r.softStart > r.hard))) throw new Error(`${label} 軟保底增量須大於零，起點不可超過硬保底。`);
    if (r.softStart === null) r.step = 0;
    if (typeof r.guarantee !== "boolean") throw new Error("UP 保證設定不正確。");
  }
  if (!Number.isFinite(rules.b) || rules.b < 0 || rules.b > 1) throw new Error("B 機率必須介於 0～100%。");
  rules.b = Math.round(rules.b * 1e6) / 1e6;
  if (Math.round((rules.s.base + rules.a.base + rules.b) * 1e6) !== 1e6) throw new Error("S／A／B 基礎機率合計必須為 100%。");
  if (rules.mode === "game" && JSON.stringify(rules) !== JSON.stringify(defaultSimulationRules(rules.pool))) throw new Error("遊戲預設不可修改，請另存為自訂規則。");
  return rules;
}
export function simulationRulesId(rules: SimulationRules): string {
  const r = validateSimulationRules(rules);
  return r.mode === "game" ? "game" : createHash("sha256").update(JSON.stringify(r)).digest("hex").slice(0, 16);
}
export function rankProbability(rule: RankRule, nextPull: number): number {
  if (rule.hard !== null && nextPull >= rule.hard) return 1;
  return Math.min(1, rule.base + (rule.softStart === null ? 0 : Math.max(0, nextPull - rule.softStart + 1) * rule.step));
}
export function effectiveProbabilities(rules: SimulationRules, state: Pick<SimulationState, "sinceS" | "sinceAOrHigher">) {
  const s = rankProbability(rules.s, state.sinceS + 1);
  const a = rules.a.hard !== null && state.sinceAOrHigher + 1 >= rules.a.hard ? 1 - s : Math.min(1 - s, rankProbability({ ...rules.a, hard: null }, state.sinceAOrHigher + 1));
  return { s, a, b: Math.max(0, 1 - s - a) };
}
export const percent = (n: number) => `${Number((n * 100).toFixed(4))}%`;
export function rulesDescription(rules: SimulationRules): string {
  return [`S／A／B：${percent(rules.s.base)}／${percent(rules.a.base)}／${percent(rules.b)}`,
    ...(["s", "a"] as const).map(key => { const r = rules[key]; return `${key.toUpperCase()}：${r.hard ? `${r.hard} 抽保底` : "無硬保底"}；${r.softStart ? `第 ${r.softStart} 抽起每抽 +${percent(r.step)}` : "無軟保底"}；UP ${percent(r.up)}；歪後必 UP ${r.guarantee ? "開" : "關"}`; }),
    ...(rules.mode === "game" ? ["軟保底採社群重建曲線，非官方公開公式。"] : []),
    ...(rules.pool === "weapon" ? ["音擎池僅出音擎；此掉落範圍與遊戲不同。"] : [])].join("\n");
}
