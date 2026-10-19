import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const COVERAGE_KINDS = ["agent", "bangboo", "weapon", "set", "enemy"] as const;
export type CoverageKind = (typeof COVERAGE_KINDS)[number];
export type EvidenceState = "missing" | "reference" | "verified" | "not-applicable";
export interface CoverageSource {
  url: string;
  sha256: string;
  fetchedAt: string;
  /** A wiki page revision or fetch date is not a game version. */
  gameVersion: string | null;
  authority: "official" | "community" | "in-game" | "local-inventory";
}
export interface MechanicCoverage {
  numeric: EvidenceState;
  timing: EvidenceState;
  implemented: boolean;
  verification: "missing" | "unit-tested" | "in-game";
  sources: string[];
  tests: string[];
  /** Reproducible capture/fixture identifiers, separate from unit tests. */
  captures: string[];
  notes: string[];
}
export interface CombatCoverage {
  schemaVersion: 1;
  revision: string;
  gameVersion: string | null;
  modelVersion: string;
  sources: Record<string, CoverageSource>;
  inventories: Record<CoverageKind, {
    status: "candidate" | "verified";
    ids: string[];
    sources: string[];
  }>;
  models: Record<string, {
    gameVersion: string | null;
    modelVersion: string;
    mechanics: Record<string, MechanicCoverage>;
  }>;
  focusTeam: { id: string; level: number; cinema: number; awakening: number; weapon: string; refinement: number; sets: string[] }[];
}
export interface RuntimeCoverage {
  modelVersion: string;
  agents: string[];
  bangboo: string[];
  weapons: string[];
  sets: string[];
  enemies: string[];
}

/** These requirements cannot be removed by omitting a mechanic from the data file. */
export const REQUIRED_MECHANICS: Record<CoverageKind, readonly string[]> = {
  agent: ["panel", "skill-coefficients", "hit-timing", "resource-costs", "anomaly-buildup", "states-and-triggers", "cinema-and-awakening", "team-conditions", "cancel-and-clock", "equipment-integration", "in-game-validation"],
  bangboo: ["panel", "skills", "hit-timing", "anomaly-buildup", "team-conditions", "in-game-validation"],
  weapon: ["panel", "passive-triggers", "refinements", "durations-stacking", "in-game-validation"],
  set: ["two-piece", "four-piece-triggers", "durations-stacking", "in-game-validation"],
  enemy: ["panel", "phases", "resistance", "stun", "anomaly", "incoming-events", "in-game-validation"],
};
export function missingMechanic(note: string): MechanicCoverage {
  return { numeric: "missing", timing: "missing", implemented: false, verification: "missing", sources: [], tests: [], captures: [], notes: [note] };
}
export function loadCombatCoverage(): CombatCoverage {
  return JSON.parse(readFileSync(resolve("src/assets/combat/coverage.json"), "utf8"));
}

/** A candidate source is useful evidence, but cannot silently become a verified model. */
export function coverageIssues(coverage: CombatCoverage, runtime?: RuntimeCoverage): string[] {
  const issues: string[] = [];
  if (coverage.schemaVersion !== 1) issues.push("Unsupported combat coverage schema");
  if (!coverage.revision || !coverage.gameVersion || coverage.gameVersion === "unverified") issues.push("Combat game version has not been pinned");
  if (!coverage.modelVersion || coverage.modelVersion === "unverified") issues.push("Combat model version has not been verified");
  if (runtime && runtime.modelVersion !== coverage.modelVersion) issues.push("Runtime and evidence model versions differ");
  const sourceIssues = (ids: string[], prefix: string): void => {
    if (!ids.length) issues.push(`${prefix}: no evidence sources`);
    for (const id of ids) {
      const source = coverage.sources[id];
      if (!source || !/^https:\/\//.test(source.url) || !/^[a-f0-9]{64}$/.test(source.sha256) || !Number.isFinite(Date.parse(source.fetchedAt))) {
        issues.push(`${prefix}: invalid source ${id}`);
      } else if (!coverage.gameVersion || source.gameVersion !== coverage.gameVersion) {
        issues.push(`${prefix}: source ${id} does not establish the target game version`);
      }
    }
  };
  const runtimeIds: Record<CoverageKind, string[]> | undefined = runtime && {
    agent: runtime.agents, bangboo: runtime.bangboo, weapon: runtime.weapons, set: runtime.sets, enemy: runtime.enemies,
  };
  for (const kind of COVERAGE_KINDS) {
    const inventory = coverage.inventories[kind];
    if (!inventory || inventory.status !== "verified" || !inventory.ids.length) issues.push(`Unverified ${kind} inventory`);
    if (!inventory) continue;
    if (new Set(inventory.ids).size !== inventory.ids.length) issues.push(`Duplicate ${kind} inventory IDs`);
    sourceIssues(inventory.sources, `${kind} inventory`);
    if (!inventory.sources.some(id => coverage.sources[id]?.authority === "official")) issues.push(`${kind} inventory: no official released-content evidence`);
    for (const id of inventory.ids) {
      const key = `${kind}:${id}`, model = coverage.models[key];
      if (runtimeIds && !runtimeIds[kind].includes(id)) issues.push(`Missing runtime ${key}`);
      if (!model) { issues.push(`Missing coverage ${key}`); continue; }
      if (!coverage.gameVersion || model.gameVersion !== coverage.gameVersion || model.modelVersion !== coverage.modelVersion) issues.push(`${key}: model evidence version mismatch`);
      for (const mechanic of new Set([...REQUIRED_MECHANICS[kind], ...Object.keys(model.mechanics)])) {
        const item = model.mechanics[mechanic], prefix = `${key}/${mechanic}`;
        if (!item) { issues.push(`Missing mechanic ${prefix}`); continue; }
        if (!item.implemented) issues.push(`${prefix}: implementation missing`);
        if (!["verified", "not-applicable"].includes(item.numeric)) issues.push(`${prefix}: numeric evidence ${item.numeric}`);
        if (!["verified", "not-applicable"].includes(item.timing)) issues.push(`${prefix}: timing evidence ${item.timing}`);
        if (!item.tests.length) issues.push(`${prefix}: no regression tests`);
        sourceIssues(item.sources, prefix);
        if ((item.numeric === "not-applicable" || item.timing === "not-applicable") && !item.notes.some(note => note.trim().length > 0)) issues.push(`${prefix}: applicability needs an evidence-backed explanation`);
        if (mechanic === "in-game-validation") {
          if (item.verification !== "in-game" || !item.captures.length || !item.sources.some(source => coverage.sources[source]?.authority === "in-game")) issues.push(`${prefix}: reproducible in-game validation missing`);
        } else if (item.verification === "missing") issues.push(`${prefix}: verification missing`);
      }
    }
  }
  return issues;
}

export function focusCoverageReport(coverage: CombatCoverage) {
  const issues = coverageIssues(coverage);
  return coverage.focusTeam.map(build => ({
    build,
    models: [`agent:${build.id}`, `weapon:${build.weapon}`, ...build.sets.map(id => `set:${id}`)].map(key => {
      const model = coverage.models[key];
      return { key, mechanics: model?.mechanics ?? {}, ready: Boolean(coverage.gameVersion && coverage.modelVersion !== "unverified" && model && !issues.some(issue => issue.includes(key))) };
    }),
  }));
}
