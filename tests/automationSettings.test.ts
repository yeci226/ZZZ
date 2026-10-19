jest.mock("../src/utilities/accountStore.js", () => ({ getLegacyAccounts: jest.fn(async () => []) }));
jest.mock("../src/utilities/mimo/panel.js", () => ({ openMimoSettings: jest.fn(async () => {}) }));
import { getLegacyAccounts } from "../src/utilities/accountStore.js";
import { openMimoSettings } from "../src/utilities/mimo/panel.js";
import { normalizeAutomation, openAutomationSettings } from "../src/utilities/settings/automation.js";
import { openGeneralSettings } from "../src/utilities/settings/general.js";
import * as settingsCommand from "../src/commands/slash/settings.js";
import type { GachaArchiveAccount } from "../src/utilities/zzz/gachaArchive.js";
import { __settingSessions, handleSettingPanel, type SettingSession } from "../src/utilities/settings/panel.js";

function setup(raw?: any, feature = "autoDaily") {
  const values: Record<string, any> = { "owner.locale": "tw", [`${feature}.owner`]: raw };
  const db = { get: jest.fn(async (key: string) => structuredClone(values[key])), set: jest.fn(async (key: string, value: any) => { values[key] = structuredClone(value); }) };
  const i: any = { user: { id: "owner" }, locale: "zh-TW", deferred: true, guildId: "guild", editReply: jest.fn(async () => {}) };
  return { values, db, i };
}
const session = () => [...__settingSessions.values()][0];
async function action(s: SettingSession, name: string, value?: string) {
  await s.action(s, name, { values: [value], isStringSelectMenu: () => value !== undefined, isChannelSelectMenu: () => false });
}
beforeEach(() => { __settingSessions.clear(); jest.clearAllMocks(); });

test("legacy configs remain enabled and keep channel, tag and schedule semantics", () => {
  expect(normalizeAutomation({ time: "24", tag: true, channelId: "old", extra: 42 }, "autoDaily")).toMatchObject({ enabled: true, time: "0", tag: "true", notifyType: "channel", channelId: "old", extra: 42 });
  expect(normalizeAutomation(undefined, "autoDaily")).toMatchObject({ enabled: false, time: "12", notifyType: "dm" });
});

test("saving a schedule while off does not enable automation; cancel discards edits", async () => {
  const { db, i, values } = setup();
  await openAutomationSettings({} as any, i, db, "autoDaily");
  const s = session();
  await action(s, "edit-time"); await action(s, "time-value", "7");
  expect(db.set).not.toHaveBeenCalled();
  await action(s, "save");
  expect(values["autoDaily.owner"]).toMatchObject({ enabled: false, time: "7" });
  await action(s, "edit-time"); await action(s, "time-value", "9"); await action(s, "cancel");
  expect(s.draft.time).toBe("7");
});

test("saving notifications preserves disabled state and unrelated live changes", async () => {
  const { db, i, values } = setup({ enabled: false, time: "8", notifyType: "dm" });
  await openAutomationSettings({} as any, i, db, "autoDaily");
  const s = session();
  await action(s, "edit-notification"); await action(s, "notify-value", "off");
  values["autoDaily.owner"].time = "10";
  await action(s, "save");
  expect(values["autoDaily.owner"]).toMatchObject({ enabled: false, time: "10", notificationEnabled: false });
});

test("same-item conflicts do not overwrite newer settings", async () => {
  const { db, i, values } = setup({ time: "8" });
  await openAutomationSettings({} as any, i, db, "autoDaily");
  const s = session();
  await action(s, "edit-time"); await action(s, "time-value", "9"); values["autoDaily.owner"].time = "11";
  await expect(action(s, "save")).rejects.toThrow("settings_conflict");
  expect(db.set).not.toHaveBeenCalled();
});

test.each(["autoDaily", "autoRedeem"] as const)("%s can be disabled without valid accounts and retains preferences", async feature => {
  const { db, i, values } = setup({ time: "8", channelId: "old", tag: "true" }, feature);
  await openAutomationSettings({} as any, i, db, feature);
  const s = session();
  await action(s, "edit-enabled"); await action(s, "enabled-value", "false"); await action(s, "save");
  expect(values[`${feature}.owner`]).toMatchObject({ enabled: false, channelId: "old", tag: "true" });
  expect(getLegacyAccounts).not.toHaveBeenCalled();
  await action(s, "edit-enabled"); await action(s, "enabled-value", "true");
  await expect(action(s, "save")).rejects.toThrow("auth");
  expect(values[`${feature}.owner`].enabled).toBe(false);
});

test("channel notification rejects an unavailable destination before writing", async () => {
  const { db, i } = setup({ enabled: false, notifyType: "dm" });
  await openAutomationSettings({ guilds: { fetch: jest.fn(async () => null) } } as any, i, db, "autoDaily");
  const s = session();
  await action(s, "edit-notification"); await action(s, "notify-value", "channel");
  await expect(action(s, "save")).rejects.toThrow("invalid");
  expect(db.set).not.toHaveBeenCalled();
});

function click(token: string, action: string): any {
  return { user: { id: "owner" }, locale: "zh-TW", guildId: "guild", deferred: false, isMessageComponent: () => true,
    customId: `settingui:${token}:${action}`, deferUpdate: jest.fn(async function(this: any) { this.deferred = true; }), editReply: jest.fn(async () => {}), reply: jest.fn() };
}

