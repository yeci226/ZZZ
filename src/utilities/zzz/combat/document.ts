import { CombatCatalog, parseBuildSpec, type BuildSpec } from "./catalog.js";
import { ELEMENTS, record } from "./stats.js";
import { validateScenario } from "./validation.js";
import type { SimulationScenario } from "./types.js";

export const MAX_PLAN_BYTES = 1_000_000;
/** Only build choices are portable. Uploaded actor models are never executable inputs. */
export interface CombatDocument {
  schemaVersion: 3;
  mode: "fixed-duration" | "kill";
  gameDataVersion?: string;
  rotationVersion?: string;
  initialState?: SimulationScenario["initialState"];
  modelVersion: string;
  name: string;
  baseline: BuildSpec[];
  specs: BuildSpec[];
  bangboo?: BuildSpec;
  enemy: SimulationScenario["enemy"];
  rotation: SimulationScenario["rotation"];
  incoming: SimulationScenario["incoming"];
  durationMs: number;
  switchMs: number;
  loop: boolean;
  seed: number;
  trials: number;
}

export function compileDocument(
  document: CombatDocument,
  catalog: CombatCatalog,
  baseline = false,
): SimulationScenario {
  if (document.schemaVersion !== 3 || document.modelVersion !== catalog.version)
    throw new Error("Saved model version is outdated; reimport equipment");
  const specs = baseline ? document.baseline : document.specs;
  if (
    !Array.isArray(specs) ||
    specs.length < 1 ||
    specs.length > 3 ||
    specs.some((s) => s?.kind !== "agent")
  )
    throw new Error("Invalid team");
  return validateScenario({
    schemaVersion: 1,
    modelVersion: catalog.version,
    mode: document.mode,
    ...(document.gameDataVersion !== undefined
      ? { gameDataVersion: document.gameDataVersion }
      : {}),
    ...(document.rotationVersion !== undefined
      ? { rotationVersion: document.rotationVersion }
      : {}),
    ...(document.initialState !== undefined
      ? { initialState: document.initialState }
      : {}),
    ...catalog.compileFormation(specs, document.bangboo),
    enemy: document.enemy,
    rotation: document.rotation,
    incoming: document.incoming,
    durationMs: document.durationMs,
    switchMs: document.switchMs,
    loop: document.loop,
    seed: document.seed,
    trials: document.trials,
  });
}

/** Portable plans carry only authored combat fields, never nested API/account metadata. */
function known<T extends object>(value: T, keys: readonly (keyof T)[]): T {
  return Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, value[key]]),
  ) as T;
}
function portableEnemy(
  input: SimulationScenario["enemy"],
): SimulationScenario["enemy"] {
  const enemy = known(input, [
    "hp",
    "shield",
    "level",
    "defense",
    "resistance",
    "stunThreshold",
    "stunDurationMs",
    "stunClock",
    "stunMultiplier",
    "phases",
    "anomaly",
  ]);
  enemy.resistance = known(input.resistance, ELEMENTS);
  if (input.shield) enemy.shield = known(input.shield, ["hp", "sources"]);
  if (input.phases)
    enemy.phases = input.phases.map((phase) => {
      const clean = known(phase, [
        "id",
        "sources",
        "atMs",
        "clock",
        "hpRatio",
        "defense",
        "resistance",
        "invulnerable",
        "shield",
      ]);
      if (phase.resistance)
        clean.resistance = known(phase.resistance, ELEMENTS);
      if (phase.shield) clean.shield = known(phase.shield, ["hp", "sources"]);
      return clean;
    });
  enemy.anomaly = {};
  for (const element of ELEMENTS) {
    const model = input.anomaly[element];
    if (!model) continue;
    const clean = known(model, [
      "threshold",
      "durationMs",
      "durationClock",
      "tickMs",
      "tickClock",
      "trigger",
      "maxProcs",
      "disorder",
      "buildupWeighting",
    ]);
    clean.disorder = known(model.disorder, [
      "kind",
      "category",
      "element",
      "basis",
      "multiplier",
      "canCrit",
      "domainMultiplier",
      "bonusFromStat",
    ]);
    if (model.disorder.bonusFromStat)
      clean.disorder.bonusFromStat = known(model.disorder.bonusFromStat, [
        "stat",
        "scale",
        "cap",
      ]);
    enemy.anomaly[element] = clean;
  }
  return enemy;
}
function portableRotation(
  steps: SimulationScenario["rotation"],
): SimulationScenario["rotation"] {
  return steps.map((step) => {
    if (step.type === "repeat")
      return { ...step, steps: portableRotation(step.steps) };
    if (step.type !== "action" || !step.when?.resource) return step;
    return {
      ...step,
      when: {
        ...step.when,
        resource: known(step.when.resource, ["name", "atLeast"]),
      },
    };
  });
}

