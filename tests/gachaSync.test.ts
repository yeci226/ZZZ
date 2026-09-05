import { GachaArchiveStore } from "../src/utilities/zzz/gachaArchive.js";
import {
  activeCalendarBanner,
  activeCalendarBanners,
  calendarBannerMetadata,
  importManualGachaArchive,
  mergeCalendarPeriods,
  mergedActiveCalendarBanner,
  normalizeGachaCategory,
  officialRecordTime,
  syncOfficialGachaArchive,
} from "../src/utilities/zzz/gachaSync.js";

describe("ZZZ gacha synchronization", () => {
  let archive: GachaArchiveStore;

  beforeEach(() => {
    archive = new GachaArchiveStore(":memory:");
  });

  afterEach(() => archive.close());

  it("keeps the official record ID separate from item ID", () => {
    expect(officialRecordTime({ year: 2026, month: 9, day: 4, hour: 8, minute: 5, second: 2 }))
      .toBe("2026-09-04T00:05:02.000Z");
  });

  it("recognizes all six official channel categories", () => {
    expect([
      normalizeGachaCategory("GACHA_TYPE_AVATAR_UP"),
      normalizeGachaCategory("GACHA_TYPE_AVATAR_RETURN"),
      normalizeGachaCategory("GACHA_TYPE_W_ENGINE_UP"),
      normalizeGachaCategory("GACHA_TYPE_W_ENGINE_RETURN"),
      normalizeGachaCategory("GACHA_TYPE_PERMANENT"),
      normalizeGachaCategory("GACHA_TYPE_BANGBOO"),
    ]).toEqual([
      "character_up", "character_return", "weapon_up", "weapon_return", "standard", "bangboo",
    ]);
  });

  it("preserves UP metadata and selects the currently active banner", () => {
    const banners = calendarBannerMetadata({
      avatar_gacha_schedule_list: [{
        gacha_id: "active", gacha_type: "GACHA_TYPE_CHARACTER_UP", version: "3.1",
        start_ts: 1_788_192_000, end_ts: 1_789_401_600,
        avatar_list: [{
          id: "1091", full_name: "星見雅", rarity: "S", icon: "https://example.invalid/miyabi.png",
          avatar_element_type: 202, avatar_sub_element_type: 201, avatar_profession: 3,
        }],
      }, {
        gacha_id: "future", gacha_type: "GACHA_TYPE_CHARACTER_UP", version: "3.2",
        start_ts: 1_789_401_600, end_ts: 1_790_006_400,
        avatar_list: [{ id: "1021", full_name: "貓又", rarity: "S" }],
      }],
    });
    expect(banners[0]?.upItems[0]).toMatchObject({
      id: "1091", name: "星見雅", rarity: "S", itemType: "character",
      elementType: 202, subElementType: 201, profession: 3,
    });
    expect(banners[0]?.recordMatchable).toBe(true);
    expect(activeCalendarBanner(banners, "character_up", new Date(1_788_300_000_000))?.bannerId).toBe("active");
  });

  it("keeps ID-less live schedules for display and merges concurrent UP agents", () => {
    const banners = calendarBannerMetadata({
      avatar_gacha_schedule_list: [{
        gacha_type: "GACHA_TYPE_CHARACTER_UP", gacha_state: "GACHA_STATE_IN_PROGRESS",
        version: "3.1", start_ts: 1_788_192_000, end_ts: 1_789_401_600,
        insurance_id: 31, idx: 1,
        avatar_list: [{ avatar_id: 1581, avatar_name: "蕾米埃爾", full_name: "蕾米埃爾·丹", rarity: "S", icon: "remiel.png" }],
      }, {
        gacha_type: "GACHA_TYPE_CHARACTER_UP", gacha_state: "GACHA_STATE_IN_PROGRESS",
        version: "3.1", start_ts: 1_788_192_000, end_ts: 1_789_401_600,
        insurance_id: 32, idx: 2,
        avatar_list: [
          { avatar_id: 1591, avatar_name: "希格莉德", full_name: "希格莉德·德拉敘爾", rarity: "S", icon: "sigrid.png" },
          { avatar_id: 1281, full_name: "派派", rarity: "A", icon: "piper.png" },
        ],
      }, {
        gacha_type: "GACHA_TYPE_CHARACTER_UP", gacha_state: "GACHA_STATE_IN_PROGRESS",
        version: "3.1", start_ts: 1_788_192_000, end_ts: 1_789_401_600,
        insurance_id: 33, idx: 3,
        avatar_list: [{ avatar_id: 1281, full_name: "派派", rarity: "A", icon: "piper.png" }],
      }, {
        gacha_type: "GACHA_TYPE_CHARACTER_RETURN", gacha_state: "GACHA_STATE_IN_PROGRESS",
        version: "3.1", start_ts: 1_788_192_000, end_ts: 1_789_401_600,
        insurance_id: 34, idx: 4,
        avatar_list: [{ avatar_id: 1481, full_name: "琉音", rarity: "S", icon: "yuzuha.png" }],
      }],
    });

    expect(banners).toHaveLength(4);
    expect(banners.every((banner) => !banner.recordMatchable)).toBe(true);
    expect(banners[0]?.bannerId).toContain("live:GACHA_TYPE_CHARACTER_UP:3.1");
    expect(activeCalendarBanners(banners, "character_up", new Date(1_788_300_000_000))).toHaveLength(3);
    const merged = mergedActiveCalendarBanner(banners, "character_up", new Date(1_788_300_000_000));
    expect(merged?.upItems.map((item) => item.name)).toEqual([
      "蕾米埃爾", "希格莉德", "派派",
    ]);
    expect(merged?.name).not.toContain("琉音");
    expect(merged?.recordMatchable).toBe(false);
    const periods = mergeCalendarPeriods(banners);
    expect(periods).toHaveLength(2);
    expect(periods.find((period) => period.channelCategory === "character_up")).toMatchObject({
      bannerId: "period:character_up:3.1:2026-09-14T16:00:00.000Z",
      recordMatchable: true,
      upItems: [
        expect.objectContaining({ id: "1581" }),
        expect.objectContaining({ id: "1591" }),
        expect.objectContaining({ id: "1281" }),
      ],
    });
  });

  it("archives official records and banner metadata with capability-detected IDs", async () => {
    let query: Record<string, unknown> = {};
    const request = {
      setQueryParams(value: Record<string, unknown>) { query = value; return this; },
      setDs() { return this; },
      async send(url: string) {
        if (url.endsWith("/cur_gacha_detail")) {
          return { response: { retcode: 0, data: { record_show_gachas: [{ gacha_type: "GACHA_TYPE_CHARACTER_RETURN" }] } } };
        }
        if (url.endsWith("/gacha_calendar")) {
          return { response: { retcode: 0, data: { avatar_gacha_schedule_list: [{
            gacha_id: "return-31", gacha_type: "GACHA_TYPE_CHARACTER_RETURN", version: "3.1",
            name: "獨家重映", start_ts: 1_788_192_000, end_ts: 1_789_401_600,
            avatar_list: [{ id: "1091", name: "測試代理人", rarity: "S", icon: "https://example.invalid/agent.png" }],
          }] } } };
        }
        if (url.endsWith("/gacha_record")) {
          expect(query.gacha_type).toBe("GACHA_TYPE_CHARACTER_RETURN");
          return { response: { retcode: 0, data: { has_more: false, gacha_item_list: [{
            id: "official-record", item_id: "1091", item_name: "測試代理人", item_type: "角色",
            rarity: "4", gacha_type: "GACHA_TYPE_CHARACTER_RETURN", gacha_id: "return-31",
            date: { year: 2026, month: 9, day: 4, hour: 8, minute: 0, second: 0 },
          }] } } };
        }
        throw new Error(`unexpected endpoint ${url}`);
      },
    };
    const result = await syncOfficialGachaArchive({
      ownerId: "owner", archive, pageDelayMs: 0, enableWeekly: true,
      zzz: { uid: "130000001", region: "prod_gf_jp", lang: "zh-tw", record: { request } },
    });

    expect(result).toMatchObject({ inserted: 1, fetched: 1, source: "official" });
    expect(archive.listRecords({ ownerId: "owner", uid: "130000001", source: "official" })[0]).toMatchObject({
      recordId: "official-record", itemId: "1091", gachaType: "GACHA_TYPE_CHARACTER_RETURN",
      channelCategory: "character_return", bannerId: "return-31", isUp: true,
    });
    expect(archive.listBanners({ ownerId: "owner", uid: "130000001", source: "official" })[0]).toMatchObject({
      bannerId: "return-31", version: "3.1", channelCategory: "character_return",
    });
    expect(archive.getAccount("owner", "130000001", "official")?.weeklyEnabled).toBe(true);
  });

  it("archives an ID-less schedule as a stable merged period and backfills its records", async () => {
    const request = {
      setQueryParams() { return this; },
      setDs() { return this; },
      async send(url: string) {
        if (url.endsWith("/gacha_calendar")) {
          return { response: { retcode: 0, data: { avatar_gacha_schedule_list: [{
            gacha_type: "GACHA_TYPE_CHARACTER_UP", gacha_state: "GACHA_STATE_IN_PROGRESS",
            version: "3.1", start_ts: 1_788_192_000, end_ts: 1_789_401_600,
            insurance_id: 31, idx: 1,
            avatar_list: [{ avatar_id: 1581, full_name: "蕾米埃爾·丹", rarity: "S", icon: "remiel.png" }],
          }] } } };
        }
        if (url.endsWith("/gacha_record")) {
          return { response: { retcode: 0, data: { has_more: false, gacha_item_list: [{
            id: "record-without-banner", item_id: "1581", item_name: "蕾米埃爾·丹",
            item_type: "代理人", rarity: "S", gacha_type: "GACHA_TYPE_CHARACTER_UP",
            date: { year: 2026, month: 9, day: 4, hour: 8, minute: 0, second: 0 },
          }] } } };
        }
        throw new Error(`unexpected endpoint ${url}`);
      },
    };

    await syncOfficialGachaArchive({
      ownerId: "owner", archive, pageDelayMs: 0,
      gachaTypes: ["GACHA_TYPE_CHARACTER_UP"],
      zzz: { uid: "130000001", region: "prod_gf_jp", lang: "zh-tw", record: { request } },
    });

    expect(archive.listBanners({ ownerId: "owner", uid: "130000001", source: "official" })[0])
      .toMatchObject({
        bannerId: "period:character_up:3.1:2026-09-14T16:00:00.000Z",
        channelCategory: "character_up",
      });
    expect(archive.listUpPeriods("prod_gf_jp", "character_up")).toHaveLength(1);
    expect(archive.listRecords({ ownerId: "owner", uid: "130000001", source: "official" })[0])
      .toMatchObject({
        bannerId: "period:character_up:3.1:2026-09-14T16:00:00.000Z",
        isUp: true,
      });
  });

  it("imports manual pages incrementally without persisting authkey", async () => {
    const requested: string[] = [];
    const result = await importManualGachaArchive({
      ownerId: "owner",
      uid: "130000001",
      url: "https://example.invalid/log?authkey=very-secret&region=prod_gf_jp",
      archive,
      everLinked: true,
      pageDelayMs: 0,
      fetch: async (url) => {
        requested.push(url);
        const query = new URL(url).searchParams;
        if (query.get("real_gacha_type") === "2" && query.get("end_id") === "0") {
          return { retcode: 0, data: { list: [{
            id: "record-1", item_id: "item-99", uid: "130000001",
            name: "測試代理人", item_type: "角色", rank_type: "4",
            time: "2026-09-04 08:00:00",
          }] } };
        }
        return { retcode: 0, data: { list: [] } };
      },
    });

    expect(result.inserted).toBe(1);
    const [record] = archive.listRecords({
      ownerId: "owner", uid: "130000001", source: "manual",
    });
    expect(record.recordId).toBe("record-1");
    expect(record.itemId).toBe("item-99");
    expect(record.gachaType).toBe("2");
    expect(record.channelCategory).toBe("character_up");
    expect(record.bannerId).toBeNull();
    expect(archive.getAccount("owner", "130000001", "manual")?.everLinked).toBe(true);
    expect(JSON.stringify(archive.listAccounts("owner"))).not.toContain("very-secret");
    expect(requested.some((url) => url.includes("very-secret"))).toBe(true);

    const second = await importManualGachaArchive({
      ownerId: "owner",
      uid: "130000001",
      url: "authkey=very-secret&region=prod_gf_jp",
      archive,
      pageDelayMs: 0,
      fetch: async (url) => requested.length && new URL(url).searchParams.get("real_gacha_type") === "2"
        ? { retcode: 0, data: { list: [{ id: "record-1", item_id: "item-99", name: "測試代理人", item_type: "角色", rank_type: "4", time: "2026-09-04 08:00:00" }] } }
        : { retcode: 0, data: { list: [] } },
    });
    expect(second.inserted).toBe(0);
  });

  it("keeps already archived rows when a later page fails", async () => {
    let requests = 0;
    await expect(importManualGachaArchive({
      ownerId: "owner",
      uid: "uid",
      url: "authkey=secret",
      archive,
      pageDelayMs: 0,
      fetch: async () => {
        requests++;
        if (requests === 1) return { retcode: 0, data: { list: [{
          id: "one", item_id: "item", name: "A", item_type: "角色",
          rank_type: "3", time: "2026-01-01 00:00:00",
        }] } };
        throw new Error("network failed");
      },
    })).rejects.toThrow("network failed");
    expect(archive.countRecords({ ownerId: "owner", uid: "uid", source: "manual" })).toBe(1);
    expect(archive.getAccount("owner", "uid", "manual")?.syncStatus).toBe("failed");
  });

  it("preserves a manual banner ID and never merges it into official rows", async () => {
    await importManualGachaArchive({
      ownerId: "owner", uid: "uid", url: "authkey=request-only", archive, pageDelayMs: 0,
      fetch: async (url) => new URL(url).searchParams.get("real_gacha_type") === "21"
        ? { retcode: 0, data: { list: [{
          id: "same-id", item_id: "item-1", gacha_type: "21", gacha_id: "rerun-31",
          uid: "uid", name: "重映代理人", item_type: "角色", rank_type: "4", time: "2026-09-04 08:00:00",
        }] } }
        : { retcode: 0, data: { list: [] } },
    });
    archive.addRecords([{
      ownerId: "owner", uid: "uid", source: "official", gachaType: "21",
      channelCategory: "character_return", bannerId: "rerun-31", recordId: "same-id",
      itemId: "item-1", name: "重映代理人", itemType: "角色", rarity: "4",
      pulledAt: "2026-09-04T00:00:00.000Z",
    }]);

    const manual = archive.listRecords({ ownerId: "owner", uid: "uid", source: "manual" })[0];
    expect(manual).toMatchObject({ channelCategory: "character_return", bannerId: "rerun-31" });
    expect(archive.countRecords({ ownerId: "owner", uid: "uid", source: "official" })).toBe(1);
    expect(archive.countRecords({ ownerId: "owner", uid: "uid", source: "manual" })).toBe(1);
  });

  it("rejects importing a URL for a different selected UID", async () => {
    await expect(importManualGachaArchive({
      ownerId: "owner", uid: "selected", url: "authkey=request-only", archive, pageDelayMs: 0,
      fetch: async (url) => new URL(url).searchParams.get("real_gacha_type") === "1"
        ? { retcode: 0, data: { list: [{
          id: "one", item_id: "item", uid: "different", name: "A",
          item_type: "角色", rank_type: "3", time: "2026-01-01 00:00:00",
        }] } }
        : { retcode: 0, data: { list: [] } },
    })).rejects.toThrow("不一致");
    expect(archive.countRecords({ ownerId: "owner", uid: "selected", source: "manual" })).toBe(0);
    expect(JSON.stringify(archive.listAccounts("owner"))).not.toContain("request-only");
  });
});
