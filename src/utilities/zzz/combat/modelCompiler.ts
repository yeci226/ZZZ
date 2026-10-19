import {
  assertBuildIdentity,
  type ActorModel,
  type BuildSpec,
} from "./catalog.js";
import {
  compareImportedPanel,
  PANEL_STATS,
  reconstructPanel,
} from "./damage.js";
import { ELEMENTS, finite, type Element, type Stat } from "./stats.js";
import { validateBuild } from "./validation.js";
import type { BuildSnapshot, EnemyModel, Panel, CombatStat } from "./types.js";

interface ComponentIdentity {
  id: string;
  version: string;
  sources: string[];
  verified: boolean;
}
export interface PanelContribution {
  flat?: Partial<Panel>;
  percent?: Partial<Panel>;
  elementBonuses?: Partial<Record<Element, number>>;
}
export interface BattleCompileContext {
  basePanel: Panel;
  displayedPanel: Panel;
}
export interface WeaponModel extends ComponentIdentity {
  /** Displayed main/sub stats only. Talents belong to configureBattle. */
  compile(choice: NonNullable<BuildSpec["weapon"]>): {
    baseAttack: number;
    displayed: PanelContribution;
  };
  configureBattle?(
    actor: BuildSnapshot,
    spec: BuildSpec,
    context: BattleCompileContext,
  ): BuildSnapshot;
}
export interface SetModel extends ComponentIdentity {
  /** Displayed set bonuses only. Conditional four-piece effects belong to configureBattle. */
  compile(pieces: number, spec: BuildSpec): PanelContribution;
  configureBattle?(
    actor: BuildSnapshot,
    pieces: number,
    spec: BuildSpec,
    context: BattleCompileContext,
  ): BuildSnapshot;
}
export interface EnemyPreset extends ComponentIdentity {
  compile(): EnemyModel;
}
export interface ActorRecipe extends ComponentIdentity {
  kind: BuildSpec["kind"];
  /** A reviewed local recipe supplies level/promotion/cinema/awakening/skill scaling. */
  compile(spec: BuildSpec): Omit<
    BuildSnapshot,
    "panel" | "modelVersion" | "provenance"
  > & {
    basePanel: Panel;
  };
  configureTeam?: ActorModel["configureTeam"];
}

/** Registered code is local and reviewed; registration alone never grants release verification. */
export class CombatComponentRegistry {
  private weapons = new Map<string, WeaponModel>();
  private sets = new Map<string, SetModel>();
  private enemies = new Map<string, EnemyPreset>();
  constructor(
    readonly version: string,
    models: {
      weapons?: WeaponModel[];
      sets?: SetModel[];
      enemies?: EnemyPreset[];
    } = {},
  ) {
    const add = <T extends ComponentIdentity>(
      target: Map<string, T>,
      values: T[],
    ) => {
      for (const model of values) {
        if (
          !/^[a-zA-Z0-9_-]{1,40}$/.test(model.id) ||
          model.version !== version ||
          !model.sources.length ||
          target.has(model.id)
        )
          throw new Error("Invalid component registration");
        target.set(model.id, model);
      }
    };
    add(this.weapons, models.weapons ?? []);
    add(this.sets, models.sets ?? []);
    add(this.enemies, models.enemies ?? []);
  }
  supportedEquipment() {
    return {
      weapons: [...this.weapons.values()]
        .filter((m) => m.verified)
        .map((m) => m.id),
      sets: [...this.sets.values()].filter((m) => m.verified).map((m) => m.id),
    };
  }
  supportedEnemies() {
    return [...this.enemies.values()]
      .filter((m) => m.verified)
      .map((m) => m.id);
  }
  enemySources(id: string): string[] {
    const model = this.enemies.get(id);
    if (!model || !model.verified)
      throw new Error(`Enemy model not verified: ${id}`);
    return [...model.sources];
  }
  weapon(id: string) {
    const model = this.weapons.get(id);
    if (!model) throw new Error(`W-Engine model not registered: ${id}`);
    return model;
  }
  set(id: string) {
    const model = this.sets.get(id);
    if (!model) throw new Error(`Drive disc model not registered: ${id}`);
    return model;
  }
  enemy(id: string): EnemyModel {
    const model = this.enemies.get(id);
    if (!model || !model.verified)
      throw new Error(`Enemy model not verified: ${id}`);
    return structuredClone(model.compile());
  }
}

const discStats: Partial<
  Record<Stat, { stat: CombatStat; percent?: boolean }>
> = {
  HP: { stat: "hp" },
  ATK: { stat: "atk" },
  DEF: { stat: "def" },
  "HP%": { stat: "hp", percent: true },
  "ATK%": { stat: "atk", percent: true },
  "DEF%": { stat: "def", percent: true },
  CRIT_Rate: { stat: "critRate" },
  CRIT_DMG: { stat: "critDmg" },
  PEN: { stat: "penFlat" },
  Anomaly_Proficiency: { stat: "anomalyProficiency" },
  PEN_Ratio: { stat: "penRatio" },
  Impact: { stat: "impact", percent: true },
  Energy_Regen: { stat: "energyRegen", percent: true },
  Anomaly_Mastery: { stat: "anomalyMastery", percent: true },
};

