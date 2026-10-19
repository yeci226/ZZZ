import { GachaSimulationStore } from "../src/utilities/zzz/gachaSimulationStore";
import { getSimulationCatalog } from "../src/utilities/zzz/gachaSimulationCatalog";
import { createSettingsPanel, settingsAction } from "../src/utilities/zzz/gachaSimulationSettingsUi";
import { __settingSessions, handleSettingPanel, openSettingPanel } from "../src/utilities/settings/panel";
import { uiText, uiFont } from "../src/utilities/settings/presentation";
jest.mock("../src/utilities/settings/presentation", () => ({ ...jest.requireActual("../src/utilities/settings/presentation"), renderSettingsPreview: jest.fn(async () => Buffer.from("png")) }));
function button() { return { isButton: () => true, isStringSelectMenu: () => false, isModalSubmit: () => false, deferUpdate: jest.fn(async () => {}), editReply: jest.fn(async () => {}), showModal: jest.fn(async () => {}) } as any; }
describe("gacha settings save one item", () => {
  let store: GachaSimulationStore;
  beforeEach(() => { store = new GachaSimulationStore(":memory:"); });
  afterEach(() => store.close());
  const banner = getSimulationCatalog().banners.find(b => b.version === "3.2" && b.pool === "character")!;
  test("save applies animation immediately; cancel another item does not undo it; done closes", async () => {
    const panel = createSettingsPanel(store, "u", banner), i = button(); panel.value.locale = "tw";
    const before = store.preferences("u").animation;
    await settingsAction(store, panel, "animation", i);
    await settingsAction(store, panel, "animation-value", i);
    expect(store.preferences("u").animation).toBe(before);
    await settingsAction(store, panel, "save", i);
    expect(store.preferences("u").animation).toBe(!before);
    expect(panel.value.view).toBe("home");
    await settingsAction(store, panel, "animation", i);
    await settingsAction(store, panel, "animation-value", i);
    await settingsAction(store, panel, "discard", i);
    expect(store.preferences("u").animation).toBe(!before);
    expect(panel.value.prefs.animation).toBe(!before);
    await settingsAction(store, panel, "done-settings", i);
    await expect(settingsAction(store, store.panel(panel.id, "u"), "animation", i)).rejects.toThrow(uiText("tw", "expired"));
  });
  test("preserves unrelated preferences and detects same-item changes", async () => {
    const panel = createSettingsPanel(store, "u", banner), i = button();
    await settingsAction(store, panel, "animation", i);
    await settingsAction(store, panel, "animation-value", i);
    const external = store.preferences("u"); external.sCandidates.weapon = ["a", "b", "c", "d", "e", "f"]; store.savePreferences("u", external);
    await settingsAction(store, panel, "save", i);
    expect(store.preferences("u").sCandidates.weapon).toEqual(external.sCandidates.weapon);
    await settingsAction(store, panel, "animation", i);
    const other = store.preferences("u"); other.animation = !other.animation; store.savePreferences("u", other);
    await expect(settingsAction(store, panel, "save", i)).rejects.toThrow(uiText(undefined, "conflict"));
  });
  test("saves the editing baseline before opening a rules modal", async () => {
    const panel = createSettingsPanel(store, "u", banner), i = button();
    await settingsAction(store, panel, "base", i);
    expect(i.showModal).toHaveBeenCalledTimes(1); expect(i.deferUpdate).not.toHaveBeenCalled();
    expect(store.panel(panel.id, "u").value.group).toBe("base");
  });
});

test("shared panel rejects foreign and expired buttons without mutating", async () => {
  __settingSessions.clear();
  const action = jest.fn(async () => {}), render = jest.fn(async () => ({}));
  const command: any = { user: { id: "owner" }, deferred: true, editReply: jest.fn(async () => {}) };
  await openSettingPanel(command, { locale: "tw", page: "home", base: {}, draft: {}, data: {}, action, render });
  const s = [...__settingSessions.values()][0];
  const i: any = { isMessageComponent: () => true, customId: `settingui:${s.token}:save`, user: { id: "stranger" }, reply: jest.fn(async () => {}), deferUpdate: jest.fn() };
  await handleSettingPanel(i); expect(action).not.toHaveBeenCalled(); expect(i.deferUpdate).not.toHaveBeenCalled();
  i.user.id = "owner"; s.expires = 0; await handleSettingPanel(i); expect(action).not.toHaveBeenCalled();
  __settingSessions.clear();
});
test("presentation keeps the project's original game fonts", () => {
  expect(uiFont("tw")).toContain("SettingsGame-tw");
  expect(uiFont("ja-JP")).toContain("SettingsGame-jp");
  expect(uiFont("fr")).not.toContain("Noto");
});
