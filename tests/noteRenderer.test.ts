import { loadImage } from "@napi-rs/canvas";
import {
  __noteRendererInternals,
  renderOfficialNote,
} from "../src/utilities/zzz/noteRenderer";

describe("official note renderer helpers", () => {
  it("formats countdowns in the official compact style", () => {
    expect(__noteRendererInternals.secondsLabel(3 * 86400 + 5 * 3600, "tw")).toBe("3天05小時");
    expect(__noteRendererInternals.secondsLabel(0, "tw")).toBe("少於1分鐘");
  });

  it("normalizes activity lists", () => {
    const list = [{ activity_id: 1 }];
    expect(__noteRendererInternals.activityList({ activity_list: list })).toBe(list);
    expect(__noteRendererInternals.activityList(null)).toEqual([]);
  });

  it("uses semantic colors for complete, active and actionable states", () => {
    expect(__noteRendererInternals.NOTE_COLORS).toMatchObject({
      complete: "#83E3A5",
      progress: "#79CFFF",
      action: "#F4D52D",
      label: "#C8CBC9",
      secondary: "#9DA19F",
    });
    expect(__noteRendererInternals.progressTone(240, 240)).toBe("complete");
    expect(__noteRendererInternals.progressTone(147, 240)).toBe("progress");
    expect(__noteRendererInternals.metricTone("cardSign", { card_sign: "CardSignDone" })).toBe("complete");
    expect(__noteRendererInternals.metricTone("cardSign", { card_sign: "CardSignNotDone" })).toBe("action");
    expect(__noteRendererInternals.metricTone("vhs", { vhs_sale: { sale_state: "SaleStateDoing" } })).toBe("progress");
    expect(__noteRendererInternals.metricTone("vhs", { vhs_sale: { sale_state: "SaleStateDone" } })).toBe("action");
    expect(__noteRendererInternals.eventTone({ state: "STATE_COMPLETED" })).toBe("complete");
    expect(__noteRendererInternals.eventTone({ state: "STATE_IN_PROGRESS", monochrome_got_cnt: 1, monochrome_cnt: 10 }))
      .toBe("progress");
  });

  it("keeps Note, reminder highlights and later activity pages at their existing dimensions", async () => {
    const events = Array.from({ length: 19 }, (_, index) => ({
      activity_id: index + 1,
      name: `活動 ${index + 1}`,
      monochrome_got_cnt: 0,
      monochrome_cnt: 100,
      state: "STATE_IN_PROGRESS",
      left_end_ts: 86_400,
    }));
    const pages = await renderOfficialNote({
      uid: "130000001",
      playerName: "測試繩匠",
      locale: "tw",
      now: Date.UTC(2026, 8, 4),
      highlighted: ["energy", "event:1"],
      note: {
        energy: { progress: { current: 123, max: 240 }, restore: 3600 },
        vitality: { current: 300, max: 400 },
        card_sign: "CardSignNotDone",
        vhs_sale: { sale_state: "SaleStateDoing" },
        bounty_commission: { num: 2, total: 4 },
        weekly_task: { cur_point: 900, max_point: 2100 },
      },
      calendar: { activity_list: events },
    });
    const images = await Promise.all(pages.map((page) => loadImage(page)));

    expect(images).toHaveLength(2);
    expect(images.map((image) => image.width)).toEqual([1044, 1044]);
    expect(images.map((image) => image.height)).toEqual([3378, 484]);
  });
});
