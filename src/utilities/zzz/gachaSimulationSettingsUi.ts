import { gachaSettingText } from "./gachaSettingsCopy.js";
import { uiText, renderSettingsPreview } from "../settings/presentation.js";
import type { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from "discord.js";
import { configuredSimulationBanner, getSimulationCatalog, ORIGINAL_S_CANDIDATES, signalSelectionCandidates, supportsSignalSelection } from "./gachaSimulationCatalog.js";
import { defaultSimulationRules, percent, rulesDescription, validateSimulationRules } from "./gachaSimulationRules.js";
import { type GachaSimulationStore, type SimulationPanel } from "./gachaSimulationStore.js";
import type { SimulationBanner } from "./gachaSimulationEngine.js";
import { numeric, yesNo, uiButton, uiMessage, uiModal, uiRow, uiSelect } from "./gachaSimulationUi.js";
import { renderSettingsCard, renderItemGrid } from "./gachaSimulationVisuals.js";
import { simulationEmoji } from "./gachaSimulationEmoji.js";

export function createSettingsPanel(store: GachaSimulationStore, owner: string, banner: SimulationBanner) {
  const prefs = store.preferences(owner), version = store.rules(owner, banner.pool, prefs.active[banner.pool]);
  return store.createPanel(owner, "settings", { banner, prefs, rules: version.rules, ruleId: version.id, version: version.version, aPage: 0, versionPage: 0, query: "", bannerPage: 0, dirty: false, view: "home", baseline: { prefs: structuredClone(prefs), rules: structuredClone(version.rules), ruleId: version.id, banner: structuredClone(banner) } });
}
export function bannerOptions(pool: string | undefined, query = "") {
  const c = getSimulationCatalog(), words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return c.banners.filter(b => (!pool || b.pool === pool) && Date.parse(b.startAt) <= Date.now())
    .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))
    .filter(b => words.every(q => [b.name, b.id, b.version, c.items[b.featuredS]?.name, ...b.featuredA.map(id => c.items[id]?.name)].join(" ").toLowerCase().includes(q)));
}
export function hasSettingsChanges(store: GachaSimulationStore, panel: SimulationPanel) {
  const d = panel.value, p = store.preferences(panel.ownerId), b: SimulationBanner = d.banner;
  return d.dirty || d.baseline?.banner?.id !== b.id || p.active[b.pool] !== d.ruleId || p.animation !== d.prefs.animation ||
    JSON.stringify(p.sCandidates[b.pool]) !== JSON.stringify(d.prefs.sCandidates[b.pool]) ||
    JSON.stringify(p.aUp[b.id] ?? b.featuredA) !== JSON.stringify(d.prefs.aUp[b.id] ?? b.featuredA);
}
export async function settingsPayload(store: GachaSimulationStore, panel: SimulationPanel) {
  const d = panel.value, b: SimulationBanner = d.banner, catalog = getSimulationCatalog(), versions = store.ruleVersions(panel.ownerId, b.pool);
  const t = (key: Parameters<typeof gachaSettingText>[1]) => gachaSettingText(d.locale, key);
  const preview = () => renderSettingsPreview(d.locale, `${b.version} ${b.name}`, [{ name: catalog.items[b.featuredS]?.name || b.featuredS, icon: catalog.items[b.featuredS]?.image, detail: t(d.rules.mode === "game" ? "reset" : "custom") }, ...(["s", "a", "b"] as const).map(rank => ({ name: `${rank.toUpperCase()} · ${percent(rank === "b" ? d.rules.b : d.rules[rank].base)}`, detail: t("base") }))]);
  const controls: any[] = [], pending = hasSettingsChanges(store, panel);
  const footer = () => uiRow(uiButton(panel, "save", uiText(d.locale, "save"), 3, !pending), uiButton(panel, "discard", uiText(d.locale, "cancel")));
  if (d.choosingBanner) {
    const options = bannerOptions(undefined, d.query), slice = options.slice(d.bannerPage * 25, d.bannerPage * 25 + 25);
    if (slice.length) controls.push(uiSelect(panel, "banner", t("banner"), slice.map(b => ({ label: `${b.version} ${b.name}・${catalog.items[b.featuredS]?.name}`, value: b.id, emoji: simulationEmoji(d.applicationId, b.pool) }))));
    controls.push(uiRow(uiButton(panel, "bannerPrev", uiText(d.locale, "previous"), 2, d.bannerPage === 0), uiButton(panel, "bannerNext", uiText(d.locale, "next"), 2, (d.bannerPage + 1) * 25 >= options.length), uiButton(panel, "search", t("search"))));
    controls.push(footer());
    return uiMessage(t("banner"), `搜尋：${d.query || "全部"} · 第 ${d.bannerPage + 1} 頁`, controls);
  }
  const eligible = signalSelectionCandidates(b, catalog), supported = supportsSignalSelection(b);
  const selectedS: string[] = supported ? (d.prefs.sCandidates[b.pool].length ? d.prefs.sCandidates[b.pool] : ORIGINAL_S_CANDIDATES[b.pool]) : b.standardS;
  const selectedA: string[] = supported ? (d.prefs.aUp[b.id] ?? b.featuredA) : b.featuredA;
  const status = [d.notice || (pending ? uiText(d.locale, "pending") : ""), uiText(d.locale, d.view === "home" ? "homeGuide" : "editGuide")].filter(Boolean).join("\n\n");
  if (d.view === "candidates") {
    if (supported) controls.push(uiSelect(panel, "sCandidates", `${t("candidates")} (${selectedS.length}/6)`, eligible.s.map(id => ({ label: catalog.items[id]?.name || id, value: id, default: selectedS.includes(id), emoji: simulationEmoji(d.applicationId, "S") })), 6, 6));
    controls.push(footer());
    const png = await renderSettingsPreview(d.locale, t("candidates"), (supported ? eligible.s : selectedS).map(id => ({ name: catalog.items[id]?.name || id, icon: catalog.items[id]?.image, selected: selectedS.includes(id) })));
    return uiMessage(t("candidates"), status, controls, png);
  }
  if (d.view === "aUp") {
    const aSlice = eligible.a.slice(d.aPage * 25, d.aPage * 25 + 25);
    if (supported) controls.push(uiSelect(panel, "aCandidates", `${t("aUp")} (${selectedA.length}/2)`, aSlice.map(id => ({ label: catalog.items[id]?.name || id, value: id, default: selectedA.includes(id), emoji: simulationEmoji(d.applicationId, "A") })), 0, 2));
    if (supported && eligible.a.length > 25) controls.push(uiRow(uiButton(panel, "aPrev", uiText(d.locale, "previous"), 2, !d.aPage), uiButton(panel, "aNext", uiText(d.locale, "next"), 2, (d.aPage + 1) * 25 >= eligible.a.length)));
    controls.push(footer());
    return uiMessage(t("aUp"), status, controls, await renderSettingsPreview(d.locale, t("aUp"), selectedA.map(id => ({ name: catalog.items[id]?.name || id, icon: catalog.items[id]?.image, selected: true }))));
  }
  if (d.view === "animation-edit") {
    controls.push(uiRow(uiButton(panel, "animation-value", `${uiText(d.locale, "on")} / ${uiText(d.locale, "off")}`, d.prefs.animation ? 3 : 2)), footer());
    return uiMessage(t("animation"), `${uiText(d.locale, "pending")} · ${uiText(d.locale, d.prefs.animation ? "on" : "off")}`, controls);
  }
  if (d.view === "rules-edit") return uiMessage(t("advanced"), uiText(d.locale, "pending"), [footer()], await preview());
  if (d.view === "advanced") {
    controls.push(uiRow(uiButton(panel, "base", t("base")), uiButton(panel, "softS", `S · ${t("pity")}`), uiButton(panel, "softA", `A · ${t("pity")}`), uiButton(panel, "up", "UP 機制")));
    controls.push(uiRow(uiButton(panel, "reset", t("reset")), uiButton(panel, "versions", t("versions")), uiButton(panel, "ruleHelp", uiText(d.locale, "help"))));
    controls.push(uiRow(uiButton(panel, "home", uiText(d.locale, "done"))));
    return uiMessage(t("advanced"), `${status}\n調整機率與保底；儲存後會使用獨立的抽卡進度。`, controls, await preview());
  }
  if (d.view === "ruleHelp") return uiMessage(uiText(d.locale, "help"), `${rulesDescription(d.rules)}\n\n只有更改機率／保底才分開計數；換候選或動畫會保留進度。`, [uiRow(uiButton(panel, "advanced", "返回進階設定"))]);
  if (d.view === "versions") {
    controls.push(uiSelect(panel, "version", "選擇歷史設定（儲存後使用）", versions.slice(d.versionPage * 25, d.versionPage * 25 + 25).map(v => ({ value: v.id, label: v.id === "game" ? "遊戲預設機率" : `自訂規則 v${v.version}`, description: `S ${percent(v.rules.s.base)}・保底 ${v.rules.s.hard ?? "關"}`, default: !d.dirty && v.id === d.ruleId }))));
    if (versions.length > 25) controls.push(uiRow(uiButton(panel, "vPrev", "較新設定", 2, !d.versionPage), uiButton(panel, "vNext", "較舊設定", 2, (d.versionPage + 1) * 25 >= versions.length)));
    controls.push(footer());
    return uiMessage(t("versions"), `${status}\n切回舊設定時，會接續該設定已保存的抽卡進度。`, controls);
  }
  controls.push(uiRow(uiButton(panel, "candidates", t("candidates")), uiButton(panel, "aUp", t("aUp")), uiButton(panel, "animation", `${t("animation")}: ${uiText(d.locale, d.prefs.animation ? "on" : "off")}`)));
  controls.push(uiRow(uiButton(panel, "advanced", t("advanced")), uiButton(panel, "chooseBanner", t("banner")), uiButton(panel, "done-settings", uiText(d.locale, "done"))));
  return uiMessage(t("title"), `${status}\n${t("applied")}`, controls, await preview());
}
export async function settingsAction(store: GachaSimulationStore, panel: SimulationPanel, action: string, interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction): Promise<boolean> {
  const d = panel.value, b: SimulationBanner = d.banner;
  if (d.closed || Date.now() - panel.updatedAt > 900000) throw new Error(uiText(d.locale, "expired"));
  const reload = () => {
    const prefs = store.preferences(panel.ownerId), version = store.rules(panel.ownerId, d.banner.pool, prefs.active[(d.banner as SimulationBanner).pool]);
    d.prefs = prefs; d.rules = version.rules; d.ruleId = version.id; d.version = version.version; d.dirty = false;
    d.baseline = { prefs: structuredClone(prefs), rules: structuredClone(version.rules), ruleId: version.id, banner: structuredClone(d.banner) };
  };
  d.baseline ||= { prefs: structuredClone(d.prefs), rules: structuredClone(d.rules), ruleId: d.ruleId, banner: structuredClone(d.banner) };
  if (interaction.isButton() && ["candidates", "aUp", "animation", "base", "softS", "softA", "up", "versions", "reset", "chooseBanner"].includes(action)) { reload(); d.group = action; }
  if (interaction.isButton() && ["base", "softS", "softA", "up", "search"].includes(action)) {
    let fields;
    if (action === "base") fields = ["s", "a", "b"].map(key => ({ id: key, label: `${key.toUpperCase()} 基礎機率（百分比）`, value: String((key === "b" ? d.rules.b : d.rules[key].base) * 100) }));
    else if (action.startsWith("soft")) { const r = d.rules[action === "softS" ? "s" : "a"]; fields = [{ id: "hard", label: "硬保底抽數（0＝關閉）", value: String(r.hard ?? 0) }, { id: "start", label: "軟保底起始抽數（0＝關閉）", value: String(r.softStart ?? 0) }, { id: "step", label: "每抽增加百分點", value: String(r.step * 100) }]; }
    else if (action === "up") fields = [{ id: "s", label: "S UP 機率（百分比）", value: String(d.rules.s.up * 100) }, { id: "sg", label: "S 歪後必 UP（開／關）", value: d.rules.s.guarantee ? "開" : "關" }, { id: "a", label: "A UP 機率（百分比）", value: String(d.rules.a.up * 100) }, { id: "ag", label: "A 歪後必 UP（開／關）", value: d.rules.a.guarantee ? "開" : "關" }];
    else fields = [{ id: "query", label: "卡池、版本或 UP 名稱", value: d.query, optional: true }];
    store.savePanel(panel);
    await interaction.showModal(uiModal(panel, `${action}Submit`, action === "search" ? "搜尋卡池" : "編輯調頻設定", fields)); return true;
  }
  await interaction.deferUpdate(); d.notice = "";
  if (interaction.isModalSubmit()) {
    const field = (id: string) => interaction.fields.getTextInputValue(id);
    if (action === "searchSubmit") { d.query = field("query"); d.bannerPage = 0; d.choosingBanner = true; }
    else {
      const draft = JSON.parse(JSON.stringify(d.rules)); draft.mode = "custom";
      if (action === "baseSubmit") { draft.s.base = numeric(field("s"), "S") / 100; draft.a.base = numeric(field("a"), "A") / 100; draft.b = numeric(field("b"), "B") / 100; }
      if (action === "softSSubmit" || action === "softASubmit") { const r = draft[action === "softSSubmit" ? "s" : "a"]; r.hard = numeric(field("hard"), "硬保底", true) || null; r.softStart = numeric(field("start"), "軟保底", true) || null; r.step = numeric(field("step"), "增量") / 100; }
      if (action === "upSubmit") { draft.s.up = numeric(field("s"), "S UP") / 100; draft.a.up = numeric(field("a"), "A UP") / 100; draft.s.guarantee = yesNo(field("sg")); draft.a.guarantee = yesNo(field("ag")); }
      d.rules = validateSimulationRules(draft); d.dirty = true; d.view = "rules-edit";
    }
  } else if (interaction.isStringSelectMenu()) {
    if (action === "version") { const v = store.rules(panel.ownerId, b.pool, interaction.values[0]); d.rules = v.rules; d.ruleId = v.id; d.version = v.version; d.dirty = false; }
    if (action === "sCandidates") d.prefs.sCandidates[b.pool] = interaction.values;
    if (action === "aCandidates") { const page = signalSelectionCandidates(b).a.slice(d.aPage * 25, d.aPage * 25 + 25); const selected = (d.prefs.aUp[b.id] ?? b.featuredA).filter((id: string) => !page.includes(id)); d.prefs.aUp[b.id] = [...selected, ...interaction.values]; }
    if (action === "banner") { const next = getSimulationCatalog().banners.find(x => x.id === interaction.values[0]); if (!next) throw new Error("找不到卡池。"); if (next.pool !== b.pool) { const v = store.rules(panel.ownerId, next.pool, d.prefs.active[next.pool]); d.rules = v.rules; d.ruleId = v.id; d.version = v.version; d.dirty = false; } d.banner = next; d.choosingBanner = true; d.aPage = 0; d.versionPage = 0; }
  } else {
    if (action === "animation") d.view = "animation-edit";
    if (action === "animation-value" && d.view === "animation-edit") d.prefs.animation = !d.prefs.animation;
    if (action === "done-settings") { d.closed = true; store.savePanel(panel); await interaction.editReply(uiMessage(uiText(d.locale, "done"), "")); return true; }
    if (action === "discard") { d.banner = d.baseline.banner; reload(); d.choosingBanner = false; d.view = "home"; }
    if (action === "reset") { d.rules = defaultSimulationRules(b.pool); d.ruleId = "game"; d.version = 0; d.dirty = false; d.view = "rules-edit"; }
    if (action === "chooseBanner") { d.choosingBanner = true; d.bannerPage = 0; }
    if (["back", "home"].includes(action)) { d.choosingBanner = false; d.view = "home"; }
    if (["candidates", "aUp", "advanced", "versions", "ruleHelp"].includes(action)) d.view = action;
    for (const [prefix, key] of [["banner", "bannerPage"], ["a", "aPage"], ["v", "versionPage"]]) { if (action === `${prefix}Prev`) d[key] = Math.max(0, d[key] - 1); if (action === `${prefix}Next`) d[key]++; }
    if (action === "save") {
      configuredSimulationBanner(b, d.prefs);
      const current = store.preferences(panel.ownerId), old = d.baseline.prefs;
      const group = d.group;
      if (group === "animation") {
        if (current.animation !== old.animation) throw new Error(uiText(d.locale, "conflict"));
        current.animation = d.prefs.animation;
      } else if (group === "candidates") {
        if (JSON.stringify(current.sCandidates[b.pool]) !== JSON.stringify(old.sCandidates[b.pool])) throw new Error(uiText(d.locale, "conflict"));
        current.sCandidates[b.pool] = [...d.prefs.sCandidates[b.pool]];
      } else if (group === "aUp") {
        if (JSON.stringify(current.aUp[b.id]) !== JSON.stringify(old.aUp[b.id])) throw new Error(uiText(d.locale, "conflict"));
        current.aUp[b.id] = [...(d.prefs.aUp[b.id] || b.featuredA)];
      } else {
        if (current.active[b.pool] !== old.active[b.pool]) throw new Error(uiText(d.locale, "conflict"));
        const version = store.saveRules(panel.ownerId, d.rules); current.active[b.pool] = version.id;
      }
      store.savePreferences(panel.ownerId, current);
      reload(); d.view = "home"; d.choosingBanner = false; d.notice = uiText(d.locale, "saved");
    }
  }
  store.savePanel(panel); await interaction.editReply(await settingsPayload(store, panel) as any); return true;
}
