import { loadImage } from "@napi-rs/canvas";
import type { GachaStatCategory } from "../src/utilities/zzz/gachaStatApi.js";
import { emptyChannel, type SignalChannelModel, type SignalLogModel, type SignalSEntry } from "../src/utilities/zzz/signalLogModel.js";
import { renderSignalLogImage, signalLogImagePageCount } from "../src/utilities/zzz/signalLogRenderer.js";
import { statusTiles } from "../src/utilities/zzz/signalLogStatus.js";
import { wallHeight } from "../src/utilities/zzz/signalLogWall.js";

const CATEGORIES: GachaStatCategory[] = ["character_up", "character_return", "weapon_up", "weapon_return", "standard", "bangboo"];

function modelWith(count: number, options: { currentPity: number | null }): SignalLogModel {
  const channels = {} as SignalLogModel["channels"];
  for (const category of CATEGORIES) channels[category] = emptyChannel(category);
  const entries: SignalSEntry[] = Array.from({ length: count }, (_, index) => ({
    itemId: index % 2 ? "1091" : "1011", kind: "character", pity: 20 + (index % 70), isUp: index % 3 === 0, pulledAt: "2026-01-01T00:00:00.000Z",
  }));
  channels.character_up = {
    ...channels.character_up, hasRecords: count > 0 || options.currentPity !== null, total: count * 60, sCount: count, upCount: count ? 2 : null,
    averageS: count ? 60 : null, averageUpCost: count ? 90 : null, currentPity: options.currentPity,
    toHardPity: options.currentPity === null ? null : 90 - options.currentPity, guaranteed: options.currentPity === null ? null : true,
    entries, firstRecordAt: "2025-06-01T00:00:00.000Z",
  };
  return { channels, tickets: null };
}

const limitedChannel: SignalChannelModel = {
  ...emptyChannel("character_up"), hasRecords: true, total: 300, sCount: 4, upCount: 3, averageS: 70, averageUpCost: 100,
};
const standardChannel: SignalChannelModel = { ...emptyChannel("standard"), hasRecords: true, total: 300, sCount: 4, averageS: 70 };

describe("statusTiles", () => {
  it("shows four tiles on limited channels and three elsewhere", () => {
    expect(statusTiles(limitedChannel, "tw").map((tile) => [tile.label, tile.value, tile.unit]))
      .toEqual([["總抽數", "300", ""], ["平均出 S", "70", "抽"], ["UP / S", "3/4", ""], ["每個 UP 平均", "100", "抽"]]);
    expect(statusTiles(standardChannel, "tw").map((tile) => tile.label)).toEqual(["總抽數", "平均出 S", "S 數量"]);
    expect(statusTiles({ ...limitedChannel, sCount: 0, upCount: 0, averageS: null, averageUpCost: null }, "tw").map((tile) => tile.value))
      .toEqual(["300", "—", "0/0", "—"]);
  });

  it("formats totals with thousands separators", () => {
    expect(statusTiles({ ...limitedChannel, total: 2434 }, "tw")[0]!.value).toBe("2,434");
  });
});

describe("wall", () => {
  it("sizes the wall between three and five rows", () => {
    expect([1, 3, 5].map(wallHeight)).toEqual([680, 680, 950]);
  });

  it("pages 34 S-ranks after the live cell, then 35 per page", () => {
    const model = modelWith(80, { currentPity: 20 });
    expect(signalLogImagePageCount({ view: "wall", category: "character_up", model })).toBe(3);
  });

  it("renders the wall at 2x width within the height limits", async () => {
    for (const [count, pity] of [[0, null], [3, 20], [80, 20]] as const) {
      const image = await loadImage(await renderSignalLogImage({ uid: "1300000001", view: "wall", page: 0, category: "character_up", model: modelWith(count, { currentPity: pity }) }));
      expect(image.width).toBe(2000);
      expect(image.height).toBeGreaterThanOrEqual(1120);
      expect(image.height).toBeLessThanOrEqual(2200);
    }
  });

  it("clamps a page beyond the last one", async () => {
    await expect(renderSignalLogImage({ uid: "1", view: "wall", page: 99, category: "character_up", model: modelWith(3, { currentPity: 1 }) })).resolves.toBeInstanceOf(Buffer);
  });

  it("rejects views that are not built yet", async () => {
    await expect(renderSignalLogImage({ uid: "1", view: "home", page: 0, category: "character_up", model: modelWith(0, { currentPity: null }) })).rejects.toThrow("view not implemented");
  });
});
