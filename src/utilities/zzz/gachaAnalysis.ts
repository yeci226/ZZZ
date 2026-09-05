import type {
  GachaArchiveRecord,
  GachaChannelCategory,
} from "./gachaArchive.js";

export type GachaRank = "S" | "A" | "B";
export type GachaGuaranteeResult = "won" | "lost" | "guaranteed" | "unknown" | null;

export interface AnalyzedGachaRecord extends GachaArchiveRecord {
  rank: GachaRank;
  pityPosition: number | null;
  pullsSincePreviousUp: number | null;
  isUp: boolean | null;
  guaranteeResult: GachaGuaranteeResult;
}

export interface GachaSummary {
  total: number;
  averageS: number | null;
  averageUp: number | null;
  winRate: number | null;
  currentPity: number | null;
  hardPity: number;
  nextGuaranteed: boolean | null;
  sRecords: AnalyzedGachaRecord[];
  records: AnalyzedGachaRecord[];
}

export const GACHA_CATEGORY_LABELS: Record<GachaChannelCategory, string> = {
  character_up: "獨家頻道",
  character_return: "獨家重映",
  weapon_up: "音擎頻道",
  weapon_return: "音擎迴響",
  standard: "常駐頻道",
  bangboo: "邦布頻道",
  unknown: "未分類",
};

export const GACHA_CATEGORY_ORDER: GachaChannelCategory[] = [
  "character_up", "character_return", "weapon_up", "weapon_return", "standard", "bangboo",
];

export function hardPityFor(category: GachaChannelCategory): number {
  return category === "weapon_up" || category === "weapon_return" || category === "bangboo" ? 80 : 90;
}

export function normalizeRank(value: unknown): GachaRank {
  const rank = String(value ?? "").toUpperCase();
  if (rank === "S" || rank === "4" || rank === "5") return "S";
  if (rank === "A" || rank === "3") return "A";
  return "B";
}

function limitedCategory(category: GachaChannelCategory): boolean {
  return ["character_up", "character_return", "weapon_up", "weapon_return"].includes(category);
}

function itemIsUp(record: GachaArchiveRecord, category: GachaChannelCategory): boolean | null {
  if (normalizeRank(record.rarity) !== "S") return null;
  // The selected S-rank Bangboo is guaranteed. This is a permanent channel
  // rule, so it must win over missing or stale archived UP snapshots.
  if (category === "bangboo") return true;
  if (!limitedCategory(category)) return null;
  if (record.isUp === true || record.isUp === false) return record.isUp;
  // A missing historical period must never be reinterpreted from today's
  // standard catalogue or presented as featured. Keep it neutral until a
  // reliable period can enrich the archived snapshot.
  return null;
}

function isBangbooItem(record: GachaArchiveRecord): boolean {
  const itemType = String(record.itemType ?? "").toLowerCase();
  const itemId = Number(record.itemId);
  return itemType.includes("bangboo") || itemType.includes("邦布")
    || (Number.isFinite(itemId) && itemId >= 50_000);
}

