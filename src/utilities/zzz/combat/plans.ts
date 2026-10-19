import { randomUUID } from "node:crypto";
import { record } from "./stats.js";
import { validateScenario } from "./validation.js";
import { hash } from "./scoring.js";
import { COMBAT_ENGINE_VERSION } from "./engine.js";
import type { SimulationResult, SimulationScenario } from "./types.js";
import type { CombatDocument } from "./document.js";

export interface PlanDB {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<any>;
  delete(key: string): Promise<any>;
}
export interface CombatPlan {
  id: string;
  owner: string;
  revision: number;
  name: string;
  updatedAt: string;
  scenario: SimulationScenario;
  comparison?: SimulationScenario;
  document?: CombatDocument;
}
export const scenarioKey = (s: SimulationScenario) =>
  hash({ engine: COMBAT_ENGINE_VERSION, scenario: validateScenario(s) });
const idCheck = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid plan ID");
};
export class CombatPlans {
  private locks = new Map<string, Promise<unknown>>();
  constructor(private db: PlanDB) {}
  async create(
    owner: string,
    scenario: SimulationScenario,
    name = "Simulation",
    document?: CombatDocument,
  ): Promise<CombatPlan> {
    if (!/^\d{1,20}$/.test(owner)) throw new Error("Invalid owner");
    const plan: CombatPlan = {
      id: randomUUID(),
      owner,
      revision: 1,
      name: name.slice(0, 100),
      updatedAt: new Date().toISOString(),
      scenario: validateScenario(scenario),
      ...(document ? { document: structuredClone(document) } : {}),
    };
    await this.db.set(`combatPlans.${plan.id}`, plan);
    return plan;
  }
  async get(id: string, owner: string): Promise<CombatPlan> {
    idCheck(id);
    const value = await this.db.get(`combatPlans.${id}`);
    if (!value || value.owner !== owner)
      throw new Error("Plan unavailable for this user");
    return structuredClone(value);
  }
  async update(
    id: string,
    owner: string,
    revision: number,
    change: (plan: CombatPlan) => void,
  ): Promise<CombatPlan> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const plan = await this.get(id, owner);
        if (plan.revision !== revision)
          throw new Error("Plan changed; reopen the current panel");
        change(plan);
        plan.scenario = validateScenario(plan.scenario);
        if (plan.comparison)
          plan.comparison = validateScenario(plan.comparison);
        plan.revision++;
        plan.updatedAt = new Date().toISOString();
        await this.db.set(`combatPlans.${id}`, plan);
        return plan;
      });
    this.locks.set(id, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(id) === next) this.locks.delete(id);
    }
  }
  export(plan: CombatPlan): string {
    // Account IDs, owners and Discord message metadata never enter shared exports.
    return JSON.stringify(
      {
        schemaVersion: 1,
        name: plan.name,
        scenario: plan.scenario,
        comparison: plan.comparison,
      },
      null,
      2,
    );
  }
  parse(text: string): {
    name: string;
    scenario: SimulationScenario;
    comparison?: SimulationScenario;
  } {
    if (Buffer.byteLength(text) > 1_000_000)
      throw new Error("Plan import too large");
    const data = record(JSON.parse(text));
    if (data.schemaVersion !== 1) throw new Error("Unsupported plan version");
    return {
      name: String(data.name ?? "Simulation").slice(0, 100),
      scenario: validateScenario(data.scenario),
      ...(data.comparison
        ? { comparison: validateScenario(data.comparison) }
        : {}),
    };
  }
  async cache(result: SimulationResult) {
    await this.db.set(`combatResults.${result.fingerprint}`, {
      createdAt: Date.now(),
      result,
    });
  }
  async cached(scenario: SimulationScenario): Promise<SimulationResult | null> {
    const value = await this.db.get(`combatResults.${scenarioKey(scenario)}`);
    return value && Date.now() - value.createdAt < 24 * 60 * 60 * 1000
      ? value.result
      : null;
  }
}