/** Reconstruct the allowlisted document, then compile both builds against local models. */
export function validateDocument(
  input: unknown,
  catalog: CombatCatalog,
): CombatDocument {
  const d = record(input);
  if (
    ![2, 3].includes(d.schemaVersion) ||
    typeof d.name !== "string" ||
    !d.name.trim() ||
    d.name.length > 100
  )
    throw new Error("Invalid plan document");
  if (
    !Array.isArray(d.specs) ||
    !Array.isArray(d.baseline) ||
    d.specs.length !== d.baseline.length ||
    d.specs.some((s: BuildSpec, i: number) => s.id !== d.baseline[i]?.id)
  )
    throw new Error("Comparison must use the same team");
  if (
    d.schemaVersion === 2 &&
    d.mode !== undefined &&
    d.mode !== "fixed-duration"
  )
    throw new Error(
      "Version 2 plans only support fixed-duration mode; correct the version before importing",
    );
  if (d.schemaVersion === 3 && !["fixed-duration", "kill"].includes(d.mode))
    throw new Error("Version 3 plans require fixed-duration or kill mode");
  const doc: CombatDocument = structuredClone({
    schemaVersion: 3,
    mode: d.schemaVersion === 2 ? "fixed-duration" : d.mode,
    ...(d.gameDataVersion !== undefined
      ? { gameDataVersion: d.gameDataVersion }
      : {}),
    ...(d.rotationVersion !== undefined
      ? { rotationVersion: d.rotationVersion }
      : {}),
    ...(d.schemaVersion === 3 && d.initialState !== undefined
      ? {
          initialState: {
            activeActor: record(d.initialState).activeActor,
            resources: record(d.initialState).resources,
          },
        }
      : {}),
    modelVersion: d.modelVersion,
    name: d.name,
    baseline: d.baseline.map(parseBuildSpec),
    specs: d.specs.map(parseBuildSpec),
    ...(d.bangboo ? { bangboo: parseBuildSpec(d.bangboo) } : {}),
    enemy: d.enemy,
    rotation: d.rotation,
    incoming: d.incoming,
    durationMs: d.durationMs,
    switchMs: d.switchMs,
    loop: d.loop,
    seed: d.seed,
    trials: d.trials,
  });
  const scenario = compileDocument(doc, catalog);
  doc.rotation = portableRotation(scenario.rotation);
  doc.enemy = portableEnemy(scenario.enemy);
  doc.incoming = scenario.incoming.map((event) =>
    known(event, ["atMs", "windowMs", "clock"]),
  );
  compileDocument(doc, catalog, true);
  return doc;
}

export function exportDocument(document: CombatDocument): string {
  return JSON.stringify(document, null, 2);
}

export function importDocument(
  text: string,
  catalog: CombatCatalog,
): CombatDocument {
  if (Buffer.byteLength(text) > MAX_PLAN_BYTES)
    throw new Error("Plan import too large");
  return validateDocument(JSON.parse(text), catalog);
}

export interface PlanAttachment {
  name: string;
  size: number;
  url: string;
}
/** Restrict download to the Discord attachment selected in the modal, and cap streaming bytes. */
export async function readPlanAttachment(
  attachment: PlanAttachment,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (
    !/\.json$/i.test(attachment.name) ||
    !Number.isInteger(attachment.size) ||
    attachment.size < 1 ||
    attachment.size > MAX_PLAN_BYTES
  )
    throw new Error("Upload one JSON plan smaller than 1 MB");
  const url = new URL(attachment.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) ||
    !/^\/attachments\/\d+\/\d+\//.test(url.pathname)
  )
    throw new Error("Invalid attachment URL");
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok || !response.body)
    throw new Error("Unable to read the uploaded plan");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PLAN_BYTES) throw new Error("Plan import too large");
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
