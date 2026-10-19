export interface CharacterSkin {
  skin_id?: number;
  skin_name?: string;
  skin_vertical_painting_url?: string;
  skin_square_url?: string;
  skin_vertical_painting_color?: string;
  is_original?: boolean;
}
export interface CharacterPortraitSource {
  role_vertical_painting_url?: string;
  role_square_url?: string;
  role_vertical_painting_color?: string;
  skin_list?: CharacterSkin[];
}

/** Use the API's displayed appearance. Owning a skin does not select it. */
export function resolveCharacterPortrait(character: CharacterPortraitSource): {
  source: string | null;
  skinName: string | null;
  color: string | null;
} {
  const skins = character.skin_list ?? [];
  const selected = skins.find((skin) =>
    character.role_vertical_painting_url
      ? skin.skin_vertical_painting_url === character.role_vertical_painting_url
      : Boolean(
          character.role_square_url &&
          skin.skin_square_url === character.role_square_url,
        ),
  );
  const original = skins.find((skin) => skin.is_original);
  const rawColor =
    selected?.skin_vertical_painting_color ??
    character.role_vertical_painting_color ??
    original?.skin_vertical_painting_color;
  const color = /^#[\da-f]{6}$/i.test(rawColor ?? "") ? rawColor! : null;
  if (character.role_vertical_painting_url)
    return {
      source: character.role_vertical_painting_url,
      skinName: selected?.is_original ? null : (selected?.skin_name ?? null),
      color,
    };
  if (selected?.skin_vertical_painting_url)
    return {
      source: selected.skin_vertical_painting_url,
      skinName: selected.is_original ? null : (selected.skin_name ?? null),
      color,
    };
  return {
    source:
      original?.skin_vertical_painting_url ?? character.role_square_url ?? null,
    skinName: null,
    color,
  };
}
