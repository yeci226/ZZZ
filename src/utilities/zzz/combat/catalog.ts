import {
  ELEMENTS,
  MAIN_MAX,
  MAIN_SLOTS,
  SUB_ROLL,
  finite,
  integer,
  normalizeDisc,
  record,
  type DiscStat,
  type DriveDisc,
} from "./stats.js";
import { validateBuild } from "./validation.js";
import type { BuildSnapshot, EnemyModel } from "./types.js";
import { importAwakening } from "./awakening.js";
import type { CombatComponentRegistry } from "./modelCompiler.js";

/** User-editable choices. Users cannot upload executable models or mark them verified. */
export interface BuildSpec {
  id: string;
  kind: "agent" | "bangboo";
  level: number;
  promotion: number;
  cinema: number;
  awakening?: number;
  skills: Record<string, number>;
  weapon: {
    id: string;
    level: number;
    promotion: number;
    refinement: number;
  } | null;
  discs: { setId: string; disc: DriveDisc }[];
}
export interface ActorModel {
  id: string;
  version: string;
  sources: string[];
  /** These adapters are reviewed local code. No remote JS or expression eval. */
  compile(spec: BuildSpec): BuildSnapshot;
  /** All adapters see the same unbuffed formation, so entry bonuses cannot compound by order. */
  configureTeam?(
    actor: BuildSnapshot,
    initialTeam: readonly BuildSnapshot[],
  ): BuildSnapshot;
}
/** Reviewed adapters must honor the requested actor and progression, including team passives. */
export function assertBuildIdentity(
  actual: Pick<BuildSnapshot, "id" | "kind" | "level" | "cinema">,
  expected: Pick<BuildSpec, "id" | "kind" | "level" | "cinema">,
  label: string,
): void {
  if (
    ["id", "kind", "level", "cinema"].some(
      (key) =>
        actual[key as keyof typeof actual] !==
        expected[key as keyof typeof expected],
    )
  )
    throw new Error(`${label} identity/progression mismatch`);
}
export class CombatCatalog {
  private models = new Map<string, ActorModel>();
  constructor(
    readonly version: string,
    models: ActorModel[] = [],
    private readonly components?: CombatComponentRegistry,
  ) {
    if (components && components.version !== version)
      throw new Error("Component catalog version mismatch");
    for (const model of models) {
      if (
        this.models.has(model.id) ||
        model.version !== version ||
        !model.sources.length
      )
        throw new Error("Invalid combat adapter");
      this.models.set(model.id, model);
    }
  }
  supported(): string[] {
    return [...this.models.keys()];
  }
  supportedEquipment(): { weapons: string[]; sets: string[] } {
    return this.components?.supportedEquipment() ?? { weapons: [], sets: [] };
  }
  supportedEnemies(): string[] {
    return this.components?.supportedEnemies() ?? [];
  }
  enemy(id: string): EnemyModel {
    if (!this.components) throw new Error("No registered enemy presets");
    return this.components.enemy(id);
  }
  enemySources(id: string): string[] {
    if (!this.components) throw new Error("No registered enemy presets");
    return this.components.enemySources(id);
  }
  compile(spec: BuildSpec): BuildSnapshot {
    spec = parseBuildSpec(spec);
    const model = this.models.get(spec.id);
    if (!model) throw new Error(`Combat model not yet verified: ${spec.id}`);
    const snapshot = model.compile(structuredClone(spec));
    assertBuildIdentity(snapshot, spec, "Combat adapter");
    validateBuild(snapshot, this.version);
    return structuredClone(snapshot);
  }
  compileFormation(
    specs: BuildSpec[],
    bangboo?: BuildSpec,
  ): { team: BuildSnapshot[]; bangboo?: BuildSnapshot } {
    if (
      !Array.isArray(specs) ||
      specs.length < 1 ||
      specs.length > 3 ||
      specs.some((s) => s.kind !== "agent") ||
      (bangboo && bangboo.kind !== "bangboo")
    )
      throw new Error("Invalid team");
    const initial = [...specs, ...(bangboo ? [bangboo] : [])].map((spec) =>
      this.compile(spec),
    );
    if (new Set(initial.map((a) => a.id)).size !== initial.length)
      throw new Error("Duplicate team members");
    const configured = initial.map((actor) => {
      const model = this.models.get(actor.id)!;
      const result =
        model.configureTeam?.(
          structuredClone(actor),
          structuredClone(initial),
        ) ?? actor;
      assertBuildIdentity(result, actor, "Team adapter");
      validateBuild(result, this.version);
      return structuredClone(result);
    });
    return {
      team: configured.slice(0, specs.length),
      ...(bangboo ? { bangboo: configured[specs.length] } : {}),
    };
  }
}
/** No real agent is marked supported until its full mechanics and timings are tested. */
export const combatCatalog = new CombatCatalog("unverified");
export const combatDefaults: { enemy?: EnemyModel; switchMs?: number } = {};

