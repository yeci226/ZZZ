import { discEnhancementCount } from "./profileDiscEnhancement.js";
import { normalizeDiscStat, SUB_ROLL, type SubStat } from "./combat/stats.js";

type DiscProperty = {
  valid?: boolean;
  add?: number | string;
  system_id?: number | string;
  property_id?: number | string;
  id?: number | string;
  base?: number | string;
  value?: number | string;
};

type Disc =
  | {
      properties?: DiscProperty[];
      rarity?: string;
    }
  | null
  | undefined;

type PlanProperty = {
  name?: string;
  full_name?: string;
  system_id?: number | string;
  id?: number | string;
  property_id?: number | string;
};

type CharacterWithPlan = {
  equip_plan_info?: {
    plan_effective_property_list?: PlanProperty[];
    game_default?: {
      property_list?: PlanProperty[];
    };
  };
};

function getPlanProperties(character: CharacterWithPlan): PlanProperty[] {
  const info = character?.equip_plan_info;
  const planned = info?.plan_effective_property_list;
  if (Array.isArray(planned) && planned.length > 0) return planned;
  const defaults = info?.game_default?.property_list;
  return Array.isArray(defaults) ? defaults : [];
}

function normalizePropertyName(value: unknown): string {
  return String(value ?? "")
    .replace(/百分比/g, "")
    .replace(/[%％]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function getCharacterEffectivePropertyNames(
  character: CharacterWithPlan,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const property of getPlanProperties(character)) {
    for (const name of [property.name, property.full_name]) {
      const normalized = normalizePropertyName(name);
      if (normalized) names.add(normalized);
    }
  }
  return names;
}

export function isCharacterEffectiveProperty(
  character: CharacterWithPlan,
  property: { property_name?: string },
): boolean {
  const name = normalizePropertyName(property.property_name);
  return (
    name.length > 0 && getCharacterEffectivePropertyNames(character).has(name)
  );
}

export function getCharacterEffectivePropertyIds(
  character: CharacterWithPlan,
  discs: Disc[],
): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const property of getPlanProperties(character)) {
    const id = propertyId(property);
    if (id !== null) ids.add(id);
  }
  return ids.size > 0 ? ids : collectEffectivePropertyIds(discs);
}

// Short panel IDs and full equipment IDs both occur in HoYoLAB responses.
// A system ID alone cannot distinguish flat ATK/HP/DEF from their percentages.
function propertyId(property: DiscProperty): number | null {
  const id = Number(property.property_id ?? property.id);
  if (Number.isInteger(id) && id >= 10000) return id;
  const system = Number(property.system_id);
  const family =
    ({ 1: 111, 2: 121, 3: 131 } as Record<number, number>)[id] ?? system;
  const raw = property.base ?? property.value;
  if ([111, 121, 131].includes(family) && raw !== undefined) {
    return family * 100 + (/[%％]/.test(String(raw)) ? 2 : 3);
  }
  const exact = (
    { 5: 20103, 6: 21103, 8: 31203, 9: 23103, 232: 23203 } as Record<
      number,
      number
    >
  )[id];
  if (exact) return exact;
  if ([201, 211, 312, 232].includes(system)) return system * 100 + 3;
  return Number.isInteger(system) && system > 0 ? system : null;
}

export function collectEffectivePropertyIds(
  discs: Disc[],
): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const disc of discs) {
    for (const property of disc?.properties ?? []) {
      const id = propertyId(property);
      if (property.valid && id !== null) ids.add(id);
    }
  }
  return ids;
}

export function isEffectiveProperty(
  property: DiscProperty,
  effectivePropertyIds: ReadonlySet<number>,
): boolean {
  const id = propertyId(property);
  if (id !== null && id >= 10000 && effectivePropertyIds.has(id)) return true;
  // Legacy plans may only contain system IDs; preserve explicit per-stat flags.
  const family =
    Number(property.system_id) || (id !== null ? Math.floor(id / 100) : 0);
  return effectivePropertyIds.has(family) && property.valid !== false;
}

export function countEffectiveRolls(
  disc: Disc,
  effectivePropertyIds: ReadonlySet<number>,
): number {
  return (disc?.properties ?? []).reduce(
    (total, property) =>
      total +
      (isEffectiveProperty(property, effectivePropertyIds)
        ? propertyRolls(property, disc?.rarity)
        : 0),
    0,
  );
}

function propertyRolls(property: DiscProperty, rarity?: string): number {
  if (property.add !== undefined) return 1 + discEnhancementCount(property.add);
  // Some endpoints omit enhancement metadata; the displayed value still records
  // every roll. Account for A/B discs and their rounded flat-stat values.
  try {
    const stat = normalizeDiscStat(property);
    const scale = ({ S: 1, A: 2 / 3, B: 1 / 3 } as Record<string, number>)[
      rarity ?? ""
    ];
    const unit = SUB_ROLL[stat.stat as SubStat] * scale;
    const count = Math.round(stat.value / unit);
    if (count >= 1 && count <= 6 && Math.abs(stat.value - count * unit) <= 0.51)
      return count;
  } catch {
    // Older records without values still describe the initial substat.
  }
  return 1;
}

export function totalEffectiveRolls(discs: Disc[]): number {
  const effectivePropertyIds = collectEffectivePropertyIds(discs);
  return discs.reduce(
    (total, disc) => total + countEffectiveRolls(disc, effectivePropertyIds),
    0,
  );
}

export function formatDriveDiscEnhancement(value: unknown): string {
  const enhancement = Number(value ?? 0);
  return Number.isFinite(enhancement) && enhancement > 0
    ? `+${Math.trunc(enhancement)}`
    : "";
}
