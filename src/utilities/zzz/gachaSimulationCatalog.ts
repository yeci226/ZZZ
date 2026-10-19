import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import type { GachaResultItem } from "./gachaAnimationCache.js";
import type {
  SimulationBanner,
  SimulationItem,
  SimulationPool,
} from "./gachaSimulationEngine.js";
import type { SimulationSession } from "./gachaSimulationStore.js";
import type { SimulationPreferences } from "./gachaSimulationRules.js";

export const ORIGINAL_S_CANDIDATES = {
  character: ["1021", "1041", "1101", "1141", "1181", "1211"],
  weapon: ["14102", "14104", "14110", "14114", "14118", "14121"],
};
export const EXTRA_S_CANDIDATES = {
  character: ["1071", "1221", "1241"],
  weapon: ["14107", "14122", "14124"],
};
export function supportsSignalSelection(banner: SimulationBanner) {
  const [major, minor] = banner.version.split(".").map(Number);
  return major > 3 || (major === 3 && minor >= 1);
}
export function signalSelectionCandidates(
  banner: SimulationBanner,
  catalog = getSimulationCatalog(),
) {
  const s = [
    ...ORIGINAL_S_CANDIDATES[banner.pool],
    ...(supportsSignalSelection(banner) ? EXTRA_S_CANDIDATES[banner.pool] : []),
  ].filter((id) => id !== banner.featuredS && catalog.items[id]?.rank === "S");
  const a = [
    ...new Set([
      ...(banner.pool === "character" ? banner.agentsA : banner.weaponsA),
      ...banner.featuredA,
    ]),
  ];
  return { s, a };
}
export function configuredSimulationBanner(
  banner: SimulationBanner,
  preferences: SimulationPreferences,
  catalog = getSimulationCatalog(),
): SimulationBanner {
  const copy = JSON.parse(JSON.stringify(banner)) as SimulationBanner;
  if (!supportsSignalSelection(copy)) return copy;
  const eligible = signalSelectionCandidates(copy, catalog),
    s = preferences.sCandidates[copy.pool],
    a = preferences.aUp[copy.id];
  if (s.length) {
    if (new Set(s).size !== 6 || s.some((id) => !eligible.s.includes(id)))
      throw new Error(
        "此卡池的 S 候選須重新選滿六位，且不可包含當期 UP。請開啟 /模擬調頻設定。",
      );
    copy.standardS = [...s];
  }
  if (a) {
    if (new Set(a).size !== 2 || a.some((id) => !eligible.a.includes(id)))
      throw new Error("此卡池的 A UP 須選擇兩個合資格項目。");
    copy.featuredA = [...a];
  }
  return copy;
}

export interface SimulationCatalog {
  schemaVersion: 1;
  updatedAt: string;
  banners: SimulationBanner[];
  items: Record<string, SimulationItem>;
  pools: {
    standardS: Record<SimulationPool, string[]>;
    agentsA: string[];
    weaponsA: string[];
    weaponsB: string[];
  };
  weaponOnly: boolean;
}
const bundledPath = path.resolve("src/assets/gacha-simulation/catalog.json");
const livePath = () =>
  process.env.ZZZ_GACHA_CATALOG ||
  path.resolve("data/zzz-gacha-simulation-catalog.json");
let cache:
  { until: number; value: SimulationCatalog; file: string } | undefined;
