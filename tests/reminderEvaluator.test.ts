import { evaluateNoteReminder } from "../src/utilities/zzz/reminderEvaluator";
import { normalizeNoteReminderConfig } from "../src/utilities/zzz/reminderConfig";

const baseNote = {
  energy: { progress: { current: 100, max: 240 }, restore: 7200 },
  vitality: { current: 300, max: 400 },
  card_sign: "CardSignNo",
  vhs_sale: { sale_state: "SaleStateNo" },
  bounty_commission: { num: 3, total: 6, refresh_time: 3600 },
  weekly_task: { cur_point: 1150, max_point: 2100, refresh_time: 3600 },
};

describe("note reminder evaluator", () => {
  it("uses the configured weekly reward target instead of API max", () => {
    const result = evaluateNoteReminder(baseNote, {}, normalizeNoteReminderConfig({
      weeklyTarget: 1100, weeklyHours: 24,
    }), { now: Date.UTC(2026, 8, 6, 18), region: "prod_gf_sg" });
    expect(result.triggers.some((trigger) => trigger.key === "weekly")).toBe(false);
    expect(result.highlighted).not.toContain("weekly");
    expect(result.triggers.some((trigger) => trigger.key === "bounty")).toBe(true);
  });

  it("supports mutually exclusive energy modes", () => {
    const amount = evaluateNoteReminder(baseNote, {}, normalizeNoteReminderConfig({
      energyMode: "amount", energyValue: 90,
    }));
    const time = evaluateNoteReminder(baseNote, {}, normalizeNoteReminderConfig({
      energyMode: "time", energyValue: 60,
    }));
    expect(amount.energyCondition).toBe(true);
    expect(time.energyCondition).toBe(false);
    expect(amount.highlighted).toContain("energy");
    expect(time.highlighted).not.toContain("energy");
  });

  it("only includes in-progress events with unclaimed film near ending", () => {
    const calendar = { activity_list: [
      { activity_id: 1, state: "STATE_IN_PROGRESS", monochrome_cnt: 300, monochrome_got_cnt: 0, left_end_ts: 3600 },
      { activity_id: 2, state: "STATE_COMPLETED", monochrome_cnt: 300, monochrome_got_cnt: 0, left_end_ts: 3600 },
      { activity_id: 3, state: "STATE_IN_PROGRESS", monochrome_cnt: 300, monochrome_got_cnt: 300, left_end_ts: 3600 },
    ] };
    const result = evaluateNoteReminder(baseNote, calendar, normalizeNoteReminderConfig({ eventHours: 24 }));
    expect(result.triggers.filter((trigger) => String(trigger.key).startsWith("event:"))).toEqual([
      expect.objectContaining({ key: "event:1" }),
    ]);
  });

  it("does not flag an operating video store for pending temple actions", () => {
    const note = {
      ...baseNote,
      vhs_sale: { sale_state: "SaleStateDoing" },
      temple_running: {
        expedition_state: "ExpeditionStateEnd",
        bench_state: "BenchStateCanProduce",
        shelve_state: "ShelveStateSoldOut",
      },
    };
    const result = evaluateNoteReminder(
      note,
      {},
      normalizeNoteReminderConfig({ dailyHours: 24 }),
      { now: Date.UTC(2026, 8, 6, 18), region: "prod_gf_sg" },
    );
    expect(result.triggers.some((trigger) => trigger.key === "vhs")).toBe(false);
  });

  it.each([
    ["SaleStateNo", true],
    ["SaleStateDone", true],
    ["SaleStateDoing", false],
    ["", false],
  ])("checks the displayed video-store state %s", (saleState, expected) => {
    const result = evaluateNoteReminder(
      { ...baseNote, vhs_sale: { sale_state: saleState } },
      {},
      normalizeNoteReminderConfig({ dailyHours: 24 }),
      { now: Date.UTC(2026, 8, 6, 18), region: "prod_gf_sg" },
    );
    expect(result.triggers.some((trigger) => trigger.key === "vhs")).toBe(expected);
    expect(result.highlighted.includes("vhs")).toBe(expected);
  });

  it.each([true, false])("keeps unfinished items neutral outside notification windows with switches %s", (enabled) => {
    const result = evaluateNoteReminder({
      ...baseNote,
      bounty_commission: { num: 0, total: 8000, refresh_time: 5 * 86400 },
      weekly_task: { cur_point: 200, max_point: 2100, refresh_time: 5 * 86400 },
    }, { activity_list: [
      { activity_id: 1, state: "STATE_IN_PROGRESS", monochrome_cnt: 800, monochrome_got_cnt: 0, left_end_ts: 26 * 86400 },
    ] }, normalizeNoteReminderConfig({
      energyMode: "off", vitalityEnabled: enabled, cardSignEnabled: enabled,
      vhsEnabled: enabled, bountyEnabled: enabled, weeklyEnabled: enabled, eventEnabled: enabled,
    }), { now: Date.UTC(2026, 8, 22, 2), region: "prod_gf_sg" });

    expect(result.highlighted).toEqual([]);
    expect(Object.values(result.attention).every((item) => item?.level === "normal")).toBe(true);
    expect(result.attention["event:1"]).toEqual({ level: "normal", remainingSeconds: 26 * 86400 });
    expect(result.triggers).toEqual([]);
  });

  it("keeps disabled notifications silent even inside their notification windows", () => {
    const result = evaluateNoteReminder({
      ...baseNote, weekly_task: { cur_point: 200, max_point: 2100, refresh_time: 3600 },
    }, { activity_list: [
      { activity_id: 1, state: "STATE_IN_PROGRESS", monochrome_cnt: 800, monochrome_got_cnt: 0, left_end_ts: 3600 },
    ] }, normalizeNoteReminderConfig({
      energyMode: "off", vitalityEnabled: false, cardSignEnabled: false,
      vhsEnabled: false, bountyEnabled: false, weeklyEnabled: false, eventEnabled: false,
    }), { now: Date.UTC(2026, 8, 22, 18), region: "prod_gf_sg" });

    expect(result.highlighted).toEqual(["vitality", "cardSign", "vhs", "bounty", "weekly", "event:1"]);
    expect(result.triggers).toEqual([]);
  });

  it("does not highlight completed tasks or unavailable, expired and fully claimed events", () => {
    const now = Date.UTC(2026, 8, 22, 18);
    const event = { state: "STATE_IN_PROGRESS", monochrome_cnt: 300, monochrome_got_cnt: 0, left_end_ts: 3600 };
    const result = evaluateNoteReminder({
      ...baseNote,
      vitality: { current: 400, max: 400 }, card_sign: "CardSignDone",
      vhs_sale: { sale_state: "SaleStateDoing" },
      bounty_commission: { num: 8000, total: 8000, refresh_time: 3600 },
      weekly_task: { cur_point: 1100, max_point: 2100, refresh_time: 3600 },
    }, { activity_list: [
      { ...event, activity_id: 1, state: "STATE_NOT_START" },
      { ...event, activity_id: 2, state: "STATE_COMPLETED" },
      { ...event, activity_id: 3, state: "STATE_END" },
      { ...event, activity_id: 4, left_end_ts: 0 },
      { ...event, activity_id: 5, left_end_ts: now / 1000 - 1 },
      { ...event, activity_id: 6, monochrome_got_cnt: 300 },
      { ...event, activity_id: 7, left_end_ts: now / 1000 + 26 * 86400 },
    ] }, normalizeNoteReminderConfig({ energyMode: "off" }), { now, region: "prod_gf_sg" });

    expect(result.highlighted).toEqual([]);
    expect(Object.keys(result.attention)).toEqual(["energy", "event:7"]);
    expect(result.attention["event:7"]?.level).toBe("normal");
    expect(result.triggers).toEqual([]);
  });

  it("separates a nearly full battery, tomorrow's weekly reset and long-running events", () => {
    const result = evaluateNoteReminder({
      ...baseNote,
      energy: { progress: { current: 222, max: 240 }, restore: 6300 },
      bounty_commission: { num: 2000, total: 8000, refresh_time: 18 * 3600 },
      weekly_task: { cur_point: 1050, max_point: 2100, refresh_time: 18 * 3600 },
    }, { activity_list: [
      { activity_id: 1, state: "STATE_IN_PROGRESS", monochrome_cnt: 800, monochrome_got_cnt: 0, left_end_ts: 21 * 86400 },
    ] }, normalizeNoteReminderConfig({ energyMode: "amount", energyValue: 200 }), {
      now: Date.parse("2026-09-27T09:45:00+08:00"), region: "prod_gf_sg",
    });

    expect(result.highlighted).toEqual(["energy", "bounty", "weekly"]);
    expect(result.attention.energy).toEqual({ level: "urgent", remainingSeconds: 6300 });
    expect(result.attention.bounty?.level).toBe("soon");
    expect(result.attention.weekly?.level).toBe("soon");
    expect(result.attention.vitality).toEqual({ level: "normal", remainingSeconds: 18.25 * 3600 });
    expect(result.attention["event:1"]?.level).toBe("normal");
  });

  it.each([
    [3 * 3600, "urgent"], [3 * 3600 + 1, "soon"],
    [24 * 3600, "soon"], [24 * 3600 + 1, "normal"],
  ])("classifies deadline %s consistently for Unix and duration fields", (remainingSeconds, level) => {
    const now = Date.UTC(2026, 8, 22, 2);
    const result = evaluateNoteReminder({
      ...baseNote,
      bounty_commission: { num: 0, total: 8000, refresh_time: remainingSeconds },
      weekly_task: { cur_point: 0, max_point: 2100, refresh_time: now / 1000 + Number(remainingSeconds) },
    }, { list: [
      { id: 1, state: "STATE_IN_PROGRESS", monochrome_cnt: 300, monochrome_got_cnt: 0, left_end_ts: now / 1000 + Number(remainingSeconds) },
    ] }, normalizeNoteReminderConfig({}), { now });
    for (const key of ["bounty", "weekly", "event:1"] as const) {
      expect(result.attention[key]).toEqual({ level, remainingSeconds });
    }
  });

  it("uses the account's server reset and removes daily emphasis after reset", () => {
    const now = Date.parse("2026-09-23T03:00:00+08:00");
    const config = normalizeNoteReminderConfig({});
    const asia = evaluateNoteReminder(baseNote, {}, config, { now, region: "prod_gf_sg" });
    const america = evaluateNoteReminder(baseNote, {}, config, { now, region: "prod_gf_us" });
    const reset = evaluateNoteReminder(baseNote, {}, config, { now: now + 3600_000, region: "prod_gf_sg" });
    expect(asia.attention.vitality).toEqual({ level: "urgent", remainingSeconds: 3600 });
    expect(america.attention.vitality).toEqual({ level: "normal", remainingSeconds: 14 * 3600 });
    expect(reset.attention.vitality).toEqual({ level: "normal", remainingSeconds: 24 * 3600 });
  });

  it("keeps a full battery urgent without adding a new delivery trigger", () => {
    const result = evaluateNoteReminder({
      ...baseNote, energy: { progress: { current: 240, max: 240 }, restore: 0 },
    }, {}, normalizeNoteReminderConfig({}), { now: Date.UTC(2026, 8, 22, 2) });
    expect(result.attention.energy).toEqual({ level: "urgent", remainingSeconds: 0 });
    expect(result.energyCondition).toBe(false);
    expect(result.triggers.some((trigger) => trigger.key === "energy")).toBe(false);
  });

  it("does not invent a deadline when an amount reminder has no recovery time", () => {
    const result = evaluateNoteReminder({
      ...baseNote, energy: { progress: { current: 220, max: 240 } },
    }, {}, normalizeNoteReminderConfig({ energyMode: "amount", energyValue: 200 }));
    expect(result.attention.energy).toEqual({ level: "soon", remainingSeconds: null });
    expect(result.highlighted).toContain("energy");
  });
});
