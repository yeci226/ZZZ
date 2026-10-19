import Database from "better-sqlite3";
import { ContainerBuilder } from "discord.js";
jest.mock("../src/utilities/accountStore.js", () => ({
  getHoyolabs: jest.fn(),
  getLegacyAccounts: jest.fn(),
}));
jest.mock("../src/utilities/core/config.js", () => ({ getConfig: () => ({}) }));
jest.mock("../src/utilities/utilities.js", () => ({
  getUserLang: async () => "tw",
}));
jest.mock("../src/utilities/webhookLogin.js", () => ({
  drainPendingLogins: jest.fn(async () => {}),
}));
jest.mock("../src/utilities/mimo/runtime.js", () => ({
  getMimoStore: () => mockStore,
  mimoAccount: jest.fn(async () => ({ cookie: "test" })),
}));
jest.mock("../src/utilities/settings/presentation.js", () => ({
  ...jest.requireActual("../src/utilities/settings/presentation.js"),
  renderSettingsPreview: jest.fn(async () => Buffer.from("preview")),
}));
import {
  getHoyolabs,
  getLegacyAccounts,
} from "../src/utilities/accountStore.js";
import { MimoStore, defaultMimoConfig } from "../src/utilities/mimo/store.js";
import {
  leastUsedDailyHour,
  scheduledDailyHour,
} from "../src/utilities/settings/dailySchedule.js";
import {
  normalizeAutomation,
  setAutomationEnabled,
} from "../src/utilities/settings/automation.js";
import {
  readQuickSetup,
  setQuickMimo,
  setQuickReminder,
} from "../src/utilities/settings/setupService.js";
import { openQuickSetup } from "../src/utilities/settings/quickSetup.js";
import {
  __settingSessions,
  handleSettingPanel,
  settingId,
} from "../src/utilities/settings/panel.js";
import setupCommand from "../src/commands/slash/setup.js";
import { getInteractionPreflight } from "../src/utilities/shared/interactionPreflight.js";
import {
  __reminderWizardInternals,
  handleReminderInteraction,
} from "../src/utilities/zzz/reminderWizard.js";

let mockStore: MimoStore, sql: Database.Database;
let values: Record<string, any>, db: any;
const hoyo = (ltuid: string, uids = ["1300000001"], invalid = false) => ({
  ltuid_v2: ltuid,
  cookie: "cookie_token_v2=test",
  invalid,
  hoyolabName: ltuid,
  characters: uids.map((uid) => ({ uid, invalid: false, nickname: uid })),
});
const session = () => [...__settingSessions.values()][0];
const command = () =>
  ({
    user: { id: "owner" },
    locale: "zh-TW",
    deferred: false,
    deferReply: jest.fn(async () => {}),
    editReply: jest.fn(async () => {}),
  }) as any;
const click = (action: string, owner = "owner") =>
  ({
    user: { id: owner },
    locale: "zh-TW",
    customId: settingId(session(), action),
    isMessageComponent: () => true,
    isStringSelectMenu: () => false,
    deferUpdate: jest.fn(async function (this: any) {
      this.deferred = true;
    }),
    editReply: jest.fn(),
    reply: jest.fn(),
    followUp: jest.fn(),
  }) as any;
async function act(action: string) {
  const i = click(action);
  await handleSettingPanel(i);
  return i;
}
beforeEach(() => {
  jest.clearAllMocks();
  __settingSessions.clear();
  __reminderWizardInternals.sessions.clear();
  __reminderWizardInternals.activeByUser.clear();
  sql = new Database(":memory:");
  mockStore = new MimoStore(sql);
  values = { "owner.locale": "tw" };
  db = {
    get: jest.fn(async (key: string) => structuredClone(values[key])),
    set: jest.fn(async (key: string, value: any) => {
      values[key] = structuredClone(value);
    }),
  };
  jest.mocked(getHoyolabs).mockResolvedValue([hoyo("h")] as any);
  jest
    .mocked(getLegacyAccounts)
    .mockResolvedValue([
      { uid: "1300000001", cookie: "cookie_token_v2=test" },
    ] as any);
});
afterEach(() => sql.close());

