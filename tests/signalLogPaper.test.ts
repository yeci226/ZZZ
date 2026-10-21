import type { AnalyzedGachaRecord, GachaSummary } from "../src/utilities/zzz/gachaAnalysis.js";
import type { GachaChannelCategory } from "../src/utilities/zzz/gachaArchive.js";
import { getZzzOfficialFont } from "../src/utilities/zzz/canvasFonts.js";
import { getPaperAccent } from "../src/utilities/zzz/profileColors.js";
import type { SignalLogRenderInput } from "../src/utilities/zzz/signalLogRenderer.js";
import {
  createScaledCanvas,
  fitWithFont,
  OUTPUT_SCALE,
  PAPER,
  resolveHeroArt,
  signalAccent,
  WIDTH,
} from "../src/utilities/zzz/signalLogPaper.js";

function sRecord(itemId: string): AnalyzedGachaRecord {
  return {
    ownerId: "owner", uid: "uid", source: "official", gachaType: "2", recordId: itemId,
    itemId, name: itemId, itemType: "代理人", rarity: "S", pulledAt: "2026-01-01T00:00:00.000Z",
    rank: "S", pityPosition: 50, pullsSincePreviousUp: null, isUp: true, guaranteeResult: null,
  };
}

function input(options: {
  category?: GachaChannelCategory;
  up?: string;
  upType?: "character" | "weapon" | "bangboo";
  elementType?: number;
  sRecords?: AnalyzedGachaRecord[];
}): SignalLogRenderInput {
  const sRecords = options.sRecords ?? [];
  const summary: GachaSummary = {
    total: sRecords.length, averageS: null, averageUp: null, winRate: null,
    currentPity: null, hardPity: 90, nextGuaranteed: null, sRecords, records: sRecords,
  };
  return {
    source: "official", uid: "uid", category: options.category ?? "character_up", bannerLabel: "測試",
    banner: options.up === undefined && options.elementType === undefined ? undefined : {
      name: "", version: "3.1", channelCategory: options.category ?? "character_up",
      upItems: [{
        id: options.up ?? "", name: "UP", icon: "", rarity: "S",
        itemType: options.upType ?? "character", elementType: options.elementType,
      }],
    },
    summary, view: "overview", page: 0,
  };
}

describe("signal log paper primitives", () => {
  it("uses a 1000-wide canvas at twice the output scale", () => {
    expect(WIDTH).toBe(1000);
    expect(OUTPUT_SCALE).toBe(2);
    expect(createScaledCanvas(10).canvas.width).toBe(2000);
  });

  it("derives the accent from the first UP item's element", () => {
    expect(signalAccent(input({ elementType: 202 }))).toBe(getPaperAccent("#05777a"));
    expect(signalAccent(input({}))).toBe(PAPER.defaultAccent);
    expect(PAPER.defaultAccent).toBe("#de493e");
  });

  it("uses the UP agent portrait for character pools", async () => {
    expect(await resolveHeroArt(input({ category: "character_up", up: "1091" }))).not.toBeNull();
  });

  it("uses the UP W-Engine art for W-Engine pools", async () => {
    expect(await resolveHeroArt(input({ category: "weapon_up", up: "14109", upType: "weapon" }))).not.toBeNull();
  });

  it("falls back to the newest S agent when the banner has no UP art", async () => {
    expect(await resolveHeroArt(input({ category: "character_up", sRecords: [sRecord("1021")] }))).not.toBeNull();
  });

  it("falls back to the newest S agent when the UP portrait file is missing", async () => {
    expect(await resolveHeroArt(input({ up: "9999", sRecords: [sRecord("1091")] }))).not.toBeNull();
  });

  it("returns null when nothing resolves", async () => {
    expect(await resolveHeroArt(input({ category: "weapon_up", up: "99999", upType: "weapon" }))).toBeNull();
  });

  it("fits long titles within their width", () => {
    const { ctx } = createScaledCanvas(10);
    const fitted = fitWithFont(ctx, "很長的卡池名稱".repeat(10), 300, 32);
    ctx.font = `32px ${getZzzOfficialFont("tw")}`;
    expect(ctx.measureText(fitted).width).toBeLessThanOrEqual(300);
  });
});
