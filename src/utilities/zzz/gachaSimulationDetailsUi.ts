import type { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from "discord.js";
import { randomInt } from "node:crypto";
import { EMPTY_SIMULATION_STATE, type SimulationBanner, type SimulationPool } from "./gachaSimulationEngine.js";
import { configuredSimulationBanner, getSimulationCatalog } from "./gachaSimulationCatalog.js";
import { percent } from "./gachaSimulationRules.js";
import { analyzeSimulation, firstSignalCurves, histogram, simulationCsv } from "./gachaSimulationAnalysis.js";
import { renderSimulationChart, type ChartSeries } from "./gachaSimulationCharts.js";
import { runSimulationJob } from "./gachaSimulationJobs.js";
import type { GachaSimulationStore, SimulationPanel, SimulationSession } from "./gachaSimulationStore.js";
import { uiButton, uiMessage, uiModal, uiRow, uiSelect } from "./gachaSimulationUi.js";
import { bannerOptions } from "./gachaSimulationSettingsUi.js";
import { renderDetailsCard, renderItemGrid, itemName } from "./gachaSimulationVisuals.js";
import { simulationEmoji } from "./gachaSimulationEmoji.js";

const pages = { overview: "調頻總覽", history: "S 級紀錄", distribution: "出貨抽數分布", hazard: "單抽出貨機率", cdf: "累積出貨機率", trend: "實際出貨率", collection: "收藏紀錄", compare: "規則比較" };
const chartDescriptions: Record<string, string> = { distribution: "每次取得 S 級所需的抽數", hazard: "隨保底進度變化的單次 S 級機率", cdf: "指定抽數內至少取得一個 S 級或 UP 的機率", trend: "模擬紀錄中 S／A 級出現的比例", compare: "比較遊戲預設與自訂機率" };
const colors = ["#ffc25c", "#d393ff", "#52c8ff"];
export function createDetailsPanel(store: GachaSimulationStore, owner: string, banner: SimulationBanner, session?: SimulationSession) {
  const pref = store.preferences(owner), id = session?.rulesId ?? (session ? "game" : pref.active[banner.pool]);
  return store.createPanel(owner, "details", { banner: session?.banner ?? banner, pool: banner.pool, rulesId: id, rules: session?.rules ?? store.rules(owner, banner.pool, id).rules, page: "overview", historyPage: 0, versionPage: 0, compare: [id], since: undefined, until: undefined, bannerId: undefined, fresh: false, sourceSession: session?.id });
}
export async function detailsPayload(store: GachaSimulationStore, panel: SimulationPanel) {
  const d = panel.value, catalog = getSimulationCatalog(), stats = analyzeSimulation(store.history(panel.ownerId), d);
  const rules = d.rules, state = d.fresh && ["hazard", "cdf"].includes(d.page) ? { ...EMPTY_SIMULATION_STATE } : store.state(panel.ownerId, d.pool, d.rulesId);
  const label = d.rulesId === "game" ? "遊戲預設機率" : `自訂規則 v${store.rules(panel.ownerId, d.pool, d.rulesId).version}`;
  const filterLabel = `${label} · ${d.pool === "character" ? "角色" : "音擎"} · 樣本 ${stats.total.toLocaleString()} 抽`;
  const back = () => uiButton(panel, "home", "返回總覽");
  const versionList = store.ruleVersions(panel.ownerId, d.pool), visibleVersions = versionList.slice(d.versionPage * 25, d.versionPage * 25 + 25);
  if (d.menu === "charts") return uiMessage("統計圖表", "選擇統計項目，查看圖表與說明。", [uiSelect(panel, "page", "選擇統計圖表", Object.entries(chartDescriptions).map(([value, description]) => ({ value, label: pages[value as keyof typeof pages], description, emoji: simulationEmoji(d.applicationId, value === "trend" ? "A" : "S") }))), uiRow(uiButton(panel, "collection", "收藏紀錄"), uiButton(panel, "bulkMenu", "大量試抽"), uiButton(panel, "filters", "篩選與匯出"), back())]);
  if (d.menu === "filters") {
    const controls = [uiSelect(panel, "version", "選擇紀錄所用的設定", visibleVersions.map(v => ({ value: v.id, label: v.id === "game" ? "遊戲預設" : `自訂規則 v${v.version}`, default: d.rulesId === v.id }))), uiRow(uiButton(panel, "filter", "卡池與日期"), uiButton(panel, "clearFilter", "清除篩選"), uiButton(panel, "csv", "下載抽卡紀錄"), back())];
    if (versionList.length > 25) controls.push(uiRow(uiButton(panel, "vPrev", "較新設定", 2, !d.versionPage), uiButton(panel, "vNext", "較舊設定", 2, (d.versionPage + 1) * 25 >= versionList.length)));
    return uiMessage("篩選與匯出", `${filterLabel}\n${d.bannerId ? `卡池：${catalog.banners.find(b => b.id === d.bannerId)?.name || d.bannerId}` : "所有同類卡池"} · ${d.since || d.until ? "已套用日期篩選" : "全部日期"}\n不同機率設定的紀錄分開保存。`, controls);
  }
  if (d.menu === "bulk") return uiMessage("大量試抽", "一次試抽很多次，觀察這份設定會抽出什麼。這裡不會增加你的日常抽數或保底。", [uiRow(uiButton(panel, "bulk1000", "1,000 抽"), uiButton(panel, "bulk10000", "10,000 抽"), uiButton(panel, "bulk100000", "100,000 抽")), uiRow(uiButton(panel, "fresh", d.fresh ? "起點：零保底" : "起點：目前保底"), back())]);
  if (d.page === "overview") {
    const filtered = d.bannerId || d.since || d.until;
    const png = await renderDetailsCard(d.banner, rules, state, stats, `${d.pool === "character" ? "角色" : "音擎"}池 · ${label} · ${filtered ? "已篩選紀錄" : "全部紀錄"}`);
    return uiMessage("模擬調頻詳情", `${d.banner.version} ${d.banner.name} · UP：**${itemName(d.banner.featuredS)}**${filtered ? "\n抽數依篩選條件顯示；保底為此類卡池的目前進度。" : ""}`, [uiRow(uiButton(panel, "history", "S 級紀錄"), uiButton(panel, "resource", "資源試算", 1), uiButton(panel, "charts", "統計圖表")), uiRow(uiButton(panel, d.pool === "character" ? "weapon" : "character", d.pool === "character" ? "音擎池" : "角色池"), uiButton(panel, "settings", "調頻設定"), uiButton(panel, "filters", "篩選與匯出"))], png);
  }
  if (d.page === "history" || d.page === "collection") {
    const history = d.page === "history";
    const rows = stats.rows.filter(p => p.rank === "S").reverse(), items = Object.entries(stats.items).sort((a, b) => b[1] - a[1]);
    const size = history ? rows.length : items.length;
    d.historyPage = Math.min(d.historyPage, Math.max(0, Math.ceil(size / 10) - 1));
    const shown = history ? rows.slice(d.historyPage * 10, d.historyPage * 10 + 10).map(p => ({ id: p.id, selected: p.up, detail: `${p.pity}抽 ${p.guaranteed === true ? "大保底" : p.guaranteed === null ? "未知" : p.up ? "UP" : "歪"}` })) : items.slice(d.historyPage * 10, d.historyPage * 10 + 10).map(([id, count]) => ({ id, detail: `取得 ${count} 次` }));
    const png = await renderItemGrid(pages[d.page as "history" | "collection"], `${filterLabel} · 第 ${d.historyPage + 1} / ${Math.max(1, Math.ceil(size / 10))} 頁`, shown);
    return uiMessage(pages[d.page as "history" | "collection"], history ? "由新到舊排列；每張圖下方是這次出 S 花了幾抽。亮框代表當期 UP。" : `小保底 ${stats.won} 次沒歪／${stats.small - stats.won} 次歪 · 未知狀態不計入`, [uiRow(uiButton(panel, "previous", "上一頁", 2, !d.historyPage), uiButton(panel, "next", "下一頁", 2, (d.historyPage + 1) * 10 >= size), back()), uiRow(uiButton(panel, "png", "下載圖片"), uiButton(panel, "charts", "統計圖表"))], png);
  }
  let text = `${d.bannerId ? `卡池：${catalog.banners.find(b => b.id === d.bannerId)?.name || d.bannerId}` : "卡池：此類全部卡池"} · ${d.since || d.until ? `${d.since ? new Date(d.since + 28800000).toISOString().slice(0, 10) : "起始"}～${d.until ? new Date(d.until + 28800000).toISOString().slice(0, 10) : "現在"}` : "全部期間"}\n`;
  let series: ChartSeries[] = [], bars = false, percentage = false, xLabel = "抽數", labels: Record<number, string> | undefined;
  if (d.page === "distribution") {
    text += `S 平均 ${stats.mean?.toFixed(2) ?? "—"} 抽 · 中位數 ${stats.median ?? "—"} · 最短 ${stats.min ?? "—"} · 最長 ${stats.max ?? "—"}\n只統計已出貨的完整間隔；UP 間隔不跨越篩選造成的缺口。`;
    bars = true; series = [{ label: "每次 S 花的抽數", icon: "S", color: colors[0], points: histogram(stats.gaps) }, { label: "每次 UP 花的抽數", icon: d.banner.featuredS, color: colors[1], points: histogram(stats.upGaps) }];
  } else if (d.page === "hazard" || d.page === "cdf") {
    const horizon = Math.min(2000, rules.s.hard ? (d.page === "cdf" ? 2 : 1) * rules.s.hard : 1000), curve = firstSignalCurves(rules, state, horizon);
    text += `從${d.fresh ? "零保底" : `已墊 ${state.sinceS} 抽、${state.guaranteedS && rules.s.guarantee ? "大" : "小"}保底`}開始看。\n${d.page === "hazard" ? "假設前面都沒抽到 S，越往右代表又多抽一次；線越高，這一抽越容易出 S。" : "往右是再抽幾次，往上是這些抽數內至少拿到一個的機會。"}${d.page === "cdf" && state.guaranteedS && rules.s.guarantee ? "\n目前是大保底，拿到 S 就是 UP，所以兩條線重疊。" : ""}\n${rules.mode === "game" ? "使用遊戲預設機率／社群軟保底模型。" : "使用你的自訂機率。"}`;
    percentage = true; xLabel = "接下來第 N 抽";
    series = d.page === "hazard" ? [{ label: "這一抽出 S 的機會", icon: "S", color: colors[0], points: curve.map(p => ({ x: p.x, y: p.hazard })) }] : [{ label: "至少一個 S", icon: "S", color: colors[0], points: curve.map(p => ({ x: p.x, y: p.s })) }, { label: "至少一個 UP S", icon: d.banner.featuredS, color: colors[1], points: curve.map(p => ({ x: p.x, y: p.up })) }];
  } else if (d.page === "trend") {
    let s = 0, a = 0; const sp: Array<{ x: number; y: number }> = [], ap: Array<{ x: number; y: number }> = [];
    const stride = Math.max(1, Math.ceil(stats.total / 300)); stats.rows.forEach((p, i) => { s += Number(p.rank === "S"); a += Number(p.rank === "A"); if (i % stride === 0 || i === stats.total - 1) { sp.push({ x: i + 1, y: s / (i + 1) }); ap.push({ x: i + 1, y: a / (i + 1) }); } });
    percentage = true; series = [{ label: "抽到 S 的比例", icon: "S", color: colors[0], points: sp }, { label: "抽到 A 的比例", icon: "A", color: colors[1], points: ap }]; text += "實際累積出率包含保底，不能直接視為基礎機率。";
  } else {
    percentage = true; text += "各規則從零保底起算，圖中比較至少取得一個 UP S 的理論機率；實測樣本分開列示。";
    for (const [i, id] of (d.compare as string[]).slice(0, 3).entries()) { const v = store.rules(panel.ownerId, d.pool, id), s = analyzeSimulation(store.history(panel.ownerId), { ...d, rulesId: id }); const name = id === "game" ? "遊戲預設" : `自訂 v${v.version}`; text += `\n${name}：${s.total} 抽／S ${s.counts.S}／平均 ${s.mean?.toFixed(2) ?? "—"}`; series.push({ label: name, color: colors[i], points: firstSignalCurves(v.rules, EMPTY_SIMULATION_STATE, 200).map(p => ({ x: p.x, y: p.up })) }); }
  }
  const chart = await renderSimulationChart({ featured: d.banner.featuredS, title: pages[d.page as keyof typeof pages], subtitle: filterLabel, series, bars, percent: percentage, xLabel, labels });
  const controls: any[] = [uiRow(back(), uiButton(panel, "charts", "切換圖表"), uiButton(panel, "png", "下載圖片"))];
  if (["cdf", "hazard"].includes(d.page)) controls.unshift(uiRow(uiButton(panel, "fresh", d.fresh ? "起點：零保底" : `起點：已墊 ${state.sinceS} 抽`)));
  if (d.page === "compare") {
    controls.unshift(uiSelect(panel, "compare", "選擇最多三份設定", visibleVersions.map(v => ({ value: v.id, label: v.id === "game" ? "遊戲預設" : `自訂 v${v.version}`, default: d.compare.includes(v.id) })), 1, Math.min(3, visibleVersions.length)));
    if (versionList.length > 25) controls.push(uiRow(uiButton(panel, "vPrev", "較新設定", 2, !d.versionPage), uiButton(panel, "vNext", "較舊設定", 2, (d.versionPage + 1) * 25 >= versionList.length)));
  }
  return uiMessage(pages[d.page as keyof typeof pages], text, controls, chart);
}
export async function detailsAction(store: GachaSimulationStore, panel: SimulationPanel, action: string, interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction) {
  const d = panel.value;
  if (interaction.isButton() && action === "filter") { await interaction.showModal(uiModal(panel, "filterSubmit", "篩選紀錄", [{ id: "banner", label: "卡池 ID 或完整名稱（留白＝全部）", value: d.bannerId || "", optional: true }, { id: "since", label: "起日 YYYY-MM-DD（台北時間，可留白）", value: d.since ? new Date(d.since + 28800000).toISOString().slice(0, 10) : "", optional: true }, { id: "until", label: "迄日 YYYY-MM-DD（台北時間，可留白）", value: d.until ? new Date(d.until + 28800000).toISOString().slice(0, 10) : "", optional: true }])); return; }
  await interaction.deferUpdate();
  if (action === "png") { const payload = await detailsPayload(store, panel); await interaction.followUp({ flags: 64, files: payload.files, allowedMentions: { parse: [] } }); return; }
  if (action === "csv") { const csv = simulationCsv(analyzeSimulation(store.history(panel.ownerId), d), getSimulationCatalog().items); if (Buffer.byteLength(csv) > 8_000_000) throw new Error("紀錄較多，請縮小期間後匯出。"); await interaction.followUp({ flags: 64, files: [{ attachment: Buffer.from(csv), name: "simulation-records.csv" }], allowedMentions: { parse: [] } }); return; }
  if (/^bulk(1000|10000|100000)$/.test(action)) {
    const input = { banner: d.banner, rules: d.rules, initial: d.fresh ? { ...EMPTY_SIMULATION_STATE } : store.state(panel.ownerId, d.pool, d.rulesId), count: Number(action.slice(4)), seed: randomInt(0, 2 ** 32) };
    const job = store.createPanel(panel.ownerId, "bulk", { input, running: true, applicationId: d.applicationId });
    const pending = runSimulationJob(store, job.id, job.ownerId, "bulk", input); void pending.catch(() => {});
    const message = await interaction.followUp({ ...uiMessage("獨立大量試抽", `正在試抽 ${input.count.toLocaleString()} 抽，不會修改日常進度。`, [uiRow(uiButton(job, "cancel", "取消試算"))]), flags: 32768 | 64 });
    try { const result = await pending; job.value = { input, result, applicationId: d.applicationId }; store.savePanel(job); const png = await renderSimulationChart({ title: "獨立試算・累積出率", subtitle: `${input.count} 抽 · 種子 ${input.seed} · ${input.rules.mode === "game" ? "遊戲預設" : "自訂規則"}`, percent: true, series: [{ label: "S", icon: "S", color: colors[0], points: result.trend.map((p: any) => ({ x: p.x, y: p.s })) }, { label: "A", icon: "A", color: colors[1], points: result.trend.map((p: any) => ({ x: p.x, y: p.a })) }] }); await interaction.webhook.editMessage(message.id, { ...uiMessage("獨立試算完成", `S ${result.counts.S}／A ${result.counts.A}／B ${result.counts.B}\nUP S ${result.up} · 小保底 ${result.won}/${result.small} 勝\n試算結果獨立，未增加日常抽數、保底或收藏。`, [uiRow(uiButton(job, "export", "匯出試算結果"))], png) }); }
    catch (error) { store.finishJob(job.id, "cancelled"); await interaction.webhook.editMessage(message.id, uiMessage("試算未完成", error instanceof Error ? error.message : "請稍後重試。") as any); }
    finally { job.value.running = false; store.savePanel(job); }
    return;
  }
  if (interaction.isModalSubmit()) {
    const query = interaction.fields.getTextInputValue("banner").trim(), matches = bannerOptions(d.pool, query);
    if (query) { const exact = matches.filter(b => b.id === query || b.name === query); if (exact.length !== 1) throw new Error("請輸入唯一的完整卡池名稱或 ID。"); d.bannerId = exact[0].id; } else d.bannerId = undefined;
    for (const key of ["since", "until"] as const) { const s = interaction.fields.getTextInputValue(key).trim(); if (s && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || (!Number.isFinite(Date.parse(s + "T00:00:00+08:00")) || new Date(Date.parse(s + "T00:00:00+08:00") + 28800000).toISOString().slice(0,10) !== s))) throw new Error("日期格式應為 YYYY-MM-DD。"); d[key] = s ? Date.parse(s + "T00:00:00+08:00") + (key === "until" ? 86400000 - 1 : 0) : undefined; }
    if (d.since && d.until && d.since > d.until) throw new Error("起日不可晚於迄日。"); d.historyPage = 0;
  } else if (interaction.isStringSelectMenu()) {
    if (action === "page") { d.page = interaction.values[0]; d.historyPage = 0; d.menu = undefined; }
    if (action === "version") { const v = store.rules(panel.ownerId, d.pool, interaction.values[0]); d.rulesId = v.id; d.rules = v.rules; d.historyPage = 0; }
    if (action === "compare") d.compare = interaction.values;
  } else {
    if (action === "home") { d.page = "overview"; d.menu = undefined; }
    if (action === "charts" || action === "filters") d.menu = action;
    if (action === "bulkMenu") d.menu = "bulk";
    if (["history", "collection"].includes(action)) { d.page = action; d.menu = undefined; d.historyPage = 0; }
    if (action === "clearFilter") { d.bannerId = d.since = d.until = undefined; d.historyPage = 0; }
    if (["character", "weapon"].includes(action)) { d.pool = action; d.rulesId = store.preferences(panel.ownerId).active[action as SimulationPool]; d.rules = store.rules(panel.ownerId, d.pool, d.rulesId).rules; d.banner = configuredSimulationBanner(bannerOptions(action)[0], store.preferences(panel.ownerId)); d.bannerId = undefined; d.historyPage = 0; d.versionPage = 0; d.compare = [d.rulesId]; }
    if (action === "fresh") d.fresh = !d.fresh;
    if (action === "previous") d.historyPage = Math.max(0, d.historyPage - 1);
    if (action === "next") d.historyPage++;
    if (action === "vPrev") d.versionPage = Math.max(0, d.versionPage - 1);
    if (action === "vNext") d.versionPage++;
  }
  store.savePanel(panel); await interaction.editReply(await detailsPayload(store, panel) as any);
}
