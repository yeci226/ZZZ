import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QuickDB } from "quick.db";
import type { ReminderTrigger } from "../src/utilities/zzz/reminderEvaluator";
import {
  getPendingReminderTriggers,
  getReminderStateKey,
  markReminderTriggersDelivered,
  rearmEnergyReminder,
  type ReminderState,
} from "../src/utilities/zzz/reminderState";

describe("note reminder state", () => {
  it("round-trips production-shaped numeric IDs through a literal QuickDB key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "zzz-reminder-state-"));
    const db = new QuickDB({ filePath: join(directory, "state.sqlite") });
    try {
      const key = getReminderStateKey("283946584461410305", "1300007596");
      const state: ReminderState = {
        sent: { vitality: "daily:2026-09-06:vitality" },
        energyArmed: false,
      };

      expect(key).toBe("noteReminderState:283946584461410305:1300007596");
      expect(key).not.toContain(".");
      await expect(db.set(key, state)).resolves.toEqual(state);
      await expect(db.get(key)).resolves.toEqual(state);
    } finally {
      (db.driver as any).database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("suppresses daily, weekly and event triggers already sent in the same cycle", () => {
    const triggers: ReminderTrigger[] = [
      { key: "vitality", cycle: "daily:2026-09-06:vitality" },
      { key: "weekly", cycle: "weekly:2026-09-07:points:1100" },
      { key: "event:123", cycle: "event:123:1788800000" },
    ];
    const state: ReminderState = {};

    expect(getPendingReminderTriggers(triggers, state)).toEqual(triggers);
    markReminderTriggersDelivered(state, triggers);
    expect(getPendingReminderTriggers(triggers, state)).toEqual([]);

    const nextDailyCycle: ReminderTrigger = {
      key: "vitality",
      cycle: "daily:2026-09-07:vitality",
    };
    expect(getPendingReminderTriggers([nextDailyCycle], state)).toEqual([nextDailyCycle]);
  });

  it("rearms energy only after the condition clears", () => {
    const energy: ReminderTrigger = { key: "energy", cycle: "energy" };
    const state: ReminderState = {};

    expect(getPendingReminderTriggers([energy], state)).toEqual([energy]);
    markReminderTriggersDelivered(state, [energy]);
    expect(getPendingReminderTriggers([energy], state)).toEqual([]);
    expect(rearmEnergyReminder(state, true)).toBe(false);
    expect(getPendingReminderTriggers([energy], state)).toEqual([]);
    expect(rearmEnergyReminder(state, false)).toBe(true);
    expect(getPendingReminderTriggers([energy], state)).toEqual([energy]);
  });
});
