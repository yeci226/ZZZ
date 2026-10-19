import { GachaSimulationStore } from "../src/utilities/zzz/gachaSimulationStore.js";
import { getSimulationCatalog, selectSimulationBanner } from "../src/utilities/zzz/gachaSimulationCatalog.js";
import { createSettingsPanel, settingsAction, settingsPayload, hasSettingsChanges } from "../src/utilities/zzz/gachaSimulationSettingsUi.js";
import { createResourcePanel, resourceAction, resourcePayload, resourceResultPayload } from "../src/utilities/zzz/gachaSimulationResourceUi.js";
import { createDetailsPanel, detailsAction, detailsPayload } from "../src/utilities/zzz/gachaSimulationDetailsUi.js";
import { runResourcePlan } from "../src/utilities/zzz/gachaSimulationAnalysis.js";
import { defaultSimulationRules } from "../src/utilities/zzz/gachaSimulationRules.js";
import { getInteractionPreflight } from "../src/utilities/shared/interactionPreflight.js";

const modal = (fields: Record<string, string>): any => ({ isButton: () => false, isStringSelectMenu: () => false, isModalSubmit: () => true, fields: { getTextInputValue: (id: string) => fields[id] || "" }, deferUpdate: jest.fn(), editReply: jest.fn() });
const button = (): any => ({ isButton: () => true, isStringSelectMenu: () => false, isModalSubmit: () => false, deferUpdate: jest.fn(), editReply: jest.fn(), showModal: jest.fn() });
const catalog = getSimulationCatalog(), banner = selectSimulationBanner(catalog);
let store: GachaSimulationStore;
beforeEach(() => { store = new GachaSimulationStore(":memory:"); });
afterEach(() => store.close());

it("applies edits only on save and can resume a saved rules version", async () => {
  const panel = createSettingsPanel(store, "owner", banner);
  panel.value.locale = "tw";
  const open = button(); await settingsAction(store, panel, "base", open);
  expect(open.showModal).toHaveBeenCalledTimes(1); expect(open.deferUpdate).not.toHaveBeenCalled();
  await settingsAction(store, panel, "baseSubmit", modal({ s: "2", a: "8", b: "90" }));
  expect(store.preferences("owner").active.character).toBe("game");
  await settingsAction(store, panel, "save", button());
  const id = store.preferences("owner").active.character;
  expect(store.rules("owner", "character", id).rules.s.base).toBe(.02);
  await settingsAction(store, panel, "reset", button());
  expect(store.preferences("owner").active.character).toBe(id);
  await settingsAction(store, panel, "save", button());
  expect(store.preferences("owner").active.character).toBe("game");
  expect(store.rules("owner", "character", id).rules.s.base).toBe(.02);
  expect(JSON.stringify((await settingsPayload(store, panel)).components)).toContain("已儲存");
});

it("keeps resource inputs and game probabilities separate from active custom settings", async () => {
  const rule = defaultSimulationRules("character"); rule.mode = "custom"; rule.s.hard = 100;
  const version = store.saveRules("owner", rule), prefs = store.preferences("owner"); prefs.active.character = version.id; store.savePreferences("owner", prefs);
  const panel = createResourcePanel(store, "owner", banner);
  expect(panel.value.input.stages[0].rules.mode).toBe("game");
  await resourceAction(store, panel, "resourcesSubmit", modal({ monochrome: "3200", reserve: "1600", polychrome: "12800", tapes: "30" }));
  await resourceAction(store, panel, "stage-characterSubmit", modal({ target: "1", pity: "30", guaranteed: "不確定", a: "5/關" }));
  expect(panel.value.input.stages[0]).toEqual(expect.objectContaining({ target: 1, sinceS: 60, guaranteed: null }));
  await resourceAction(store, panel, "stage-weaponSubmit", modal({ target: "0", pity: "80", guaranteed: "小保底" }));
  expect(panel.value.input.stages[1].target).toBe(0);
  expect(store.preferences("owner").active.character).toBe(version.id);
  expect(store.state("owner", "character").total).toBe(0);
  await expect(resourceAction(store, panel, "stage-characterSubmit", modal({ target: "1", pity: "91", guaranteed: "小保底" }))).rejects.toThrow("已墊");
});

it.each(["gacha-simulation-settings", "gacha-simulation-details"])("acknowledges %s without account lookup", commandName => {
  expect(getInteractionPreflight({ commandName, options: {} } as any)).toEqual({ deferBeforeDrain: true, skipPendingLoginDrain: true, skipLocaleLookup: true });
});

it("previews animation edits then saves immediately before returning home", async () => {
  const panel = createSettingsPanel(store, "owner", banner);
  await settingsAction(store, panel, "animation", button());
  await settingsAction(store, panel, "animation-value", button());
  expect(hasSettingsChanges(store, panel)).toBe(true);
  expect(panel.value.prefs.animation).toBe(false);
  expect(store.preferences("owner").animation).toBe(true);
  const payload = await settingsPayload(store, panel);
  const json = JSON.stringify(payload.components);
  expect(json).toContain(":save");
  expect(json).not.toContain('"custom_id":"gsim:panel:' + panel.id + ':base"');
  await settingsAction(store, panel, "save", button());
  expect(store.preferences("owner").animation).toBe(false);
  expect(hasSettingsChanges(store, panel)).toBe(false);
  expect(panel.value.view).toBe("home");
  expect(store.state("owner", "character").total).toBe(0);
});

it("lets users reach charts and history without changing progress or losing filters", async () => {
  const panel = createDetailsPanel(store, "owner", banner);
  panel.value.bannerId = banner.id;
  await detailsAction(store, panel, "charts", button());
  const choose: any = { ...button(), isButton: () => false, isStringSelectMenu: () => true, values: ["cdf"] };
  await detailsAction(store, panel, "page", choose);
  expect(panel.value.menu).toBeUndefined();
  expect(panel.value.page).toBe("cdf");
  await detailsAction(store, panel, "home", button());
  expect(panel.value.bannerId).toBe(banner.id);
  const json = JSON.stringify((await detailsPayload(store, panel)).components);
  expect(json).toContain(":resource");
  expect(json).not.toContain(":bulk10000");
  await detailsAction(store, panel, "history", button());
  expect(panel.value.page).toBe("history");
  expect(store.state("owner", "character").total).toBe(0);
});

it("keeps resource results separate while expanding examples and charts", async () => {
  const panel = createResourcePanel(store, "owner", banner);
  panel.value.input.resources.tapes = 100;
  panel.value.input.rounds = 100;
  panel.value.result = runResourcePlan(panel.value.input); panel.value.showResult = true;
  const initial = JSON.stringify(panel.value.input), result = JSON.stringify(panel.value.result);
  expect(JSON.stringify((await resourceResultPayload(panel)).components)).not.toContain("95%");
  await resourceAction(store, panel, "showExample", button());
  expect(panel.value.resultView).toBe("example");
  await resourceAction(store, panel, "resultHome", button());
  await resourceAction(store, panel, "showCharts", button());
  expect(panel.value.resultView).toBe("charts");
  await resourceAction(store, panel, "edit", button());
  const home = await resourcePayload(store, panel);
  expect(home.files).toHaveLength(1);
  expect(JSON.stringify(panel.value.input)).toBe(initial);
  expect(JSON.stringify(panel.value.result)).toBe(result);
  expect(store.state("owner", "character").total).toBe(0);
});