test("registration is public and acknowledges before pending-login work", () => {
  expect(setupCommand.data.toJSON()).toMatchObject({
    name: "setup",
    name_localizations: { "zh-TW": "快速設定" },
  });
  expect(getInteractionPreflight({ commandName: "setup" })).toMatchObject({
    deferBeforeDrain: true,
    skipPendingLoginDrain: false,
  });
});
test("allocator selects only minima, excludes disabled users, and counts legacy midnight correctly", () => {
  const rows: Record<string, any> = Object.fromEntries(
    Array.from({ length: 24 }, (_, time) => [
      `u${time}`,
      { time, enabled: true },
    ]),
  );
  rows.u5.enabled = false;
  rows.extra = { time: 24 };
  rows.bad = { time: "broken" };
  expect(leastUsedDailyHour(rows)).toBe(5);
  delete rows.u9;
  const pick = jest.fn(() => 1);
  expect(leastUsedDailyHour(rows, pick)).toBe(9);
  expect(pick).toHaveBeenCalledWith(2);
  expect(leastUsedDailyHour(undefined, () => 23)).toBe(23);
  expect(scheduledDailyHour({ time: 24 })).toBe(0);
  expect(scheduledDailyHour({})).toBe(13);
  expect(scheduledDailyHour({ time: -1 })).toBe(13);
  expect(scheduledDailyHour({ time: 1.5 })).toBe(2);
});
test("viewing and closing setup writes nothing; enabling assigns once and preserves legacy preferences", async () => {
  const i = command();
  await openQuickSetup({} as any, i, db);
  expect(i.deferReply).toHaveBeenCalledWith({ flags: 64 });
  expect(db.set).not.toHaveBeenCalled();
  expect(mockStore.configs()).toEqual([]);
  expect(session().base).toMatchObject({
    daily: { enabled: false },
    redeem: { enabled: false },
    reminder: { enabled: false },
  });
  values.autoDaily = Object.fromEntries(
    Array.from({ length: 24 }, (_, time) => [
      `u${time}`,
      { time, enabled: time !== 7 },
    ]),
  );
  await act("on-daily");
  expect(values["autoDaily.owner"]).toMatchObject({
    enabled: true,
    time: "7",
    notifyType: "dm",
  });
  await act("off-daily");
  values.autoDaily.u7.enabled = true;
  values.autoDaily.u8.enabled = false;
  await act("on-daily");
  expect(values["autoDaily.owner"].time).toBe("7");
  await act("on-redeem");
  expect(values["autoRedeem.owner"]).toMatchObject({
    enabled: true,
    notifyType: "dm",
    notificationEnabled: true,
    tag: "false",
  });
  await act("on-reminder");
  expect(values["noteReminder.owner"]).toMatchObject({
    enabled: true,
    notifyType: "dm",
    energyValue: 60,
    dailyHours: 3,
    weeklyHours: 24,
    eventHours: 24,
  });
  const before = structuredClone(values);
  await act("done");
  expect(values).toEqual(before);
  expect(__settingSessions.size).toBe(0);
  const legacy = {
    enabled: false,
    time: "6",
    notificationEnabled: false,
    notifyType: "channel",
    channelId: "old",
    tag: "true",
    extra: 123,
  };
  values["autoDaily.owner"] = legacy;
  await setAutomationEnabled(
    db,
    "owner",
    "autoDaily",
    normalizeAutomation(legacy, "autoDaily"),
    true,
  );
  expect(values["autoDaily.owner"]).toEqual({ ...legacy, enabled: true });
});
test("mixed Mimo accounts commit independently, preserve preferences, and report UID/auth/ownership failures", async () => {
  jest
    .mocked(getHoyolabs)
    .mockResolvedValue([
      hoyo("ready"),
      hoyo("multiple", ["2", "3"]),
      hoyo("expired", ["4"], true),
      hoyo("foreign", ["5"]),
      hoyo("custom", ["6", "7"]),
    ] as any);
  mockStore.putConfig(defaultMimoConfig("someone-else", "foreign", "5"));
  const custom = {
    ...defaultMimoConfig("owner", "custom", "7"),
    notifyType: "off" as const,
    order: ["dennies"],
    tag: true,
  };
  mockStore.putConfig(custom);
  const snapshot = await readQuickSetup(db, "owner");
  expect(await setQuickMimo(db, "owner", snapshot.mimo, true)).toEqual({
    multiple: "choose",
    expired: "auth",
    foreign: "forbidden",
  });
  expect(mockStore.get("ready")).toMatchObject({
    enabled: true,
    uid: "1300000001",
    notifyType: "dm",
    tag: false,
    order: ["polychrome"],
  });
  expect(mockStore.get("custom")).toMatchObject({
    enabled: true,
    uid: "7",
    notifyType: "off",
    order: ["dennies"],
    tag: true,
  });
  expect(mockStore.get("multiple")).toBeUndefined();
  expect(mockStore.get("foreign")?.enabled).toBe(false);
  const chosen = defaultMimoConfig("owner", "multiple", "3");
  mockStore.putConfig(chosen);
  await setQuickMimo(
    db,
    "owner",
    (await readQuickSetup(db, "owner")).mimo,
    true,
  );
  expect(mockStore.get("multiple")).toMatchObject({ uid: "3", enabled: true });
  const disabled = await setQuickMimo(
    db,
    "owner",
    (await readQuickSetup(db, "owner")).mimo,
    false,
  );
  expect(disabled).toEqual({ foreign: "forbidden" });
  expect(mockStore.get("custom")).toMatchObject({
    enabled: false,
    uid: "7",
    order: ["dennies"],
  });
});
test("a concurrent Mimo configuration is never overwritten", async () => {
  const snapshot = await readQuickSetup(db, "owner");
  mockStore.putConfig({
    ...defaultMimoConfig("owner", "h", "1300000001"),
    uid: "another",
    order: ["dennies"],
  });
  expect(await setQuickMimo(db, "owner", snapshot.mimo, true)).toEqual({
    h: "choose",
  });
  expect(mockStore.get("h")).toMatchObject({
    enabled: false,
    uid: "another",
    order: ["dennies"],
  });
});
test("partial Mimo setup opens account repair, then details returns to the correct page", async () => {
  jest
    .mocked(getHoyolabs)
    .mockResolvedValue([hoyo("ready"), hoyo("choose", ["2", "3"])] as any);
  await openQuickSetup({} as any, command(), db);
  await act("on-mimo");
  expect(session().page).toBe("mimo");
  expect(mockStore.get("ready")?.enabled).toBe(true);
  await act("account-choose");
  expect(session().page).toBe("account");
  expect(session().data.accounts).toHaveLength(2);
  expect(session().backLabel).toBe("返回快速設定");
  await act("back-settings");
  expect(session().page).toBe("mimo");
  expect(mockStore.get("choose")).toBeUndefined();
});
test("missing login offers recovery; disabling and bad reminder repair preserve existing settings", async () => {
  jest.mocked(getLegacyAccounts).mockResolvedValue([]);
  await openQuickSetup({} as any, command(), db);
  const reply = await act("on-daily");
  expect(JSON.stringify(reply.editReply.mock.calls)).toContain("/account");
  expect(values["autoDaily.owner"]).toBeUndefined();
  values["autoDaily.owner"] = { enabled: true, time: "8" };
  await openQuickSetup({} as any, command(), db);
  await act("off-daily");
  expect(values["autoDaily.owner"]).toMatchObject({
    enabled: false,
    time: "8",
  });
  jest
    .mocked(getLegacyAccounts)
    .mockResolvedValue([{ uid: "1", cookie: "test" }]);
  values["noteReminder.owner"] = {
    enabled: false,
    notifyType: "channel",
    energyMode: "amount",
    energyValue: 220,
  };
  const before = structuredClone(values["noteReminder.owner"]);
  const snapshot = await readQuickSetup(db, "owner");
  await expect(
    setQuickReminder({} as any, db, "owner", snapshot.reminder, true),
  ).rejects.toThrow("reminderFix");
  expect(values["noteReminder.owner"]).toEqual(before);
});
test("foreign and expired controls do not save; reopening invalidates the old setup", async () => {
  await openQuickSetup({} as any, command(), db);
  const foreign = click("on-daily", "stranger"),
    old = click("on-daily");
  await handleSettingPanel(foreign);
  expect(foreign.reply).toHaveBeenCalled();
  expect(db.set).not.toHaveBeenCalled();
  await openQuickSetup({} as any, command(), db);
  await handleSettingPanel(old);
  expect(old.reply.mock.calls[0][0].content).toContain("/setup");
  expect(db.set).not.toHaveBeenCalled();
});
test("reminder details return to setup without saving and stale details point at setup", async () => {
  await openQuickSetup({} as any, command(), db);
  await act("on-reminder");
  const stored = structuredClone(values["noteReminder.owner"]);
  const panel = await act("details-reminder");
  const reminder = [...__reminderWizardInternals.sessions.values()][0];
  expect(JSON.stringify(panel.editReply.mock.calls)).toContain("返回快速設定");
  reminder.draft.energyValue = 100;
  const i: any = {
    user: { id: "owner" },
    locale: "zh-TW",
    customId: `reminder:${reminder.token}:back-settings:setup`,
    isButton: () => true,
    isMessageComponent: () => true,
    isModalSubmit: () => false,
    isChannelSelectMenu: () => false,
    isStringSelectMenu: () => false,
    deferUpdate: jest.fn(async function (this: any) {
      this.deferred = true;
    }),
    editReply: jest.fn(),
    reply: jest.fn(async () => {}),
    isRepliable: () => true,
  };
  await handleReminderInteraction({} as any, i, db);
  expect(session().reopenCommand).toBe("setup");
  expect(values["noteReminder.owner"]).toEqual(stored);
  i.deferred = false;
  i.customId = `reminder:${reminder.token}:save:setup`;
  await handleReminderInteraction({} as any, i, db);
  expect(i.reply.mock.calls.at(-1)[0].content).toContain("/setup");
});
test.each(["en", "tw", "cn", "jp", "kr", "fr", "vi"])(
  "setup and paginated account repair fit component limits in %s",
  async (locale) => {
    values["owner.locale"] = locale;
    jest
      .mocked(getHoyolabs)
      .mockResolvedValue(
        Array.from({ length: 30 }, (_, n) => hoyo(`h${n}`, [`${n}`])) as any,
      );
    await openQuickSetup({} as any, command(), db);
    await act("on-daily");
    await act("on-redeem");
    await act("on-reminder");
    await act("on-mimo");
    for (const page of ["home", "mimo"]) {
      session().page = page;
      const payload = await session().render(session());
      const count = (c: any): number =>
        1 +
        (c.components || []).reduce((n: number, x: any) => n + count(x), 0) +
        (c.accessory ? count(c.accessory) : 0);
      expect(
        payload.components.reduce((n: number, c: any) => n + count(c), 0),
      ).toBeLessThanOrEqual(40);
      expect(() =>
        new ContainerBuilder(payload.components[0]).toJSON(),
      ).not.toThrow();
      expect(JSON.stringify(payload)).not.toContain("undefined");
    }
  },
);
