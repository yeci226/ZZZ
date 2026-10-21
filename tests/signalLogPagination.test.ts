import type { AnalyzedGachaRecord, GachaRank, GachaSummary } from "../src/utilities/zzz/gachaAnalysis.js";
import {
  normalizeSignalLogView,
  paginateSignalBannerChoices,
  paginateSignalBannerChoicesWithPinned,
  signalLogPageCount,
  switchSignalLogView,
} from "../src/utilities/zzz/signalLogPagination.js";

describe("signal log banner pagination", () => {
  const choices = Array.from({ length: 51 }, (_, index) => ({
    label: `3.${index} 卡池`, value: `banner-${index}`,
  }));

  it("uses Discord's 25-option limit and pages newest-to-oldest", () => {
    expect(paginateSignalBannerChoices(choices, 0)).toMatchObject({
      page: 0, pages: 3, items: choices.slice(0, 25),
    });
    expect(paginateSignalBannerChoices(choices, 1).items).toEqual(choices.slice(25, 50));
    expect(paginateSignalBannerChoices(choices, 2).items).toEqual(choices.slice(50));
  });

  it("clamps forged or stale page numbers", () => {
    expect(paginateSignalBannerChoices(choices, 99).page).toBe(2);
    expect(paginateSignalBannerChoices(choices, -3).page).toBe(0);
    expect(paginateSignalBannerChoices([], 8)).toEqual({ items: [], page: 0, pages: 1 });
  });

  it("pins the all-history option while reserving 24 slots for banners", () => {
    const all = { label: "全部紀錄", value: "__all__" };
    const first = paginateSignalBannerChoicesWithPinned(choices, 0, all);
    const second = paginateSignalBannerChoicesWithPinned(choices, 1, all);
    expect(first.items).toEqual([all, ...choices.slice(0, 24)]);
    expect(second.items).toEqual([all, ...choices.slice(24, 48)]);
    expect(first.items).toHaveLength(25);
    expect(first.pages).toBe(3);
  });
});

function summaryOf(oldestFirst: GachaRank[]): GachaSummary {
  const records = oldestFirst.map((rank, index) => ({ rank, recordId: String(index) }) as AnalyzedGachaRecord).reverse();
  return {
    total: records.length, averageS: null, averageUp: null, winRate: null,
    currentPity: null, hardPity: 90, nextGuaranteed: null,
    sRecords: records.filter((record) => record.rank === "S"), records,
  };
}

describe("signal log view pages", () => {
  const sThenOpen = (sCount: number) => summaryOf([
    ...Array.from({ length: sCount }, () => ["B", "S"] as GachaRank[]).flat(), "B", "B", "B",
  ]);

  it("counts overview pages from S records and cycle pages from pity cycles", () => {
    expect(signalLogPageCount(sThenOpen(11), "overview")).toBe(2);
    expect(signalLogPageCount(sThenOpen(11), "records")).toBe(2);
    expect(signalLogPageCount(sThenOpen(10), "overview")).toBe(1);
    expect(signalLogPageCount(sThenOpen(10), "records")).toBe(2);
  });

  it("does not count an open cycle that is not the channel's live pity", () => {
    expect(signalLogPageCount(sThenOpen(10), "records", false, false)).toBe(1);
  });

  it("never returns fewer than one page", () => {
    expect(signalLogPageCount(summaryOf([]), "overview")).toBe(1);
    expect(signalLogPageCount(summaryOf([]), "records")).toBe(1);
  });

  it("switches view and resets the page to zero", () => {
    expect(switchSignalLogView("overview")).toEqual({ view: "records", page: 0 });
    expect(switchSignalLogView("records")).toEqual({ view: "overview", page: 0 });
  });

  it("normalizes unknown persisted views to overview", () => {
    expect(normalizeSignalLogView("records")).toBe("records");
    expect(normalizeSignalLogView("grid")).toBe("overview");
    expect(normalizeSignalLogView(null)).toBe("overview");
  });
});
