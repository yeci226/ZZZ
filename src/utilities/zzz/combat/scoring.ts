import { createHash } from "node:crypto";
import { finite, integer, record, MAIN_MAX, MAIN_SLOTS, SUB_ROLL, normalizeDisc, type DriveDisc, type Element, type Stat, type SubStat } from "./stats.js";

export const SCORE_VERSION = "zzz-disc-1";
export const GRADE_THRESHOLDS = [[0, "D"], [40, "C"], [50, "B"], [60, "A"], [70, "S"], [80, "SS"], [85, "SSS"], [90, "ACE"]] as const;
export function grade(score: number): string { return [...GRADE_THRESHOLDS].reverse().find(([min]) => score >= min)![1]; }
export interface ContextWeight { main: number; subs: Partial<Record<SubStat, number>> }
export interface ScoringBuild { id: string; slots: Record<string, Partial<Record<Stat, ContextWeight>>> }
export interface ScoringAgent { name: string; builds: ScoringBuild[] }
export interface ScoringSnapshot {
  schemaVersion: 1; revision: string; fetchedAt: string; source: string;
  hash: string; agents: Record<string, ScoringAgent>;
}
export interface DiscScore { slot: number; status: "scored" | "empty" | "invalid"; score: number | null; grade: string | null; main: number; sub: number; reason?: string }
export interface ProfileScore {
  version: string; hash: string; build: string; availableBuilds: string[];
  discs: DiscScore[]; total: number | null; grade: string | null; complete: boolean;
  pending?: boolean;
}
export function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function adaptScoringSource(input: unknown, revision: string, fetchedAt: string): ScoringSnapshot {
  if (!/^[a-f0-9]{40}$/.test(revision) || !Number.isFinite(Date.parse(fetchedAt))) throw new Error("Invalid scoring provenance");
  const agents: Record<string, ScoringAgent> = {};
  for (const [id, data] of Object.entries(record(record(input).agents))) {
    if (!/^\d{4}$/.test(id)) throw new Error("Invalid scoring agent ID");
    const agent = record(data);
    if (typeof agent.name !== "string" || !agent.name.trim()) throw new Error("Missing agent name");
    const builds: ScoringBuild[] = [];
    for (const [buildId, raw] of Object.entries(record(agent.builds))) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(buildId)) throw new Error("Invalid build ID");
      const contexts = record(record(raw).contextualWeights), slots: ScoringBuild["slots"] = {};
      if (Object.keys(contexts).length !== 6) throw new Error("Incomplete scoring slots");
      for (let slot = 1; slot <= 6; slot++) {
        const rows: Partial<Record<Stat, ContextWeight>> = {};
        for (const [stat, rawWeight] of Object.entries(record(contexts[`Drive${slot}`]))) {
          if (!MAIN_SLOTS[slot].includes(stat as Stat)) throw new Error(`Invalid main ${stat} at ${slot}`);
          const weight = record(rawWeight), subs: ContextWeight["subs"] = {};
          for (const [key, value] of Object.entries(record(weight.substatWeights))) {
            if (!(key in SUB_ROLL)) throw new Error(`Unknown substat ${key}`);
            subs[key as SubStat] = finite(value, "substat weight", 0, 10);
          }
          if (!Object.values(subs).some(n => n > 0)) throw new Error("Empty substat weights");
          rows[stat as Stat] = { main: finite(weight.mainStatPoints, "main weight", 0, 100), subs };
        }
        if (!Object.values(rows).some(w => w!.main > 0)) throw new Error("Empty main weights");
        slots[slot] = rows;
      }
      builds.push({ id: buildId, slots });
    }
    if (!builds.length || builds.length > 20) throw new Error("Invalid scoring builds");
    agents[id] = { name: agent.name, builds };
  }
  if (!Object.keys(agents).length) throw new Error("Empty scoring snapshot");
  return { schemaVersion: 1, revision, fetchedAt, source: "https://github.com/SouthxPaw/zzz.optimizer", hash: hash(agents), agents };
}