test("settings shortcuts open a new panel exactly once and back returns to settings", async () => {
  const { db, i } = setup();
  await openGeneralSettings({} as any, i, db);
  const home = JSON.stringify(i.editReply.mock.calls[0][0]);
  expect(home).toContain("自動同步抽卡紀錄"); expect(home).not.toContain("每週封存");
  expect(home).toContain("open-daily"); expect(home).toContain("open-redeem"); expect(home).toContain("open-mimo"); expect(home).toContain("open-reminder");
  const i2 = click(session().token, "open-daily");
  await handleSettingPanel(i2);
  expect(i2.editReply).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(i2.editReply.mock.calls[0][0])).toContain("自動簽到");
  const i3 = click(session().token, "back-settings"); await handleSettingPanel(i3);
  expect(i3.editReply).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(i3.editReply.mock.calls[0][0])).toContain("open-mimo");
  expect(db.set).not.toHaveBeenCalled();
});

test("Mimo shortcut uses its existing settings panel", async () => {
  const { db, i } = setup(), client: any = {};
  await openGeneralSettings(client, i, db);
  await action(session(), "open-mimo");
  expect(openMimoSettings).toHaveBeenCalledWith(client, expect.anything(), db, expect.any(Function));
});

test.each(["en", "tw", "cn", "jp", "kr", "fr", "vi"])("settings home stays within Discord component limits in %s", async locale => {
  const { db, i, values } = setup(); values["owner.locale"] = locale;
  await openGeneralSettings({} as any, i, db);
  const payload = i.editReply.mock.calls[0][0];
  function count(c: any): number { return 1 + (c.components || []).reduce((n: number, child: any) => n + count(child), 0) + (c.accessory ? count(c.accessory) : 0); }
  expect(payload.components.reduce((n: number, c: any) => n + count(c), 0)).toBeLessThanOrEqual(40);
  const { ContainerBuilder } = await import("discord.js");
  expect(() => new ContainerBuilder(payload.components[0]).toJSON()).not.toThrow();
});


test.each(["en", "tw", "cn", "jp", "kr", "fr", "vi"])("original controls and individual feature rows fit with archive pagination in %s", async locale => {
  const { db, i, values } = setup();
  values["owner.locale"] = locale;
  values["owner.paintingMode"] = true;
  values["owner.profileStyle"] = "current";
  const rows: GachaArchiveAccount[] = Array.from({ length: 18 }, (_, index) => ({
    ownerId: "owner", uid: String(100000000 + index), region: "prod_gf_jp",
    source: "official", weeklyEnabled: true, lastSyncedAt: null, syncStatus: "idle",
    lastError: null, orphanedAt: null, purgeAfter: null, purgeWarnedAt: null, everLinked: true,
  }));
  const build = settingsCommand.buildSettingsComponents;
  const spy = jest.spyOn(settingsCommand, "buildSettingsComponents").mockImplementation(
    (owner, tr, database, page) => build(owner, tr, database, page, rows),
  );
  try {
    await openGeneralSettings({} as any, i, db, 1);
    const container = i.editReply.mock.calls[0][0].components[0];
    const controls: any[] = [];
    function visit(c: any) {
      controls.push(c);
      for (const child of c.components || []) visit(child);
      if (c.accessory) visit(c.accessory);
    }
    visit(container);
    expect(controls.length).toBeLessThanOrEqual(40);
    expect(container.accent_color).toBeUndefined();
    expect(container.components[0].content).toMatch(/^## /);
    const control = (id: string) => controls.find(c => c.custom_id === id);
    expect(control("settings_togglePainting")).toMatchObject({ type: 2, style: 3 });
    expect(control("settings_toggleRankPainting")).toMatchObject({ type: 2, style: 2 });
    expect(control("settings_selectProfileStyle").options.find((o: any) => o.default).value).toBe("current");
    expect(control("settings_selectLocale").options.find((o: any) => o.default).value).toBe(locale);
    expect(control("settings_selectGachaClear").options).toHaveLength(8);
    expect(control("settings_gachaArchivePage:0").disabled).toBe(false);
    expect(control("settings_gachaArchivePage:2").disabled).toBe(false);
    // Shortcuts may share a row when the archive pagination consumes more components.
    const actions = controls.filter(c => c.custom_id?.startsWith("settingui:")).map(c => c.custom_id.split(":")[2]);
    expect(actions).toEqual(expect.arrayContaining(["open-setup", "open-daily", "open-redeem", "open-mimo", "open-reminder"]));
    const shortcutText = controls.filter(c => c.content).map(c => c.content).join("\n");
    const { automationText } = await import("../src/utilities/settings/automationCopy.js");
    for (const feature of ["daily", "redeem", "mimo", "reminder"] as const) {
      expect(shortcutText).toContain(automationText(locale, feature));
      expect(shortcutText).toContain(automationText(locale, `${feature}Desc`));
    }
    expect(controls.length).toBeLessThanOrEqual(40);
    if (locale === "tw") {
      const text = controls.filter(c => c.content).map(c => c.content).join("\n");
      expect(text).toContain("已儲存的抽卡紀錄");
      expect(text).not.toMatch(/封存|目前版|正式版/);
      expect(control("settings_selectProfileStyle").options.map((o: any) => o.label))
        .toEqual(["樣式一：固定影畫插圖", "樣式二：可調整角色插圖"]);
    }
    expect(controls.reduce((length, c) => length + (c.content?.length || 0), 0)).toBeLessThanOrEqual(4000);
    const { ContainerBuilder } = await import("discord.js");
    expect(() => new ContainerBuilder(container).toJSON()).not.toThrow();
    expect(db.set).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});
