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
  if (property.valid) return true;
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
