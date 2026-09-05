import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { GachaSummary } from "../src/utilities/zzz/gachaAnalysis.js";
import { getZzzOfficialNumberFont } from "../src/utilities/zzz/canvasFonts.js";
import { renderSignalLog, __signalLogRendererInternals } from "../src/utilities/zzz/signalLogRenderer.js";

function emptySummary(): GachaSummary {
  return {
    total: 0, averageS: null, averageUp: null, winRate: null,
    currentPity: null, hardPity: 90, nextGuaranteed: null,
    sRecords: [], records: [],
  };
}

describe("official-style signal log renderer", () => {
  it("renders official overview with a resource section and manual overview without one", async () => {
    const shared = {
      uid: "130000001", playerName: "繩匠", archivedAt: "2026-09-04T00:00:00.000Z",
      category: "character_up" as const, bannerLabel: "3.1 測試卡池",
      summary: emptySummary(), view: "overview" as const, page: 0,
    };
    const official = await loadImage(await renderSignalLog({ ...shared, source: "official", details: { tickets: [] } }));
    const manual = await loadImage(await renderSignalLog({ ...shared, source: "manual" }));

    expect(__signalLogRendererInternals.outputScale).toBe(2);
    expect(official.width).toBe(2088);
    expect(manual.width).toBe(2088);
    expect(official.height - manual.height).toBe(140);
  });

  it("renders a 20-record S/A/B page as a large 5×4 grid across all supported card kinds", async () => {
    const summary = emptySummary();
    summary.total = 20;
    const itemTypes = ["代理人", "音擎", "邦布", ""];
    summary.records = Array.from({ length: 20 }, (_, index) => ({
      ownerId: "owner", uid: "uid", source: "manual" as const,
      gachaType: "1", channelCategory: "standard" as const, bannerId: null,
      recordId: String(index), itemId: "", name: `紀錄 ${index}`,
      itemType: itemTypes[index % itemTypes.length]!, rarity: index === 0 ? "4" : index === 1 ? "3" : "2",
      pulledAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      rank: index === 0 ? "S" as const : index === 1 ? "A" as const : "B" as const,
      pityPosition: index === 0 ? null : index,
      pullsSincePreviousUp: null, isUp: null, guaranteeResult: null,
    }));

    const image = await loadImage(await renderSignalLog({
      source: "manual", uid: "uid", category: "standard", bannerLabel: "未分類",
      summary, view: "records", page: 0,
    }));
    expect(image.width).toBe(2088);
    expect(image.height).toBe(2150);
  }, 15_000);

  it("places large record cards left-to-right across five columns before starting a new row", () => {
    expect(__signalLogRendererInternals.recordGridMetrics).toEqual({
      cardSize: 152, columns: 5, gap: 40,
      nameWidth: 184, nameSize: 14, nameLineHeight: 18,
      startX: 62, startY: 251,
    });
    expect(__signalLogRendererInternals.recordCardPlacement(0)).toEqual({ column: 0, row: 0, x: 62, y: 251 });
    expect(__signalLogRendererInternals.recordCardPlacement(4)).toEqual({ column: 4, row: 0, x: 830, y: 251 });
    expect(__signalLogRendererInternals.recordCardPlacement(5)).toEqual({ column: 0, row: 1, x: 62, y: 445 });
    expect(__signalLogRendererInternals.recordCardPlacement(19)).toEqual({ column: 4, row: 3, x: 830, y: 833 });
  });

  it("aligns S-record cards, names and progress bars with the current-pity row", () => {
    expect(__signalLogRendererInternals.overviewMetrics).toEqual({
      currentItemCenterX: 97,
      sRecordCardX: 59,
      contentX: 145,
      progressWidth: 685,
      officialInfoPanelHeight: 154,
      officialInfoBlockHeight: 170,
      officialInfoDividerY: 77,
    });
  });

  it("shrinks oversized information values instead of letting them reach a divider", () => {
    const ctx = createCanvas(400, 100).getContext("2d");
    const value = "999,999,999,999,999";
    const size = __signalLogRendererInternals.fittedNumberSize(ctx, value, 154, 30);
    expect(size).toBeLessThan(30);
    ctx.font = `${size}px ${getZzzOfficialNumberFont("tw")}`;
    expect(ctx.measureText(value).width).toBeLessThanOrEqual(154);
  });

  it("wraps complete item names without ellipses and grows only the affected record row", () => {
    const longName = "「電磁暴」超長完整音擎名稱用來驗證換行不省略";
    const regular = __signalLogRendererInternals.recordGridLayout(Array(5).fill("測試音擎"));
    const wrapped = __signalLogRendererInternals.recordGridLayout([
      longName, "測試音擎", "測試音擎", "測試音擎", "測試音擎",
    ]);
    const lines = wrapped.placements[0].name.lines;

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(longName);
    expect(lines.join("")).not.toContain("…");
    expect(wrapped.rowHeights[0]).toBeGreaterThan(regular.rowHeights[0]);
    expect(wrapped.height).toBeGreaterThan(regular.height);
  });

  it("keeps an empty compact-record page tall enough for its empty-state message", async () => {
    const image = await loadImage(await renderSignalLog({
      source: "manual", uid: "uid", category: "standard", bannerLabel: "未分類",
      summary: emptySummary(), view: "records", page: 0,
    }));

    expect(image.width).toBe(2088);
    expect(image.height).toBe(986);
  });

  it("maps official item URLs and hides unavailable values instead of inventing them", () => {
    const url = __signalLogRendererInternals.itemIcon({ itemId: "1021" } as any);
    expect(url).toContain("role_square_avatar_1021.png");
    expect(__signalLogRendererInternals.itemIcon({ itemId: "" } as any)).toBe("");
    expect(__signalLogRendererInternals.resultLabel({ isUp: null, guaranteeResult: "unknown" } as any)).toBe("無法判定");
    expect(__signalLogRendererInternals.recordPullLabel(39)).toBe("39");
    expect(__signalLogRendererInternals.recordPullLabel(null)).toBe("?");
    expect(__signalLogRendererInternals.recordPullNumberStyle).toEqual({
      fontSize: 20,
      lineWidth: 5,
      fill: "#fff",
      stroke: "rgba(0,0,0,.92)",
      insetX: 7,
      centerY: 18,
    });
    expect(__signalLogRendererInternals.coverPlacement(100, 200, 76, 76)).toEqual({
      x: 0, y: -38, width: 76, height: 152,
    });
    expect(__signalLogRendererInternals.coverPlacement(200, 100, 76, 76)).toEqual({
      x: -38, y: 0, width: 152, height: 76,
    });
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

  it("omits the current-pity strip after the first overview page", async () => {
    const summary = emptySummary();
    summary.currentPity = 20;
    summary.sRecords = Array.from({ length: 20 }, (_, index) => ({
      ownerId: "owner", uid: "uid", source: "manual" as const,
      gachaType: "2", channelCategory: "character_up" as const, bannerId: "banner",
      recordId: String(index), itemId: "", name: `S 紀錄 ${index}`,
      itemType: "代理人", rarity: "S", pulledAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      rank: "S" as const, pityPosition: 40, pullsSincePreviousUp: null,
      isUp: false, guaranteeResult: "lost" as const,
    }));
    const shared = {
      source: "manual" as const, uid: "uid", category: "character_up" as const,
      bannerLabel: "測試卡池", summary, view: "overview" as const,
    };
    const first = await loadImage(await renderSignalLog({ ...shared, page: 0 }));
    const second = await loadImage(await renderSignalLog({ ...shared, page: 1 }));
    expect(first.height - second.height).toBe(188);
  });

  it("uses the shared header for missing and multiple UP items", async () => {
    const shared = {
      source: "manual" as const, uid: "130000001", category: "character_up" as const,
      playerName: "這是一個很長的繩匠名稱用於測試截斷", archivedAt: "2026-09-04T00:00:00.000Z",
      bannerLabel: "一個很長的卡池名稱用於測試新版標題截斷行為",
      summary: emptySummary(), view: "overview" as const, page: 0, stale: true,
    };
    const missing = await loadImage(await renderSignalLog(shared));
    const multiple = await loadImage(await renderSignalLog({
      ...shared,
      banner: {
        name: "雙代理人頻道", version: "3.1", channelCategory: "character_up",
        upItems: [
          { id: "1091", name: "星見雅", icon: "", rarity: "S", itemType: "character" },
          { id: "1021", name: "貓又", icon: "", rarity: "S", itemType: "character" },
        ],
      },
    }));

    expect(missing.width).toBe(2088);
    expect(multiple.width).toBe(2088);
    expect(multiple.height).toBe(missing.height);
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
