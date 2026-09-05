type DiscProperty = {
  valid?: boolean;
  add?: number | string;
  system_id?: number | string;
};

type Disc =
  | {
      properties?: DiscProperty[];
    }
  | null
  | undefined;

type PlanProperty = {
  name?: string;
  full_name?: string;
  system_id?: number | string;
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
    name.length > 0 &&
    getCharacterEffectivePropertyNames(character).has(name)
  );
}

export function getCharacterEffectiveSystemIds(
  character: CharacterWithPlan,
  discs: Disc[],
): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const property of getPlanProperties(character)) {
    const id = Number(property.system_id);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  return ids.size > 0 ? ids : collectEffectiveSystemIds(discs);
}

function systemId(property: DiscProperty): number | null {
  const value = Number(property.system_id);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function collectEffectiveSystemIds(discs: Disc[]): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const disc of discs) {
    for (const property of disc?.properties ?? []) {
      const id = systemId(property);
      if (property.valid && id !== null) ids.add(id);
    }
  }
  return ids;
}

export function isEffectiveProperty(
  property: DiscProperty,
  effectiveSystemIds: ReadonlySet<number>,
): boolean {
  const id = systemId(property);
  return id !== null && effectiveSystemIds.has(id);
}

export function countEffectiveRolls(
  disc: Disc,
  effectiveSystemIds: ReadonlySet<number>,
): number {
  return (disc?.properties ?? []).reduce(
    (total, property) =>
      total +
      (isEffectiveProperty(property, effectiveSystemIds)
        ? 1 + Number(property.add ?? 0)
        : 0),
    0,
  );
}

export function totalEffectiveRolls(discs: Disc[]): number {
  const effectiveSystemIds = collectEffectiveSystemIds(discs);
  return discs.reduce(
    (total, disc) => total + countEffectiveRolls(disc, effectiveSystemIds),
    0,
  );
}

export function formatDriveDiscEnhancement(value: unknown): string {
  const enhancement = Number(value ?? 0);
  return Number.isFinite(enhancement) && enhancement > 0
    ? `+${Math.trunc(enhancement)}`
    : "";
}
