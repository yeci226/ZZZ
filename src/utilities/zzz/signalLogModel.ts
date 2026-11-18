import type { GachaArchiveBanner } from "./gachaArchive.js";
import { GACHA_CATEGORY_ORDER, hardPityFor, type AnalyzedGachaRecord, type GachaSummary } from "./gachaAnalysis.js";
import type { GachaStatCategory, GachaStatIndex, GachaStatPool, GachaStatRecord, GachaStatType } from "./gachaStatApi.js";
import { gtCardKind } from "./signalLogPaper.js";

export type SignalItemKind = "character" | "weapon" | "bangboo" | "unknown";
export interface SignalSEntry { itemId: string; kind: SignalItemKind; pity: number | null; isUp: boolean | null; pulledAt: string | null }
export interface SignalSegment { key: string; version: string; upNames: string[]; startAt: string | null; endAt: string | null; ongoing: boolean; pulls: number | null; entries: SignalSEntry[] }
export interface SignalChannelModel {
  category: GachaStatCategory; limited: boolean; hasRecords: boolean;
  total: number; sCount: number; upCount: number | null; averageS: number | null; averageUpCost: number | null;
  currentPity: number | null; hardPity: number; toHardPity: number | null; guaranteed: boolean | null; pityEstimated: boolean;
  entries: SignalSEntry[]; // newest first
  segments: SignalSegment[]; // newest first
  firstRecordAt: string | null;
}
export interface SignalTickets { monochrome: number | null; polychrome: number; encrypted: number; original: number; boopon: number; pullsAvailable: number }
export interface SignalLogModel { channels: Record<GachaStatCategory, SignalChannelModel>; tickets: SignalTickets | null }

export const UNCLASSIFIED_SEGMENT_KEY = "__unclassified__";

export const TICKET_MATCHERS = [
  (type: string) => type.endsWith("POLYCHROME"),
  (type: string) => type.endsWith("ENCRYPTED_MASTER_TAPE"),
  (type: string) => type.endsWith("MASTER_TAPE") && !type.includes("ENCRYPTED"),
  (type: string) => type.endsWith("BOOPON"),
];

export function ticketEntry(details: any, matcher: (type: string) => boolean): any | undefined {
  const tickets = Array.isArray(details?.tickets) ? details.tickets : [];
  return tickets.find((item: any) => matcher(String(item?.ticket_type ?? "").toUpperCase()));
}

export function ticketValue(details: any, matcher: (type: string) => boolean): number {
  return Number(ticketEntry(details, matcher)?.ticket_cnt ?? 0);
}

const LIMITED: GachaStatCategory[] = ["character_up", "character_return", "weapon_up", "weapon_return"];
const round1 = (value: number): number => Math.round(value * 10) / 10;
const pullsFor = (polychrome: number, encrypted: number): number => Math.floor(polychrome / 160) + encrypted;
const iso = (seconds: number): string | null => (seconds > 0 ? new Date(seconds * 1000).toISOString() : null);

export function isLimitedCategory(category: GachaStatCategory): boolean {
  return LIMITED.includes(category);
}

export function emptyChannel(category: GachaStatCategory): SignalChannelModel {
  return {
    category, limited: isLimitedCategory(category), hasRecords: false,
    total: 0, sCount: 0, upCount: null, averageS: null, averageUpCost: null,
    currentPity: null, hardPity: hardPityFor(category), toHardPity: null, guaranteed: null, pityEstimated: false,
    entries: [], segments: [], firstRecordAt: null,
  };
}

function kindOf(itemType: string, itemId: string): SignalItemKind {
  const type = itemType.toUpperCase();
  if (type.includes("AVATAR")) return "character";
  if (type.includes("WEAPON")) return "weapon";
  if (type.includes("BANGBOO") || type.includes("BUDDY")) return "bangboo";
  return gtCardKind("", itemId);
}

function earliest(values: Array<string | null>): string | null {
  let best: string | null = null;
  for (const value of values) if (value && (best === null || Date.parse(value) < Date.parse(best))) best = value;
  return best;
}

function officialEntry(record: GachaStatRecord, limited: boolean): SignalSEntry {
  return { itemId: record.itemId, kind: kindOf(record.itemType, record.itemId), pity: record.count, isUp: limited ? record.isUp : null, pulledAt: iso(record.recordTime) };
}

const bySortDesc = (left: GachaStatRecord, right: GachaStatRecord) => right.sort - left.sort;

function upNamesOf(pools: GachaStatPool[]): string[] {
  const items = pools.flatMap((pool) => pool.upItems);
  const rare = items.filter((item) => item.rarity === "S");
  return (rare.length ? rare : items).map((item) => item.name);
}

function officialSegments(type: GachaStatType, pools: GachaStatPool[], limited: boolean): SignalSegment[] {
  const toEntries = (list: GachaStatPool[]) => list.flatMap((pool) => pool.records).sort(bySortDesc).map((record) => officialEntry(record, limited));
  return type.versions.flatMap((version): SignalSegment[] => {
    const versionPools = pools.filter((pool) => pool.version === version);
    if (versionPools.some((pool) => pool.startTs > 0)) {
      return [...versionPools].sort((left, right) => right.startTs - left.startTs).map((pool) => ({
        key: `${version}:${pool.startTs}`, version, upNames: upNamesOf([pool]), startAt: iso(pool.startTs), endAt: iso(pool.endTs),
        ongoing: pool.state === "in_progress", pulls: null, entries: toEntries([pool]),
      }));
    }
    return [{
      key: `${version}:0`, version, upNames: upNamesOf(versionPools), startAt: null, endAt: null,
      ongoing: versionPools.some((pool) => pool.state === "in_progress"), pulls: null, entries: toEntries(versionPools),
    }];
  });
}

