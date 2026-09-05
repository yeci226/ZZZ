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

  it("maps each Note module to its official accent while completed values stay muted", () => {
    expect(__noteRendererInternals.NOTE_COLORS).toMatchObject({
      complete: "#7D7F80",
      energy: "#2CACF1",
      daily: "#FFDE00",
      weekly: "#F1AD3D",
      event: "#FF4483",
      action: "#FFDE00",
      neutral: "#FFFFFF",
      label: "#D9DBDD",
      secondary: "#7D7F80",
      surface: "#161817",
    });
    expect(__noteRendererInternals.progressTone(240, 240, "energy")).toBe("complete");
    expect(__noteRendererInternals.progressTone(147, 240, "energy")).toBe("energy");
    expect(__noteRendererInternals.metricTone("vitality", { vitality: { current: 200, max: 400 } })).toBe("daily");
    expect(__noteRendererInternals.metricTone("cardSign", { card_sign: "CardSignDone" })).toBe("complete");
    expect(__noteRendererInternals.metricTone("cardSign", { card_sign: "CardSignNotDone" })).toBe("daily");
    expect(__noteRendererInternals.metricTone("vhs", { vhs_sale: { sale_state: "SaleStateDoing" } })).toBe("daily");
    expect(__noteRendererInternals.metricTone("bounty", { bounty_commission: { num: 4000, total: 8000 } }))
      .toBe("weekly");
    expect(__noteRendererInternals.eventTone({ state: "STATE_COMPLETED" })).toBe("complete");
    expect(__noteRendererInternals.eventTone({ state: "STATE_IN_PROGRESS", monochrome_got_cnt: 1, monochrome_cnt: 10 }))
      .toBe("event");
  });

  it("renders exact module accents while activity names remain neutral", async () => {
    const [page] = await renderOfficialNote({
      uid: "130000002",
      playerName: "配色測試",
      locale: "tw",
      now: Date.UTC(2026, 8, 5),
      note: {
        energy: { progress: { current: 120, max: 240 }, restore: 3600 },
        vitality: { current: 200, max: 400 },
        card_sign: "CardSignNotDone",
        vhs_sale: { sale_state: "SaleStateDoing" },
        bounty_commission: { num: 4000, total: 8000 },
        weekly_task: { cur_point: 1150, max_point: 2100 },
      },
      calendar: { activity_list: [
        { activity_id: 1, name: "進行中的活動", monochrome_got_cnt: 0, monochrome_cnt: 1050, state: "STATE_IN_PROGRESS", left_end_ts: 86_400 },
        { activity_id: 2, name: "已完成的活動", monochrome_got_cnt: 300, monochrome_cnt: 300, state: "STATE_COMPLETED", left_end_ts: 0 },
      ] },
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

    expect(colors.get("44,172,241")).toBeGreaterThan(100);
    expect(colors.get("125,127,128")).toBeGreaterThan(100);
    expect(colors.get("255,222,0")).toBeGreaterThan(100);
    expect(colors.get("241,173,61")).toBeGreaterThan(100);
    expect(colors.get("255,68,131")).toBeGreaterThan(100);
    expect(colors.get("217,219,221")).toBeGreaterThan(100);
    expect(colors.get("22,24,23")).toBeGreaterThan(10_000);

    const activeNamePixels = ctx.getImageData(76, 940, 520, 34).data;
    const completedNamePixels = ctx.getImageData(76, 1072, 520, 34).data;
    const countColor = (data: Uint8ClampedArray, red: number, green: number, blue: number) => {
      let count = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset] === red && data[offset + 1] === green && data[offset + 2] === blue) count++;
      }
      return count;
    };
    expect(countColor(activeNamePixels, 217, 219, 221)).toBeGreaterThan(20);
    expect(countColor(activeNamePixels, 255, 68, 131)).toBe(0);
    expect(countColor(completedNamePixels, 217, 219, 221)).toBeGreaterThan(20);
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
