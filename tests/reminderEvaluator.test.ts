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

  it("recognizes pending actions from the current video-store API", () => {
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
    expect(result.triggers.some((trigger) => trigger.key === "vhs")).toBe(true);
  });
});
