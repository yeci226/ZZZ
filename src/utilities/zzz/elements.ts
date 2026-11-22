import fs from "fs";

const ELEMENT_ICON_DIR = "./src/assets/images/icons/element";
const PROFESSION_ICON_DIR = "./src/assets/images/icons/profession";
const GENERATED_ICON_CODES_FILE = "./src/assets/icon-codes.generated.json";

export const ELEMENT_ICON_BY_TYPE: Record<number, string> = {
  200: "physic",
  201: "fire",
  202: "ice",
  203: "thunder",
  204: "wind",
  205: "ether",
  300: "lumen",
};

/** `${element_type}_${sub_element_type}` → 特殊屬性本地檔名（與官方計算機相同的鍵） */
export const SPECIAL_ELEMENT_BY_SUB_TYPE: Record<string, string> = {
  "202_1": "frost",
  "205_2": "auricink",
  "200_4": "honededge",
  "201_5": "flare",
};

/** 資料缺少 sub_element_type 時的備援 */
export const SPECIAL_ELEMENT_BY_CHARACTER_ID: Record<string, string> = {
  "1091": "frost",
  "1371": "auricink",
  "1431": "honededge",
};

/** avatar_profession → 本地檔名（不含副檔名） */
export const PROFESSION_ICON_BY_ID: Record<number, string> = {
  1: "attack",
  2: "stun",
  3: "anomaly",
  4: "support",
  5: "defense",
  6: "rupture",
  7: "armero",
};

/** 外部來源（Wiki、計算機）的圖示名稱與本地檔名不同者；未列出者沿用原名。 */
export const ICON_NAME_ALIAS: Record<string, string> = {
  physical: "physic",
  electric: "thunder",
  honed_edge: "honededge",
  light: "lumen",
  breakthrough: "stun",
  defensive: "defense",
  fengyu: "armero",
};

export const canonicalIconName = (name: string) => {
  const lower = name.toLowerCase();
  return ICON_NAME_ALIAS[lower] ?? lower;
};

type IconCodeKind = "element" | "profession";
type IconCodes = Record<IconCodeKind, Record<string, string>>;
let generatedIconCodes: IconCodes | undefined;

function hardcodedIconName(kind: IconCodeKind, code: string) {
  return kind === "element"
    ? (SPECIAL_ELEMENT_BY_SUB_TYPE[code] ?? ELEMENT_ICON_BY_TYPE[Number(code)])
    : PROFESSION_ICON_BY_ID[Number(code)];
}

/** 自動下載時新發現的代碼（寫死的對照永遠優先）。 */
function generatedCodes(): IconCodes {
  if (!generatedIconCodes) {
    try {
      const raw = JSON.parse(fs.readFileSync(GENERATED_ICON_CODES_FILE, "utf8"));
      generatedIconCodes = {
        element: raw?.element ?? {},
        profession: raw?.profession ?? {},
      };
    } catch {
      generatedIconCodes = { element: {}, profession: {} };
    }
  }
  return generatedIconCodes;
}

/** 記錄新代碼對應的檔名；只新增寫死對照沒有的代碼。回傳新增筆數。 */
export function registerIconCodes(
  kind: IconCodeKind,
  codes: Record<string, string>,
  file: string = GENERATED_ICON_CODES_FILE,
): number {
  const current = generatedCodes();
  let added = 0;
  for (const [code, name] of Object.entries(codes)) {
    if (hardcodedIconName(kind, code) || current[kind][code] === name) continue;
    current[kind][code] = name;
    added++;
  }
  if (added) fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
  return added;
}

/** 測試用：清除記憶體中的代碼快取 */
export function resetGeneratedIconCodes() {
  generatedIconCodes = undefined;
}

function iconNameForCode(kind: IconCodeKind, code: string) {
  return hardcodedIconName(kind, code) ?? generatedCodes()[kind][code];
}

/** 屬性圖示名稱：子屬性優先，其次角色 ID 備援，最後為基本屬性。 */
export function getElementIconName(
  elementType: number,
  subElementType?: number | null,
  characterId?: string | number,
): string | undefined {
  const sub = Number(subElementType);
  if (sub > 0) {
    const special = iconNameForCode("element", `${elementType}_${sub}`);
    if (special) return special;
  }
  if (characterId !== undefined) {
    const special = SPECIAL_ELEMENT_BY_CHARACTER_ID[String(characterId)];
    if (special) return special;
  }
  return ELEMENT_ICON_BY_TYPE[elementType];
}

export function getElementEmojiKey(
  elementType: number,
  characterId?: string | number,
  subElementType?: number | null,
): string | undefined {
  return getElementIconName(elementType, subElementType, characterId);
}

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

function findIconFile(dir: string, name: string, extensions: string[]) {
  for (const ext of extensions) {
    const candidate = `${dir}/${name}.${ext}`;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** 所有已知的屬性圖示名稱（基本、特殊、自動記錄的新代碼）。 */
export function knownElementIconNames(): string[] {
  return [
    ...new Set([
      ...Object.values(ELEMENT_ICON_BY_TYPE),
      ...Object.values(SPECIAL_ELEMENT_BY_SUB_TYPE),
      ...Object.values(SPECIAL_ELEMENT_BY_CHARACTER_ID),
      ...Object.values(generatedCodes().element),
    ]),
  ];
}

/** 依圖示名稱找本地檔案（webp 優先）。 */
export function getElementIconFileByName(name: string): string | null {
  return findIconFile(ELEMENT_ICON_DIR, name, ["webp", "png"]);
}

export function getElementIconPath(
  elementType: number,
  subElementType?: number | null,
  characterId?: string | number,
): string {
  const name = getElementIconName(elementType, subElementType, characterId);
  if (name && name !== ELEMENT_ICON_BY_TYPE[elementType]) {
    const special = findIconFile(ELEMENT_ICON_DIR, name, ["webp", "png"]);
    if (special) return special;
  }
  const filename = ELEMENT_ICON_FILE_BY_TYPE[elementType];
  return filename
    ? `${ELEMENT_ICON_DIR}/${filename}`
    : `${ELEMENT_ICON_DIR}/physic.webp`;
}

/** 回傳第一個實際存在的職業圖示路徑；找不到則為 null。 */
export function getProfessionIconPath(
  profession: unknown,
  extensions: string[] = ["webp", "png"],
  dir: string = PROFESSION_ICON_DIR,
): string | null {
  const name = iconNameForCode("profession", String(Number(profession)));
  return name ? findIconFile(dir, name, extensions) : null;
}

const WIKI_ICON_FILTERS = {
  agent_stats: "element",
  agent_specialties: "profession",
} as const;

/** 從 HoYoWiki get_menu_filters 取出所有屬性與特性圖示：{ element: { 檔名: url }, profession: {...} } */
export function findWikiIcons(
  filters: any[],
): Record<"element" | "profession", Record<string, string>> {
  const result = { element: {}, profession: {} } as Record<
    "element" | "profession",
    Record<string, string>
  >;
  for (const filter of filters ?? []) {
    const kind =
      WIKI_ICON_FILTERS[filter?.key as keyof typeof WIKI_ICON_FILTERS];
    if (!kind) continue;
    for (const value of filter.values ?? []) {
      let code = String(value?.enum_string ?? "").trim().toLowerCase();
      if (!code && /^(流明|Lumen)$/i.test(String(value?.value ?? "").trim()))
        code = "light";
      const icon = String(value?.icon ?? "").trim();
      if (!/^[a-z0-9_]+$/.test(code) || !icon.startsWith("https://")) continue;
      result[kind][canonicalIconName(code)] = icon;
    }
  }
  return result;
}
