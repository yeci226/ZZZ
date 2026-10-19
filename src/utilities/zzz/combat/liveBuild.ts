import { hash } from "./scoring.js";
import { importAwakening } from "./awakening.js";
import {
  finite,
  integer,
  normalizeDisc,
  record,
  type Element,
} from "./stats.js";
import type { Panel } from "./types.js";

export interface LiveBuild {
  id: string;
  name: string;
  level: number;
  cinema: number;
  awakening: number;
  /** Official out-of-combat display, before W-Engine talents and four-piece effects. */
  displayed: Panel;
  baseAttack: number;
  elementBonuses: Partial<Record<Element, number>>;
  skills: Record<string, number>;
  weapon: { id: string; name: string; refinement: number } | null;
  sets: { id: string; name: string; pieces: number }[];
  fingerprint: string;
}

const properties: Record<number, keyof Panel> = {
  1: "hp",
  2: "atk",
  3: "def",
  4: "impact",
  5: "critRate",
  6: "critDmg",
  7: "anomalyMastery",
  8: "anomalyProficiency",
  9: "penRatio",
  11: "energyRegen",
  232: "penFlat",
};
const elements: Record<number, Element> = {
  315: "physical",
  316: "fire",
  317: "ice",
  318: "electric",
  319: "ether",
};

/** A snapshot calculator cannot change gear or levels: it uses the imported build as-is. */
export function importLiveBuild(raw: unknown): LiveBuild {
  const c = record(Array.isArray(raw) ? raw[0] : raw);
  if (
    !Array.isArray(c.properties) ||
    !Array.isArray(c.skills) ||
    !Array.isArray(c.equip)
  )
    throw new Error("Missing live character properties, skills or equipment");
  const displayed = {
    damageBonus: 0,
    resIgnore: 0,
    defReduction: 0,
    vulnerability: 0,
    penFlat: 0,
  } as Panel;
  const elementBonuses: LiveBuild["elementBonuses"] = {};
  const seen = new Set<number>();
  const value = (v: unknown) => {
    if (typeof v !== "string" || !/^\d+(\.\d+)?%?$/.test(v))
      throw new Error("Invalid displayed property");
    return finite(v.replace("%", ""), "displayed property", 0, 1e7);
  };
  for (const item of c.properties) {
    const p = record(item),
      id = integer(p.property_id, "property ID", 1, 99999);
    if (seen.has(id)) throw new Error("Duplicate displayed property");
    seen.add(id);
    if (properties[id]) displayed[properties[id]] = value(p.final);
    else if (elements[id]) elementBonuses[elements[id]] = value(p.final);
    else throw new Error(`Unsupported displayed property: ${id}`);
  }
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 11])
    if (!seen.has(id)) throw new Error(`Missing displayed property: ${id}`);
  const sets = new Map<string, LiveBuild["sets"][number]>();
  const slots = new Set<number>();
  for (const [index, item] of c.equip.entries()) {
    const disc = normalizeDisc(item, index + 1);
    if (slots.has(disc.slot)) throw new Error("Duplicate equipment slot");
    slots.add(disc.slot);
    const id = String(integer(item.equip_suit?.suit_id, "disc set", 1, 999999));
    const entry = sets.get(id) ?? {
      id,
      name: String(item.equip_suit?.name ?? id),
      pieces: 0,
    };
    entry.pieces++;
    sets.set(id, entry);
  }
  const skills: Record<string, number> = {};
  for (const item of c.skills) {
    const key = String(integer(item.skill_type, "skill type", 0, 20));
    if (Object.hasOwn(skills, key)) throw new Error("Duplicate skill type");
    skills[key] = integer(item.level, "skill level", 1, 20);
  }
  const build = {
    id: String(integer(c.id, "agent ID", 1000, 99999)),
    name: String(c.name_mi18n ?? c.id).slice(0, 100),
    level: integer(c.level, "level", 1, 60),
    cinema: integer(c.rank, "cinema", 0, 6),
    awakening: importAwakening(c),
    displayed,
    elementBonuses,
    baseAttack: value(c.properties.find((p: any) => p.property_id === 2)?.base),
    skills,
    weapon: c.weapon
      ? {
          id: String(integer(c.weapon.id, "weapon ID", 1, 999999)),
          name: String(c.weapon.name).slice(0, 100),
          refinement: integer(c.weapon.star, "refinement", 1, 5),
        }
      : null,
    sets: [...sets.values()],
  };
  return { ...build, fingerprint: hash(build) };
}

export function importLiveTeam(raw: unknown): LiveBuild[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3)
    throw new Error("Select one to three characters");
  const team = raw.map(importLiveBuild);
  if (new Set(team.map((a) => a.id)).size !== team.length)
    throw new Error("Duplicate character");
  return team;
}
