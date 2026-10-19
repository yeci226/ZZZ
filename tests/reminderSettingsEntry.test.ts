jest.mock("../src/utilities/utilities.js", () => ({ getUserLang: jest.fn(async () => "tw") }));
jest.mock("../src/utilities/core/config.js", () => ({ getConfig: jest.fn(() => ({})) }));
jest.mock("../src/utilities/settings/presentation.js", () => ({
  ...jest.requireActual("../src/utilities/settings/presentation.js"),
  renderSettingsPreview: jest.fn(async () => Buffer.from("preview")),
}));
import { openGeneralSettings } from "../src/utilities/settings/general.js";
import { __settingSessions, handleSettingPanel } from "../src/utilities/settings/panel.js";
import { __reminderWizardInternals, handleReminderInteraction } from "../src/utilities/zzz/reminderWizard.js";
import { REMINDER_COPY } from "../src/utilities/zzz/reminderCopy.js";

function button(customId: string): any {
  return {
    customId, user: { id: "owner" }, locale: "zh-TW", guild: null, channel: null,
    isRepliable: () => true, isButton: () => true, isMessageComponent: () => true,
    isModalSubmit: () => false, isChannelSelectMenu: () => false, isStringSelectMenu: () => false,
    deferUpdate: jest.fn(async function(this: any) { this.deferred = true; }),
    editReply: jest.fn(async () => {}), reply: jest.fn(async () => {}), showModal: jest.fn(),
  };
}
const reminderSession = () => [...__reminderWizardInternals.sessions.values()][0];
const settingsSession = () => [...__settingSessions.values()][0];
beforeEach(() => {
  __settingSessions.clear();
  __reminderWizardInternals.sessions.clear();
  __reminderWizardInternals.activeByUser.clear();
  jest.clearAllMocks();
});
async function open(raw?: any) {
  const values: Record<string, any> = { "owner.locale": "tw", "noteReminder.owner": raw };
  const db = { get: jest.fn(async (key: string) => structuredClone(values[key])), set: jest.fn(async (key: string, value: any) => { values[key] = structuredClone(value); return value; }) };
  const command: any = { user: { id: "owner" }, locale: "zh-TW", deferred: true, editReply: jest.fn(async () => {}) };
  await openGeneralSettings({} as any, command, db);
  const previous = settingsSession().token;
  const i = button(`settingui:${previous}:open-reminder`);
  await handleSettingPanel(i);
  return { db, values, i, previous };
}

test("settings opens the original reminder panel once, preserving existing configuration", async () => {
  const raw = { enabled: true, notifyType: "dm", energyMode: "amount", energyValue: 220 };
  const { db, i, values, previous } = await open(raw);
  expect(i.deferUpdate).toHaveBeenCalledTimes(1);
  expect(i.reply).not.toHaveBeenCalled();
  expect(i.editReply).toHaveBeenCalledTimes(1);
  expect(__settingSessions.has(previous)).toBe(false);
  expect(reminderSession().draft).toMatchObject(raw);
  expect(JSON.stringify(i.editReply.mock.calls[0][0])).toContain(":back-settings");
  expect(values["noteReminder.owner"]).toEqual(raw);
  expect(db.set).not.toHaveBeenCalled();
});

test("returning to settings discards unsaved reminder edits and invalidates the old panel", async () => {
  const { db } = await open();
  const s = reminderSession();
  s.draft.energyValue = 123; s.page = 2;
  const i = button(`reminder:${s.token}:back-settings`);
  await handleReminderInteraction({} as any, i, db);
  expect(i.editReply).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(i.editReply.mock.calls[0][0])).toContain("open-reminder");
  expect(__reminderWizardInternals.sessions.has(s.token)).toBe(false);
  expect(db.set).not.toHaveBeenCalled();
  const stale = button(`reminder:${s.token}:save`);
  await handleReminderInteraction({} as any, stale, db);
  expect(stale.reply.mock.calls[0][0].content).toContain("/settings");
  expect(db.set).not.toHaveBeenCalled();
});

test("foreign users cannot open a reminder panel from someone else's settings", async () => {
  const db = { get: jest.fn(async () => "tw"), set: jest.fn() };
  await openGeneralSettings({} as any, { user: { id: "owner" }, deferred: true, editReply: jest.fn() } as any, db);
  const i = button(`settingui:${settingsSession().token}:open-reminder`); i.user.id = "stranger";
  await handleSettingPanel(i);
  expect(__reminderWizardInternals.sessions.size).toBe(0);
  expect(i.deferUpdate).not.toHaveBeenCalled();
  expect(db.set).not.toHaveBeenCalled();
});

test("reminders opened from settings still save one item without enabling automation", async () => {
  const { db, values } = await open();
  const s = reminderSession();
  await handleReminderInteraction({} as any, button(`reminder:${s.token}:page-2`), db);
  s.draft.energyMode = "amount"; s.draft.energyValue = 220;
  await handleReminderInteraction({} as any, button(`reminder:${s.token}:save`), db);
  expect(values["noteReminder.owner"]).toMatchObject({ enabled: false, energyMode: "amount", energyValue: 220 });
  expect(reminderSession().page).toBe(0);
});

test("every reminder expiration message points at the surviving settings entry", () => {
  for (const copy of Object.values(REMINDER_COPY)) {
    expect(copy.expired).toContain("/settings");
    expect(copy.expired).not.toMatch(/\/reminder|\/提醒/);
  }
});
