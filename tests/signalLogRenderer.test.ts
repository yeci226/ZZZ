import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { GachaSummary } from "../src/utilities/zzz/gachaAnalysis.js";
import { getZzzOfficialNumberFont } from "../src/utilities/zzz/canvasFonts.js";
import { renderSignalLog, __signalLogRendererInternals } from "../src/utilities/zzz/signalLogRenderer.js";
import { signalText } from "../src/utilities/zzz/recordText.js";

function emptySummary(): GachaSummary {
  return {
    total: 0, averageS: null, averageUp: null, winRate: null,
    currentPity: null, hardPity: 90, nextGuaranteed: null,
    sRecords: [], records: [],
  };
}

describe("official-style signal log renderer", () => {
  it("shrinks oversized information values instead of letting them reach a divider", () => {
    const ctx = createCanvas(400, 100).getContext("2d");
    const value = "999,999,999,999,999";
    const size = __signalLogRendererInternals.fittedNumberSize(ctx, value, 154, 30);
    expect(size).toBeLessThan(30);
    ctx.font = `${size}px ${getZzzOfficialNumberFont("tw")}`;
    expect(ctx.measureText(value).width).toBeLessThanOrEqual(154);
  });

  it("maps official item URLs", () => {
    const url = __signalLogRendererInternals.itemIcon({ itemId: "1021" } as any);
    expect(url).toContain("role_square_avatar_1021.png");
    expect(__signalLogRendererInternals.itemIcon({ itemId: "" } as any)).toBe("");
  });

  it("selects the correct shared GtCard kind without inventing unknown metadata", () => {
    expect(__signalLogRendererInternals.gtCardKind("代理人", "1091")).toBe("character");
    expect(__signalLogRendererInternals.gtCardKind("音擎", "12001")).toBe("weapon");
    expect(__signalLogRendererInternals.gtCardKind("邦布", "50001")).toBe("bangboo");
    expect(__signalLogRendererInternals.gtCardKind("", "not-an-id")).toBe("unknown");

    const input = {
      source: "official", uid: "uid", category: "character_up", bannerLabel: "測試",
      summary: emptySummary(), view: "overview", page: 0,
      banner: {
        name: "測試", version: "3.1", channelCategory: "character_up",
        upItems: [{
          id: "1091", name: "星見雅", icon: "official.png", rarity: "S", itemType: "character",
          elementType: 202, subElementType: 201, profession: 3,
        }],
      },
    } as any;
    expect(__signalLogRendererInternals.gtCardSource(input, {
      id: "1091", itemType: "代理人", rarity: "S",
    })).toMatchObject({ icon: "official.png", elementType: 202, subElementType: 201, profession: 3 });
    expect(__signalLogRendererInternals.gtCardSource(input, {
      id: "1021", itemType: "代理人", rarity: "S",
    })).toEqual({ id: "1021", itemType: "代理人", rarity: "S", icon: undefined,
      elementType: undefined, subElementType: undefined, profession: undefined });
  });

  it("groups selected-banner S items and sorts every UP item first", () => {
    const summary = emptySummary();
    summary.sRecords = [
      { itemId: "1021", name: "貓又", itemType: "代理人", isUp: false } as any,
      { itemId: "1091", name: "星見雅", itemType: "代理人", isUp: true } as any,
      { itemId: "1091", name: "星見雅", itemType: "代理人", isUp: true } as any,
    ];
    const items = __signalLogRendererInternals.sItemCounts({
      source: "official", uid: "uid", category: "character_up", bannerLabel: "星見雅",
      summary, view: "overview", page: 0,
      banner: { name: "星見雅", version: "3.1", channelCategory: "character_up", upItems: [] },
    });
    expect(items.map((item) => [item.name, item.count, item.isUp])).toEqual([
      ["星見雅", 2, true], ["貓又", 1, false],
    ]);
  });

  it("carries known banner metadata into the selected-banner S summary only", () => {
    const summary = emptySummary();
    summary.sRecords = [
      { itemId: "1091", name: "星見雅", itemType: "代理人", isUp: true } as any,
      { itemId: "1021", name: "貓又", itemType: "代理人", isUp: false } as any,
    ];
    const items = __signalLogRendererInternals.sItemCounts({
      source: "official", uid: "uid", category: "character_up", bannerLabel: "星見雅",
      summary, view: "overview", page: 0,
      banner: { name: "星見雅", version: "3.1", channelCategory: "character_up", upItems: [{
        id: "1091", name: "星見雅", icon: "", rarity: "S", itemType: "character",
        elementType: 202, subElementType: 201, profession: 3,
      }] },
    });
    expect(items[0]).toMatchObject({ name: "星見雅", elementType: 202, subElementType: 201, profession: 3 });
    expect(items[1]).toMatchObject({ name: "貓又" });
    expect(items[1].elementType).toBeUndefined();
    expect(items[1].profession).toBeUndefined();
  });

  it("uses the supplied newest S-rank Bangboo as the single header item", () => {
    const summary = emptySummary();
    summary.sRecords = [{
      itemId: "54010", name: "較舊邦布", itemType: "邦布", rarity: "S", isUp: true,
    } as any];
    const input = {
      source: "official", uid: "uid", category: "bangboo", bannerLabel: "邦布頻道",
      summary, view: "overview", page: 0,
      headerItem: { id: "54023", name: "最近邦布", itemType: "bangboo", rarity: "S" },
      banner: {
        name: "行事曆邦布", version: "3.1", channelCategory: "bangboo",
        upItems: [{ id: "54099", name: "行事曆項目", icon: "", rarity: "S", itemType: "bangboo" }],
      },
    } as any;

    expect(__signalLogRendererInternals.bannerUpItems(input)).toEqual([input.headerItem]);
    expect(__signalLogRendererInternals.bannerUpItems({ ...input, headerItem: undefined })[0])
      .toMatchObject({ id: "54010", name: "較舊邦布", itemType: "bangboo", rarity: "S" });
    expect(__signalLogRendererInternals.bannerUpItems({
      ...input, headerItem: undefined, summary: emptySummary(),
    })).toEqual([]);
  });
});

