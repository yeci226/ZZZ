/**
 * 解析 HoYoLAB 養成計算機（character-builder）前端 gtUi bundle 內的屬性／特性圖示。
 * 計算機會比 Wiki 更早收錄新角色的圖示（例如前瞻角色的新子屬性）。
 * 任何一步對不上即捨棄該項，呼叫端保留既有檔案。
 */

export const CHARACTER_BUILDER_URL =
  "https://act.hoyolab.com/zzz/gt/character-builder-h/";
export const GT_UI_ASSET_ROOT = "https://act.hoyoverse.com/gt-ui/";

export type GtUiIconEntry = { name: string; url: string };
export type GtUiIcons = Record<
  "element" | "profession",
  Record<string, GtUiIconEntry>
>;

export function findGtUiBundlePath(indexHtml: string): string | null {
  return indexHtml.match(/static\/js\/gtUi\.[0-9a-f]+\.js/)?.[0] ?? null;
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 在每個 export 自己的作用域內（export 之後最近的定義）解析圖示路徑；所有作用域須一致。 */
function resolveIconUrl(bundle: string, iconName: string): string | null {
  const exportRe = new RegExp(
    `${iconName}:function\\(\\)\\{return ([\\w$]+)\\}`,
    "g",
  );
  const urls = new Set<string>();
  for (const match of bundle.matchAll(exportRe)) {
    const variable = match[1]!;
    const definitionRe = new RegExp(
      `[,;\\s]${escapeRegExp(variable)}=(?:"([^"]*)"|[^,;"]+)`,
      "g",
    );
    definitionRe.lastIndex = match.index! + match[0].length;
    const definition = definitionRe.exec(bundle);
    const assetPath = definition?.[1];
    if (!assetPath || !/^~\/assets\/icons\/[0-9a-f]+\.png$/.test(assetPath))
      return null;
    urls.add(GT_UI_ASSET_ROOT + assetPath.slice(2));
  }
  return urls.size === 1 ? [...urls][0]! : null;
}

function collect(
  bundle: string,
  pattern: RegExp,
  keyOf: (match: RegExpMatchArray) => string,
): Record<string, GtUiIconEntry> {
  const iconByKey = new Map<string, string | null>();
  for (const match of bundle.matchAll(pattern)) {
    const key = keyOf(match);
    const icon = match.groups!.icon!;
    const previous = iconByKey.get(key);
    iconByKey.set(key, previous === undefined || previous === icon ? icon : null);
  }

  const resolved: Array<[string, GtUiIconEntry]> = [];
  for (const [key, icon] of iconByKey) {
    if (!icon) continue;
    const url = resolveIconUrl(bundle, icon);
    if (!url) continue;
    const name = icon
      .replace(/^ZzzGame(Elemental|Specialties)/, "")
      .replace(/1$/, "")
      .toLowerCase();
    resolved.push([key, { name, url }]);
  }

  const urlCount = new Map<string, number>();
  for (const [, entry] of resolved)
    urlCount.set(entry.url, (urlCount.get(entry.url) ?? 0) + 1);
  return Object.fromEntries(
    resolved.filter(([, entry]) => urlCount.get(entry.url) === 1),
  );
}

export function parseGtUiIcons(bundle: string): GtUiIcons {
  return {
    element: collect(
      bundle,
      /(?:"".concat\((?<type>\d+),"_",(?<sub>\d+)\)|[(,](?<base>\d+)),"(?<icon>ZzzGameElemental[A-Za-z]+1)"/g,
      (m) =>
        m.groups!.base ?? `${m.groups!.type}_${m.groups!.sub}`,
    ),
    profession: collect(
      bundle,
      /[(,](?<id>\d+),"(?<icon>ZzzGameSpecialties[A-Za-z]+1)"/g,
      (m) => m.groups!.id!,
    ),
  };
}
