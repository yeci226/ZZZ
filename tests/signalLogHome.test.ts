import { loadImage } from "@napi-rs/canvas";
import type { GachaStatCategory } from "../src/utilities/zzz/gachaStatApi.js";
import { emptyChannel, type SignalLogModel, type SignalSEntry } from "../src/utilities/zzz/signalLogModel.js";
import { homeHeight, ticketCells } from "../src/utilities/zzz/signalLogHome.js";
import { renderSignalLogImage, signalLogImagePageCount } from "../src/utilities/zzz/signalLogRenderer.js";

const CATEGORIES: GachaStatCategory[] = ["character_up", "character_return", "weapon_up", "weapon_return", "standard", "bangboo"];
const tickets = { monochrome: 100, polychrome: 1600, encrypted: 3, original: 0, boopon: 7, pullsAvailable: 13 };

function entries(count: number): SignalSEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    itemId: index % 2 ? "1091" : "1011", kind: "character", pity: 20 + index * 9, isUp: index % 2 === 0, pulledAt: "2026-01-01T00:00:00.000Z",
  }));
}

function modelWith(active: GachaStatCategory[], withTickets: boolean): SignalLogModel {
  const channels = {} as SignalLogModel["channels"];
  for (const category of CATEGORIES) channels[category] = emptyChannel(category);
  active.forEach((category, index) => {
    channels[category] = {
      ...channels[category], hasRecords: true, total: 300 + index, sCount: index === 3 ? 0 : 5, currentPity: index === 3 ? null : 30 + index * 20,
      guaranteed: channels[category].limited ? index % 2 === 0 : null, entries: index === 3 ? [] : entries(6),
      firstRecordAt: "2025-06-15T00:00:00.000Z",
    };
  });
  return { channels, tickets: withTickets ? tickets : null };
}

const allEmptyModel = modelWith([], false);
const fourActiveWithTickets = modelWith(["character_up", "weapon_up", "standard", "bangboo"], true);

describe("signal log home", () => {
  it("lists five tickets, or four when monochrome is unknown", () => {
    expect(ticketCells(tickets, "tw")).toEqual([
      { label: "菲林底片", value: "100" }, { label: "菲林", value: "1,600" }, { label: "加密母帶", value: "3" },
      { label: "原裝母帶", value: "0" }, { label: "邦布券", value: "7" },
    ]);
    expect(ticketCells({ ...tickets, monochrome: null }, "tw").map((cell) => cell.label)).toEqual(["菲林", "加密母帶", "原裝母帶", "邦布券"]);
  });

  it("uses half-height rows for empty channels and never goes below the minimum height", () => {
    expect(homeHeight(allEmptyModel)).toBe(560);
    expect(homeHeight(fourActiveWithTickets)).toBe(16 + 66 + 10 + 4 * 94 + 2 * 44 + 5 * 9 + 42);
    expect(homeHeight({ ...fourActiveWithTickets, tickets: null })).toBe(16 + 4 * 94 + 2 * 44 + 5 * 9 + 42);
  });

  it("renders the home page for full, ticketless, stale and empty accounts", async () => {
    const cases = [
      { model: fourActiveWithTickets, archivedAt: "2026-11-18T00:15:00.000Z" },
      { model: { ...fourActiveWithTickets, tickets: null }, stale: true },
      { model: allEmptyModel },
    ];
    for (const item of cases) {
      const image = await loadImage(await renderSignalLogImage({ uid: "1300000001", view: "home", page: 0, category: "character_up", locale: "tw", ...item }));
      expect(image.width).toBe(2000);
      expect(image.height).toBeGreaterThanOrEqual(1120);
      expect(image.height).toBeLessThanOrEqual(2200);
    }
  });

  it("reports a single page for home", () => {
    expect(signalLogImagePageCount({ view: "home", category: "character_up", model: fourActiveWithTickets })).toBe(1);
  });
});
