import { createCanvas, loadImage } from "@napi-rs/canvas";
import { evaluateNoteReminder } from "../src/utilities/zzz/reminderEvaluator";
import { normalizeNoteReminderConfig } from "../src/utilities/zzz/reminderConfig";
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
    expect(__noteRendererInternals.metricTone("vhs", { vhs_sale: { sale_state: "SaleStateDoing" } })).toBe("complete");
    expect(__noteRendererInternals.metricTone("bounty", { bounty_commission: { num: 4000, total: 8000 } }))
      .toBe("weekly");
    expect(__noteRendererInternals.eventTone({ state: "STATE_COMPLETED" })).toBe("complete");
    expect(__noteRendererInternals.eventTone({ state: "STATE_IN_PROGRESS", monochrome_got_cnt: 1, monochrome_cnt: 10 }))
      .toBe("event");
  });

  it.each(["SaleStateDoing", "SaleStateNo", "SaleStateDone"])(
    "renders video-store colors and reminder borders for %s despite pending temple actions",
    async (saleState) => {
      const now = Date.UTC(2026, 8, 6, 18);
      const note = {
        vitality: { current: 0, max: 400 },
        card_sign: "CardSignDone",
        vhs_sale: { sale_state: saleState },
        temple_running: {
          expedition_state: "ExpeditionStateEnd",
          bench_state: "BenchStateCanProduce",
          shelve_state: "ShelveStateSoldOut",
        },
      };
      const evaluation = evaluateNoteReminder(note, {}, normalizeNoteReminderConfig({
        energyMode: "off", weeklyEnabled: false,
      }), { now, region: "prod_gf_sg" });
      // Keep reminder mode active even when the video store needs no action.
      expect(evaluation.triggers.some((trigger) => trigger.key === "vitality")).toBe(true);
      const needsAction = saleState !== "SaleStateDoing";
      for (const reminderMode of [false, true]) {
        const [page] = await renderOfficialNote({
          uid: "130000001", locale: "tw", now, note,
          ...(reminderMode ? { attention: evaluation.attention } : {}),
        });
        const image = await loadImage(page!);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const offsetY = reminderMode ? 88 : 0;
        const valuePixels = ctx.getImageData(70, 578 + offsetY, 420, 44).data;
        let yellow = 0;
        let urgent = 0;
        let gray = 0;
        for (let offset = 0; offset < valuePixels.length; offset += 4) {
          const [r, g, b] = valuePixels.slice(offset, offset + 3);
          if (r === 255 && g === 222 && b === 0) yellow++;
          if (r === 255 && g === 128 && b === 92) urgent++;
          if (r === 125 && g === 127 && b === 128) gray++;
        }
        if (needsAction) expect(reminderMode ? urgent : yellow).toBeGreaterThan(20);
        else {
          expect(yellow).toBe(0);
          if (!reminderMode) expect(gray).toBeGreaterThan(20);
        }
        const border = Array.from(ctx.getImageData(48, 560 + offsetY, 1, 1).data);
        if (reminderMode && needsAction) expect(border).toEqual([255, 128, 92, 255]);
        else expect(border).not.toEqual([255, 128, 92, 255]);
      }
    },
  );

  it("focuses an energy-only reminder on the battery while unfinished tasks stay readable and unframed", async () => {
    const now = Date.UTC(2026, 8, 22, 2);
    const note = {
      energy: { progress: { current: 220, max: 240 }, restore: 7200 },
      vitality: { current: 0, max: 400 }, card_sign: "CardSignNo",
      vhs_sale: { sale_state: "SaleStateDone" },
      bounty_commission: { num: 0, total: 8000, refresh_time: 5 * 86400 },
      weekly_task: { cur_point: 200, max_point: 2100, refresh_time: 5 * 86400 },
    };
    const event = { monochrome_cnt: 800, monochrome_got_cnt: 0, left_end_ts: 26 * 86400 };
    const calendar = { activity_list: [
      { ...event, activity_id: 1, name: "Active", state: "STATE_IN_PROGRESS" },
      { ...event, activity_id: 2, name: "Upcoming", state: "STATE_NOT_START", left_start_ts: 86400 },
      { ...event, activity_id: 3, name: "Complete", state: "STATE_COMPLETED", monochrome_got_cnt: 800 },
    ] };
    const evaluation = evaluateNoteReminder(note, calendar, normalizeNoteReminderConfig({
      energyMode: "amount", energyValue: 220,
    }), { now, region: "prod_gf_sg" });
    expect(evaluation.triggers).toEqual([{ key: "energy", cycle: "energy" }]);

    for (const reminderMode of [false, true]) {
      const [page] = await renderOfficialNote({
        uid: "1300007596", locale: "tw", now, note, calendar,
        ...(reminderMode ? { attention: evaluation.attention } : {}),
      });
      const image = await loadImage(page!);
      const ctx = createCanvas(image.width, image.height).getContext("2d");
      ctx.drawImage(image, 0, 0);
      const offsetY = reminderMode ? 88 : 0;
      const energyBorder = Array.from(ctx.getImageData(48, 190 + offsetY, 1, 1).data);
      if (reminderMode) expect(energyBorder).toEqual([255, 128, 92, 255]);
      else expect(energyBorder).not.toEqual([255, 128, 92, 255]);
      const borderPoints = [[48, 406], [534, 406], [48, 564], [534, 564], [48, 722], [48, 964]];
      for (const [x, y] of borderPoints) {
        const border = Array.from(ctx.getImageData(x!, y! + offsetY, 1, 1).data);
        expect(border).not.toEqual([255, 222, 0, 255]);
        expect(border).not.toEqual([255, 128, 92, 255]);
      }
      for (const y of [1096, 1228]) {
        expect(Array.from(ctx.getImageData(48, y + offsetY, 1, 1).data)).not.toEqual([255, 222, 0, 255]);
      }
      if (reminderMode) {
        // Ordinary unfinished values retain full contrast without borrowing warning colors.
        const pixels = ctx.getImageData(70, 410 + offsetY, 420, 50).data;
        const rgb = Array.from({ length: pixels.length / 4 }, (_, i) => Array.from(pixels.slice(i * 4, i * 4 + 3)).join(","));
        expect(rgb.filter((color) => color === "217,219,221").length).toBeGreaterThan(100);
        expect(rgb).not.toContain("255,222,0");
      }
    }
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

  it("shows separate urgent and soon borders, including an event that ends before the battery fills", async () => {
    const now = Date.parse("2026-09-27T09:45:00+08:00");
    const note = {
      energy: { progress: { current: 222, max: 240 }, restore: 6300 },
      vitality: { current: 0, max: 400 }, card_sign: "CardSignNo",
      vhs_sale: { sale_state: "SaleStateDoing" },
      bounty_commission: { num: 2000, total: 8000, refresh_time: 18 * 3600 },
      weekly_task: { cur_point: 1050, max_point: 2100, refresh_time: 18 * 3600 },
    };
    const calendar = { activity_list: [
      { activity_id: 1, name: "先做這個活動", state: "STATE_IN_PROGRESS", monochrome_cnt: 800, monochrome_got_cnt: 0, left_end_ts: 2700 },
      { activity_id: 2, name: "還有三週", state: "STATE_IN_PROGRESS", monochrome_cnt: 300, monochrome_got_cnt: 0, left_end_ts: 21 * 86400 },
    ] };
    const evaluation = evaluateNoteReminder(note, calendar, normalizeNoteReminderConfig({
      energyMode: "amount", energyValue: 200,
    }), { now, region: "prod_gf_sg" });
    const [page] = await renderOfficialNote({ uid: "130000001", locale: "tw", now, note, calendar, attention: evaluation.attention });
    const image = await loadImage(page!);
    const ctx = createCanvas(image.width, image.height).getContext("2d");
    ctx.drawImage(image, 0, 0);
    const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    expect(pixel(48, 278)).toEqual([255, 128, 92, 255]); // Battery: urgent.
    expect(pixel(534, 652)).toEqual([255, 222, 0, 255]); // Weekly reset: soon.
    expect(pixel(48, 1052)).toEqual([255, 128, 92, 255]); // Event: urgent.
    expect(pixel(48, 1184)).not.toEqual([255, 222, 0, 255]); // Long-running event: neutral.
    expect(pixel(48, 1184)).not.toEqual([255, 128, 92, 255]);

    // The top summary follows the earlier event deadline. Marking that event
    // complete must move the summary back to the battery without affecting its card.
    const completedCalendar = { activity_list: calendar.activity_list.map((event, index) => index ? event : { ...event, monochrome_got_cnt: 800 }) };
    const completed = evaluateNoteReminder(note, completedCalendar, normalizeNoteReminderConfig({
      energyMode: "amount", energyValue: 200,
    }), { now, region: "prod_gf_sg" });
    const [updated] = await renderOfficialNote({ uid: "130000001", locale: "tw", now, note, calendar: completedCalendar, attention: completed.attention });
    const updatedImage = await loadImage(updated!);
    const updatedCtx = createCanvas(updatedImage.width, updatedImage.height).getContext("2d");
    updatedCtx.drawImage(updatedImage, 0, 0);
    expect(Buffer.from(ctx.getImageData(70, 152, 904, 64).data))
      .not.toEqual(Buffer.from(updatedCtx.getImageData(70, 152, 904, 64).data));
    expect(Buffer.from(ctx.getImageData(70, 240, 900, 190).data))
      .toEqual(Buffer.from(updatedCtx.getImageData(70, 240, 900, 190).data));
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