export function modelFromOfficialStats(
  index: GachaStatIndex,
  stored: Array<{ category: GachaStatCategory; version: string; pools: GachaStatPool[] }>,
): { model: SignalLogModel; incomplete: GachaStatCategory[] } {
  const channels = {} as Record<GachaStatCategory, SignalChannelModel>;
  const incomplete: GachaStatCategory[] = [];
  for (const category of GACHA_CATEGORY_ORDER as GachaStatCategory[]) {
    const type = index.types.find((item) => item.category === category);
    if (!type) { channels[category] = emptyChannel(category); continue; }
    const limited = isLimitedCategory(category);
    const pools = stored.filter((row) => row.category === category).flatMap((row) => row.pools);
    const entries = pools.flatMap((pool) => pool.records).sort(bySortDesc).map((record) => officialEntry(record, limited));
    if (entries.length !== type.sCount) incomplete.push(category);
    const hardPity = type.currentPity + type.toHardPity || hardPityFor(category);
    channels[category] = {
      category, limited, hasRecords: type.totalCount > 0,
      total: type.totalCount, sCount: type.sCount,
      upCount: limited ? type.upCount : null,
      averageS: type.sCount ? round1((type.totalCount - type.currentPity) / type.sCount) : null,
      averageUpCost: limited && type.upCount && type.averageUp !== null ? Math.round(type.averageUp) : null,
      currentPity: type.currentPity, hardPity, toHardPity: hardPity - type.currentPity,
      guaranteed: limited && entries.length ? !entries[0]!.isUp : null,
      pityEstimated: false, entries, segments: officialSegments(type, pools, limited),
      firstRecordAt: earliest(entries.map((entry) => entry.pulledAt)),
    };
  }
  const { monochrome, polychrome, encrypted, original, boopon } = index.tickets;
  return { model: { channels, tickets: { monochrome, polychrome, encrypted, original, boopon, pullsAvailable: pullsFor(polychrome, encrypted) } }, incomplete };
}

function archiveEntry(record: AnalyzedGachaRecord, limited: boolean): SignalSEntry {
  return {
    itemId: record.itemId, kind: kindOf(record.itemType, record.itemId), pity: record.pityPosition,
    isUp: limited ? record.isUp ?? null : null, pulledAt: record.pulledAt || null,
  };
}

export function channelFromArchive(input: {
  category: GachaStatCategory; summary: GachaSummary; pityEstimated: boolean; banners: GachaArchiveBanner[]; unclassifiedLabel: string;
}): SignalChannelModel {
  const { category, summary, banners } = input;
  const limited = isLimitedCategory(category);
  const entries = summary.sRecords.map((record) => archiveEntry(record, limited));
  const known = new Set(banners.map((banner) => banner.bannerId));
  const groups = new Map<string, AnalyzedGachaRecord[]>();
  for (const record of summary.records) {
    const key = record.bannerId && known.has(record.bannerId) ? record.bannerId : UNCLASSIFIED_SEGMENT_KEY;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const time = (value: string | null) => { const parsed = value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : 0; };
  const now = Date.now();
  const sOnly = (records: AnalyzedGachaRecord[]) => records.filter((record) => record.rank === "S").map((record) => archiveEntry(record, limited));
  const segments: SignalSegment[] = banners.filter((banner) => groups.has(banner.bannerId))
    .sort((left, right) => time(right.startAt) - time(left.startAt))
    .map((banner) => {
      const records = groups.get(banner.bannerId)!;
      const rare = banner.upItems.filter((item) => item.rarity === "S");
      const names = (rare.length ? rare : banner.upItems).map((item) => item.name);
      return {
        key: banner.bannerId, version: banner.version, upNames: names.length ? names : [banner.name],
        startAt: banner.startAt, endAt: banner.endAt, ongoing: banner.endAt !== null && time(banner.endAt) > now,
        pulls: records.length, entries: sOnly(records),
      };
    });
  const loose = groups.get(UNCLASSIFIED_SEGMENT_KEY);
  if (loose) {
    segments.push({
      key: UNCLASSIFIED_SEGMENT_KEY, version: "", upNames: [input.unclassifiedLabel], startAt: null, endAt: null, ongoing: false,
      pulls: loose.length, entries: sOnly(loose),
    });
  }
  return {
    category, limited, hasRecords: summary.total > 0, total: summary.total, sCount: summary.sRecords.length,
    upCount: limited && summary.upEligible ? summary.upWins : null,
    averageS: summary.averageS, averageUpCost: limited ? summary.averageUpCost : null,
    currentPity: summary.currentPity, hardPity: summary.hardPity,
    toHardPity: summary.currentPity === null ? null : summary.hardPity - summary.currentPity,
    guaranteed: limited ? summary.nextGuaranteed : null, pityEstimated: input.pityEstimated,
    entries, segments, firstRecordAt: earliest(summary.records.map((record) => record.pulledAt || null)),
  };
}

export function ticketsFromDetails(details: any): SignalTickets | null {
  if (!Array.isArray(details?.tickets) || !details.tickets.length) return null;
  const [polychrome, encrypted, original, boopon] = TICKET_MATCHERS.map((matcher) => ticketValue(details, matcher)) as [number, number, number, number];
  return { monochrome: null, polychrome, encrypted, original, boopon, pullsAvailable: pullsFor(polychrome, encrypted) };
}
