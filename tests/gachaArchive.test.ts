import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GachaArchiveStore } from "../src/utilities/zzz/gachaArchive.js";

describe("structured ZZZ gacha archive", () => {
  let store: GachaArchiveStore;

  beforeEach(() => {
    store = new GachaArchiveStore(":memory:");
  });

  afterEach(() => store.close());

  it("keeps official and manual records with the same ID isolated", () => {
    const base = {
      ownerId: "owner",
      uid: "130000001",
      gachaType: "GACHA_TYPE_CHARACTER_UP",
      recordId: "9001",
      itemId: "1011",
      name: "代理人",
      itemType: "角色",
      rarity: "S",
      pulledAt: "2026-09-04T12:00:00.000Z",
    };

    expect(store.addRecords([{ ...base, source: "official" }])).toBe(1);
    expect(store.addRecords([{ ...base, source: "official" }])).toBe(0);
    expect(store.addRecords([{ ...base, source: "manual" }])).toBe(1);
    expect(store.countRecords({ ownerId: "owner", uid: base.uid, source: "official" })).toBe(1);
    expect(store.countRecords({ ownerId: "owner", uid: base.uid, source: "manual" })).toBe(1);
  });

  it("sorts pages newest-first and filters by gacha type", () => {
    const records = [1, 2, 3].map((day) => ({
      ownerId: "owner",
      uid: "uid",
      source: "official" as const,
      gachaType: day === 1 ? "weapon" : "character",
      recordId: String(day),
      itemId: String(100 + day),
      name: `item-${day}`,
      itemType: "角色",
      rarity: "A",
      pulledAt: `2026-09-0${day}T00:00:00.000Z`,
    }));
    store.addRecords(records);

    expect(store.listRecords({ ownerId: "owner", uid: "uid", source: "official", limit: 2 })
      .map((record) => record.recordId)).toEqual(["3", "2"]);
    expect(store.listRecords({
      ownerId: "owner",
      uid: "uid",
      source: "official",
      gachaType: "character",
    })).toHaveLength(2);
  });

  it("stores raw type, category and banner without assigning unclassified records by date", () => {
    store.addRecords([
      {
        ownerId: "owner", uid: "uid", source: "official",
        gachaType: "GACHA_TYPE_CHARACTER_RETURN", channelCategory: "character_return",
        bannerId: "schedule-3102", recordId: "2", itemId: "101",
        name: "限定代理人", itemType: "代理人", rarity: "S", pulledAt: "2026-09-02T00:00:00.000Z",
      },
      {
        ownerId: "owner", uid: "uid", source: "official",
        gachaType: "GACHA_TYPE_CHARACTER_RETURN", channelCategory: "character_return",
        bannerId: null, recordId: "1", itemId: "102",
        name: "舊紀錄", itemType: "代理人", rarity: "A", pulledAt: "2026-09-01T00:00:00.000Z",
      },
    ]);

    expect(store.listRecords({ ownerId: "owner", uid: "uid", source: "official", channelCategory: "character_return", bannerId: "schedule-3102" }))
      .toHaveLength(1);
    expect(store.listRecords({ ownerId: "owner", uid: "uid", source: "official", channelCategory: "character_return", bannerId: null })[0]?.name)
      .toBe("舊紀錄");
  });

  it("keeps an official banner catalogue isolated by source", () => {
    store.upsertBanner({
      ownerId: "owner", uid: "uid", source: "official", bannerId: "banner-1",
      channelCategory: "character_up", name: "獨家頻道", version: "3.1",
      startAt: "2026-09-01T00:00:00.000Z", endAt: "2026-09-20T00:00:00.000Z",
      upItems: [{
        id: "101", name: "代理人", icon: "https://example.invalid/icon.png",
        itemType: "character", elementType: 202, subElementType: 201, profession: 3,
      }],
    });
    store.upsertBanner({
      ownerId: "owner", uid: "uid", source: "manual", bannerId: "banner-1",
      channelCategory: "character_up", name: "", version: "", startAt: null, endAt: null, upItems: [],
    });

    expect(store.listBanners({ ownerId: "owner", uid: "uid", source: "official" })[0]).toMatchObject({
      name: "獨家頻道", version: "3.1", upItems: [{
        id: "101", name: "代理人", icon: "https://example.invalid/icon.png",
        itemType: "character", elementType: 202, subElementType: 201, profession: 3,
      }],
    });
    expect(store.listBanners({ ownerId: "owner", uid: "uid", source: "manual" })[0]?.name).toBe("");
  });

  it("backfills only uniquely matched unclassified records and preserves real IDs", () => {
    for (const banner of [
      { id: "period-a", start: "2026-09-01T00:00:00.000Z", end: "2026-09-10T00:00:00.000Z" },
      { id: "period-b", start: "2026-09-08T00:00:00.000Z", end: "2026-09-20T00:00:00.000Z" },
    ]) {
      store.upsertBanner({
        ownerId: "owner", uid: "uid", source: "official", bannerId: banner.id,
        channelCategory: "weapon_up", name: banner.id, version: "3.1",
        startAt: banner.start, endAt: banner.end, upItems: [],
      });
    }
    store.addRecords([
      {
        ownerId: "owner", uid: "uid", source: "official", gachaType: "3",
        channelCategory: "weapon_up", bannerId: null, recordId: "unique", itemId: "a",
        name: "唯一區間", itemType: "音擎", rarity: "A", pulledAt: "2026-09-05T00:00:00.000Z",
      },
      {
        ownerId: "owner", uid: "uid", source: "official", gachaType: "3",
        channelCategory: "weapon_up", bannerId: null, recordId: "overlap", itemId: "b",
        name: "重疊區間", itemType: "音擎", rarity: "A", pulledAt: "2026-09-09T00:00:00.000Z",
      },
      {
        ownerId: "owner", uid: "uid", source: "official", gachaType: "3",
        channelCategory: "weapon_up", bannerId: "real-id", recordId: "real", itemId: "c",
        name: "真實 ID", itemType: "音擎", rarity: "A", pulledAt: "2026-09-05T00:00:00.000Z",
      },
    ]);

    expect(store.classifyUnresolvedBannerRecords({ ownerId: "owner", uid: "uid", source: "official" })).toBe(1);
    expect(store.classifyUnresolvedBannerRecords({ ownerId: "owner", uid: "uid", source: "official" })).toBe(0);
    const records = store.listRecords({ ownerId: "owner", uid: "uid", source: "official" });
    expect(records.find((record) => record.recordId === "unique")?.bannerId).toBe("period-a");
    expect(records.find((record) => record.recordId === "overlap")?.bannerId).toBeNull();
    expect(records.find((record) => record.recordId === "real")?.bannerId).toBe("real-id");
  });

  it("persists signal-log sessions across store instances and cascades them with the archive", () => {
    const directory = mkdtempSync(join(tmpdir(), "zzz-gacha-session-"));
    const path = join(directory, "archive.sqlite");
    const first = new GachaArchiveStore(path);
    first.upsertAccount({ ownerId: "owner", uid: "uid", source: "official" });
    first.saveSignalLogSession({
      token: "durable-token", invokerId: "viewer", ownerId: "owner", accountIndex: 2,
      uid: "uid", playerName: "繩匠", locale: "tw", linked: true, region: "prod_gf_jp",
      source: "official", category: "weapon_up", bannerId: "period-a",
      bannerPage: 3, page: 1, stale: false,
    });
    first.close();

    const second = new GachaArchiveStore(path);
    expect(second.getSignalLogSession("durable-token")).toMatchObject({
      invokerId: "viewer", ownerId: "owner", uid: "uid", source: "official",
      category: "weapon_up", bannerId: "period-a", bannerPage: 3, page: 1,
    });
    expect(second.clear("owner", "uid", "official")).toBe(1);
    expect(second.getSignalLogSession("durable-token")).toBeNull();
    second.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("normalizes legacy zero banner IDs when reopening an archive", () => {
    const directory = mkdtempSync(join(tmpdir(), "zzz-gacha-zero-banner-"));
    const path = join(directory, "archive.sqlite");
    const first = new GachaArchiveStore(path);
    first.addRecords([{
      ownerId: "owner", uid: "uid", source: "manual", gachaType: "2",
      channelCategory: "character_up", bannerId: "0", recordId: "legacy-zero", itemId: "item",
      name: "舊紀錄", itemType: "代理人", rarity: "S", pulledAt: "2026-09-01T00:00:00.000Z",
    }]);
    first.upsertBanner({
      ownerId: "owner", uid: "uid", source: "manual", bannerId: "0",
      channelCategory: "character_up", name: "錯誤卡池", version: "",
      startAt: null, endAt: null, upItems: [],
    });
    first.close();

    const second = new GachaArchiveStore(path);
    expect(second.listRecords({ ownerId: "owner", uid: "uid", source: "manual" })[0]?.bannerId).toBeNull();
    expect(second.listBanners({ ownerId: "owner", uid: "uid", source: "manual" })).toEqual([]);
    second.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("classifies S records from immutable regional UP periods and exact time boundaries", () => {
    store.upsertUpPeriod({
      region: "prod_gf_jp", periodId: "old", channelCategory: "character_up",
      startAt: "2026-09-01T00:00:00.000Z", endAt: "2026-09-10T00:00:00.000Z",
      recordMatchable: true, sUpItemIds: ["featured"], sUpComplete: true,
    });
    store.upsertUpPeriod({
      region: "prod_gf_jp", periodId: "new", channelCategory: "character_up",
      startAt: "2026-09-10T00:00:00.000Z", endAt: "2026-09-20T00:00:00.000Z",
      recordMatchable: true, sUpItemIds: ["replacement"], sUpComplete: true,
    });
    store.addRecords([
      {
        ownerId: "owner", uid: "uid", source: "official", gachaType: "2",
        channelCategory: "character_up", bannerId: null, recordId: "old-up", itemId: "featured",
        name: "昔日 UP", itemType: "代理人", rarity: "S", pulledAt: "2026-09-09T23:59:59.000Z",
      },
      {
        ownerId: "owner", uid: "uid", source: "official", gachaType: "2",
        channelCategory: "character_up", bannerId: null, recordId: "new-standard", itemId: "featured",
        name: "後來非 UP", itemType: "代理人", rarity: "S", pulledAt: "2026-09-10T00:00:00.000Z",
      },
    ]);

    expect(store.classifyUnresolvedUpRecords({
      ownerId: "owner", uid: "uid", source: "official", region: "prod_gf_jp",
    })).toBe(2);
    const records = store.listRecords({ ownerId: "owner", uid: "uid", source: "official" });
    expect(records.find((record) => record.recordId === "old-up")?.isUp).toBe(true);
    expect(records.find((record) => record.recordId === "new-standard")?.isUp).toBe(false);

    store.upsertUpPeriod({
      region: "prod_gf_jp", periodId: "old", channelCategory: "character_up",
      startAt: "2026-09-01T00:00:00.000Z", endAt: "2026-09-10T00:00:00.000Z",
      recordMatchable: true, sUpItemIds: ["replacement"], sUpComplete: true,
    });
    expect(store.listUpPeriods("prod_gf_jp", "character_up")[0]?.sUpItemIds)
      .toEqual(["featured", "replacement"]);
    expect(store.classifyUnresolvedUpRecords({
      ownerId: "owner", uid: "uid", source: "official", region: "prod_gf_jp",
    })).toBe(0);
    expect(store.listRecords({ ownerId: "owner", uid: "uid", source: "official" })
      .find((record) => record.recordId === "old-up")?.isUp).toBe(true);
  });

  it("merges concurrent schedules but leaves incomplete or wrong-region periods unresolved", () => {
    for (const [periodId, itemId] of [["one", "agent-a"], ["two", "agent-b"]] as const) {
      store.upsertUpPeriod({
        region: "prod_gf_jp", periodId, channelCategory: "character_up",
        startAt: "2026-09-01T00:00:00.000Z", endAt: "2026-09-20T00:00:00.000Z",
        recordMatchable: false, sUpItemIds: [itemId], sUpComplete: true,
      });
    }
    store.addRecords([{
      ownerId: "owner", uid: "uid", source: "manual", gachaType: "2",
      channelCategory: "character_up", bannerId: null, recordId: "agent-b", itemId: "agent-b",
      name: "同期 UP", itemType: "代理人", rarity: "S", pulledAt: "2026-09-05T00:00:00.000Z",
    }]);
    expect(store.classifyUnresolvedUpRecords({
      ownerId: "owner", uid: "uid", source: "manual", region: "prod_gf_jp",
    })).toBe(1);
    expect(store.listRecords({ ownerId: "owner", uid: "uid", source: "manual" })[0]?.isUp).toBe(true);

    store.addRecords([{
      ownerId: "owner", uid: "eu", source: "official", gachaType: "2",
      channelCategory: "character_up", bannerId: null, recordId: "unresolved", itemId: "agent-a",
      name: "不同區域", itemType: "代理人", rarity: "S", pulledAt: "2026-09-05T00:00:00.000Z",
    }]);
    expect(store.classifyUnresolvedUpRecords({
      ownerId: "owner", uid: "eu", source: "official", region: "prod_gf_eu",
    })).toBe(0);
    expect(store.listRecords({ ownerId: "owner", uid: "eu", source: "official" })[0]?.isUp).toBeNull();

    store.upsertUpPeriod({
      region: "prod_gf_jp", periodId: "incomplete", channelCategory: "character_up",
      startAt: "2026-10-01T00:00:00.000Z", endAt: "2026-10-20T00:00:00.000Z",
      recordMatchable: false, sUpItemIds: [], sUpComplete: false,
    });
    store.addRecords([{
      ownerId: "owner", uid: "late", source: "official", gachaType: "2",
      channelCategory: "character_up", bannerId: null, recordId: "incomplete", itemId: "agent-c",
      name: "資料不完整", itemType: "代理人", rarity: "S", pulledAt: "2026-10-05T00:00:00.000Z",
    }]);
    expect(store.classifyUnresolvedUpRecords({
      ownerId: "owner", uid: "late", source: "official", region: "prod_gf_jp",
    })).toBe(0);
    expect(store.listRecords({ ownerId: "owner", uid: "late", source: "official" })[0]?.isUp).toBeNull();

    store.clear("owner", "uid");
    expect(store.listUpPeriods("prod_gf_jp", "character_up")).toHaveLength(3);
  });

  it("persists every Bangboo S-rank as UP without calendar periods", () => {
    store.addRecords([
      {
        ownerId: "owner", uid: "bangboo", source: "official", gachaType: "5",
        channelCategory: "bangboo", bannerId: null, recordId: "s-null", itemId: "54010",
        name: "艾瑞兒", itemType: "邦布", rarity: "S", pulledAt: "2026-09-01T00:00:00.000Z",
        isUp: null,
      },
      {
        ownerId: "owner", uid: "bangboo", source: "official", gachaType: "5",
        channelCategory: "bangboo", bannerId: null, recordId: "s-false", itemId: "54023",
        name: "阿飯", itemType: "邦布", rarity: "4", pulledAt: "2026-09-02T00:00:00.000Z",
        isUp: false,
      },
      {
        ownerId: "owner", uid: "bangboo", source: "official", gachaType: "5",
        channelCategory: "bangboo", bannerId: null, recordId: "a-null", itemId: "53001",
        name: "A 級邦布", itemType: "邦布", rarity: "A", pulledAt: "2026-09-03T00:00:00.000Z",
        isUp: null,
      },
    ]);

    expect(store.classifyUnresolvedUpRecords({
      ownerId: "owner", uid: "bangboo", source: "official", region: "",
    })).toBe(2);
    const records = store.listRecords({ ownerId: "owner", uid: "bangboo", source: "official" });
    expect(records.find((item) => item.recordId === "s-null")?.isUp).toBe(true);
    expect(records.find((item) => item.recordId === "s-false")?.isUp).toBe(true);
    expect(records.find((item) => item.recordId === "a-null")?.isUp).toBeNull();
  });

  it("retains linked archives for 90 days and cancels purge after relinking", () => {
    store.upsertAccount({
      ownerId: "owner",
      uid: "uid",
      region: "prod_gf_jp",
      source: "official",
      everLinked: true,
    });
    const unlinkedAt = new Date("2026-01-01T00:00:00.000Z");
    expect(store.markOrphaned("owner", "uid", unlinkedAt)).toBe(1);
    expect(store.getAccount("owner", "uid", "official")?.purgeAfter)
      .toBe("2026-04-01T00:00:00.000Z");

    expect(store.restoreLinked("owner", "uid", "prod_gf_jp")).toBe(1);
    expect(store.getAccount("owner", "uid", "official")?.purgeAfter).toBeNull();
    expect(store.purgeExpired(new Date("2027-01-01T00:00:00.000Z"))).toBe(0);
  });

  it("selects one seven-day warning and cascades records on the 90-day purge", () => {
    store.upsertAccount({ ownerId: "owner", uid: "uid", source: "official", everLinked: true });
    store.addRecords([{
      ownerId: "owner", uid: "uid", source: "official", gachaType: "1",
      channelCategory: "standard", recordId: "one", itemId: "item", name: "項目",
      itemType: "角色", rarity: "A", pulledAt: "2026-01-01T00:00:00.000Z",
    }]);
    store.markOrphaned("owner", "uid", new Date("2026-01-01T00:00:00.000Z"));

    expect(store.listPurgeWarnings(new Date("2026-03-24T23:59:59.000Z"))).toHaveLength(0);
    expect(store.listPurgeWarnings(new Date("2026-03-25T00:00:00.000Z"))).toHaveLength(1);
    store.markPurgeWarned("owner", "uid", "official", new Date("2026-03-25T00:00:00.000Z"));
    expect(store.listPurgeWarnings(new Date("2026-03-26T00:00:00.000Z"))).toHaveLength(0);
    expect(store.purgeExpired(new Date("2026-04-01T00:00:00.000Z"))).toBe(1);
    expect(store.countRecords({ ownerId: "owner", uid: "uid", source: "official" })).toBe(0);
  });

  it("does not orphan URL-only manual archives", () => {
    store.upsertAccount({ ownerId: "owner", uid: "uid", source: "manual" });
    expect(store.markOrphaned("owner", "uid")).toBe(0);
    expect(store.getAccount("owner", "uid", "manual")?.purgeAfter).toBeNull();
  });

  it("redacts credential values from stored synchronization errors", () => {
    store.upsertAccount({ ownerId: "owner", uid: "uid", source: "official" });
    store.recordSyncFailure("owner", "uid", "official", new Error(
      "request failed authkey=very-secret&cookie=also-secret; ltoken=third-secret",
    ));
    const error = store.getAccount("owner", "uid", "official")?.lastError ?? "";
    expect(error).toContain("authkey=[redacted]");
    expect(error).toContain("cookie=[redacted]");
    expect(error).toContain("ltoken=[redacted]");
    expect(error).not.toContain("very-secret");
    expect(error).not.toContain("also-secret");
    expect(error).not.toContain("third-secret");
  });

  it("migrates existing archive rows without losing records", () => {
    const directory = mkdtempSync(join(tmpdir(), "zzz-gacha-migration-"));
    const path = join(directory, "archive.sqlite");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE archive_accounts (
        owner_id TEXT NOT NULL, uid TEXT NOT NULL, region TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL, weekly_enabled INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT, sync_status TEXT NOT NULL DEFAULT 'idle', last_error TEXT,
        orphaned_at TEXT, purge_after TEXT, purge_warned_at TEXT,
        ever_linked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, uid, source)
      );
      CREATE TABLE gacha_records (
        owner_id TEXT NOT NULL, uid TEXT NOT NULL, source TEXT NOT NULL,
        gacha_type TEXT NOT NULL, record_id TEXT NOT NULL, item_id TEXT NOT NULL,
        name TEXT NOT NULL, item_type TEXT NOT NULL, rarity TEXT NOT NULL,
        pulled_at TEXT NOT NULL, first_saved_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, uid, source, record_id)
      );
      INSERT INTO archive_accounts VALUES (
        'owner', 'uid', '', 'official', 0, NULL, 'idle', NULL, NULL, NULL, NULL, 1,
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO gacha_records VALUES (
        'owner', 'uid', 'official', 'character', 'record-1', 'item-1',
        '舊資料', '角色', 'S', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
    `);
    legacy.close();

    const migrated = new GachaArchiveStore(path);
    expect(migrated.listRecords({ ownerId: "owner", uid: "uid", source: "official" })[0]).toMatchObject({
      recordId: "record-1", name: "舊資料", channelCategory: "character_up", bannerId: null, isUp: null,
    });
    migrated.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
