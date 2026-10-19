jest.mock("../src/utilities/utilities.js", () => ({
  getUserLang: jest.fn().mockResolvedValue("tw"),
}));
jest.mock("../src/utilities/core/config.js", () => ({
  getConfig: jest.fn(() => ({})),
}));

import { uiText } from "../src/utilities/settings/presentation";

import { ButtonStyle, ComponentType, MessageFlags } from "discord.js";
import { normalizeNoteReminderConfig } from "../src/utilities/zzz/reminderConfig";
import { REMINDER_COPY } from "../src/utilities/zzz/reminderCopy";
import {
  __reminderWizardInternals,
  buildReminderMessage,
  handleReminderInteraction,
  hasReminderTrigger,
  parseReminderInteger,
  type ReminderWizardSession,
} from "../src/utilities/zzz/reminderWizard";

function makeSession(overrides: Partial<ReminderWizardSession> = {}) {
  const draft = normalizeNoteReminderConfig({
    notifyType: "dm",
    notificationEnabled: true,
  });
  return __reminderWizardInternals.createSession({
    userId: "user-1",
    locale: "tw",
    draft,
    isNew: true,
    page: 1,
    enableOnSave: false,
    ...overrides,
  });
}

function buttonInteraction(session: ReminderWizardSession, action: string) {
  return {
    customId: `reminder:${session.token}:${action}`,
    user: { id: session.userId },
    locale: "zh-TW",
    guild: null,
    channel: null,
    deferred: false,
    replied: false,
    isRepliable: () => true,
    isButton: () => true,
    isMessageComponent: () => true,
    isModalSubmit: () => false,
    isChannelSelectMenu: () => false,
    isStringSelectMenu: () => false,
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function modalInteraction(
  session: ReminderWizardSession,
  action: string,
  values: Record<string, string>,
) {
  return {
    customId: `reminder:${session.token}:${action}`,
    user: { id: session.userId },
    locale: "zh-TW",
    deferred: false,
    replied: false,
    fields: { getTextInputValue: (key: string) => values[key] ?? "" },
    isRepliable: () => true,
    isButton: () => false,
    isMessageComponent: () => false,
    isModalSubmit: () => true,
    isChannelSelectMenu: () => false,
    isStringSelectMenu: () => false,
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe("reminder setup wizard", () => {
  beforeEach(() => {
    __reminderWizardInternals.sessions.clear();
    __reminderWizardInternals.activeByUser.clear();
  });

  it("contains complete copy for all seven locales", () => {
    const englishKeys = Object.keys(REMINDER_COPY.en).sort();
    expect(Object.keys(REMINDER_COPY).sort()).toEqual(["cn", "en", "fr", "jp", "kr", "tw", "vi"]);
    for (const localized of Object.values(REMINDER_COPY)) {
      expect(Object.keys(localized).sort()).toEqual(englishKeys);
      expect(localized.steps).toHaveLength(6);
      expect(localized.stepDescriptions).toHaveLength(6);
      expect(Object.values(localized).flat().every((value) => String(value).trim().length > 0)).toBe(true);
    }
  });

  it("builds every page as Components V2 and only shows the full summary where needed", () => {
    const session = makeSession();
    for (const locale of Object.keys(REMINDER_COPY) as ReminderWizardSession["locale"][]) {
      session.locale = locale;
      for (let page = 1; page <= 5; page++) {
        session.page = page as ReminderWizardSession["page"];
        const payload = buildReminderMessage(session);
        expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
        expect(payload.components).toHaveLength(1);
        const container = payload.components[0].toJSON();
        expect(container.type).toBe(ComponentType.Container);
        expect(container.components.length).toBeLessThanOrEqual(10);
        expect(JSON.stringify(container)).toContain(":save");
        expect(JSON.stringify(container)).not.toContain(`${page}／6`);
        if (page < 6) expect(JSON.stringify(container)).not.toContain(`**${REMINDER_COPY[session.locale].status}:**`);
        else expect(JSON.stringify(container)).toContain(`**${REMINDER_COPY[session.locale].status}:**`);
      }
    }
  });

  it("shows units instead of bare numbers in every locale's time menus", () => {
    const session = makeSession({ page: 2 });
    for (const locale of Object.keys(REMINDER_COPY) as ReminderWizardSession["locale"][]) {
      session.locale = locale;
      const container = buildReminderMessage(session).components[0].toJSON() as any;
      const selects = container.components
        .filter((component: any) => component.type === ComponentType.ActionRow)
        .flatMap((component: any) => component.components)
        .filter((component: any) => component.type === ComponentType.StringSelect);
      const values = selects.find((component: any) => component.custom_id.endsWith(":energy-value"));
      expect(values.options).toHaveLength(4);
      expect(values.options.every((option: any) => !/^\d+$/.test(option.label))).toBe(true);
    }
  });

  it("validates every custom integer boundary", () => {
    expect(parseReminderInteger("15", 15, 720)).toBe(15);
    expect(parseReminderInteger("720", 15, 720)).toBe(720);
    expect(parseReminderInteger("14", 15, 720)).toBeNull();
    expect(parseReminderInteger("721", 15, 720)).toBeNull();
    expect(parseReminderInteger("1.5", 1, 12)).toBeNull();
    expect(parseReminderInteger("abc", 1, 12)).toBeNull();
  });

  it("uses explicit Markdown headings and readable time labels", () => {
    const session = makeSession({ locale: "tw", page: 2 });
    let json = JSON.stringify(buildReminderMessage(session).components[0].toJSON());
    expect(json).toContain("**電量**");
    expect(json).toContain("**提醒條件**");
    expect(json).toContain("30 分鐘");
    expect(json).toContain("1 小時");

    session.page = 3;
    json = JSON.stringify(buildReminderMessage(session).components[0].toJSON());
    expect(json).toContain(`**${REMINDER_COPY.tw.daily}**`);
    expect(json).toContain("重置前 3 小時");

    session.page = 4;
    json = JSON.stringify(buildReminderMessage(session).components[0].toJSON());
    expect(json).toContain(`**${REMINDER_COPY.tw.weekly}**`);
    expect(json).toContain("重置前 1 天");
    expect(json).toContain("1100 點");

    session.page = 5;
    json = JSON.stringify(buildReminderMessage(session).components[0].toJSON());
    expect(json).toContain("**活動**");
    expect(json).toContain("結束前 1 天");
  });

  it("requires at least one enabled reminder", () => {
    const config = normalizeNoteReminderConfig({
      energyMode: "off", vitalityEnabled: false, cardSignEnabled: false,
      vhsEnabled: false, bountyEnabled: false, weeklyEnabled: false, eventEnabled: false,
    });
    expect(hasReminderTrigger(config)).toBe(false);
    config.eventEnabled = true;
    expect(hasReminderTrigger(config)).toBe(true);
  });

  function memoryDb(initial?: any) {
    let stored = initial && structuredClone(initial);
    return { get: jest.fn(async () => stored), set: jest.fn(async (_key, value) => { stored = structuredClone(value); }) };
  }
  it("saves one item immediately and keeps saved items when another edit is cancelled", async () => {
    const session = makeSession({ isNew: false, page: 0 });
    const db = memoryDb(session.draft);
    await handleReminderInteraction({} as any, buttonInteraction(session, "page-2"), db as any);
    session.draft.energyValue = 120;
    expect(db.set).not.toHaveBeenCalled();
    await handleReminderInteraction({} as any, buttonInteraction(session, "save"), db as any);
    expect((await db.get()).energyValue).toBe(120);
    expect(session.page).toBe(0);
    await handleReminderInteraction({} as any, buttonInteraction(session, "page-3"), db as any);
    session.draft.dailyHours = 6;
    await handleReminderInteraction({} as any, buttonInteraction(session, "cancel"), db as any);
    expect(session.draft.energyValue).toBe(120);
    expect(session.draft.dailyHours).toBe(3);
    expect(__reminderWizardInternals.sessions.has(session.token)).toBe(true);
    await handleReminderInteraction({} as any, buttonInteraction(session, "done"), db as any);
    expect(__reminderWizardInternals.sessions.has(session.token)).toBe(false);
  });
  it("first partial save stays disabled and preserves unrelated defaults", async () => {
    const session = makeSession({ page: 2, baseline: normalizeNoteReminderConfig(undefined) });
    const db = memoryDb();
    session.draft.energyValue = 120;
    await handleReminderInteraction({} as any, buttonInteraction(session, "save"), db as any);
    expect(await db.get()).toMatchObject({ enabled: false, energyValue: 120 });
    expect(session.page).toBe(0);
  });
  it("serializes repeated enable clicks without switching the state off", async () => {
    const session = makeSession({ isNew: false, page: 0 });
    session.draft.enabled = false;
    const db = memoryDb(session.draft);
    await Promise.all([1, 2].map(() => handleReminderInteraction({} as any, buttonInteraction(session, "enable"), db as any)));
    expect((await db.get()).enabled).toBe(true);
    expect(session.busy).toBe(false);
  });
  it("detects a conflicting edit and retains the draft", async () => {
    const session = makeSession({ isNew: false, page: 2 });
    const db = memoryDb({ ...session.draft, energyValue: 240 });
    session.draft.energyValue = 120;
    await handleReminderInteraction({} as any, buttonInteraction(session, "save"), db as any);
    expect(session.error).toBe(uiText("tw", "conflict"));
    expect(session.draft.energyValue).toBe(120);
    expect((await db.get()).energyValue).toBe(240);
  });
  it("does not persist a cancelled new item", async () => {
    const session = makeSession();
    const db = memoryDb();
    await handleReminderInteraction({} as any, buttonInteraction(session, "cancel"), db as any);
    expect(db.set).not.toHaveBeenCalled();
    expect(session.page).toBe(0);
  });

  it("opens custom modals without deferring the component first", async () => {
    const session = makeSession({ page: 2 });
    const interaction = buttonInteraction(session, "custom-energy");
    await handleReminderInteraction({} as any, interaction, { get: jest.fn(), set: jest.fn() } as any);
    expect(interaction.showModal).toHaveBeenCalled();
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    const modal = interaction.showModal.mock.calls[0][0].toJSON();
    expect(modal.components[0].components[0].value).toBe("1 小時");
    expect(modal.components[0].components[0].placeholder).toContain("30 分鐘");
  });

  it("accepts natural custom durations while preserving configured ranges", async () => {
    const session = makeSession({ page: 3 });
    const db = { get: jest.fn(), set: jest.fn() };
    const valid = modalInteraction(session, "custom-daily", { hours: "90分鐘" });
    await handleReminderInteraction({} as any, valid, db as any);
    expect(session.draft.dailyHours).toBe(1.5);
    expect(session.error).toBeUndefined();
    expect(db.set).not.toHaveBeenCalled();

    const invalid = modalInteraction(session, "custom-daily", { hours: "30分鐘" });
    await handleReminderInteraction({} as any, invalid, db as any);
    expect(session.draft.dailyHours).toBe(1.5);
    expect(session.error).toBe(REMINDER_COPY.tw.invalidDuration);
  });

  it("preserves an existing configuration while toggling enabled state", async () => {
    const session = makeSession({ isNew: false, page: 0 });
    session.draft.enabled = true;
    session.draft.weeklyTarget = 1600;
    const db = memoryDb(session.draft);
    const interaction = buttonInteraction(session, "disable");
    await handleReminderInteraction({} as any, interaction, db as any);
    expect(db.set).toHaveBeenCalledWith(
      "noteReminder.user-1",
      expect.objectContaining({ enabled: false, weeklyTarget: 1600 }),
    );
  });

  it("routes enable through delivery setup when the saved destination is invalid", async () => {
    const session = makeSession({ isNew: false, page: 0 });
    session.draft.enabled = true;
    session.draft.notificationEnabled = false;
    const db = memoryDb(session.draft);
    const interaction = buttonInteraction(session, "enable");
    await handleReminderInteraction({} as any, interaction, db as any);
    expect(session.page).toBe(1);
    expect(session.enableOnSave).toBe(false);
    expect(db.set).not.toHaveBeenCalled();
  });

  it("refuses enabling without an active trigger", async () => {
    const session = makeSession({ isNew: false, page: 0 });
    Object.assign(session.draft, { energyMode: "off", vitalityEnabled: false, cardSignEnabled: false, vhsEnabled: false, bountyEnabled: false, weeklyEnabled: false, eventEnabled: false });
    const db = memoryDb(session.draft);
    await handleReminderInteraction({} as any, buttonInteraction(session, "enable"), db as any);
    expect(session.error).toBe(REMINDER_COPY.tw.noTriggers);
    expect(db.set).not.toHaveBeenCalled();
  });

  it("rejects expired sessions and interactions from another user", async () => {
    const expired = makeSession();
    expired.expiresAt = Date.now() - 1;
    const expiredInteraction = buttonInteraction(expired, "next");
    await handleReminderInteraction({} as any, expiredInteraction, { get: jest.fn(), set: jest.fn() } as any);
    expect(expiredInteraction.reply).toHaveBeenCalled();
    expect(expiredInteraction.deferUpdate).not.toHaveBeenCalled();

    const owned = makeSession();
    const stranger = buttonInteraction(owned, "next");
    stranger.user.id = "user-2";
    await handleReminderInteraction({} as any, stranger, { get: jest.fn(), set: jest.fn() } as any);
    expect(stranger.reply).toHaveBeenCalled();
    expect(stranger.deferUpdate).not.toHaveBeenCalled();
  });

  it("uses a danger button for disabling an active existing reminder", () => {
    const session = makeSession({ isNew: false, page: 0 });
    session.draft.enabled = true;
    const payload = buildReminderMessage(session);
    const container = payload.components[0].toJSON() as any;
    const toggle = container.components.filter((component: any) => component.type === ComponentType.ActionRow).flatMap((r: any) => r.components).find((c: any) => c.custom_id.endsWith(":disable"));
    expect(toggle.style).toBe(ButtonStyle.Danger);
  });

  it("uses step wording for navigation in every locale", () => {
    expect(REMINDER_COPY.tw.back).toBe("上一步");
    expect(REMINDER_COPY.tw.next).toBe("下一步");
    expect(REMINDER_COPY.cn.back).toBe("上一步");
    expect(REMINDER_COPY.cn.next).toBe("下一步");
    expect(REMINDER_COPY.en.back).toBe("Previous step");
    expect(REMINDER_COPY.en.next).toBe("Next step");
  });
});
