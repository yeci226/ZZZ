import { loadImage } from "@napi-rs/canvas";
import { emptyChannel, UNCLASSIFIED_SEGMENT_KEY, type SignalLogModel, type SignalSegment } from "../src/utilities/zzz/signalLogModel.js";
import { renderSignalLogImage, signalLogImagePageCount } from "../src/utilities/zzz/signalLogRenderer.js";
import { paginateSegments, segmentSummary, segmentTitle, sliceHeight } from "../src/utilities/zzz/signalLogVersions.js";

function seg(version: string, count: number, extra: Partial<SignalSegment> = {}): SignalSegment {
  return {
    key: version, version, upNames: [], startAt: null, endAt: null, ongoing: false, pulls: null,
    entries: Array.from({ length: count }, (_, index) => ({
      itemId: index % 2 ? "1091" : "1011", kind: "character" as const, pity: 20 + index, isUp: index < 3, pulledAt: "2026-01-01T00:00:00.000Z",
    })),
    ...extra,
  };
}

function modelOf(segments: SignalSegment[]): SignalLogModel {
  const channels = {} as SignalLogModel["channels"];
  for (const category of ["character_up", "character_return", "weapon_up", "weapon_return", "standard", "bangboo"] as const) channels[category] = emptyChannel(category);
  channels.character_up = {
    ...channels.character_up, hasRecords: true, total: 300, sCount: 6, upCount: 4, averageS: 70, averageUpCost: 100,
    entries: segments.flatMap((segment) => segment.entries), segments, firstRecordAt: "2025-06-01T00:00:00.000Z",
  };
  return { channels, tickets: null };
}

const versionedModel = modelOf([
  seg("3.3", 0, { key: "3.3:2", upNames: ["賽維里安", "諾姆"], startAt: "2026-11-11T04:00:00.000Z", endAt: "2026-12-01T03:59:59.000Z", ongoing: true }),
  seg("3.3", 4, { key: "3.3:1", upNames: ["菲歐妮", "維琳娜"], startAt: "2026-10-21T02:00:00.000Z", endAt: "2026-11-11T03:59:59.000Z" }),
  seg("3.2", 0),
  seg("3.1", 4),
  seg("3.0", 2),
]);

describe("paginateSegments", () => {
  it("measures a slice by its header and rows", () => {
    expect([0, 1, 7, 8].map((count) => sliceHeight({ segment: seg("3.1", count), entries: seg("3.1", count).entries, continued: false })))
      .toEqual([34, 34 + 126, 34 + 126, 34 + 126 + 9 + 126]);
  });

  it("packs whole segments into a page and starts a new page when the next one does not fit", () => {
    const pages = paginateSegments([seg("3.4", 7), seg("3.3", 7), seg("3.2", 7), seg("3.1", 7)]);
    expect(pages.map((page) => page.map((slice) => slice.segment.version))).toEqual([["3.4", "3.3", "3.2"], ["3.1"]]);
  });

  it("splits a segment that is larger than a page and marks the rest as continued", () => {
    const pages = paginateSegments([seg("2.1", 40)]);
    expect(pages.map((page) => page.map((slice) => [slice.entries.length, slice.continued]))).toEqual([[[28, false]], [[12, true]]]);
  });

  it("keeps empty versions as header-only slices and returns one empty page for no segments", () => {
    expect(paginateSegments([seg("3.2", 0)])[0]![0]!.entries).toEqual([]);
    expect(paginateSegments([])).toEqual([[]]);
  });
});

describe("segment text", () => {
  it("titles segments", () => {
    expect(segmentTitle(seg("3.3", 1, { upNames: ["菲歐妮", "維琳娜"], startAt: "2026-10-21T02:00:00.000Z", endAt: "2026-11-11T03:59:59.000Z" }), "tw")).toBe("3.3  菲歐妮／維琳娜  10/21–11/11");
    expect(segmentTitle(seg("3.1", 4), "tw")).toBe("3.1");
    expect(segmentTitle(seg("", 1, { key: UNCLASSIFIED_SEGMENT_KEY, upNames: ["未分類"] }), "tw")).toBe("未分類");
  });

  it("summarises segments", () => {
    expect(segmentSummary(seg("3.1", 4), true, "tw")).toBe("4 個 S · 3 UP");
    expect(segmentSummary(seg("3.1", 4), false, "tw")).toBe("4 個 S");
    expect(segmentSummary(seg("3.2", 0), true, "tw")).toBe("沒出 S");
    expect(segmentSummary(seg("3.0", 2, { pulls: 120 }), true, "tw")).toBe("120 抽 · 2 個 S · 2 UP");
    expect(segmentSummary(seg("3.2", 0, { pulls: 40 }), true, "tw")).toBe("40 抽 · 沒出 S");
  });
});

describe("renderSignalVersions", () => {
  it("renders a version page within the height limits", async () => {
    const image = await loadImage(await renderSignalLogImage({ uid: "1", view: "versions", page: 0, category: "character_up", model: versionedModel }));
    expect(image.width).toBe(2000);
    expect(image.height).toBeGreaterThanOrEqual(1120);
    expect(image.height).toBeLessThanOrEqual(2200);
  });

  it("renders the empty state, a clamped page and counts pages", async () => {
    const empty = modelOf([]);
    expect(signalLogImagePageCount({ view: "versions", category: "character_up", model: empty })).toBe(1);
    await expect(renderSignalLogImage({ uid: "1", view: "versions", page: 9, category: "character_up", model: empty, stale: true, locale: "tw" })).resolves.toBeInstanceOf(Buffer);
    const long = modelOf([seg("2.1", 40)]);
    expect(signalLogImagePageCount({ view: "versions", category: "character_up", model: long })).toBe(2);
    await expect(renderSignalLogImage({ uid: "1", view: "versions", page: 1, category: "character_up", model: long })).resolves.toBeInstanceOf(Buffer);
  });
});