/** Calendar metadata can predate local artwork. Repair stale paths when loading it. */
function resolveMissingSimulationImages(catalog: SimulationCatalog) {
  for (const item of Object.values(catalog.items)) {
    if (
      item.kind !== "character" ||
      existsSync(item.image) ||
      !/^\d{3,8}$/.test(item.id)
    )
      continue;
    const portrait = [
      `src/assets/gacha-simulation/ui/characters/${item.id}.png`,
      `src/assets/images/zzz/paintings/role_vertical_painting_${item.id}.png`,
    ].find((file) => existsSync(file));
    if (portrait) {
      item.image = portrait;
      item.crop = [0.25, 0.08, 0.47, 0.6];
    }
  }
}
export function getSimulationCatalog(): SimulationCatalog {
  if (cache && cache.until > Date.now() && cache.file === livePath())
    return cache.value;
  const bundled = JSON.parse(
    readFileSync(bundledPath, "utf8"),
  ) as SimulationCatalog;
  let value = bundled;
  if (existsSync(livePath())) {
    try {
      const live = JSON.parse(
        readFileSync(livePath(), "utf8"),
      ) as SimulationCatalog;
      if (
        live.schemaVersion === 1 &&
        Array.isArray(live.banners) &&
        live.items &&
        live.pools
      ) {
        // A live calendar only knows recent banners. Keep bundled historical
        // snapshots (including their period-specific pools) when refreshing it.
        const banners = new Map(live.banners.map((b) => [b.id, b]));
        for (const banner of bundled.banners) banners.set(banner.id, banner);
        value = {
          ...live,
          banners: [...banners.values()],
          items: { ...live.items, ...bundled.items },
        };
      }
    } catch (error) {
      console.error(
        "[gacha-simulate] Invalid live catalog; using bundled snapshot",
        error,
      );
    }
  }
  resolveMissingSimulationImages(value);
  cache = { until: Date.now() + 30_000, value, file: livePath() };
  return value;
}
export const isLiveSimulationBanner = (
  banner: SimulationBanner,
  now = Date.now(),
) => Date.parse(banner.startAt) <= now && Date.parse(banner.endAt) > now;

export function selectSimulationBanner(
  catalog: SimulationCatalog,
  id?: string | null,
  now = Date.now(),
): SimulationBanner {
  if (id) {
    const found = catalog.banners.find(
      (b) => b.id === id && Date.parse(b.startAt) <= now,
    );
    if (!found) throw new Error("找不到這個卡池，請從自動完成清單選擇。");
    return found;
  }
  const live = catalog.banners
    .filter((b) => b.pool === "character" && isLiveSimulationBanner(b, now))
    .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
  if (!live.length)
    throw new Error("最新卡池資料尚未更新，請從卡池清單選擇已收錄的卡池。");
  return live[0];
}
export function simulationBannerChoices(
  query: string,
  catalog = getSimulationCatalog(),
  now = Date.now(),
) {
  const normalize = (value: string) =>
    value.normalize("NFKC").toLocaleLowerCase();
  const needles = normalize(query).trim().split(/\s+/).filter(Boolean);
  return catalog.banners
    .filter((b) => Date.parse(b.startAt) <= now)
    .sort(
      (a, b) =>
        Number(isLiveSimulationBanner(b, now)) -
          Number(isLiveSimulationBanner(a, now)) ||
        Date.parse(b.startAt) - Date.parse(a.startAt),
    )
    .filter((b) => {
      const searchable = normalize(
        [
          b.id,
          b.version,
          b.name,
          b.startAt.slice(0, 10),
          isLiveSimulationBanner(b, now) ? "進行中 最新" : "歷史 過往",
          b.pool === "character" ? "角色 代理人" : "音擎 武器",
          catalog.items[b.featuredS]?.name,
          ...b.featuredA.map((id) => catalog.items[id]?.name),
        ].join(" "),
      );
      return needles.every((needle) => searchable.includes(needle));
    })
    .map((b) => ({
      value: b.id,
      name: `${isLiveSimulationBanner(b, now) ? "進行中" : "歷史"}｜${b.version}｜${b.pool === "character" ? "角色" : "音擎"}｜${b.name}${b.name.includes(catalog.items[b.featuredS]?.name || "") ? "" : `（${catalog.items[b.featuredS]?.name || b.featuredS}）`}`.slice(
        0,
        100,
      ),
    }))
    .slice(0, 25);
}

export function simulationResultItems(
  session: SimulationSession,
  catalog = getSimulationCatalog(),
): GachaResultItem[] {
  return session.pulls.map((pull) => {
    const item = catalog.items[pull.id];
    if (!item || item.rank !== pull.rank)
      throw new Error(`缺少調頻物品素材：${pull.id}`);
    return { ...item, image: path.resolve(item.image), isNew: pull.isNew };
  });
}
export function assertSimulationAssets(
  banner: SimulationBanner,
  catalog = getSimulationCatalog(),
) {
  const groups: Array<[string[], "S" | "A" | "B", SimulationPool]> = [
    [[banner.featuredS, ...banner.standardS], "S", banner.pool],
    [banner.featuredA, "A", banner.pool],
    [banner.agentsA, "A", "character"],
    [banner.weaponsA, "A", "weapon"],
    [banner.weaponsB, "B", "weapon"],
  ];
  for (const [ids, rank, kind] of groups)
    for (const id of ids) {
      if (catalog.items[id]?.rank !== rank || catalog.items[id]?.kind !== kind)
        throw new Error(`卡池物品資料不符（${id}）。`);
    }
  const ids = new Set([
    banner.featuredS,
    ...banner.featuredA,
    ...banner.standardS,
    ...banner.agentsA,
    ...banner.weaponsA,
    ...banner.weaponsB,
  ]);
  for (const id of ids) {
    const item = catalog.items[id];
    if (!item || !existsSync(item.image))
      throw new Error(`這個卡池的結果素材尚未準備好（${id}）。`);
  }
}