function sRecords(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ownerId: "owner", uid: "uid", source: "manual" as const,
    gachaType: "2", channelCategory: "character_up" as const, bannerId: "banner",
    recordId: String(index), itemId: index % 2 ? "1021" : "1091", name: index % 2 ? "貓又" : "星見雅",
    itemType: "代理人", rarity: "S", pulledAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    rank: "S" as const, pityPosition: 40 + index, pullsSincePreviousUp: null,
    isUp: index % 2 === 0, guaranteeResult: null,
  }));
}

describe("paper-style signal log overview", () => {
  const shared = {
    uid: "130000001", playerName: "繩匠", archivedAt: "2026-09-04T00:00:00.000Z",
    category: "character_up" as const, bannerLabel: "3.1 測試卡池",
    summary: emptySummary(), view: "overview" as const, page: 0,
  };

  it("adds a resource row only for official archives with ticket data", async () => {
    const tickets = [{ ticket_type: "TICKET_TYPE_POLYCHROME", ticket_cnt: 8240 }];
    const official = await loadImage(await renderSignalLog({ ...shared, source: "official", details: { tickets } }));
    const noTickets = await loadImage(await renderSignalLog({ ...shared, source: "official", details: { tickets: [] } }));
    const manual = await loadImage(await renderSignalLog({ ...shared, source: "manual" }));
    const { resourceRowHeight } = __signalLogRendererInternals.overviewMetrics;
    expect(official.width).toBe(2000);
    expect(official.height - manual.height).toBe(resourceRowHeight * 2);
    expect(noTickets.height).toBe(manual.height);
  });

  it("shows the current pity card only on the first page", () => {
    const summary = { ...emptySummary(), currentPity: 20, sRecords: sRecords(12) };
    const labels = (page: number) => __signalLogRendererInternals.overviewStatCards({
      ...shared, locale: "tw", source: "manual", summary, page,
    }).map(([label]) => label);
    expect(labels(0)).toContain(signalText("tw").currentPity);
    expect(labels(1)).not.toContain(signalText("tw").currentPity);
    expect(labels(1)).toHaveLength(4);
  });

  it("badges only UP S-ranks with TOP", () => {
    const { hasTopBadge } = __signalLogRendererInternals;
    expect(hasTopBadge({ isUp: true } as any)).toBe(true);
    expect(hasTopBadge({ isUp: false } as any)).toBe(false);
    expect(hasTopBadge({ isUp: null } as any)).toBe(false);
  });

  it("shows a dash for UP-only stats in the standard pool", () => {
    const label = signalText("tw").averageUp;
    const entries = __signalLogRendererInternals.statsEntries({ ...emptySummary(), averageUp: 60 }, "standard", "tw");
    expect(entries.find(([entry]) => entry === label)?.[1]).toBe("—");
  });

  it("renders without throwing when no hero art resolves", async () => {
    await expect(renderSignalLog({ ...shared, source: "manual", category: "weapon_up" })).resolves.toBeInstanceOf(Buffer);
  });

  it("renders an empty-state overview taller than the banner", async () => {
    const image = await loadImage(await renderSignalLog({ ...shared, source: "manual" }));
    expect(image.height).toBeGreaterThan(300 * 2);
  });

  it("lays out ten S records per page in two columns", async () => {
    const summary = { ...emptySummary(), sRecords: sRecords(12) };
    const first = await loadImage(await renderSignalLog({ ...shared, source: "manual", summary, page: 0 }));
    const second = await loadImage(await renderSignalLog({ ...shared, source: "manual", summary, page: 1 }));
    expect(first.height).toBeGreaterThan(second.height);
  }, 15_000);

  it("keeps long titles and player names from changing the banner height", async () => {
    const long = {
      ...shared, source: "manual" as const, stale: true,
      playerName: "這是一個很長的繩匠名稱用於測試截斷",
      bannerLabel: "一個很長的卡池名稱用於測試新版標題截斷行為",
    };
    const plain = await loadImage(await renderSignalLog({ ...shared, source: "manual" }));
    const stretched = await loadImage(await renderSignalLog(long));
    expect(stretched.height).toBe(plain.height);
  });
});

