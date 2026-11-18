import type { AnalyzedGachaRecord, GachaRank, GachaSummary } from "../src/utilities/zzz/gachaAnalysis.js";
import { loadImage } from "@napi-rs/canvas";
import { buildPityCycles } from "../src/utilities/zzz/signalLogCycleData.js";
import { emptyChannel, type SignalLogModel } from "../src/utilities/zzz/signalLogModel.js";
import { renderSignalLogImage, signalLogImagePageCount } from "../src/utilities/zzz/signalLogRenderer.js";

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
    total: records.length, averageS: null, averageUp: null, winRate: null, upWins: 0, upEligible: 0, averageUpCost: null,
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

  it("shifts A positions past pulls that happened before the first archived record", () => {
    const [cycle] = buildPityCycles(summary([rec("B"), rec("A"), rec("S", { pityPosition: 40 })]));
    expect(cycle).toMatchObject({ length: 40, aPositions: [39], unknownPulls: 37, partial: true });
  });

  it("drops the open cycle when the filtered records do not reach the channel's newest pull", () => {
    const records = summary([rec("B"), rec("S", { pityPosition: 2 }), rec("B"), rec("A")]);
    expect(buildPityCycles(records, false, false).map((cycle) => cycle.sRecord?.rank)).toEqual(["S"]);
    expect(buildPityCycles(records, false, true)[0]!.sRecord).toBeNull();
  });

  it("marks the oldest cycle partial when its pity position is unknown", () => {
    const [cycle] = buildPityCycles(summary([rec("B"), rec("S", { pityPosition: null })]));
    expect(cycle).toMatchObject({ length: 2, partial: true });
  });
});

function summaryWithOpenPulls(open: number): GachaSummary {
  return summary([rec("B"), rec("S", { pityPosition: 2, isUp: true }), ...Array.from({ length: open }, (_, i) => rec(i % 10 === 4 ? "A" : "B"))]);
}

describe("buildPityCycles live pity", () => {
  it("uses the live pity for the open cycle when one is supplied", () => {
    const records = summaryWithOpenPulls(18);
    expect(buildPityCycles(records, false, true)[0]!.length).toBe(18);
    expect(buildPityCycles(records, false, true, 20)[0]!.length).toBe(20);
    expect(buildPityCycles(records, false, false, 20)[0]!.sRecord).not.toBeNull();
  });

  it("adds an open cycle when the live pity is positive but no open pulls are archived", () => {
    const records = summary([rec("B"), rec("S", { pityPosition: 2 })]);
    const cycles = buildPityCycles(records, false, true, 7);
    expect(cycles[0]).toMatchObject({ length: 7, sRecord: null, aPositions: [] });
    expect(buildPityCycles(records, false, true, 0)).toHaveLength(1);
    expect(buildPityCycles(records, false, true, null)).toHaveLength(1);
  });

  it("keeps the archived open cycle when the live pity is zero", () => {
    expect(buildPityCycles(summaryWithOpenPulls(3), false, true, 0)[0]).toMatchObject({ length: 3, sRecord: null });
  });
});

function modelFor(category: "character_up" | "standard" = "character_up"): SignalLogModel {
  const channels = {} as SignalLogModel["channels"];
  for (const key of ["character_up", "character_return", "weapon_up", "weapon_return", "standard", "bangboo"] as const) channels[key] = emptyChannel(key);
  channels[category] = { ...channels[category], hasRecords: true, total: 200, sCount: 3, currentPity: 20, toHardPity: 70, firstRecordAt: "2025-06-01T00:00:00.000Z" };
  return { channels, tickets: null };
}

function manyCycles(count: number): GachaSummary {
  const records: AnalyzedGachaRecord[] = [];
  for (let i = 0; i < count; i++) records.push(rec("B"), rec("A"), rec("S", { pityPosition: 20 + (i * 13) % 70, isUp: i % 2 === 0 }));
  return summary(records);
}

describe("cycles view", () => {
  const cycles = (records: GachaSummary) => ({ summary: records, pityEstimated: false, openCycleIsLive: true, bannerLabel: null });

  it("renders pity cycles inside the poster frame", async () => {
    for (const category of ["character_up", "standard"] as const) {
      const image = await loadImage(await renderSignalLogImage({ uid: "1", view: "cycles", page: 0, category, model: modelFor(category), cycles: cycles(manyCycles(12)) }));
      expect(image.width).toBe(2000);
      expect(image.height).toBeGreaterThanOrEqual(1120);
      expect(image.height).toBeLessThanOrEqual(2200);
    }
  });

  it("renders an empty state when there are no archived pulls", async () => {
    const empty = summary([]);
    const image = await loadImage(await renderSignalLogImage({ uid: "1", view: "cycles", page: 0, category: "character_up", model: modelFor(), cycles: cycles(empty) }));
    expect(image.width).toBe(2000);
    expect(image.height).toBeGreaterThanOrEqual(1120);
  });

  it("counts ten cycles per page, including the live open cycle", () => {
    const model = modelFor();
    expect(signalLogImagePageCount({ view: "cycles", category: "character_up", model, cycles: cycles(manyCycles(12)) })).toBe(2);
    expect(signalLogImagePageCount({ view: "cycles", category: "character_up", model, cycles: cycles(summary([])) })).toBe(1);
    expect(signalLogImagePageCount({ view: "cycles", category: "character_up", model })).toBe(1);
  });

  it("rejects when the cycles input is missing", async () => {
    await expect(renderSignalLogImage({ uid: "1", view: "cycles", page: 0, category: "character_up", model: modelFor() })).rejects.toThrow();
  });
});
