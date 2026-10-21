import type { AnalyzedGachaRecord, GachaRank, GachaSummary } from "../src/utilities/zzz/gachaAnalysis.js";
import { buildPityCycles } from "../src/utilities/zzz/signalLogCycleData.js";

let sequence = 0;
function rec(rank: GachaRank, extra: Partial<AnalyzedGachaRecord> = {}): AnalyzedGachaRecord {
  sequence++;
  return {
    ownerId: "owner", uid: "uid", source: "official", gachaType: "2",
    recordId: String(sequence), itemId: rank === "S" ? "1091" : rank === "A" ? "1031" : "12001",
    name: rank, itemType: rank === "B" ? "音擎" : "代理人", rarity: rank,
    pulledAt: new Date(Date.UTC(2026, 0, 1, 0, sequence)).toISOString(),
    rank, pityPosition: null, pullsSincePreviousUp: null, isUp: null, guaranteeResult: null,
    ...extra,
  };
}

/** Records are given oldest → newest for readability; summaries store them newest first. */
function summary(oldestFirst: AnalyzedGachaRecord[], extra: Partial<GachaSummary> = {}): GachaSummary {
  const records = oldestFirst.slice().reverse();
  return {
    total: records.length, averageS: null, averageUp: null, winRate: null,
    currentPity: null, hardPity: 90, nextGuaranteed: null,
    sRecords: records.filter((record) => record.rank === "S"), records,
    ...extra,
  };
}

describe("buildPityCycles", () => {
  it("splits records at each S and returns newest first with the in-progress cycle on top", () => {
    const cycles = buildPityCycles(summary([
      rec("B"), rec("A"), rec("S", { pityPosition: 3, isUp: true }),
      rec("B"), rec("B"), rec("A"), rec("B"), rec("S", { pityPosition: 5, isUp: false }),
      rec("B"), rec("A"),
    ], { currentPity: 2 }));
    expect(cycles.map((cycle) => cycle.length)).toEqual([2, 5, 3]);
    expect(cycles[0].sRecord).toBeNull();
    expect(cycles[0].aPositions).toEqual([2]);
    expect(cycles[1]).toMatchObject({ aPositions: [3], lost: true });
    expect(cycles[2]).toMatchObject({ aPositions: [2], lost: false, partial: false });
  });

  it("has no in-progress cycle when the newest record is an S", () => {
    const cycles = buildPityCycles(summary([rec("B"), rec("S", { pityPosition: 2 })], { currentPity: 0 }));
    expect(cycles).toHaveLength(1);
    expect(cycles[0].sRecord).not.toBeNull();
  });

  it("marks the oldest cycle partial when pity is estimated", () => {
    const cycles = buildPityCycles(summary([
      rec("B"), rec("S", { pityPosition: 2 }), rec("B"), rec("S", { pityPosition: 2 }),
    ]), true);
    expect(cycles.map((cycle) => cycle.partial)).toEqual([false, true]);
  });

  it("marks the oldest cycle partial when its S pityPosition exceeds the records present", () => {
    const cycles = buildPityCycles(summary([rec("B"), rec("S", { pityPosition: 40 })]));
    expect(cycles[0]).toMatchObject({ length: 40, partial: true });
  });

  it("keeps an out-of-range pityPosition as the cycle length", () => {
    const records = Array.from({ length: 94 }, () => rec("B"));
    const cycles = buildPityCycles(summary([...records, rec("S", { pityPosition: 95 })]));
    expect(cycles[0].length).toBe(95);
  });

  it("returns an empty list for an empty summary", () => {
    expect(buildPityCycles(summary([]))).toEqual([]);
  });
});
