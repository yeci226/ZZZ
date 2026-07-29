const ELEMENT_ICON_DIR = "./src/assets/images/icons/element";

export const ELEMENT_ICON_BY_TYPE: Record<number, string> = {
  200: "physic",
  201: "fire",
  202: "ice",
  203: "thunder",
  204: "wind",
  205: "ether",
  300: "lumen",
};

export const ELEMENT_ICON_FILE_BY_TYPE: Record<number, string> = {
  200: "physic.webp",
  201: "fire.webp",
  202: "ice.webp",
  203: "thunder.webp",
  204: "wind.png",
  205: "ether.webp",
  300: "lumen.png",
};

export const ELEMENT_TYPES = Object.keys(ELEMENT_ICON_BY_TYPE).map(Number);

export function getElementIconPath(elementType: number): string {
  const filename = ELEMENT_ICON_FILE_BY_TYPE[elementType];
  return filename
    ? `${ELEMENT_ICON_DIR}/${filename}`
    : `${ELEMENT_ICON_DIR}/physic.webp`;
}

/** Resolve official Wind/Lumen icon URLs from HoYoLAB Wiki's agent filters. */
export function findWikiElementIcons(filters: any[]): Record<string, string> {
  const values: any[] =
    filters.find((filter: any) => filter?.key === "agent_stats")?.values ?? [];
  const result: Record<string, string> = {};

  for (const value of values) {
    const enumString = String(value?.enum_string ?? "").trim().toLowerCase();
    const displayName = String(value?.value ?? "").trim();
    const icon = String(value?.icon ?? "").trim();
    if (!icon.startsWith("https://")) continue;

    if (enumString === "wind") result["wind.png"] = icon;
    if (enumString === "lumen" || /^(流明|Lumen)$/i.test(displayName)) {
      result["lumen.png"] = icon;
    }
  }

  return result;
}