/** Return the newest S-rank Bangboo across the complete channel timeline. */
export function latestBangbooSRecord(records: GachaArchiveRecord[]): GachaArchiveRecord | null {
  return [...records]
    .filter((record) => record.channelCategory === "bangboo"
      && normalizeRank(record.rarity) === "S"
      && isBangbooItem(record))
    .sort((left, right) => {
      const leftTime = Date.parse(left.pulledAt);
      const rightTime = Date.parse(right.pulledAt);
      const time = (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
      return time || right.recordId.localeCompare(left.recordId, "en", { numeric: true });
    })[0] ?? null;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function matchesBanner(record: GachaArchiveRecord, bannerId: string | null | undefined): boolean {
  if (bannerId === undefined) return true;
  if (bannerId === null) return !record.bannerId;
  return record.bannerId === bannerId;
}

function distancesBetween(
  records: AnalyzedGachaRecord[],
  predicate: (record: AnalyzedGachaRecord) => boolean,
): number[] {
  const distances: number[] = [];
  let previousIndex: number | null = null;
  records.forEach((record, index) => {
    if (!predicate(record)) return;
    if (previousIndex !== null) distances.push(index - previousIndex);
    previousIndex = index;
  });
  return distances;
}

export function analyzeGachaRecords(input: {
  records: GachaArchiveRecord[];
  category: GachaChannelCategory;
  bannerId?: string | null;
  livePity?: number | null;
  liveGuaranteed?: boolean | null;
}): GachaSummary {
  const chronological = [...input.records].sort((left, right) => {
    const time = Date.parse(left.pulledAt) - Date.parse(right.pulledAt);
    return time || left.recordId.localeCompare(right.recordId, "en", { numeric: true });
  });
  let pity = 0;
  let pityKnown = false;
  let nextGuaranteed: boolean | null = null;
  let previousUpIndex: number | null = null;
  const analyzed: AnalyzedGachaRecord[] = [];

  chronological.forEach((record, index) => {
    pity++;
    const rank = normalizeRank(record.rarity);
    const isUp = itemIsUp(record, input.category);
    let pityPosition: number | null = pityKnown ? pity : null;
    let guaranteeResult: GachaGuaranteeResult = null;
    let pullsSincePreviousUp: number | null = null;

    if (rank === "S") {
      if (limitedCategory(input.category)) {
        if (isUp === false) {
          guaranteeResult = "lost";
          nextGuaranteed = true;
        } else if (isUp === true) {
          guaranteeResult = nextGuaranteed === true ? "guaranteed" : nextGuaranteed === false ? "won" : "unknown";
          if (previousUpIndex !== null) pullsSincePreviousUp = index - previousUpIndex;
          previousUpIndex = index;
          nextGuaranteed = false;
        } else {
          guaranteeResult = "unknown";
          nextGuaranteed = null;
        }
      }
      pity = 0;
      pityKnown = true;
    }

    analyzed.push({
      ...record, rank, pityPosition, pullsSincePreviousUp, isUp, guaranteeResult,
    });
  });

  const selected = analyzed.filter((record) => matchesBanner(record, input.bannerId));
  const selectedS = selected.filter((record) => record.rank === "S");
  // Pity carries across banner changes, so every S-rank with a known
  // channel-level boundary is a valid sample for the selected period. A null
  // position (rendered as "?") is deliberately excluded from both averages.
  const completedS = selectedS
    .map((record) => record.pityPosition)
    .filter((value): value is number => value !== null);
  const completedUp = selectedS
    .filter((record) => record.isUp === true)
    .map((record) => record.pityPosition)
    .filter((value): value is number => value !== null);
  const eligible = selectedS.filter((record) => record.isUp === true || record.isUp === false);
  const wins = eligible.filter((record) => record.isUp === true).length;

  return {
    total: selected.length,
    averageS: mean(completedS),
    averageUp: limitedCategory(input.category) ? mean(completedUp) : null,
    winRate: limitedCategory(input.category) && eligible.length ? Math.round((wins / eligible.length) * 1000) / 10 : null,
    currentPity: input.livePity !== undefined && input.livePity !== null ? input.livePity : pityKnown ? pity : null,
    hardPity: hardPityFor(input.category),
    nextGuaranteed: input.liveGuaranteed !== undefined && input.liveGuaranteed !== null ? input.liveGuaranteed : nextGuaranteed,
    sRecords: selectedS.slice().reverse(),
    records: selected.slice().reverse(),
  };
}

export function readLiveGachaState(details: any, category: GachaChannelCategory): {
  pity: number | null;
  guaranteed: boolean | null;
} {
  const info = (Array.isArray(details?.gacha_info_list) ? details.gacha_info_list : [])
    .find((item: any) => {
      const raw = String(item?.gacha_type ?? "").toUpperCase();
      if (category === "character_return") return raw.includes("CHARACTER_RETURN") || raw.includes("AVATAR_RETURN") || raw === "21";
      if (category === "weapon_return") return raw.includes("WEAPON_RETURN") || raw.includes("W_ENGINE_RETURN") || raw === "22";
      if (category === "character_up") return ((raw.includes("CHARACTER") || raw.includes("AVATAR")) && !raw.includes("RETURN")) || ["2", "11"].includes(raw);
      if (category === "weapon_up") return ((raw.includes("WEAPON") || raw.includes("W_ENGINE")) && !raw.includes("RETURN")) || ["3", "12"].includes(raw);
      if (category === "standard") return raw.includes("STANDARD") || raw.includes("PERMANENT") || raw === "1";
      if (category === "bangboo") return raw.includes("BANGBOO") || raw === "5";
      return false;
    });
  if (!info) return { pity: null, guaranteed: null };
  const hard = hardPityFor(category);
  const direct = [info.current_s_count, info.current_count, info.cur_count, info.pity_count]
    .map(Number).find(Number.isFinite);
  const remaining = Number(info.more_s_need_cnt);
  const pity = direct !== undefined ? direct : Number.isFinite(remaining) ? Math.max(0, hard - remaining) : null;
  const guaranteeValue = info.is_up_guaranteed ?? info.is_guaranteed ?? info.guaranteed;
  const guaranteed = typeof guaranteeValue === "boolean"
    ? guaranteeValue
    : guaranteeValue === 1 || guaranteeValue === "1" || String(guaranteeValue).toUpperCase().includes("GUARANTEED")
      ? true
      : guaranteeValue === 0 || guaranteeValue === "0"
        ? false
        : null;
  return { pity, guaranteed };
}

export const __gachaAnalysisInternals = { itemIsUp, isBangbooItem, matchesBanner, mean, distancesBetween };