/** Strict, allowlisted build choices; discard imported account metadata and model code. */
export function parseBuildSpec(input: unknown): BuildSpec {
  const s = record(input);
  const id = (value: unknown): string => {
    if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(value))
      throw new Error("Invalid equipment ID");
    return value;
  };
  if (
    !["agent", "bangboo"].includes(s.kind) ||
    !Array.isArray(s.discs) ||
    s.discs.length > 6
  )
    throw new Error("Invalid build choices");
  const skills = Object.fromEntries(
    Object.entries(record(s.skills)).map(([key, value]) => {
      if (
        !/^[a-zA-Z0-9_-]{1,40}$/.test(key) ||
        ["__proto__", "constructor", "prototype"].includes(key)
      )
        throw new Error("Invalid skill ID");
      return [key, integer(value, "skill level", 0, 20)];
    }),
  );
  const stat = (input: unknown): DiscStat => {
    const p = record(input);
    if (
      !Object.hasOwn(MAIN_MAX, p.stat) ||
      (p.element !== undefined &&
        (p.stat !== "Element_DMG" || !ELEMENTS.includes(p.element)))
    )
      throw new Error("Unknown disc stat");
    return {
      stat: p.stat,
      value: finite(p.value, "disc stat", 0, 100_000),
      ...(p.element ? { element: p.element } : {}),
    };
  };
  const discs = s.discs.map((value) => {
    const item = record(value),
      d = record(item.disc),
      slot = integer(d.slot, "disc slot", 1, 6);
    if (
      !["S", "A", "B"].includes(d.rarity) ||
      !Array.isArray(d.subs) ||
      d.subs.length > 4
    )
      throw new Error("Invalid drive disc");
    const rarity = d.rarity as DriveDisc["rarity"];
    const main = stat(d.main),
      subs = d.subs.map(stat);
    const level = integer(
      d.level,
      "disc level",
      0,
      { S: 15, A: 12, B: 9 }[rarity],
    );
    if (
      !MAIN_SLOTS[slot].includes(main.stat) ||
      main.value <= 0 ||
      main.value > MAIN_MAX[main.stat] + 0.001 ||
      (main.stat === "Element_DMG" && !main.element) ||
      new Set(subs.map((p) => p.stat)).size !== subs.length ||
      subs.some((p) => !Object.hasOwn(SUB_ROLL, p.stat) || p.stat === main.stat)
    )
      throw new Error("Illegal disc properties");
    const scale = { S: 1, A: 2 / 3, B: 1 / 3 }[rarity];
    let rolls = 0;
    for (const p of subs) {
      const unit = SUB_ROLL[p.stat as keyof typeof SUB_ROLL] * scale,
        count = Math.round(p.value / unit),
        // Precision follows the displayed stat, not whether this rarity's roll is integral.
        tolerance = ["HP%", "ATK%", "DEF%", "CRIT_Rate", "CRIT_DMG"].includes(
          p.stat,
        )
          ? 0.11
          : 0.51;
      if (
        count < 1 ||
        count > 6 ||
        Math.abs(p.value - count * unit) > tolerance
      )
        throw new Error("Invalid substat rolls");
      rolls += count;
    }
    if (rolls > 4 + Math.floor(level / 3))
      throw new Error("Substat rolls exceed disc level");
    return { setId: id(item.setId), disc: { slot, rarity, level, main, subs } };
  });
  if (new Set(discs.map((d) => d.disc.slot)).size !== discs.length)
    throw new Error("Duplicate disc slots");
  const w = s.weapon === null ? null : record(s.weapon);
  if (s.kind === "bangboo" && (w || discs.length))
    throw new Error("Bangboo cannot equip weapons or discs");
  return {
    id: id(s.id),
    kind: s.kind,
    level: integer(s.level, "level", 1, 60),
    promotion: integer(s.promotion, "promotion", 0, 6),
    cinema: integer(s.cinema, "cinema", 0, 6),
    ...(s.awakening !== undefined
      ? { awakening: integer(s.awakening, "awakening", 0, 6) }
      : {}),
    skills,
    discs,
    weapon: w
      ? {
          id: id(w.id),
          level: integer(w.level, "weapon level", 1, 60),
          promotion: integer(w.promotion, "weapon promotion", 0, 6),
          refinement: integer(w.refinement, "refinement", 1, 5),
        }
      : null,
  };
}

export function importBuildSpec(
  raw: unknown,
  promotion?: { agent: number; weapon?: number },
): BuildSpec {
  const c = record(Array.isArray(raw) ? raw[0] : raw);
  const id = String(integer(c.id, "agent ID", 1000, 99999));
  const skills: Record<string, number> = {};
  if (!Array.isArray(c.skills) || !Array.isArray(c.equip))
    throw new Error("Incomplete character data");
  for (const skill of c.skills)
    skills[String(integer(skill.skill_type, "skill type", 0, 20))] = integer(
      skill.level,
      "skill level",
      0,
      20,
    );
  const discs = c.equip.map((d: any, i: number) => ({
    setId: String(integer(d.equip_suit?.suit_id, "disc set", 1, 999999)),
    disc: normalizeDisc(d, i + 1),
  }));
  if (
    discs.length > 6 ||
    new Set(discs.map((d) => d.disc.slot)).size !== discs.length
  )
    throw new Error("Invalid equipment slots");
  const w = c.weapon ? record(c.weapon) : null;
  // Promotion is required: never infer a cap/ascension from level alone.
  return {
    id,
    kind: "agent",
    level: integer(c.level, "level", 1, 60),
    promotion: integer(promotion?.agent ?? c.promote_level, "promotion", 0, 6),
    cinema: integer(c.rank, "cinema", 0, 6),
    awakening: importAwakening(c),
    skills,
    weapon: w
      ? {
          id: String(integer(w.id, "weapon ID", 1, 999999)),
          level: integer(w.level, "weapon level", 1, 60),
          promotion: integer(
            promotion?.weapon ?? w.promote_level,
            "weapon promotion",
            0,
            6,
          ),
          refinement: integer(w.star, "refinement", 1, 5),
        }
      : null,
    discs,
  };
}
