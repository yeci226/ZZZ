const mockLoadNote = jest.fn();
const mockRender = jest.fn();
jest.mock("../src/utilities/utilities.js", () => ({
  getUserLang: jest.fn().mockResolvedValue("tw"),
}));
jest.mock("../src/utilities/accountStore.js", () => ({
  getLegacyAccounts: jest.fn().mockResolvedValue([
    {
      uid: "1300007596",
      cookie: "test-cookie",
      nickname: "Yeci",
      region: "prod_gf_sg",
    },
  ]),
}));
jest.mock("../src/utilities/zzz/clientFactory.js", () => ({
  createZzzClient: () => ({}),
  getZzzClientLanguage: () => "zh-tw",
}));
jest.mock("../src/utilities/zzz/officialRecordApi.js", () => ({
  loadOfficialNoteData: (...args: unknown[]) => mockLoadNote(...args),
}));
jest.mock("../src/utilities/zzz/noteRenderer.js", () => ({
  renderOfficialNote: (...args: unknown[]) => mockRender(...args),
}));
jest.mock("../src/utilities/core/logger.js", () => ({
  __esModule: true,
  default: class {
    info() {}
    warn() {}
    error() {}
  },
}));

import { NoteReminderService } from "../src/utilities/zzz/reminderService";
import {
  getReminderStateKey,
  type ReminderState,
} from "../src/utilities/zzz/reminderState";

const morning = Date.UTC(2026, 8, 22, 2);
const beforeReset = Date.UTC(2026, 8, 22, 18);
const stateKey = getReminderStateKey("user", "1300007596");

function setup(energyMode = "amount") {
  const note = {
    energy: { progress: { current: 220, max: 240 }, restore: 7200 },
    vitality: { current: 0, max: 400 },
    card_sign: "CardSignNo",
    vhs_sale: { sale_state: "SaleStateDone" },
    bounty_commission: { num: 0, total: 8000, refresh_time: 5 * 86400 },
    weekly_task: { cur_point: 200, max_point: 2100, refresh_time: 5 * 86400 },
  };
  const calendar = {
    activity_list: [
      {
        activity_id: 1,
        state: "STATE_IN_PROGRESS",
        monochrome_cnt: 800,
        monochrome_got_cnt: 0,
        left_end_ts: 26 * 86400,
      },
    ],
  };
  mockLoadNote.mockResolvedValue({ note, calendar });
  mockRender.mockResolvedValue([Buffer.from("image")]);
  const stored = new Map<string, any>([
    [
      "noteReminder",
      {
        user: { notifyType: "dm", energyMode, energyValue: 220 },
      },
    ],
  ]);
  const db = {
    get: jest.fn(async (key: string) => structuredClone(stored.get(key))),
    set: jest.fn(async (key: string, value: unknown) => {
      stored.set(key, structuredClone(value));
    }),
  };
  const send = jest.fn().mockResolvedValue(undefined);
  const client = {
    db,
    users: { fetch: jest.fn().mockResolvedValue({ send }) },
  };
  return {
    service: new NoteReminderService(client),
    stored,
    db,
    send,
    note,
    calendar,
  };
}

it("does not render, send or consume reminders for ordinary unfinished work", async () => {
  const { service, send, db } = setup("off");
  await service.run(morning);
  expect(mockLoadNote).toHaveBeenCalledTimes(1);
  expect(mockRender).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(db.set).not.toHaveBeenCalled();
});

