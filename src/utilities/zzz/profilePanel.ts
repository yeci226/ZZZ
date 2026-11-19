type Property = {
  property_id?: number | string;
  property_name?: string;
  base?: string | number;
  final?: string | number;
};

type PanelCharacter = {
  properties?: Property[];
  equip?: Array<{
    equip_suit?: { suit_id?: number | string };
    main_properties?: Property[];
  } | null>;
  weapon?: { properties?: Property[] } | null;
};

/** Correct an under-reported PEN ratio using unconditional equipped bonuses.
 * A final panel may already include set effects, so never add them to final.
 */
export function getProfilePanelProperties(
  character: PanelCharacter,
): Property[] {
  const discs = character.equip ?? [];
  const pufferPieces = discs.filter(
    (disc) => Number(disc?.equip_suit?.suit_id) === 31100,
  ).length;
  const gearProperties = [
    ...discs.flatMap((disc) => disc?.main_properties ?? []),
    ...(character.weapon?.properties ?? []),
  ];
  const minimumPenRatio = gearProperties.reduce(
    (sum, property) => {
      if (![9, 23103].includes(Number(property.property_id))) return sum;
      const value = Number(String(property.base ?? "").replace(/[%％]/g, ""));
      return sum + (Number.isFinite(value) && value > 0 ? value : 0);
    },
    pufferPieces >= 2 ? 8 : 0,
  );

  return (character.properties ?? []).map((property) => {
    if (Number(property.property_id) !== 9) return property;
    const value = Number(
      String(property.final ?? property.base ?? "").replace(/[%％]/g, ""),
    );
    return Number.isFinite(value) && value < minimumPenRatio
      ? { ...property, final: `${minimumPenRatio.toFixed(1)}%` }
      : property;
  });
}