interface CalendarBanner {
  name: string;
  version: string;
  channelCategory: string;
  startAt: string | null;
  endAt: string | null;
  upItems: Array<{
    id: string;
    name: string;
    rarity?: string;
    itemType?: string;
  }>;
}
/** Receives only public calendar metadata, never UID, cookies, or real pull records. */
export function cacheSimulationCalendar(banners: CalendarBanner[]) {
  const current = getSimulationCatalog();
  const next: SimulationCatalog = JSON.parse(JSON.stringify(current));
  for (const entry of banners) {
    // Re-screening/reverberation have other guarantees: do not silently map them to a regular channel.
    if (
      !["character_up", "weapon_up"].includes(entry.channelCategory) ||
      !entry.startAt ||
      !entry.endAt
    )
      continue;
    const pool: SimulationPool =
      entry.channelCategory === "character_up" ? "character" : "weapon";
    const safeItems = entry.upItems.filter((i) => /^\d{3,8}$/.test(i.id));
    const featuredA = [
      ...new Set(safeItems.filter((i) => i.rarity === "A").map((i) => i.id)),
    ];
    const featuredS = safeItems.filter((i) => i.rarity === "S");
    if (!featuredA.length) continue;
    for (const item of safeItems) {
      if (next.items[item.id] || !["A", "S"].includes(item.rarity || ""))
        continue;
      const portrait = `src/assets/gacha-simulation/ui/characters/${item.id}.png`;
      const image =
        pool === "character"
          ? existsSync(portrait)
            ? portrait
            : `src/assets/images/agents/${item.id}.webp`
          : `src/assets/images/icons/gacha/weapon-big/${item.id}.webp`;
      next.items[item.id] = {
        id: item.id,
        name: item.name,
        rank: item.rarity as "A" | "S",
        kind: pool,
        image,
        ...(pool === "character"
          ? {
              crop: existsSync(portrait)
                ? [0.25, 0.08, 0.47, 0.6]
                : ([0, 0, 1, 2 / 3] as [number, number, number, number]),
            }
          : {}),
      };
    }
    for (const item of featuredS) {
      const id = `${pool}-${item.id}-${entry.startAt.slice(0, 10)}`;
      const eligible = (ids: string[]) =>
        ids.filter(
          (id) =>
            !next.items[id]?.poolAvailableSince ||
            Date.parse(next.items[id].poolAvailableSince!) <=
              Date.parse(entry.startAt!),
        );
      const banner: SimulationBanner = {
        id,
        name:
          featuredS.length === 1 && entry.name
            ? entry.name
            : `${next.items[item.id]?.name || item.name} UP`,
        version: entry.version,
        pool,
        startAt: entry.startAt,
        endAt: entry.endAt,
        featuredS: item.id,
        featuredA,
        standardS: next.pools.standardS[pool],
        agentsA:
          pool === "weapon" && next.weaponOnly
            ? []
            : eligible(next.pools.agentsA),
        weaponsA: eligible(next.pools.weaponsA),
        weaponsB: eligible(next.pools.weaponsB),
      };
      // Prefer the Asia schedule if the same global update is observed from another server.
      const existing = next.banners.find((b) => b.id === id);
      if (existing && existing.endAt <= banner.endAt) continue;
      next.banners = next.banners.filter((b) => b.id !== id);
      next.banners.push(banner);
    }
  }
  resolveMissingSimulationImages(next);
  next.updatedAt = new Date().toISOString();
  const filename = livePath();
  mkdirSync(path.dirname(filename), { recursive: true });
  const temp = `${filename}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(next, null, 2) + "\n");
  renameSync(temp, filename);
  cache = { until: Date.now() + 30_000, value: next, file: filename };
}
