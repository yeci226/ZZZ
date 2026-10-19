import { randomInt } from "node:crypto";
import type { GachaRank } from "./gachaAnimationCache.js";
import { defaultSimulationRules, effectiveProbabilities, type SimulationRules } from "./gachaSimulationRules.js";

export type SimulationPool = "character" | "weapon";
export interface SimulationItem {
  id: string;
  name: string;
  rank: GachaRank;
  kind: SimulationPool;
  image: string;
  crop?: [number, number, number, number];
  /** First availability outside its debut UP banner; older pools must exclude it. */
  poolAvailableSince?: string;
}
export interface SimulationBanner {
  id: string;
  name: string;
  version: string;
  pool: SimulationPool;
  startAt: string;
  endAt: string;
  featuredS: string;
  featuredA: string[];
  /** Snapshot the available pool so continuing an old message does not change it. */
  standardS: string[];
  agentsA: string[];
  weaponsA: string[];
  weaponsB: string[];
}
export interface SimulationState {
  total: number;
  sinceS: number;
  sinceAOrHigher: number;
  guaranteedS: boolean;
  guaranteedA: boolean;
  countS: number;
  countA: number;
}
export interface SimulationPull {
  id: string;
  rank: GachaRank;
  featured: boolean;
  atPity: number;
  isNew?: boolean;
  probabilities?: { s: number; a: number; b: number };
  guaranteed?: boolean;
  aPity?: number;
}
export const EMPTY_SIMULATION_STATE: Readonly<SimulationState> = {
  total: 0, sinceS: 0, sinceAOrHigher: 0, guaranteedS: false, guaranteedA: false, countS: 0, countA: 0,
};

// Base rates and hard guarantees follow Signal Search details. The soft-pity
// curves are community reconstructions, not a published HoYoverse server formula.
export const SIMULATION_RULES = {
  character: { s: .006, a: .094, hardS: 90, softS: 74, stepS: .06, up: .5 },
  weapon: { s: .01, a: .15, hardS: 80, softS: 65, stepS: .06, up: .75 },
} as const;
export const SIMULATION_RULES_REVISION = "zzz-community-soft-pity-v1";
export const secureRandom = () => randomInt(0, 2 ** 48 - 1) / (2 ** 48 - 1);

export function sProbability(pool: SimulationPool, nextPull: number): number {
  const r = SIMULATION_RULES[pool];
  if (nextPull >= r.hardS) return 1;
  return Math.min(1, r.s + Math.max(0, nextPull - r.softS + 1) * r.stepS);
}

export function validateSimulationBanner(b: SimulationBanner): void {
  if (!["character", "weapon"].includes(b.pool) || !b.featuredS || !b.featuredA.length ||
    !b.standardS.length || !b.weaponsA.length || !b.weaponsB.length ||
    (b.pool === "character" && !b.agentsA.length)) throw new Error("卡池項目尚未準備完成。");
}

/** Pure sequential draws: a ten-pull is exactly ten single pulls, never rerolled for a cache hit. */
export function simulatePulls(
  banner: SimulationBanner, initial: SimulationState, count: 1 | 10, random = secureRandom,
  rules: SimulationRules = defaultSimulationRules(banner.pool),
): { state: SimulationState; pulls: SimulationPull[] } {
  if (count !== 1 && count !== 10) throw new Error("只能選擇單抽或十抽。");
  validateSimulationBanner(banner);
  if (rules.pool !== banner.pool) throw new Error("卡池與機率規則不符。");
  const state = { ...initial }, pulls: SimulationPull[] = [];
  const roll = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid random source");
    return value;
  };
  const pick = (ids: string[]) => {
    if (!ids.length) throw new Error("卡池項目尚未準備完成。");
    return ids[Math.floor(roll() * ids.length)];
  };
  for (let i = 0; i < count; i++) {
    const pity = state.sinceS + 1, probabilities = effectiveProbabilities(rules, state), value = roll();
    // S takes precedence over the A-or-higher guarantee, and resets that counter too.
    const rank: GachaRank = value < probabilities.s ? "S" : value < probabilities.s + probabilities.a ? "A" : "B";
    const aPity = state.sinceAOrHigher + 1;
    const guaranteed = rank === "S" ? rules.s.guarantee && state.guaranteedS : rank === "A" ? rules.a.guarantee && state.guaranteedA : false;
    let id: string, featured = false;
    if (rank === "S") {
      featured = guaranteed || roll() < rules.s.up;
      id = featured ? banner.featuredS : pick(banner.standardS.filter(id => id !== banner.featuredS));
      state.guaranteedS = rules.s.guarantee && !featured; state.sinceS = 0; state.countS++;
    } else {
      state.sinceS++;
      if (rank === "A") {
        featured = guaranteed || roll() < rules.a.up;
        if (featured) id = pick(banner.featuredA);
        else {
          // Off-UP A agents and W-Engines have equal category weight on an agent channel.
          // The weapon-only option follows this bot's requested simulation pool.
          const agents = banner.agentsA.filter(id => !banner.featuredA.includes(id));
          const weapons = banner.weaponsA.filter(id => !banner.featuredA.includes(id));
          id = pick(agents.length && (weapons.length === 0 || roll() < .5) ? agents : weapons);
        }
        state.guaranteedA = rules.a.guarantee && !featured; state.countA++;
      } else id = pick(banner.weaponsB);
    }
    state.sinceAOrHigher = rank === "B" ? state.sinceAOrHigher + 1 : 0;
    state.total++;
    pulls.push({ id, rank, featured, atPity: pity, aPity, guaranteed, probabilities });
  }
  return { state, pulls };
}