it("renders current urgency while preserving later daily reminders and deduplication", async () => {
  const { service, stored, send, note, calendar } = setup();
  await service.run(morning);
  expect(send).toHaveBeenCalledTimes(1);
  expect(mockRender).toHaveBeenLastCalledWith(
    expect.objectContaining({
      highlighted: ["energy"],
      attention: expect.objectContaining({
        energy: { level: "urgent", remainingSeconds: 7200 },
        vitality: { level: "normal", remainingSeconds: 18 * 3600 },
        "event:1": { level: "normal", remainingSeconds: 26 * 86400 },
      }),
    }),
  );
  expect(stored.get(stateKey)).toEqual({
    energyArmed: false,
    sent: { energy: "energy" },
  });

  await service.run(morning + 60_000);
  expect(send).toHaveBeenCalledTimes(1);
  expect(mockRender).toHaveBeenCalledTimes(1);

  await service.run(beforeReset);
  expect(send).toHaveBeenCalledTimes(2);
  expect(mockRender).toHaveBeenLastCalledWith(
    expect.objectContaining({
      highlighted: ["energy", "vitality", "cardSign", "vhs"],
      attention: expect.objectContaining({
        vitality: { level: "urgent", remainingSeconds: 7200 },
      }),
    }),
  );
  expect(stored.get(stateKey)).toEqual({
    energyArmed: false,
    sent: {
      energy: "energy",
      vitality: "daily:2026-09-23:vitality",
      cardSign: "daily:2026-09-23:cardSign",
      vhs: "daily:2026-09-23:vhs",
    },
  });

  // A newly due event sends another image while already-notified daily tasks remain highlighted.
  mockLoadNote.mockResolvedValue({
    note,
    calendar: {
      activity_list: [{ ...calendar.activity_list[0], left_end_ts: 3600 }],
    },
  });
  await service.run(beforeReset + 60_000);
  expect(send).toHaveBeenCalledTimes(3);
  expect(mockRender).toHaveBeenLastCalledWith(
    expect.objectContaining({
      highlighted: ["energy", "vitality", "cardSign", "vhs", "event:1"],
      attention: expect.objectContaining({
        "event:1": { level: "urgent", remainingSeconds: 3600 },
      }),
    }),
  );
  expect((stored.get(stateKey) as ReminderState).sent?.["event:1"]).toBe(
    "event:1",
  );

  await service.run(beforeReset + 120_000);
  expect(send).toHaveBeenCalledTimes(3);
});

it.each([false, true])(
  "sends an event once across 15-minute polls and restart (absolute timestamp: %s)",
  async (absolute) => {
    const { service, db, send, note, calendar } = setup("off");
    const event = calendar.activity_list[0];
    const deadline = morning / 1000 + 7200;
    const load = (elapsed: number, id = 1, claimed = 0) => {
      mockLoadNote.mockResolvedValue({
        note,
        calendar: {
          activity_list: [
            {
              ...event,
              activity_id: id,
              monochrome_got_cnt: claimed,
              left_end_ts: absolute ? deadline : 7200 - elapsed,
            },
          ],
        },
      });
    };

    load(0);
    await service.run(morning);
    expect(send).toHaveBeenCalledTimes(1);

    for (const elapsed of [900, 1800, 2700]) {
      load(elapsed);
      await service.run(morning + elapsed * 1000);
    }
    const restarted = new NoteReminderService({
      db,
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });
    load(3600);
    await restarted.run(morning + 3600_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(mockRender).toHaveBeenCalledTimes(1);

    load(4500, 2, 800);
    await restarted.run(morning + 4500_000);
    expect(send).toHaveBeenCalledTimes(1);
    load(5400, 3);
    await restarted.run(morning + 5400_000);
    expect(send).toHaveBeenCalledTimes(2);
  },
);

it.each(["event:1:7200", "event:1:1790049600"])(
  "honors legacy event delivery state %s without a duplicate after upgrade",
  async (legacyCycle) => {
    const { service, stored, send, note, calendar } = setup("off");
    stored.set(stateKey, { sent: { "event:1": legacyCycle } });
    mockLoadNote.mockResolvedValue({
      note,
      calendar: {
        activity_list: [{ ...calendar.activity_list[0], left_end_ts: 6300 }],
      },
    });
    await service.run(morning + 900_000);
    expect(send).not.toHaveBeenCalled();
    expect(mockRender).not.toHaveBeenCalled();
  },
);
