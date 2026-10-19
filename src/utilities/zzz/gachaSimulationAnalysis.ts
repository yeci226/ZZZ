import { EMPTY_SIMULATION_STATE, simulatePulls, type SimulationBanner, type SimulationPool, type SimulationState } from "./gachaSimulationEngine.js";
import { defaultSimulationRules, rankProbability, validateSimulationRules, type SimulationRules } from "./gachaSimulationRules.js";
import type { SimulationSession } from "./gachaSimulationStore.js";

export interface HistoryFilter { pool: SimulationPool; rulesId: string; bannerId?: string; since?: number; until?: number }
export function analyzeSimulation(sessions: SimulationSession[], filter: HistoryFilter) {
  const all = sessions.filter(s => s.banner.pool === filter.pool && (s.rulesId ?? "game") === filter.rulesId).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const rows: Array<{ index: number; time: number; banner: string; id: string; rank: string; up: boolean; pity: number; guaranteed: boolean | null; sChance: number | null; isNew: boolean }> = [];
  let previous: SimulationState | undefined;
  for (const session of all) {
    const start = session.state.total - session.pulls.length;
    let guarantee: boolean | undefined = previous?.total === start ? previous.guaranteedS : start === 0 ? false : undefined;
    const include = (!filter.bannerId || session.banner.id === filter.bannerId) && (!filter.since || session.createdAt >= filter.since) && (!filter.until || session.createdAt <= filter.until);
    session.pulls.forEach((p, i) => {
      if (include) rows.push({ index: start + i + 1, time: session.createdAt, banner: session.banner.name, id: p.id, rank: p.rank, up: p.featured, pity: p.atPity, guaranteed: p.rank === "S" ? p.guaranteed ?? guarantee ?? null : null, sChance: p.probabilities?.s ?? rankProbability((session.rules ?? defaultSimulationRules(session.banner.pool)).s, p.atPity), isNew: !!p.isNew });
      if (p.rank === "S") guarantee = (session.rules?.s.guarantee ?? true) && !p.featured;
    }); previous = session.state;
  }
  const s = rows.filter(p => p.rank === "S"), small = s.filter(p => p.guaranteed === false);
  const counts = { S: s.length, A: rows.filter(p => p.rank === "A").length, B: rows.filter(p => p.rank === "B").length };
  const items: Record<string, number> = {}; rows.forEach(p => items[p.id] = (items[p.id] || 0) + 1);
  const gaps = s.map(p => p.pity).sort((a, b) => a - b);
  const upGaps: number[] = []; let lastUp: number | undefined;
  // UP intervals use the unfiltered stream; gaps crossing an excluded banner or time range are not fabricated.
  let lastIndex: number | undefined;
  for (const p of rows) { if (lastIndex !== undefined && p.index !== lastIndex + 1) lastUp = undefined; if (p.rank === "S" && p.up) { if (lastUp !== undefined) upGaps.push(p.index - lastUp); lastUp = p.index; } lastIndex = p.index; }
  return { rows, counts, items, total: rows.length, up: s.filter(p => p.up).length, small: small.length, won: small.filter(p => p.up).length, guaranteed: s.filter(p => p.guaranteed === true).length, unknown: s.filter(p => p.guaranteed === null).length, gaps, upGaps,
    mean: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    median: quantile(gaps, .5), min: gaps[0] ?? null, max: gaps.at(-1) ?? null };
}
export function quantile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null; const position = (sorted.length - 1) * p, lower = Math.floor(position), fraction = position - lower;
  return sorted[lower] + ((sorted[lower + 1] ?? sorted[lower]) - sorted[lower]) * fraction;
}
export function firstSignalCurves(rules: SimulationRules, initial: Pick<SimulationState, "sinceS" | "guaranteedS">, horizon = 1000) {
  let missS = 1, states = new Map<string, number>([[`${initial.sinceS},${Number(initial.guaranteedS && rules.s.guarantee)}`, 1]]);
  const rows: Array<{ x: number; hazard: number; s: number; up: number }> = [];
  for (let n = 1; n <= horizon; n++) {
    const hazard = rankProbability(rules.s, initial.sinceS + n); missS *= 1 - hazard;
    const next = new Map<string, number>(); const add = (k: string, p: number) => { if (p > 1e-16) next.set(k, (next.get(k) || 0) + p); };
    for (const [key, mass] of states) {
      const [pity, guaranteed] = key.split(",").map(Number), ps = rankProbability(rules.s, pity + 1), up = guaranteed ? 1 : rules.s.up;
      add(`${pity + 1},${guaranteed}`, mass * (1 - ps)); add(`0,${Number(rules.s.guarantee)}`, mass * ps * (1 - up));
    }
    states = next;
    rows.push({ x: n, hazard, s: 1 - missS, up: Math.min(1, Math.max(0, 1 - [...states.values()].reduce((a, b) => a + b, 0))) });
  }
  return rows;
}
export function histogram(values: number[], bins = 20): Array<{ x: number; y: number }> {
  if (!values.length) return [];
  const max = values.reduce((max, n) => Math.max(max, n), 0), width = Math.max(1, Math.ceil((max + 1) / bins));
  const counts = new Map<number, number>(); for (const n of values) { const x = Math.floor(n / width) * width; counts.set(x, (counts.get(x) || 0) + 1); }
  return [...counts].sort((a, b) => a[0] - b[0]).map(([x, y]) => ({ x, y }));
}
export function simulationCsv(analysis: ReturnType<typeof analyzeSimulation>, names: Record<string, { name: string }>) {
  const cell = (v: unknown) => { const text = String(v ?? ""); return '"' + (/^[=+\-@]/.test(text) ? "'" : "") + text.replace(/"/g, '""') + '"'; };
  return "\ufeff" + [["抽數", "時間", "卡池", "物品", "稀有度", "UP", "S保底位置", "大保底", "當抽S機率"], ...analysis.rows.map(p => [p.index, new Date(p.time).toISOString(), p.banner, names[p.id]?.name ?? p.id, p.rank, p.up, p.pity, p.guaranteed, p.sChance])].map(row => row.map(cell).join(",")).join("\r\n");
}
export function seededRandom(seed: number) {
  let value = seed >>> 0; return () => { value += 0x6D2B79F5; let x = value; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}
export interface ResourceBudget { monochrome: number; polychrome: number; tapes: number; reserve: number }
export function resourceBudget(r: ResourceBudget) {
  for (const value of Object.values(r)) if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) throw new Error("資源須為 0～10 億的整數。");
  if (r.reserve > r.monochrome) throw new Error("保留底片不可超過擁有數量。");
  const available = r.polychrome + r.monochrome - r.reserve;
  return { pulls: r.tapes + Math.floor(available / 160), remainder: available % 160 };
}
export function remainingResources(r: ResourceBudget, used: number) {
  const tapesSpent = Math.min(used, r.tapes), filmNeeded = (used - tapesSpent) * 160;
  const polychromeSpent = Math.min(filmNeeded, r.polychrome), monochromeSpent = filmNeeded - polychromeSpent;
  return { tapes: r.tapes - tapesSpent, polychrome: r.polychrome - polychromeSpent, monochrome: r.monochrome - monochromeSpent, reserve: r.reserve };
}
export interface ResourceStage { banner: SimulationBanner; rules: SimulationRules; target: number; sinceS: number; guaranteed: boolean | null }
export interface ResourcePlan { resources: ResourceBudget; stages: ResourceStage[]; rounds: number; seed: number }
export interface SignalEvent { pool: SimulationPool; pull: number; poolPull: number; id: string; up: boolean; pity: number; guaranteed: boolean }
export interface ResourceExample { events: SignalEvent[]; obtained: Record<SimulationPool, number>; used: number; remaining: ResourceBudget; complete: boolean; omittedEvents: number }
export function validateResourcePlan(plan: ResourcePlan) {
  const budget = resourceBudget(plan.resources);
  if (budget.pulls > 100_000) throw new Error("每次資源試算最多 100,000 抽，請減少本次納入的資源。");
  if (!Number.isInteger(plan.rounds) || plan.rounds < 1 || plan.rounds > 10000 || !Number.isInteger(plan.seed)) throw new Error("試算回合或種子不正確。");
  if (!plan.stages.length || plan.stages.length > 2 || new Set(plan.stages.map(s => s.banner.pool)).size !== plan.stages.length) throw new Error("每種池只能安排一個階段。");
  let targets = 0;
  for (const stage of plan.stages) {
    validateSimulationRules(stage.rules);
    if (stage.rules.pool !== stage.banner.pool || !Number.isInteger(stage.target) || stage.target < 0 || stage.target > (stage.banner.pool === "character" ? 7 : 5)) throw new Error("角色目標為 0～7 份、音擎為 0～5 份。");
    if (!Number.isInteger(stage.sinceS) || stage.sinceS < 0 || stage.sinceS > 100000 || (stage.rules.s.hard && stage.sinceS >= stage.rules.s.hard)) throw new Error("已墊抽數不正確，應小於 S 硬保底。");
    if (stage.guaranteed !== null && typeof stage.guaranteed !== "boolean") throw new Error("請選擇大小保底。");
    targets += stage.target;
  }
  if (!targets) throw new Error("至少設定一項目標。");
  return budget;
}
/** Probability distribution for time to next S. Shared hazard function; skips A/B events, which do not affect S. */
function signalSampler(rules: SimulationRules) {
  const cache = new Map<number, Float64Array>();
  return (sinceS: number, remaining: number, random: () => number) => {
    const r = rules.s;
    if (r.softStart === null && r.hard === null) {
      if (r.base === 0) return remaining + 1;
      if (r.base === 1) return 1;
      return Math.min(remaining + 1, Math.floor(Math.log1p(-random()) / Math.log1p(-r.base)) + 1);
    }
    let cdf = cache.get(sinceS);
    if (!cdf) {
      const end = r.hard ?? Math.ceil((1 - r.base) / r.step) + r.softStart!;
      const length = Math.max(1, end - sinceS);
      cdf = new Float64Array(length); let miss = 1;
      for (let n = 1; n <= length; n++) { miss *= 1 - rankProbability(r, sinceS + n); cdf[n - 1] = 1 - miss; }
      cache.set(sinceS, cdf);
    }
    const value = random(); let left = 0, right = cdf.length;
    while (left < right) { const middle = (left + right) >>> 1; if (cdf[middle] > value) right = middle; else left = middle + 1; }
    return Math.min(remaining + 1, left + 1);
  };
}
export function wilson(successes: number, total: number): [number, number] {
  if (!total) return [0, 1]; const z = 1.95996398454, p = successes / total, den = 1 + z * z / total;
  const mid = (p + z * z / (2 * total)) / den, d = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / den;
  return [Math.max(0, mid - d), Math.min(1, mid + d)];
}
export function guaranteedPlanBudget(stages: ResourceStage[]): number | null {
  let total = 0;
  for (const stage of stages.filter(s => s.target)) {
    const r = stage.rules.s;
    const effectiveHard = Math.min(r.hard ?? Infinity, r.base === 1 ? 1 : r.softStart !== null ? r.softStart - 1 + Math.ceil((1 - r.base) / r.step) : Infinity);
    if (!Number.isFinite(effectiveHard) || (r.up < 1 && !r.guarantee)) return null;
    const first = Math.max(1, effectiveHard - stage.sinceS);
    total += first + (r.up < 1 && !(stage.guaranteed && r.guarantee) ? effectiveHard : 0) + (stage.target - 1) * effectiveHard * (r.up === 1 ? 1 : 2);
  }
  return total;
}
export function runResourcePlan(plan: ResourcePlan, deadlineMs = 30_000) {
  const budget = validateResourcePlan(plan), rng = seededRandom(plan.seed), deadline = Date.now() + deadlineMs;
  const cases: Array<{ label: string; stages: ResourceStage[] }> = [{ label: "", stages: plan.stages }];
  for (let index = 0; index < plan.stages.length; index++) if (plan.stages[index].target && plan.stages[index].guaranteed === null) {
    const current = cases.splice(0);
    for (const row of current) for (const guaranteed of [false, true]) cases.push({ label: `${row.label}${plan.stages[index].banner.pool === "character" ? "角色" : "音擎"}${guaranteed ? "大" : "小"}保底 `, stages: row.stages.map((s, i) => i === index ? { ...s, guaranteed } : s) });
  }
  return { input: plan, budget, scenarios: cases.map((scenario, caseIndex) => {
    const caseDeadline = Date.now() + Math.max(1, deadline - Date.now()) / (cases.length - caseIndex);
    const samplers = scenario.stages.map(s => signalSampler(s.rules));
    const required = { character: scenario.stages.find(s => s.banner.pool === "character")?.target || 0, weapon: scenario.stages.find(s => s.banner.pool === "weapon")?.target || 0 };
    const successes = { character: 0, weapon: 0, both: 0, characterOnly: 0, weaponOnly: 0, neither: 0 };
    const outcomes: Record<string, number> = {}, successfulUsed: number[] = [], successfulRemaining: number[] = [];
    const firstGoalTimes: Record<SimulationPool, number[]> = { character: [], weapon: [] };
    let example: ResourceExample | undefined, completed = 0;
    for (let round = 0; round < plan.rounds; round++) {
      if (Date.now() >= caseDeadline) break;
      const obtained = { character: 0, weapon: 0 }, events: SignalEvent[] = []; let used = 0, interrupted = false, omittedEvents = 0;
      const goalTimes: Partial<Record<SimulationPool, number>> = { ...(required.character ? {} : { character: 0 }), ...(required.weapon ? {} : { weapon: 0 }) };
      for (let j = 0; j < scenario.stages.length; j++) {
        const stage = scenario.stages[j], pool = stage.banner.pool;
        let sinceS = stage.sinceS, guarantee = !!stage.guaranteed && stage.rules.s.guarantee, poolPull = 0;
        if (round > 0 && stage.rules.s.up === 0 && !stage.rules.s.guarantee && !guarantee && stage.target) { used = budget.pulls; break; }
        while (obtained[pool] < stage.target && used < budget.pulls) {
          if ((poolPull & 255) === 0 && Date.now() >= caseDeadline) { interrupted = true; break; }
          const wait = samplers[j](sinceS, budget.pulls - used, rng);
          if (wait > budget.pulls - used) { used = budget.pulls; break; }
          used += wait; poolPull += wait;
          const up = guarantee || rng() < stage.rules.s.up;
          const off = stage.banner.standardS.filter(id => id !== stage.banner.featuredS);
          const id = up ? stage.banner.featuredS : off[Math.floor(rng() * off.length)];
          if (!round) { if (events.length < 200) events.push({ pool, pull: used, poolPull, id, up, pity: sinceS + wait, guaranteed: guarantee }); else omittedEvents++; }
          if (up) obtained[pool]++;
          guarantee = stage.rules.s.guarantee && !up; sinceS = 0;
        }
        if (interrupted) break;
        if (stage.target && obtained[pool] >= stage.target) goalTimes[pool] = used;
      }
      if (interrupted) break;
      completed++;
      const char = obtained.character >= required.character, weapon = obtained.weapon >= required.weapon;
      successes.character += Number(char); successes.weapon += Number(weapon); successes.both += Number(char && weapon);
      successes.characterOnly += Number(char && !weapon); successes.weaponOnly += Number(weapon && !char); successes.neither += Number(!char && !weapon);
      outcomes[`${obtained.character}/${obtained.weapon}`] = (outcomes[`${obtained.character}/${obtained.weapon}`] || 0) + 1;
      for (const pool of ["character", "weapon"] as const) if (goalTimes[pool] !== undefined) firstGoalTimes[pool].push(goalTimes[pool]!);
      if (char && weapon) { successfulUsed.push(used); successfulRemaining.push(budget.pulls - used); }
      if (!example) example = { events, obtained, used, remaining: remainingResources(plan.resources, used), complete: char && weapon, omittedEvents };
    }
    successfulUsed.sort((a, b) => a - b); successfulRemaining.sort((a, b) => a - b);
    const curve = Array.from({ length: 41 }, (_, i) => { const x = Math.floor(budget.pulls * i / 40); return { x, character: completed ? firstGoalTimes.character.filter(n => n <= x).length / completed : 0, weapon: completed ? firstGoalTimes.weapon.filter(n => n <= x).length / completed : 0, both: completed ? successfulUsed.filter(n => n <= x).length / completed : 0 }; });
    return { label: scenario.label.trim() || "指定保底", completed, successes, intervals: { character: wilson(successes.character, completed), weapon: wilson(successes.weapon, completed), both: wilson(successes.both, completed) }, outcomes, usedHistogram: histogram(successfulUsed), remainingHistogram: histogram(successfulRemaining), medianUsed: quantile(successfulUsed, .5), medianRemaining: quantile(successfulRemaining, .5), guaranteeBudget: guaranteedPlanBudget(scenario.stages), curve, example };
  }) };
}
export function runBulkTrial(input: { banner: SimulationBanner; rules: SimulationRules; initial: SimulationState; count: number; seed: number }) {
  validateSimulationRules(input.rules);
  if (![1000, 10000, 100000].includes(input.count)) throw new Error("批量試抽只支援 1 千／1 萬／10 萬抽。");
  const random = seededRandom(input.seed); let state = { ...input.initial };
  const counts = { S: 0, A: 0, B: 0 }, items: Record<string, number> = {}, gaps: number[] = [], upGaps: number[] = [];
  let up = 0, won = 0, small = 0, lastUp: number | undefined;
  const trend: Array<{ x: number; s: number; a: number }> = [];
  for (let n = 0; n < input.count; n += 10) {
    const result = simulatePulls(input.banner, state, 10, random, input.rules); state = result.state;
    result.pulls.forEach((p, i) => { counts[p.rank]++; items[p.id] = (items[p.id] || 0) + 1; if (p.rank === "S") { gaps.push(p.atPity); if (!p.guaranteed) { small++; won += Number(p.featured); } if (p.featured) { up++; if (lastUp !== undefined) upGaps.push(n + i - lastUp); lastUp = n + i; } } });
    if ((n + 10) % Math.max(10, input.count / 100) === 0) trend.push({ x: n + 10, s: counts.S / (n + 10), a: counts.A / (n + 10) });
  }
  return { input, counts, items, up, won, small, state, gaps: histogram(gaps), upGaps: histogram(upGaps), trend };
}
