import {
  analyzeGachaRecords,
  hardPityFor,
  latestBangbooSRecord,
  normalizeRank,
  readLiveGachaState,
} from "../src/utilities/zzz/gachaAnalysis.js";
import type { GachaArchiveRecord } from "../src/utilities/zzz/gachaArchive.js";

function record(index: number, input: Partial<GachaArchiveRecord> = {}): GachaArchiveRecord {
  return {
    ownerId: "owner",
    uid: "130000001",
    source: "official",
    gachaType: "GACHA_TYPE_CHARACTER_UP",
    channelCategory: "character_up",
    bannerId: "banner-a",
    recordId: String(index).padStart(4, "0"),
    itemId: String(20_000 + index),
    name: `項目 ${index}`,
    itemType: "代理人",
    rarity: "B",
    pulledAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    ...input,
  };
}

describe("ZZZ gacha analysis", () => {
  it("averages known S/UP pity positions and excludes unknown outcomes", () => {
    const records = [
      ...Array.from({ length: 10 }, (_, i) => record(i + 1)),
      record(11, { rarity: "S", itemId: "1021", name: "貓又", isUp: false }),
      ...Array.from({ length: 5 }, (_, i) => record(i + 12)),
      record(17, { rarity: "S", itemId: "9999", name: "限定 A", isUp: true }),
      ...Array.from({ length: 3 }, (_, i) => record(i + 18)),
      record(21, { rarity: "S", itemId: "9998", name: "限定 B", isUp: true }),
      record(22),
      record(23),
    ];

    const summary = analyzeGachaRecords({ records, category: "character_up" });

    expect(summary.averageS).toBe(5);
    expect(summary.averageUp).toBe(5);
    expect(summary.winRate).toBe(66.7);
    expect(summary.currentPity).toBe(2);
    expect(summary.nextGuaranteed).toBe(false);
    expect(summary.sRecords.map((item) => item.guaranteeResult)).toEqual(["won", "guaranteed", "lost"]);
    expect(summary.sRecords.at(-1)?.pityPosition).toBeNull();
  });

  it("filters single-banner totals while keeping channel pity across banners", () => {
    const records = [
      record(1, { rarity: "S", itemId: "9999", bannerId: "old" }),
      record(2, { bannerId: "new" }),
      record(3, { bannerId: "new" }),
    ];
    const summary = analyzeGachaRecords({ records, category: "character_up", bannerId: "new" });

    expect(summary.total).toBe(2);
    expect(summary.records).toHaveLength(2);
    expect(summary.currentPity).toBe(2);
  });

  it("uses a known cross-banner pity boundary for the selected banner", () => {
    const records = [
      record(1, { rarity: "S", itemId: "9999", bannerId: "old" }),
      record(2, { bannerId: "new" }),
      record(3, { bannerId: "new" }),
      record(4, { rarity: "S", itemId: "9998", bannerId: "new" }),
    ];
    const summary = analyzeGachaRecords({ records, category: "character_up", bannerId: "new" });

    expect(summary.sRecords[0]?.pityPosition).toBe(3);
    expect(summary.averageS).toBe(3);
    expect(summary.averageUp).toBeNull();
  });

  it("produces 55 / 55 / 100% when an unknown weapon S precedes one known UP", () => {
    const records = [
      ...Array.from({ length: 59 }, (_, index) => record(index + 1, {
        channelCategory: "weapon_up", gachaType: "GACHA_TYPE_WEAPON_UP", rarity: "B",
      })),
      record(60, {
        channelCategory: "weapon_up", gachaType: "GACHA_TYPE_WEAPON_UP",
        rarity: "S", name: "霓虹妄想", itemId: "14151", isUp: null,
      }),
      ...Array.from({ length: 54 }, (_, index) => record(index + 61, {
        channelCategory: "weapon_up", gachaType: "GACHA_TYPE_WEAPON_UP", rarity: "B",
      })),
      record(115, {
        channelCategory: "weapon_up", gachaType: "GACHA_TYPE_WEAPON_UP",
        rarity: "S", name: "空羽復歸之詩", itemId: "14158", isUp: true,
      }),
    ];

    const summary = analyzeGachaRecords({ records, category: "weapon_up" });

    expect(summary.sRecords.map((item) => item.pityPosition)).toEqual([55, null]);
    expect(summary.averageS).toBe(55);
    expect(summary.averageUp).toBe(55);
    expect(summary.winRate).toBe(100);
  });

  it("does not invent pity or UP status when the archive has no reliable boundary", () => {
    const summary = analyzeGachaRecords({
      records: [record(1), record(2, { rarity: "S", itemId: "" })],
      category: "character_up",
    });
    expect(summary.sRecords[0]?.pityPosition).toBeNull();
    expect(summary.sRecords[0]?.isUp).toBeNull();
    expect(summary.averageS).toBeNull();
    expect(summary.currentPity).toBe(0);
  });

  it("uses live official pity and guarantee values when available", () => {
    const live = readLiveGachaState({
      gacha_info_list: [{ gacha_type: "GACHA_TYPE_WEAPON_UP", more_s_need_cnt: 13, is_up_guaranteed: 1 }],
    }, "weapon_up");
    expect(live).toEqual({ pity: 67, guaranteed: true });
    expect(hardPityFor("weapon_up")).toBe(80);
    expect(normalizeRank("4")).toBe("S");
    expect(readLiveGachaState({
      gacha_info_list: [{ gacha_type: "GACHA_TYPE_PERMANENT", more_s_need_cnt: 12 }],
    }, "standard").pity).toBe(78);
  });

  it("uses each historical snapshot instead of the selected banner catalogue", () => {
    const summary = analyzeGachaRecords({
      records: [
        record(1, { rarity: "S", itemId: "1091", name: "昔日 UP", isUp: true }),
        record(2, { rarity: "S", itemId: "1091", name: "後來非 UP", isUp: false }),
      ],
      category: "character_up",
    });
    expect(summary.sRecords.map((item) => item.isUp)).toEqual([false, true]);
    expect(summary.sRecords[0]?.guaranteeResult).toBe("lost");
  });

  it("keeps an unresolved limited S neutral and does not carry a guarantee through it", () => {
    const summary = analyzeGachaRecords({
      records: [
        record(1, { rarity: "S", itemId: "known-standard", isUp: false }),
        record(2, { rarity: "S", itemId: "unresolved", isUp: null }),
        record(3, { rarity: "S", itemId: "known-up", isUp: true }),
      ],
      category: "character_up",
    });
    expect(summary.sRecords.map((item) => [item.isUp, item.guaranteeResult])).toEqual([
      [true, "unknown"],
      [null, "unknown"],
      [false, "lost"],
    ]);
  });

  it("shows limited-only metrics as unavailable for standard and Bangboo channels", () => {
    for (const category of ["standard", "bangboo"] as const) {
      const summary = analyzeGachaRecords({ records: [record(1, { channelCategory: category })], category });
      expect(summary.averageUp).toBeNull();
      expect(summary.winRate).toBeNull();
      expect(summary.nextGuaranteed).toBeNull();
    }
  });

  it("treats every S-rank Bangboo as UP without enabling limited-pool statistics", () => {
    const records = [null, false, true].map((isUp, index) => record(index + 1, {
      gachaType: "GACHA_TYPE_BANGBOO",
      channelCategory: "bangboo",
      itemId: String(54_010 + index),
      itemType: "邦布",
      rarity: "S",
      isUp,
    }));
    records.push(record(4, {
      gachaType: "GACHA_TYPE_BANGBOO", channelCategory: "bangboo",
      itemId: "54020", itemType: "邦布", rarity: "A", isUp: null,
    }));

    const summary = analyzeGachaRecords({ records, category: "bangboo" });

    expect(summary.sRecords.map((item) => item.isUp)).toEqual([true, true, true]);
    expect(summary.records.find((item) => item.rank === "A")?.isUp).toBeNull();
    expect(summary.averageUp).toBeNull();
    expect(summary.winRate).toBeNull();
    expect(summary.nextGuaranteed).toBeNull();
    expect(summary.sRecords.every((item) => item.guaranteeResult === null)).toBe(true);
  });

  it("selects the newest S-rank Bangboo and breaks timestamp ties by record ID", () => {
    const sameTime = "2026-09-05T00:00:00.000Z";
    const records = [
      record(1, { gachaType: "5", channelCategory: "bangboo", itemId: "54010", itemType: "邦布", rarity: "S" }),
      record(100, { gachaType: "5", channelCategory: "bangboo", itemId: "54020", itemType: "邦布", rarity: "S", pulledAt: sameTime }),
      record(101, { gachaType: "5", channelCategory: "bangboo", itemId: "54023", itemType: "邦布", rarity: "S", pulledAt: sameTime }),
      record(102, { gachaType: "5", channelCategory: "bangboo", itemId: "54024", itemType: "邦布", rarity: "A", pulledAt: "2026-09-06T00:00:00.000Z" }),
      record(103, { gachaType: "5", channelCategory: "bangboo", itemId: "12003", itemType: "音擎", rarity: "S", pulledAt: "2026-09-07T00:00:00.000Z" }),
    ];

    expect(latestBangbooSRecord(records)?.itemId).toBe("54023");
    expect(latestBangbooSRecord(records.filter((item) => item.rarity !== "S"))).toBeNull();
  });
});
