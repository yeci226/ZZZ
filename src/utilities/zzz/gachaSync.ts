import axios from "axios";

import {
  GachaArchiveRecord,
  GachaArchiveStore,
  getGachaArchiveStore,
  type GachaArchiveSource,
  type GachaChannelCategory,
} from "./gachaArchive.js";
import { requestZzzRecordApi } from "./officialRecordApi.js";

const MANUAL_GACHA_TYPES = [1, 2, 3, 5, 21, 22] as const;

const FALLBACK_OFFICIAL_TYPES = [
  "GACHA_TYPE_CHARACTER_UP",
  "GACHA_TYPE_CHARACTER_RETURN",
  "GACHA_TYPE_WEAPON_UP",
  "GACHA_TYPE_WEAPON_RETURN",
  "GACHA_TYPE_STANDARD",
  "GACHA_TYPE_BANGBOO",
];

export interface GachaCalendarBanner {
  bannerId: string;
  recordMatchable: boolean;
  channelCategory: GachaChannelCategory;
  name: string;
  version: string;
  startAt: string | null;
  endAt: string | null;
  state: string;
  upItems: Array<{
    id: string;
    name: string;
    icon: string;
    rarity?: string;
    itemType?: "character" | "weapon" | "bangboo" | "unknown";
    elementType?: number;
    subElementType?: number;
    profession?: string | number;
  }>;
}

export interface GachaSyncResult {
  inserted: number;
  fetched: number;
  uid: string;
  source: "official" | "manual";
}

type ManualFetch = (url: string) => Promise<any>;

export function normalizeGachaCategory(value: unknown): GachaChannelCategory {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("CHARACTER_RETURN") || raw.includes("AVATAR_RETURN") || raw === "21") return "character_return";
  if (raw.includes("WEAPON_RETURN") || raw.includes("W_ENGINE_RETURN") || raw.includes("WENGINE_RETURN") || raw === "22") return "weapon_return";
  if (raw.includes("CHARACTER") || raw.includes("AVATAR") || ["2", "11", "2001"].includes(raw)) return "character_up";
  if (raw.includes("WEAPON") || raw.includes("W_ENGINE") || raw.includes("WENGINE") || ["3", "12", "3001"].includes(raw)) return "weapon_up";
  if (raw.includes("STANDARD") || raw.includes("REGULAR") || raw.includes("PERMANENT") || raw === "1") return "standard";
  if (raw.includes("BANGBOO") || raw.includes("BOOPON") || raw === "5") return "bangboo";
  return "unknown";
}

function bannerIdOf(item: any): string | null {
  const value = item?.gacha_id ?? item?.banner_id ?? item?.schedule_id;
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return !normalized || normalized === "0" ? null : normalized;
}

function syntheticCalendarBannerId(schedule: any): string {
  return [
    "live",
    String(schedule?.gacha_type ?? "unknown"),
    String(schedule?.version ?? ""),
    String(schedule?.start_ts ?? schedule?.start_time ?? ""),
    String(schedule?.end_ts ?? schedule?.end_time ?? ""),
    String(schedule?.insurance_id ?? ""),
    String(schedule?.idx ?? ""),
  ].join(":");
}

function recordIdOf(item: any): string {
  const value = item?.id ?? item?.record_id;
  return value === undefined || value === null || value === "" ? "" : String(value);
}