/** Rebuild the displayed panel from original bases; never reapply gear to an API final panel. */
export function createActorModel(
  recipe: ActorRecipe,
  registry: CombatComponentRegistry,
): ActorModel {
  if (
    recipe.version !== registry.version ||
    !recipe.sources.length ||
    !recipe.verified
  )
    throw new Error("Recipe is unverified or has a version mismatch");
  return {
    id: recipe.id,
    version: recipe.version,
    sources: [...recipe.sources],
    configureTeam: recipe.configureTeam,
    compile(spec) {
      if (spec.id !== recipe.id || spec.kind !== recipe.kind)
        throw new Error("Recipe identity mismatch");
      const base = recipe.compile(structuredClone(spec));
      assertBuildIdentity(base, spec, "Recipe output");
      const panelBase = { ...base.basePanel },
        flat: Partial<Panel> = {},
        percent: Partial<Panel> = {},
        elements = { ...base.elementBonuses };
      const sources = new Set(recipe.sources),
        sets = new Map<string, number>();
      const add = (contribution: PanelContribution) => {
        for (const [target, values] of [
          [flat, contribution.flat],
          [percent, contribution.percent],
        ] as const) {
          for (const [key, value] of Object.entries(values ?? {})) {
            if (!PANEL_STATS.includes(key as CombatStat))
              throw new Error("Unknown contributed stat");
            target[key as CombatStat] =
              (target[key as CombatStat] ?? 0) +
              finite(value, key, -100_000, 1e7);
          }
        }
        for (const [element, value] of Object.entries(
          contribution.elementBonuses ?? {},
        )) {
          const key = element as Element;
          if (!ELEMENTS.includes(key))
            throw new Error("Unknown contributed element");
          elements[key] =
            (elements[key] ?? 0) + finite(value, element, -100, 100_000);
        }
      };
      const weapon = spec.weapon ? registry.weapon(spec.weapon.id) : undefined;
      if (weapon && spec.weapon) {
        if (!weapon.verified) throw new Error("W-Engine model not verified");
        const data = weapon.compile(structuredClone(spec.weapon));
        panelBase.atk += finite(
          data.baseAttack,
          "W-Engine base attack",
          0,
          1e7,
        );
        add(data.displayed);
        weapon.sources.forEach((url) => sources.add(url));
      }
      for (const { setId, disc } of spec.discs) {
        registry.set(setId); // Unknown sets never silently become plain stats.
        sets.set(setId, (sets.get(setId) ?? 0) + 1);
        for (const stat of [disc.main, ...disc.subs]) {
          if (stat.stat === "Element_DMG") {
            if (!stat.element) throw new Error("Missing elemental main stat");
            elements[stat.element] = (elements[stat.element] ?? 0) + stat.value;
          } else {
            const key = discStats[stat.stat];
            if (!key) throw new Error(`Unsupported disc stat ${stat.stat}`);
            const target = key.percent ? percent : flat;
            target[key.stat] = (target[key.stat] ?? 0) + stat.value;
          }
        }
      }
      for (const [id, count] of sets) {
        const model = registry.set(id);
        if (!model.verified) throw new Error("Drive disc model not verified");
        add(model.compile(count, structuredClone(spec)));
        model.sources.forEach((url) => sources.add(url));
      }
      const { basePanel: _base, ...rest } = base;
      const panel = reconstructPanel({
        base: panelBase,
        additions: flat,
        percentages: percent,
      });
      let snapshot: BuildSnapshot = {
        ...rest,
        panel,
        elementBonuses: elements,
        modelVersion: recipe.version,
        provenance: { verified: true, sources: [...sources], unsupported: [] },
      };
      // Each callback is reviewed local code and may author initial buffs, actions and triggers.
      if (weapon?.configureBattle)
        snapshot = weapon.configureBattle(
          structuredClone(snapshot),
          structuredClone(spec),
          { basePanel: { ...panelBase }, displayedPanel: { ...panel } },
        );
      for (const [id, count] of sets) {
        const model = registry.set(id);
        if (model.configureBattle)
          snapshot = model.configureBattle(
            structuredClone(snapshot),
            count,
            structuredClone(spec),
            { basePanel: { ...panelBase }, displayedPanel: { ...panel } },
          );
      }
      assertBuildIdentity(snapshot, spec, "Equipment");
      if (PANEL_STATS.some((key) => snapshot.panel[key] !== panel[key]))
        throw new Error(
          "Battle talents must not overwrite the displayed panel",
        );
      validateBuild(snapshot, recipe.version);
      return snapshot;
    },
  };
}

export function assertImportedPanel(
  snapshot: BuildSnapshot,
  displayed: Partial<Panel>,
): void {
  const mismatches = compareImportedPanel(snapshot.panel, displayed);
  if (mismatches.length)
    throw new Error(`Imported panel mismatch: ${mismatches.join(", ")}`);
}
