import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hash } from "./scoring.js";
import { combatCatalog, combatDefaults } from "./catalog.js";
import { coverageIssues, loadCombatCoverage, type CombatCoverage, type RuntimeCoverage } from "./coverage.js";

export interface ModelEvidence {
  status: "verified" | "missing";
  sources: string[];
  tests: string[];
  /** Every material mechanic must be explicitly covered, not just a model ID. */
  mechanics: Record<string, {implemented: boolean; verified: boolean}>;
}
export interface CombatRelease {
  schemaVersion: 1; enabled: boolean; rosterVerified: boolean; rosterSource: string;
  agents: {id: string; name: string}[]; bangboo: string[]; weapons: string[]; sets: string[];
  modelVersion: string; evidence: string[]; models: Record<string, ModelEvidence>;
  coverageRevision?: string; gameVersion?: string | null; enemies?: string[];
}
export function releaseIssues(release: CombatRelease, coverage: CombatCoverage = loadCombatCoverage(), runtime?: RuntimeCoverage): string[] {
  const issues: string[] = [];
  if (release.schemaVersion !== 1) issues.push("Unsupported release schema");
  if (!release.rosterVerified) issues.push("Released roster has not been independently verified");
  if (!release.agents.length || !release.bangboo.length || !release.weapons.length || !release.sets.length) issues.push("Incomplete released entity inventories");
  const required = ["engine:formulas", "engine:timing", "engine:anomaly", "engine:resources", "engine:integration",
    ...release.agents.map(a => `agent:${a.id}`), ...release.bangboo.map(id => `bangboo:${id}`),
    ...release.weapons.map(id => `weapon:${id}`), ...release.sets.map(id => `set:${id}`)];
  for (const id of required) {
    const model = release.models[id];
    if (!model || model.status !== "verified" || !model.sources.length || !model.tests.length || !Object.keys(model.mechanics).length
      || Object.values(model.mechanics).some(m => !m.implemented || !m.verified)) issues.push(`Unverified ${id}`);
  }
  if (!release.evidence.length || release.modelVersion === "unverified") issues.push("No complete validation evidence");
  if (!release.coverageRevision || release.coverageRevision !== coverage.revision || !release.gameVersion || release.gameVersion !== coverage.gameVersion || release.modelVersion !== coverage.modelVersion) issues.push("Release and coverage evidence versions differ");
  const inventories = { agent: release.agents.map(actor => actor.id), bangboo: release.bangboo, weapon: release.weapons, set: release.sets, enemy: release.enemies ?? [] };
  for (const [kind, ids] of Object.entries(inventories)) {
    const recorded = coverage.inventories[kind as keyof typeof coverage.inventories]?.ids ?? [];
    if (new Set(ids).size !== ids.length || ids.length !== recorded.length || ids.some(id => !recorded.includes(id))) issues.push(`Release ${kind} inventory does not match coverage`);
  }
  issues.push(...coverageIssues(coverage, runtime));
  return issues;
}
export function loadCombatRelease(): CombatRelease {
  return JSON.parse(readFileSync(resolve("src/assets/combat/release.json"), "utf8"));
}
/** Full combat stays gated on verified models; disc scoring has a separate release switch. */
export function combatReleased(): boolean {
  try {
    const release = loadCombatRelease();
    const coverage = loadCombatCoverage();
    const registry = combatCatalog as typeof combatCatalog & { supportedEquipment?: () => {weapons: string[]; sets: string[]}; supportedEnemies?: () => string[] };
    const equipment = registry.supportedEquipment?.() ?? { weapons: [], sets: [] };
    const supported = combatCatalog.supported();
    return release.enabled && releaseIssues(release, coverage, { modelVersion: combatCatalog.version, agents: release.agents.map(actor => actor.id).filter(id => supported.includes(id)), bangboo: release.bangboo.filter(id => supported.includes(id)), weapons: equipment.weapons, sets: equipment.sets, enemies: registry.supportedEnemies?.() ?? [] }).length === 0 && release.modelVersion === combatCatalog.version
      && Boolean(combatDefaults.enemy && combatDefaults.switchMs)
      && [...release.agents.map(a => a.id), ...release.bangboo].every(id => combatCatalog.supported().includes(id));
  }
  catch { return false; }
}
export function combatVersion(): string { return hash({ release: loadCombatRelease(), coverage: loadCombatCoverage() }); }