function timeIso(value: unknown): string | null {
  const amount = Number(value);
  if (Number.isFinite(amount) && amount > 0) {
    return new Date(amount > 10_000_000_000 ? amount : amount * 1000).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function calendarSchedules(calendar: any): Array<{ schedule: any; itemType: GachaCalendarBanner["upItems"][number]["itemType"] }> {
  return [
    ...(Array.isArray(calendar?.avatar_gacha_schedule_list) ? calendar.avatar_gacha_schedule_list.map((schedule: any) => ({ schedule, itemType: "character" as const })) : []),
    ...(Array.isArray(calendar?.weapon_gacha_schedule_list) ? calendar.weapon_gacha_schedule_list.map((schedule: any) => ({ schedule, itemType: "weapon" as const })) : []),
    ...(Array.isArray(calendar?.standard_gacha_schedule_list) ? calendar.standard_gacha_schedule_list.map((schedule: any) => ({ schedule, itemType: "unknown" as const })) : []),
    ...(Array.isArray(calendar?.bangboo_gacha_schedule_list) ? calendar.bangboo_gacha_schedule_list.map((schedule: any) => ({ schedule, itemType: "bangboo" as const })) : []),
  ];
}

function scheduleItems(schedule: any, itemType: GachaCalendarBanner["upItems"][number]["itemType"]): GachaCalendarBanner["upItems"] {
  const list = schedule?.avatar_list ?? schedule?.weapon_list ?? schedule?.item_list ?? [];
  return (Array.isArray(list) ? list : []).map((item: any) => {
    const elementType = Number(item?.avatar_element_type ?? item?.element_type);
    const subElementType = Number(item?.avatar_sub_element_type ?? item?.sub_element_type);
    const profession = item?.avatar_profession ?? item?.profession;
    return {
      id: String(item?.id ?? item?.item_id ?? item?.avatar_id ?? item?.weapon_id ?? ""),
      name: String(itemType === "character"
        ? item?.avatar_name ?? item?.full_name ?? item?.name ?? ""
        : item?.talent_title ?? item?.weapon_name ?? item?.name ?? item?.full_name ?? ""),
      icon: String(item?.icon ?? item?.icon_url ?? ""),
      rarity: item?.rarity === undefined && item?.rank_type === undefined ? undefined : String(item?.rarity ?? item?.rank_type),
      itemType,
      elementType: Number.isFinite(elementType) ? elementType : undefined,
      subElementType: Number.isFinite(subElementType) ? subElementType : undefined,
      profession: profession === undefined || profession === null ? undefined : profession,
    };
  });
}

export function calendarBannerMetadata(calendar: any): GachaCalendarBanner[] {
  return calendarSchedules(calendar).flatMap(({ schedule, itemType }) => {
    const officialBannerId = bannerIdOf(schedule);
    const upItems = scheduleItems(schedule, itemType);
    return [{
      bannerId: officialBannerId ?? syntheticCalendarBannerId(schedule),
      recordMatchable: officialBannerId !== null,
      channelCategory: normalizeGachaCategory(schedule?.gacha_type),
      name: String(schedule?.name ?? schedule?.title ?? upItems.map((item) => item.name).filter(Boolean).join("／")),
      version: String(schedule?.version ?? ""),
      startAt: timeIso(schedule?.start_ts ?? schedule?.start_time),
      endAt: timeIso(schedule?.end_ts ?? schedule?.end_time),
      state: String(schedule?.gacha_state ?? schedule?.state ?? ""),
      upItems,
    }];
  });
}

export function activeCalendarBanners(
  banners: GachaCalendarBanner[],
  category?: GachaChannelCategory,
  now = new Date(),
): GachaCalendarBanner[] {
  const timestamp = now.getTime();
  return banners.filter((banner) => {
    if (category && banner.channelCategory !== category) return false;
    const start = banner.startAt ? Date.parse(banner.startAt) : Number.NaN;
    const end = banner.endAt ? Date.parse(banner.endAt) : Number.NaN;
    if (Number.isFinite(start) && Number.isFinite(end)) return start <= timestamp && timestamp < end;
    const state = banner.state.toUpperCase();
    return !!state && !state.includes("NOT_START") && !state.includes("CLOSE") && !state.includes("FINISH") && !state.includes("END");
  }).sort((left, right) => String(right.startAt ?? "").localeCompare(String(left.startAt ?? "")));
}

export function activeCalendarBanner(
  banners: GachaCalendarBanner[],
  category?: GachaChannelCategory,
  now = new Date(),
): GachaCalendarBanner | null {
  return activeCalendarBanners(banners, category, now)[0] ?? null;
}

export function mergedActiveCalendarBanner(
  banners: GachaCalendarBanner[],
  category: GachaChannelCategory,
  now = new Date(),
): GachaCalendarBanner | null {
  const active = activeCalendarBanners(banners, category, now);
  if (!active.length) return null;
  const items = new Map<string, GachaCalendarBanner["upItems"][number]>();
  for (const banner of active) {
    for (const item of banner.upItems) {
      const key = item.id || `${item.itemType ?? "unknown"}:${item.name}`;
      if (!items.has(key)) items.set(key, item);
    }
  }
  const first = active[0]!;
  const upItems = [...items.values()];
  return {
    ...first,
    recordMatchable: active.every((banner) => banner.recordMatchable),
    name: upItems.map((item) => item.name).filter(Boolean).join("／"),
    upItems,
  };
}

function calendarGroupId(category: GachaChannelCategory, version: string, endAt: string): string {
  return `period:${category}:${version || "unknown"}:${endAt}`;
}

/**
 * Convert calendar schedules without stable API IDs into locally stable,
 * browsable periods. Concurrent schedules of the same channel/version that
 * share an end time are one period because their individual pulls cannot be
 * distinguished safely from the official history response.
 */
export function mergeCalendarPeriods(banners: GachaCalendarBanner[]): GachaCalendarBanner[] {
  const direct = banners.filter((banner) => banner.recordMatchable);
  const groups = new Map<string, GachaCalendarBanner[]>();
  for (const banner of banners) {
    if (banner.recordMatchable || !banner.startAt || !banner.endAt) continue;
    const key = `${banner.channelCategory}\0${banner.version}\0${banner.endAt}`;
    const existing = groups.get(key) ?? [];
    existing.push(banner);
    groups.set(key, existing);
  }
  const merged = [...groups.values()].map((items) => {
    const first = items[0]!;
    const upItems = new Map<string, GachaCalendarBanner["upItems"][number]>();
    for (const banner of items) {
      for (const item of banner.upItems) {
        const key = String(item.id) || `${item.itemType ?? "unknown"}:${item.name}`;
        if (!upItems.has(key)) upItems.set(key, item);
      }
    }
    const starts = items.map((item) => item.startAt!).sort();
    const union = [...upItems.values()];
    return {
      ...first,
      bannerId: calendarGroupId(first.channelCategory, first.version, first.endAt!),
      recordMatchable: true,
      startAt: starts[0]!,
      name: union.map((item) => item.name).filter(Boolean).join("／")
        || items.map((item) => item.name).filter(Boolean).join("／"),
      upItems: union,
    };
  });
  return [...direct, ...merged].sort((left, right) =>
    String(right.startAt ?? "").localeCompare(String(left.startAt ?? "")),
  );
}

export function archiveCalendarMetadata(
  archive: GachaArchiveStore,
  ownerId: string,
  uid: string,
  source: GachaArchiveSource,
  region: string,
  banners: GachaCalendarBanner[],
): void {
  archiveCalendarPeriods(archive, region, banners);
  for (const metadata of mergeCalendarPeriods(banners)) {
    archive.upsertBanner({
      ownerId, uid, source, ...metadata,
    });
  }
  archive.classifyUnresolvedBannerRecords({ ownerId, uid, source });
}

function isSRarity(value: unknown): boolean {
  const rarity = String(value ?? "").toUpperCase();
  return rarity === "S" || rarity === "4" || rarity === "5";
}

function limitedCategory(category: GachaChannelCategory): boolean {
  return category === "character_up" || category === "character_return"
    || category === "weapon_up" || category === "weapon_return";
}

export function archiveCalendarPeriods(
  archive: GachaArchiveStore,
  region: string,
  banners: GachaCalendarBanner[],
): void {
  for (const banner of banners) {
    const rankedItems = banner.upItems.filter((item) => item.rarity !== undefined && item.rarity !== null);
    const sUpItemIds = rankedItems
      .filter((item) => isSRarity(item.rarity))
      .map((item) => String(item.id))
      .filter(Boolean);
    archive.upsertUpPeriod({
      region,
      periodId: banner.bannerId,
      channelCategory: banner.channelCategory,
      startAt: banner.startAt,
      endAt: banner.endAt,
      recordMatchable: banner.recordMatchable,
      sUpItemIds,
      sUpComplete: limitedCategory(banner.channelCategory)
        && banner.upItems.length > 0
        && rankedItems.length === banner.upItems.length
        && sUpItemIds.length > 0,
    });
  }
}

function pad(value: unknown): string {
  return String(Number(value ?? 0)).padStart(2, "0");
}

export function officialRecordTime(value: any): string {
  if (!value) return new Date(0).toISOString();
  if (typeof value === "string") {
    const normalized = value.includes("T") ? value : value.replace(" ", "T") + "+08:00";
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  const text = `${value.year}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}+08:00`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function officialTypes(detail: any): string[] {
  const list = detail?.record_show_gachas ?? detail?.record_show_gacha_list ?? [];
  const result = (Array.isArray(list) ? list : [])
    .map((item: any) => String(item?.gacha_type ?? item?.type ?? item ?? ""))
    .filter(Boolean);
  return [...new Set(result.length ? result : FALLBACK_OFFICIAL_TYPES)];
}

function toOfficialRecord(
  item: any,
  ownerId: string,
  uid: string,
  gachaType: string,
): GachaArchiveRecord {
  return {
    ownerId,
    uid,
    source: "official",
    gachaType: String(item?.gacha_type ?? gachaType),
    channelCategory: normalizeGachaCategory(item?.gacha_type ?? gachaType),
    bannerId: bannerIdOf(item),
    recordId: recordIdOf(item),
    itemId: String(item.item_id ?? ""),
    name: String(item.item_name ?? item.name ?? ""),
    itemType: String(item.item_type ?? ""),
    rarity: String(item.rarity ?? item.rank_type ?? ""),
    pulledAt: officialRecordTime(item.date ?? item.time),
  };
}

export async function syncOfficialGachaArchive(options: {
  zzz: any;
  ownerId: string;
  enableWeekly?: boolean;
  archive?: GachaArchiveStore;
  gachaTypes?: string[];
  pageDelayMs?: number;
}): Promise<GachaSyncResult> {
  const archive = options.archive ?? getGachaArchiveStore();
  const uid = String(options.zzz.uid);
  const region = String(options.zzz.region ?? "");
  archive.upsertAccount({ ownerId: options.ownerId, uid, region, source: "official", everLinked: true });
  archive.restoreLinked(options.ownerId, uid, region);

  let inserted = 0;
  let fetched = 0;
  try {
    let types = options.gachaTypes;
    if (!types?.length) {
      const detail = await requestZzzRecordApi<any>(options.zzz, "cur_gacha_detail");
      types = officialTypes(detail);
    }

    try {
      const calendar = await requestZzzRecordApi<any>(options.zzz, "gacha_calendar");
      archiveCalendarMetadata(
        archive,
        options.ownerId,
        uid,
        "official",
        region,
        calendarBannerMetadata(calendar),
      );
    } catch {
      // Record synchronization remains available when the optional calendar fails.
    }

    for (const gachaType of types) {
      let endId = "";
      while (true) {
        const data = await requestZzzRecordApi<any>(options.zzz, "gacha_record", {
          gacha_type: gachaType,
          end_id: endId || undefined,
        });
        const page = Array.isArray(data?.gacha_item_list) ? data.gacha_item_list : [];
        if (page.length === 0) break;
        fetched += page.length;
        const pageInserted = archive.addRecords(
          page.filter((item: any) => recordIdOf(item))
            .map((item: any) => toOfficialRecord(item, options.ownerId, uid, gachaType)),
        );
        inserted += pageInserted;

        // Pages are newest first. Encountering any stored record means all
        // following pages are already archived, so this remains incremental.
        if (!data?.has_more || pageInserted < page.length) break;
        const nextId = recordIdOf(page[page.length - 1]);
        if (!nextId || nextId === endId) break;
        endId = nextId;
        if ((options.pageDelayMs ?? 250) > 0) {
          await new Promise((resolve) => setTimeout(resolve, options.pageDelayMs ?? 250));
        }
      }
    }
    archive.classifyUnresolvedBannerRecords({ ownerId: options.ownerId, uid, source: "official" });
    archive.classifyUnresolvedUpRecords({
      ownerId: options.ownerId, uid, source: "official", region,
    });
    archive.recordSyncSuccess(options.ownerId, uid, "official");
    if (options.enableWeekly) archive.setWeeklyEnabled(options.ownerId, uid, true);
    return { inserted, fetched, uid, source: "official" };
  } catch (error) {
    archive.recordSyncFailure(options.ownerId, uid, "official", error);
    throw error;
  }
}

function normalizeManualUrl(input: string): URLSearchParams {
  const value = input.trim();
  let query: URLSearchParams;
  try {
    query = new URL(value).searchParams;
  } catch {
    query = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
  }
  if (!query.get("authkey")) throw new Error("調頻 URL 缺少 authkey");
  query.set("authkey_ver", query.get("authkey_ver") || "1");
  query.set("sign_type", query.get("sign_type") || "2");
  query.set("game_biz", query.get("game_biz") || "nap_global");
  query.set("size", "20");
  return query;
}

function manualRecordTime(value: unknown): string {
  const text = String(value ?? "");
  const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T") + "+08:00");
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

export async function importManualGachaArchive(options: {
  ownerId: string;
  url: string;
  uid?: string;
  region?: string;
  everLinked?: boolean;
  archive?: GachaArchiveStore;
  fetch?: ManualFetch;
  pageDelayMs?: number;
}): Promise<GachaSyncResult> {
  const archive = options.archive ?? getGachaArchiveStore();
  const query = normalizeManualUrl(options.url);
  const fetchPage: ManualFetch = options.fetch ?? (async (url) => (await axios.get(url)).data);
  let resolvedUid = String(options.uid ?? query.get("uid") ?? "");
  let inserted = 0;
  let fetched = 0;
  let accountCreated = false;

  try {
    for (const realType of MANUAL_GACHA_TYPES) {
      let endId = "0";
      while (true) {
        query.set("real_gacha_type", String(realType));
        query.set("end_id", endId);
        let response: any;
        try {
          response = await fetchPage(
            `https://public-operation-nap-sg.hoyoverse.com/common/gacha_record/api/getGachaLog?${query.toString()}`,
          );
        } catch (error) {
          if (realType === 21 || realType === 22) break;
          throw error;
        }
        if (Number(response?.retcode ?? 0) !== 0) {
          if (realType === 21 || realType === 22) break;
          throw new Error(String(response?.message || "手動調頻紀錄讀取失敗"));
        }
        const page = Array.isArray(response?.data?.list) ? response.data.list : [];
        if (page.length === 0) break;
        const pageUid = String(page[0]?.uid ?? "");
        if (resolvedUid && pageUid && resolvedUid !== pageUid) {
          throw new Error(`調頻 URL 的 UID（${pageUid}）與所選帳號（${resolvedUid}）不一致`);
        }
        resolvedUid ||= pageUid;
        if (!resolvedUid) throw new Error("調頻 URL 未提供可辨識的遊戲 UID");
        if (!accountCreated) {
          archive.upsertAccount({
            ownerId: options.ownerId,
            uid: resolvedUid,
            region: options.region ?? String(query.get("region") ?? ""),
            source: "manual",
            everLinked: options.everLinked,
          });
          accountCreated = true;
        }
        fetched += page.length;
        const pageRecords = page.filter((item: any) => recordIdOf(item)).map((item: any): GachaArchiveRecord => ({
          ownerId: options.ownerId,
          uid: resolvedUid,
          source: "manual",
          gachaType: String(item?.gacha_type ?? realType),
          channelCategory: normalizeGachaCategory(realType === 21 || realType === 22 ? realType : item?.gacha_type ?? realType),
          bannerId: bannerIdOf(item),
          recordId: recordIdOf(item),
          itemId: String(item.item_id ?? ""),
          name: String(item.name ?? ""),
          itemType: String(item.item_type ?? ""),
          rarity: String(item.rank_type ?? ""),
          pulledAt: manualRecordTime(item.time),
        }));
        const pageInserted = archive.addRecords(pageRecords);
        inserted += pageInserted;
        for (const record of pageRecords) {
          if (!record.bannerId) continue;
          archive.upsertBanner({
            ownerId: options.ownerId, uid: resolvedUid, source: "manual",
            bannerId: record.bannerId, channelCategory: record.channelCategory ?? "unknown",
            name: "", version: "", startAt: null, endAt: null, upItems: [],
          });
        }
        if (pageInserted < page.length) break;
        const nextId = recordIdOf(page[page.length - 1]);
        if (!nextId || nextId === endId) break;
        endId = nextId;
        if ((options.pageDelayMs ?? 250) > 0) {
          await new Promise((resolve) => setTimeout(resolve, options.pageDelayMs ?? 250));
        }
      }
    }

    if (!resolvedUid) throw new Error("沒有可匯入的調頻紀錄，無法辨識 UID");
    if (!accountCreated) {
      archive.upsertAccount({
        ownerId: options.ownerId,
        uid: resolvedUid,
        region: options.region ?? String(query.get("region") ?? ""),
        source: "manual",
        everLinked: options.everLinked,
      });
    }
    archive.classifyUnresolvedUpRecords({
      ownerId: options.ownerId,
      uid: resolvedUid,
      source: "manual",
      region: options.region ?? String(query.get("region") ?? ""),
    });
    archive.recordSyncSuccess(options.ownerId, resolvedUid, "manual");
    return { inserted, fetched, uid: resolvedUid, source: "manual" };
  } catch (error) {
    if (resolvedUid) {
      if (!accountCreated) {
        archive.upsertAccount({
          ownerId: options.ownerId, uid: resolvedUid, source: "manual",
          region: options.region, everLinked: options.everLinked,
        });
      }
      archive.recordSyncFailure(options.ownerId, resolvedUid, "manual", error);
    }
    throw error;
  } finally {
    // The only authkey copy lives in this request-scoped URLSearchParams.
    query.delete("authkey");
  }
}
