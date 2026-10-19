import { randomInt } from "node:crypto";
import type { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from "discord.js";
import { configuredSimulationBanner, getSimulationCatalog } from "./gachaSimulationCatalog.js";
import { defaultSimulationRules, percent, rulesDescription } from "./gachaSimulationRules.js";
import { resourceBudget, validateResourcePlan, type ResourcePlan, type ResourceStage } from "./gachaSimulationAnalysis.js";
import { runSimulationJob } from "./gachaSimulationJobs.js";
import type { GachaSimulationStore, SimulationPanel } from "./gachaSimulationStore.js";
import { numeric, yesNo, uiButton, uiMessage, uiModal, uiRow, uiSelect } from "./gachaSimulationUi.js";
import { bannerOptions } from "./gachaSimulationSettingsUi.js";
import { renderSimulationChart, type ChartSeries } from "./gachaSimulationCharts.js";
import { renderResourceCard, renderResourceSummary, renderItemGrid, friendlyPercent } from "./gachaSimulationVisuals.js";
import { simulationEmoji } from "./gachaSimulationEmoji.js";
import type { SimulationBanner, SimulationPool } from "./gachaSimulationEngine.js";

export function createResourcePanel(store: GachaSimulationStore, ownerId: string, banner?: SimulationBanner) {
  const prefs = store.preferences(ownerId), previous = store.lastPanel(ownerId, "resource");
  const stages = (["character", "weapon"] as const).map(pool => ({ banner: configuredSimulationBanner(banner?.pool === pool ? banner : bannerOptions(pool)[0], prefs), rules: defaultSimulationRules(pool), target: 1, sinceS: 0, guaranteed: false }));
  const input: ResourcePlan = { resources: { monochrome: 0, polychrome: 0, tapes: 0, reserve: 0 }, stages, rounds: 10000, seed: randomInt(0, 2 ** 32) };
  return store.createPanel(ownerId, "resource", { input, previousInput: previous?.value.input, graph: "curve", scenario: 0, eventPage: 0, bannerPage: 0, query: "", versionPage: 0 });
}
export async function resourcePayload(store: GachaSimulationStore, panel: SimulationPanel) {
  const d = panel.value, input: ResourcePlan = d.input, catalog = getSimulationCatalog(), budget = resourceBudget(input.resources);
  if (d.running && store.jobStatus(panel.id) !== "running") { d.running = false; d.notice = "上次工作已結束或中斷，可重新試算。"; store.savePanel(panel); }
  if (d.running) return uiMessage("個人資源試算執行中", "使用輸入資源、兩池獨立保底和設定快照估算，最多 30 秒。日常抽數與收藏不會變更。", [uiRow(uiButton(panel, "cancel", "取消試算", 4))]);
  if (d.choosingBanner) {
    const options = bannerOptions(d.choosingBanner, d.query), visible = options.slice(d.bannerPage * 25, d.bannerPage * 25 + 25), controls = [];
    if (visible.length) controls.push(uiSelect(panel, "banner", "選擇試算卡池", visible.map(b => ({ value: b.id, label: `${b.version} ${b.name}・${catalog.items[b.featuredS]?.name}`, emoji: simulationEmoji(d.applicationId, b.pool) }))));
    controls.push(uiRow(uiButton(panel, "bannerPrev", "上一頁", 2, !d.bannerPage), uiButton(panel, "bannerNext", "下一頁", 2, (d.bannerPage + 1) * 25 >= options.length), uiButton(panel, "search", "搜尋"), uiButton(panel, "back", "返回")));
    return uiMessage("試算卡池", `${options.length} 個卡池 · 搜尋 ${d.query || "全部"}`, controls);
  }
  if (d.rulesPool) {
    const versions = store.ruleVersions(panel.ownerId, d.rulesPool), stage = input.stages.find(s => s.banner.pool === d.rulesPool)!;
    return uiMessage("選擇試算機率", `目前：${stage.rules.mode === "game" ? "遊戲預設" : "自訂規則"}\n${rulesDescription(stage.rules)}`, [uiSelect(panel, "rule", "選擇保存的規則版本", versions.slice(d.versionPage * 25, d.versionPage * 25 + 25).map(v => ({ value: v.id, label: v.id === "game" ? "遊戲預設" : `自訂規則 v${v.version}`, description: `S ${percent(v.rules.s.base)} · 保底 ${v.rules.s.hard ?? "關"}` }))), uiRow(uiButton(panel, "vPrev", "上一頁", 2, !d.versionPage), uiButton(panel, "vNext", "下一頁", 2, (d.versionPage + 1) * 25 >= versions.length), uiButton(panel, "back", "返回"))]);
  }
  if (d.view === "advanced") return uiMessage("進階試算選項", `順序：${input.stages.map(s => s.banner.pool === "character" ? "角色" : "音擎").join(" → ")}；達標才換池。\n機率：${input.stages.map(s => `${s.banner.pool === "character" ? "角色" : "音擎"} ${s.rules.mode === "game" ? "遊戲預設" : "自訂"}`).join("／")}\n\n只計輸入資源，不含抽卡返還與未來收入。160 菲林＝1 抽；底片 1：1 換菲林，保留的底片不動用。軟保底採社群模型；音擎池只出音擎。`, [uiRow(uiButton(panel, "banner-character", "角色卡池"), uiButton(panel, "banner-weapon", "音擎卡池"), uiButton(panel, "order", "交換先後順序")), uiRow(uiButton(panel, "rules-character", "角色機率"), uiButton(panel, "rules-weapon", "音擎機率"), uiButton(panel, "export", "匯出資料")), uiRow(uiButton(panel, "home", "返回試算"))]);
  const controls = [uiRow(uiButton(panel, "resources", "1 · 資源設定"), uiButton(panel, "stage-character", "2 · 角色目標"), uiButton(panel, "stage-weapon", "2 · 音擎目標")), uiRow(uiButton(panel, "run", "3 · 開始試算", 3), uiButton(panel, "advanced", "進階選項"), uiButton(panel, "load", "載入上次輸入", 2, !d.previousInput))];
  return uiMessage("資源試算", `${d.notice || ""}\n輸入可用資源與保底進度；目標為 **0** 時略過該卡池。\n預設使用遊戲機率；這裡不會增加模擬抽卡紀錄。`, controls, await renderResourceCard(input));
}

export async function resourceResultPayload(panel: SimulationPanel) {
  const d = panel.value, result = d.result, scenario = result.scenarios[d.scenario || 0], catalog = getSimulationCatalog();
  if (!scenario?.completed) return uiMessage("本次試算未完成", "沒有完整回合可供統計，請減少本次資源或使用較簡單的規則。", [uiRow(uiButton(panel, "edit", "返回輸入"))]);
  const e = scenario.example, budget = result.budget, input: ResourcePlan = result.input;
  const controls: any[] = [];
  if (result.scenarios.length > 1) controls.push(uiSelect(panel, "scenario", "選擇保底情境", result.scenarios.map((s: any, i: number) => ({ label: s.label, value: String(i), default: i === d.scenario }))));
  const back = uiButton(panel, "resultHome", "返回試算結果");
  const scope = `${scenario.completed.toLocaleString()} 次試算 · ${input.stages.some(s => s.rules.mode === "custom") ? "自訂機率" : "遊戲預設機率／社群軟保底模型"}`;
  if (d.resultView === "example") {
    const events = e?.events || [], visible = events.slice((d.eventPage || 0) * 10, (d.eventPage || 0) * 10 + 10);
    controls.push(uiRow(uiButton(panel, "eventPrev", "上一頁", 2, !d.eventPage), uiButton(panel, "eventNext", "下一頁", 2, ((d.eventPage || 0) + 1) * 10 >= events.length), uiButton(panel, "example", "重新產生"), back));
    return uiMessage("單次試算範例", `這是一個隨機範例。用了 ${e?.used ?? 0} 抽，取得角色 UP ${e?.obtained.character ?? 0} 份、音擎 UP ${e?.obtained.weapon ?? 0} 份。${e?.omittedEvents ? "僅列前 200 次 S。" : ""}`, controls, await renderItemGrid("S 級抽取範例", "按抽取順序排列 · 只列出 S · 亮框為當期 UP", visible.map((p: any) => ({ id: p.id, selected: p.up, detail: `第 ${p.pull} 抽 · ${p.up ? "UP" : "歪"}` }))));
  }
  if (d.resultView === "charts") {
    let series: ChartSeries[], bars = false, percentage = false, labels: Record<number, string> | undefined;
    if (d.graph === "outcomes") { const outcomes = Object.entries(scenario.outcomes) as Array<[string, number]>; labels = Object.fromEntries(outcomes.map(([key], i) => [i + 1, key])); series = [{ label: "角色／音擎 UP 份數", icon: "tapes", color: "#ffc25c", points: outcomes.map(([, n], i) => ({ x: i + 1, y: n / scenario.completed })) }]; bars = true; percentage = true; }
    else if (d.graph === "used" || d.graph === "remaining") { series = [{ label: d.graph === "used" ? "達標時花掉的抽數" : "達標時剩下的抽數", icon: "tapes", color: "#c995ff", points: d.graph === "used" ? scenario.usedHistogram : scenario.remainingHistogram }]; bars = true; }
    else { percentage = true; series = (["character", "weapon", "both"] as const).filter(key => key === "both" || input.stages.find(s => s.banner.pool === key)?.target).map(key => ({ label: { character: "抽到角色目標", weapon: "抽到音擎目標", both: "全部目標達成" }[key], icon: key === "both" ? "tapes" : input.stages.find(s => s.banner.pool === key)?.banner.featuredS, color: { character: "#ffc25c", weapon: "#c995ff", both: "#52c8ff" }[key], points: scenario.curve.map((p: any) => ({ x: p.x, y: p[key] })) })); }
    const png = await renderSimulationChart({ title: d.graph === "curve" ? "目標達成機率" : "試算結果分布", subtitle: `${scope} · 預算 ${budget.pulls} 抽`, series, bars, percent: percentage, labels, xLabel: d.graph === "outcomes" ? "角色／音擎取得份數" : "抽數" });
    controls.push(uiSelect(panel, "graph", "切換圖表", [{ value: "curve", label: "達成機率曲線" }, { value: "outcomes", label: "UP 取得數量" }, { value: "used", label: "達標消耗分布" }, { value: "remaining", label: "達標剩餘分布" }]));
    controls.push(uiRow(back, uiButton(panel, "numbers", "統計數據")));
    return uiMessage("試算圖表", d.graph === "curve" ? "往右是抽取次數，往上是達標機會。曲線最右邊就是你目前的預算。" : "每個長條表示這種結果在試算中出現多少次。", controls, png);
  }
  if (d.resultView === "numbers") {
    const fmt = (key: "character" | "weapon" | "both") => `${friendlyPercent(scenario.successes[key] / scenario.completed)}（95% 區間 ${friendlyPercent(scenario.intervals[key][0])}～${friendlyPercent(scenario.intervals[key][1])}）`;
    controls.push(uiRow(back, uiButton(panel, "export", "下載完整資料")));
    return uiMessage("試算統計數據", `${scope}\n全部達成：${fmt("both")}\n${input.stages.filter(s => s.target).map(s => `${s.banner.pool === "character" ? "角色" : "音擎"}目標：${fmt(s.banner.pool)}`).join("\n")}\n成功時花費中位數 ${scenario.medianUsed ?? "—"} 抽；剩餘中位數 ${scenario.medianRemaining ?? "—"} 抽。\n只計輸入資源，不含抽卡返還、商店兌換及未來收入。`, controls);
  }
  const guarantee = scenario.guaranteeBudget === null ? "這份設定沒有有限的必達抽數。" : scenario.guaranteeBudget > budget.pulls ? `若要確保全部達標，最多還需 ${scenario.guaranteeBudget - budget.pulls} 抽。` : "依目前保底規則，這份預算足以保證全部達標。";
  controls.push(uiRow(uiButton(panel, "showExample", "抽取範例"), uiButton(panel, "showCharts", "達成機率"), uiButton(panel, "edit", "修改資源／目標")), uiRow(uiButton(panel, "numbers", "統計數據")));
  return uiMessage("試算結果", `${guarantee}\n${scope} · 未計抽卡返還`, controls, await renderResourceSummary(input, scenario));
}
export async function resourceAction(store: GachaSimulationStore, panel: SimulationPanel, action: string, interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction) {
  const d = panel.value, input: ResourcePlan = d.input;
  if (interaction.isButton() && ["resources", "stage-character", "stage-weapon", "search"].includes(action)) {
    let fields;
    if (action === "resources") fields = [{ id: "monochrome", label: "擁有的菲林底片", value: String(input.resources.monochrome) }, { id: "polychrome", label: "本次可用菲林", value: String(input.resources.polychrome) }, { id: "tapes", label: "本次可用加密母帶", value: String(input.resources.tapes) }, { id: "reserve", label: "保留不換算的菲林底片", value: String(input.resources.reserve) }];
    else if (action.startsWith("stage-")) {
      const s = input.stages.find(s => s.banner.pool === action.slice(6))!;
      fields = [{ id: "target", label: `UP 目標份數（${s.banner.pool === "character" ? "0～7" : "0～5"}；0＝略過）`, value: String(s.target) }, { id: "pity", label: "距 S 級保底剩餘抽數（或填 已墊:70）", value: s.rules.s.hard ? String(s.rules.s.hard - s.sinceS) : `已墊:${s.sinceS}` }, { id: "guaranteed", label: "下個 S：小保底／大保底／不確定", value: s.guaranteed === null ? "不確定" : s.guaranteed ? "大保底" : "小保底" }];
    } else fields = [{ id: "query", label: "版本、卡池或 UP 名稱", value: d.query || "", optional: true }];
    await interaction.showModal(uiModal(panel, action + "Submit", action === "resources" ? "輸入本次可用資源" : action === "search" ? "搜尋卡池" : "輸入實際目標與保底", fields)); return;
  }
  await interaction.deferUpdate();
  if (action === "export") { await interaction.followUp({ flags: 64, files: [{ attachment: Buffer.from(JSON.stringify({ input, result: d.result }, null, 2)), name: "resource-simulation.json" }] }); return; }
  if (action === "cancel") { store.finishJob(panel.id, "cancelled"); await interaction.followUp({ content: "已要求取消試算，日常進度未變更。", flags: 64 }); return; }
  if (action === "run" || action === "example") {
    validateResourcePlan(input); if (store.jobStatus(panel.id) === "running") throw new Error("本面板已有試算執行中。");
    const snapshot: ResourcePlan = JSON.parse(JSON.stringify(input)); snapshot.seed = randomInt(0, 2 ** 32); if (action === "example") snapshot.rounds = 1;
    const pending = runSimulationJob(store, panel.id, panel.ownerId, "resource", snapshot);
    void pending.catch(() => {}); // Claim synchronously before yielding, and attach rejection immediately.
    d.running = true; store.savePanel(panel);
    try {
      await interaction.editReply(await resourcePayload(store, panel) as any);
      const result = await pending;
      if (action === "example" && d.result) result.scenarios.forEach((s: any, i: number) => { if (s.example) { d.result.scenarios[i].example = s.example; d.result.scenarios[i].exampleSeed = snapshot.seed; } });
      else { d.result = result; d.scenario = 0; d.resultView = "summary"; }
      d.eventPage = 0; d.showResult = true;
    } catch (error) { store.finishJob(panel.id, "cancelled"); d.notice = error instanceof Error ? error.message : "試算未完成"; d.showResult = false; }
    finally { d.running = false; store.savePanel(panel); }
    await interaction.editReply(d.showResult ? await resourceResultPayload(panel) as any : await resourcePayload(store, panel) as any); return;
  }
  if (interaction.isModalSubmit()) {
    const field = (key: string) => { try { return interaction.fields.getTextInputValue(key).trim(); } catch (error) { if (key === "a") return ""; throw error; } };
    if (action === "resourcesSubmit") { const r = { monochrome: numeric(field("monochrome"), "底片", true), polychrome: numeric(field("polychrome"), "菲林", true), tapes: numeric(field("tapes"), "母帶", true), reserve: numeric(field("reserve"), "保留底片", true) }; resourceBudget(r); input.resources = r; }
    else if (action === "searchSubmit") { d.query = field("query"); d.bannerPage = 0; }
    else if (action.startsWith("stage-")) {
      const stage = input.stages.find(s => s.banner.pool === action.slice(6).replace("Submit", ""))!, copy = { ...stage };
      copy.target = numeric(field("target"), "目標份數", true);
      const raw = field("pity").replace("：", ":");
      if (raw.startsWith("已墊:")) copy.sinceS = numeric(raw.slice(3), "已墊抽數", true);
      else { if (!stage.rules.s.hard) throw new Error("無硬保底時請填「已墊:抽數」。"); const remaining = numeric(raw, "剩餘抽數", true); if (remaining < 1) throw new Error("剩餘抽數至少為 1。"); copy.sinceS = stage.rules.s.hard - remaining; }
      const guarantee = field("guaranteed"); if (!["小保底", "大保底", "不確定", "小", "大"].includes(guarantee)) throw new Error("請填小保底、大保底或不確定。");
      copy.guaranteed = guarantee === "不確定" ? null : guarantee.startsWith("大");
      const a = field("a"); if (a) { const [pity, g] = a.split("/"); const n = numeric(pity, "A 已墊抽數", true); if (stage.rules.a.hard && n >= stage.rules.a.hard) throw new Error("A 已墊抽數應小於硬保底。"); yesNo(g || "關"); } (copy as any).aState = a;
      const trial = { ...input, stages: input.stages.map(s => s === stage ? copy : s) }; validateResourcePlan({ ...trial, stages: trial.stages.map(s => ({ ...s, target: s.target || (trial.stages.every(x => !x.target) && s === copy ? 1 : 0) })) });
      Object.assign(stage, copy);
    }
    d.showResult = false;
  } else if (interaction.isStringSelectMenu()) {
    if (action === "graph") { d.graph = interaction.values[0]; d.resultView = "charts"; }
    if (action === "scenario") { d.scenario = Number(interaction.values[0]); d.eventPage = 0; }
    if (action === "banner") { const banner = getSimulationCatalog().banners.find(b => b.id === interaction.values[0] && b.pool === d.choosingBanner); if (!banner) throw new Error("找不到卡池。"); input.stages.find(s => s.banner.pool === banner.pool)!.banner = configuredSimulationBanner(banner, store.preferences(panel.ownerId)); d.choosingBanner = undefined; d.showResult = false; }
    if (action === "rule") { input.stages.find(s => s.banner.pool === d.rulesPool)!.rules = store.rules(panel.ownerId, d.rulesPool, interaction.values[0]).rules; d.rulesPool = undefined; d.showResult = false; }
  } else {
    if (action === "edit") { d.showResult = false; d.view = "home"; }
    if (action === "advanced") d.view = "advanced";
    if (action === "home") d.view = "home";
    if (action === "resultHome") d.resultView = "summary";
    if (action === "showExample" || action === "eventNext" || action === "eventPrev") d.resultView = "example";
    if (action === "showCharts") { d.resultView = "charts"; d.graph = "curve"; }
    if (action === "numbers") d.resultView = "numbers";
    if (action === "order") { input.stages.reverse(); d.showResult = false; }
    if (action === "load" && d.previousInput) { d.input = JSON.parse(JSON.stringify(d.previousInput)); d.showResult = false; }
    if (action.startsWith("banner-")) { d.choosingBanner = action.slice(7); d.query = ""; d.bannerPage = 0; }
    if (action.startsWith("rules-")) { d.rulesPool = action.slice(6); d.versionPage = 0; }
    if (action === "back") { d.choosingBanner = undefined; d.rulesPool = undefined; }
    if (action === "bannerPrev") d.bannerPage = Math.max(0, d.bannerPage - 1);
    if (action === "bannerNext") d.bannerPage++;
    if (action === "vPrev") d.versionPage = Math.max(0, d.versionPage - 1);
    if (action === "vNext") d.versionPage++;
    if (action === "eventPrev") d.eventPage = Math.max(0, (d.eventPage || 0) - 1);
    if (action === "eventNext") d.eventPage = (d.eventPage || 0) + 1;
  }
  store.savePanel(panel); await interaction.editReply(d.showResult ? await resourceResultPayload(panel) as any : await resourcePayload(store, panel) as any);
}