export function scoreDisc(disc: DriveDisc, build: ScoringBuild, element?: Element): DiscScore {
  const contexts = build.slots[disc.slot];
  const best = Object.values(contexts).sort((a, b) => b!.main - a!.main)[0]!;
  // A legal but unrecommended main retains the build's baseline substat weights.
  const weights = contexts[disc.main.stat] ?? { main: 0, subs: best.subs };
  const eligible = Object.entries(weights.subs).filter(([s]) => s !== disc.main.stat).map(([, w]) => w!).sort((a, b) => b - a).slice(0, 4);
  const maxSub = eligible.reduce((s, n) => s + n, 0) + 5 * (eligible[0] ?? 0);
  const actualSub = disc.subs.reduce((sum, s) => sum + s.value / SUB_ROLL[s.stat as SubStat] * (weights.subs[s.stat as SubStat] ?? 0), 0);
  const matchesElement = disc.main.stat !== "Element_DMG" || Boolean(element && disc.main.element === element);
  if (disc.main.stat === "Element_DMG" && (!element || !disc.main.element)) throw new Error("Unknown damage element");
  const main = matchesElement ? (weights.main / best.main) * disc.main.value / MAIN_MAX[disc.main.stat] : 0;
  const sub = maxSub > 0 ? actualSub / maxSub : 0;
  const score = Math.min(100, Math.max(0, 100 * (0.4 * main + 0.6 * sub)));
  return { slot: disc.slot, status: "scored", score, grade: grade(score), main, sub };
}

export function scoreCharacter(input: unknown, snapshot: ScoringSnapshot, selected = "auto"): ProfileScore | null {
  const character = record(Array.isArray(input) ? input[0] : input);
  const agent = snapshot.agents[String(character.id)];
  if (!agent) return null;
  const chosen = selected === "auto" ? agent.builds : agent.builds.filter(b => b.id === selected);
  if (!chosen.length) throw new Error("Unknown scoring build");
  if (!Array.isArray(character.equip)) throw new Error("Missing equipment list");
  const elements: Record<number, Element> = {200: "physical", 201: "fire", 202: "ice", 203: "electric", 204: "wind", 205: "ether", 300: "luminous"};
  const element = elements[Number(character.element_type)];
  const slots = new Map<number, unknown>();
  const invalidSlots = new Set<number>();
  const typed = character.equip.some((d: any) => d?.equipment_type !== undefined);
  if (character.equip.length > 6) throw new Error("Too many equipped discs");
  character.equip.forEach((d: any, i: number) => {
    if (!d) return;
    const slot = integer(typed ? d.equipment_type : i + 1, "disc slot", 1, 6);
    if (slots.has(slot)) invalidSlots.add(slot);
    slots.set(slot, d);
  });
  const results = chosen.map(build => {
    const discs: DiscScore[] = Array.from({ length: 6 }, (_, index) => {
      const slot = index + 1, raw = slots.get(slot);
      if (!raw) return {slot, status: "empty", score: 0, grade: null, main: 0, sub: 0};
      try {
        if (invalidSlots.has(slot)) throw new Error("Duplicate disc slot");
        return scoreDisc(normalizeDisc(raw, slot), build, element);
      } catch (error) {
        return {slot, status: "invalid", score: null, grade: null, main: 0, sub: 0, reason: error instanceof Error ? error.message : "Invalid disc"};
      }
    });
    const total = discs.some(d => d.score === null) ? null : discs.reduce((sum, d) => sum + d.score!, 0);
    return {version: SCORE_VERSION, hash: snapshot.hash, build: build.id, availableBuilds: agent.builds.map(b => b.id), discs, total,
      grade: total === null ? null : grade(total / 6), complete: discs.every(d => d.status === "scored")};
  });
  return results.sort((a, b) => (b.total ?? -1) - (a.total ?? -1))[0];
}
