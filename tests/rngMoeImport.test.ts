import { GachaArchiveStore } from "../src/utilities/zzz/gachaArchive.js";
import {
  importRngMoeProfile,
  parseRngMoeBackup,
  RNG_MOE_BACKUP_MAX_BYTES,
} from "../src/utilities/zzz/rngMoeImport.js";

function backup(profiles: Record<string, any>) {
  return parseRngMoeBackup(JSON.stringify({
    version: 1,
    game: "zzz",
    data: { profiles, curProfileId: 1 },
  }));
}

function profile(bindUid: string | null, items: Record<string, any[]>, name = "Main") {
  return {
    name,
    id: 1,
    bindUid,
    version: 11,
    stores: { 0: { items, gachaTypes: {}, gachaBanners: {} } },
  };
}

function pull(uid: string, id: number, rarity = 4, timestamp = Date.UTC(2025, 0, 1), gacha = 1) {
  return { uid, id, rarity, timestamp, gacha, gachaType: 0, pity: 99, result: 3 };
}

describe("rng.moe backup import", () => {
  let archive: GachaArchiveStore;
  beforeEach(() => { archive = new GachaArchiveStore(":memory:"); });
  afterEach(() => archive.close());

  it("maps all six channels and preserves distinct pulls from the same second", async () => {
    const parsed = backup({ 1: profile("130000001", {
      1001: [pull("1000000000000000001", 1021), pull("1000000000000000002", 1021)],
      2001: [pull("1000000000000000003", 1091)],
      3001: [pull("1000000000000000004", 14140)],
      5001: [pull("1000000000000000005", 54010)],
      12001: [pull("1000000000000000006", 1191)],
      13001: [pull("1000000000000000007", 14109)],
    }) });
    const result = await importRngMoeProfile({
      ownerId: "owner", backup: parsed, profileKey: "1", archive,
      catalog: { "1021": { name: "貓又", itemType: "代理人" } },
    });

    expect(result).toMatchObject({ uid: "130000001", total: 7, inserted: 7, duplicates: 0 });
    const records = archive.listTimeline({ ownerId: "owner", uid: result.uid });
    expect(records).toHaveLength(7);
    expect(new Set(records.map((row) => row.channelCategory))).toEqual(new Set([
      "standard", "character_up", "weapon_up", "bangboo", "character_return", "weapon_return",
    ]));
    expect(records.filter((row) => row.itemId === "1021")).toHaveLength(2);
    expect(records[0]).toMatchObject({ name: "貓又", rarity: "S", bannerId: "rng:1" });
  });

  it("is idempotent and lets official data enrich the same canonical record", async () => {
    const parsed = backup({ 1: profile("130000001", {
      2001: [pull("1000000000000000001", 1091)],
    }) });
    const first = await importRngMoeProfile({ ownerId: "owner", backup: parsed, profileKey: "1", archive, catalog: {} });
    const second = await importRngMoeProfile({ ownerId: "owner", backup: parsed, profileKey: "1", archive, catalog: {} });
    expect(first.inserted).toBe(1);
    expect(second).toMatchObject({ inserted: 0, duplicates: 1 });

    archive.addRecords([{
      ownerId: "owner", uid: "130000001", source: "official", recordId: "1000000000000000001",
      itemId: "1091", name: "星見雅", itemType: "代理人", rarity: "4",
      gachaType: "GACHA_TYPE_CHARACTER_UP", channelCategory: "character_up",
      bannerId: "official-banner", pulledAt: new Date(Date.UTC(2025, 0, 1)).toISOString(),
    }]);
    expect(archive.countRecords({ ownerId: "owner", uid: "130000001" })).toBe(1);
    expect(archive.countRecords({ ownerId: "owner", uid: "130000001", source: "rng_moe" })).toBe(1);
    expect(archive.countRecords({ ownerId: "owner", uid: "130000001", source: "official" })).toBe(1);
    expect(archive.listRecords({ ownerId: "owner", uid: "130000001" })[0]).toMatchObject({
      source: "official", name: "星見雅", bannerId: "official-banner",
    });
  });

  it("lists multiple profiles and requires a matching or supplied UID", async () => {
    const parsed = backup({
      1: profile("130000001", { 1001: [pull("1000000000000000001", 1021)] }, "One"),
      2: profile(null, { 1001: [pull("1000000000000000002", 1021)] }, "Two"),
    });
    expect(parsed.profiles).toEqual([
      expect.objectContaining({ key: "1", name: "One", uid: "130000001", recordCount: 1 }),
      expect.objectContaining({ key: "2", name: "Two", uid: "", recordCount: 1 }),
    ]);
    await expect(importRngMoeProfile({
      ownerId: "owner", backup: parsed, profileKey: "1", uid: "130000002", archive, catalog: {},
    })).rejects.toThrow("不一致");
    await expect(importRngMoeProfile({
      ownerId: "owner", backup: parsed, profileKey: "2", archive, catalog: {},
    })).rejects.toThrow("提供遊戲 UID");
    const result = await importRngMoeProfile({
      ownerId: "owner", backup: parsed, profileKey: "2", uid: "130000002", archive, catalog: {},
    });
    expect(result.uid).toBe("130000002");
  });

  it("rejects synthetic, precision-lost, corrupt and oversized data atomically", async () => {
    for (const bad of [
      { ...pull("1000000000000000001", 1021), manual: true },
      { ...pull("1000000000000000001", 1021), uid: 1000000000000000001 },
    ]) {
      const parsed = backup({ 1: profile("130000001", { 1001: [bad] }) });
      await expect(importRngMoeProfile({
        ownerId: "owner", backup: parsed, profileKey: "1", archive, catalog: {},
      })).rejects.toThrow();
      expect(archive.getAccount("owner", "130000001")).toBeNull();
    }
    expect(() => parseRngMoeBackup("not json")).toThrow("損壞");
    expect(() => parseRngMoeBackup("x".repeat(RNG_MOE_BACKUP_MAX_BYTES + 1))).toThrow("10 MiB");
    expect(() => backup({
      1: profile("130000001", { 9999: [pull("1000000000000000001", 1021)] }),
    })).toThrow("不支援的 rng.moe 抽卡頻道");
  });
});