describe("pity cycle view", () => {
  const { cycleTrackCells } = __signalLogRendererInternals;
  const sRecord = sRecords(1)[0]!;

  it("maps a cycle onto exactly hardPity track cells", () => {
    const cells = cycleTrackCells({ length: 5, aPositions: [3], sRecord, lost: false, partial: false, unknownPulls: 0 }, 80);
    expect(cells).toHaveLength(80);
    expect(cells.slice(0, 6)).toEqual(["b", "b", "a", "b", "s", "empty"]);
  });

  it("leaves pulls before the archive empty instead of drawing them as B", () => {
    expect(cycleTrackCells({ length: 5, aPositions: [4], sRecord, lost: false, partial: true, unknownPulls: 2 }, 90).slice(0, 6))
      .toEqual(["empty", "empty", "b", "a", "s", "empty"]);
  });

  it("marks in-progress cells as current", () => {
    expect(cycleTrackCells({ length: 2, aPositions: [], sRecord: null, lost: false, partial: false, unknownPulls: 0 }, 90).slice(0, 3))
      .toEqual(["current", "current", "empty"]);
  });

  it("clamps cycles longer than hardPity without overflowing", () => {
    const cells = cycleTrackCells({ length: 95, aPositions: [], sRecord, lost: false, partial: true, unknownPulls: 0 }, 90);
    expect(cells).toHaveLength(90);
    expect(cells.at(-1)).toBe("s");
  });

  it("renders ten cycles per page at the expected width", async () => {
    const records = sRecords(12).map((record) => ({ ...record, pityPosition: 1 }));
    const summary = { ...emptySummary(), sRecords: records, records };
    const shared = {
      source: "manual" as const, uid: "uid", category: "character_up" as const, bannerLabel: "測試",
      summary, view: "records" as const,
    };
    const first = await loadImage(await renderSignalLog({ ...shared, page: 0 }));
    const second = await loadImage(await renderSignalLog({ ...shared, page: 1 }));
    expect(first.width).toBe(2000);
    expect(first.height).toBeGreaterThan(second.height);
  }, 15_000);

  it("renders an empty cycle page and an overlong cycle without throwing", async () => {
    const shared = { source: "manual" as const, uid: "uid", category: "character_up" as const, bannerLabel: "測試", page: 0, view: "records" as const };
    await expect(renderSignalLog({ ...shared, summary: emptySummary() })).resolves.toBeInstanceOf(Buffer);
    const overlong = [{ ...sRecord, pityPosition: 95 }];
    await expect(renderSignalLog({ ...shared, summary: { ...emptySummary(), sRecords: overlong, records: overlong } }))
      .resolves.toBeInstanceOf(Buffer);
  });
});
