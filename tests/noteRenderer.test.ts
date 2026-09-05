import { createCanvas, loadImage } from "@napi-rs/canvas";
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

  it("uses the official neutral palette for progress, complete and actionable states", () => {
    expect(__noteRendererInternals.NOTE_COLORS).toMatchObject({
      complete: "#7D7F80",
      progress: "#FFFFFF",
      action: "#FFDE00",
      neutral: "#FFFFFF",
      label: "#D9DBDD",
      secondary: "#7D7F80",
      surface: "#161817",
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

  it("renders exact white, muted gray, action yellow and official dark surface pixels", async () => {
    const [page] = await renderOfficialNote({
      uid: "130000002",
      playerName: "配色測試",
      locale: "tw",
      now: Date.UTC(2026, 8, 5),
      note: {
        energy: { progress: { current: 120, max: 240 }, restore: 3600 },
        vitality: { current: 400, max: 400 },
        card_sign: "CardSignNotDone",
        vhs_sale: { sale_state: "SaleStateDoing" },
        bounty_commission: { num: 8000, total: 8000 },
        weekly_task: { cur_point: 1150, max_point: 2100 },
      },
      calendar: { activity_list: [] },
    });
    const image = await loadImage(page!);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    const colors = new Map<string, number>();
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const key = `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`;
      colors.set(key, (colors.get(key) ?? 0) + 1);
    }

    expect(colors.get("255,255,255")).toBeGreaterThan(100);
    expect(colors.get("125,127,128")).toBeGreaterThan(100);
    expect(colors.get("255,222,0")).toBeGreaterThan(100);
    expect(colors.get("22,24,23")).toBeGreaterThan(10_000);
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
    const firstPage = createCanvas(images[0]!.width, images[0]!.height);
    const firstPageContext = firstPage.getContext("2d");
    firstPageContext.drawImage(images[0]!, 0, 0);

    expect(images).toHaveLength(2);
    expect(images.map((image) => image.width)).toEqual([1044, 1044]);
    expect(images.map((image) => image.height)).toEqual([3378, 484]);
    expect(Array.from(firstPageContext.getImageData(48, 190, 1, 1).data)).toEqual([255, 222, 0, 255]);
  });
});
