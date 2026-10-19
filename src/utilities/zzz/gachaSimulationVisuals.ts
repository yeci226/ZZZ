import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D, type Image } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import path from "node:path";
import { getSimulationCatalog } from "./gachaSimulationCatalog.js";
import type { SimulationBanner, SimulationState } from "./gachaSimulationEngine.js";
import type { SimulationRules } from "./gachaSimulationRules.js";
import { percent } from "./gachaSimulationRules.js";
import { resourceBudget, type ResourcePlan, type analyzeSimulation } from "./gachaSimulationAnalysis.js";

export const SIM_COLORS = { S: "#ffca55", A: "#d69bff", B: "#51c9f6", ink: "#f4f5f1", muted: "#adb1b9", bg: "#15161b", card: "#23252d", accent: "#ddfa64" };
export const SIM_IMAGE_PATHS: Record<string, string> = {
  S: "src/assets/gacha-simulation/ui/rank-s-gold.png",
  A: "src/assets/gacha-simulation/ui/rank-a-result.png",
  B: "src/assets/gacha-simulation/ui/rank-b-result.png",
  polychrome: "src/assets/images/zzz/official-record/icon-feilin-summary.8643ebfe.png",
  tapes: "src/assets/images/zzz/official-record/icon-encrypted-master.728d9443.png",
  character: "src/assets/images/icons/roleCircle/1011.webp",
  weapon: "src/assets/images/icons/gacha/weapon-big/14118.webp",
};
let fontsReady = false;
const images = new Map<string, Promise<Image | undefined>>();
export function simulationFonts() {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(path.resolve("src/assets/fonts/zzz-official/zzz-tw.woff2"), "SimBody");
  GlobalFonts.registerFromPath(path.resolve("src/assets/zh-tw.ttf"), "SimTitle");
  GlobalFonts.registerFromPath(path.resolve("src/assets/impact.ttf"), "SimNumber");
  fontsReady = true;
}
export async function simulationImage(key: string): Promise<Image | undefined> {
  if (!images.has(key)) images.set(key, (async () => {
    const item = getSimulationCatalog().items[key];
    const head = path.resolve(`src/assets/images/icons/roleCircle/${key}.webp`);
    const file = SIM_IMAGE_PATHS[key] ?? (item?.kind === "character" && existsSync(head) ? head : item?.image);
    if (!file || !existsSync(file)) return undefined;
    const image = await loadImage(file);
    if (item?.kind === "character" && !existsSync(head) && item.crop) {
      const [x, y, w, h] = item.crop;
      // Keep the crop's own aspect ratio. The avatar slot handles final scaling;
      // resizing a wide crop to a square here would permanently distort the face.
      const width = Math.round(image.width * w), height = Math.round(image.height * h);
      const c = createCanvas(width, height), ctx = c.getContext("2d");
      ctx.drawImage(image, image.width * x, image.height * y, image.width * w, image.height * h, 0, 0, width, height);
      return loadImage(c.toBuffer("image/png"));
    }
    return image;
  })().catch(() => undefined));
  return images.get(key)!;
}
export function box(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, color = SIM_COLORS.card, radius = 18) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}
export function words(ctx: SKRSContext2D, text: string, x: number, y: number, size = 26, color = SIM_COLORS.ink, width = 920, family = "SimBody") {
  ctx.font = `${size}px ${family}`; ctx.fillStyle = color; ctx.textAlign = "left";
  while (ctx.measureText(text).width > width && text.length > 1) text = text.slice(0, text.endsWith("…") ? -2 : -1) + "…";
  ctx.fillText(text, x, y);
}
export async function picture(ctx: SKRSContext2D, key: string, x: number, y: number, size = 64) {
  const img = await simulationImage(key);
  if (img) {
    ctx.save();
    const avatar = key === "character" || getSimulationCatalog().items[key]?.kind === "character";
    if (avatar) {
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    // Fill circular avatars with one scale factor; trim the perimeter, never stretch faces.
    // Equipment, rarity and resource icons retain their complete original silhouettes.
    const scale = size / (avatar ? Math.min(img.width, img.height) : Math.max(img.width, img.height));
    ctx.drawImage(img, x + (size - img.width * scale) / 2, y + (size - img.height * scale) / 2, img.width * scale, img.height * scale);
    ctx.restore();
  }
}
export function cardCanvas(height: number, title: string, subtitle = "") {
  simulationFonts(); const canvas = createCanvas(1000, height), ctx = canvas.getContext("2d");
  ctx.fillStyle = SIM_COLORS.bg; ctx.fillRect(0, 0, 1000, height);
  ctx.fillStyle = SIM_COLORS.accent; ctx.fillRect(32, 32, 7, 34);
  words(ctx, title, 54, 61, 32, SIM_COLORS.ink, 900, "SimTitle");
  if (subtitle) words(ctx, subtitle, 34, 99, 24, SIM_COLORS.muted);
  return { canvas, ctx };
}
export function itemName(id: string) { return getSimulationCatalog().items[id]?.name ?? id; }
export function poolName(pool: string) { return pool === "character" ? "角色" : "音擎"; }
export function friendlyPercent(value: number) { return `${(value * 100).toFixed(1)}%`; }

export async function renderSettingsCard(b: SimulationBanner, rules: SimulationRules, animation: boolean, pending: boolean) {
  const { canvas, ctx } = cardCanvas(454, `${b.version} ${b.name}`, `${poolName(b.pool)}池 · ${pending ? "有尚未儲存的變更" : "目前使用的設定"}`);
  box(ctx, 32, 126, 936, 142);
  await picture(ctx, b.featuredS, 42, 132, 124);
  words(ctx, itemName(b.featuredS), 184, 173, 32, SIM_COLORS.ink, 530, "SimTitle");
  words(ctx, rules.mode === "game" ? "遊戲預設機率" : "自訂機率", 184, 215, 26, rules.mode === "game" ? SIM_COLORS.accent : SIM_COLORS.S);
  words(ctx, rules.s.hard ? `最多 ${rules.s.hard} 抽出 S` : "S 保底已關閉", 650, 177, 27, SIM_COLORS.S, 285);
  words(ctx, `抽取動畫：${animation ? "播放" : "跳過"}`, 650, 221, 24, SIM_COLORS.muted);
  for (const [i, rank] of (["S", "A", "B"] as const).entries()) {
    const x = 32 + i * 318; box(ctx, x, 286, 300, 104);
    await picture(ctx, rank, x + 15, 303, 66);
    words(ctx, percent(rank === "B" ? rules.b : rules[rank.toLowerCase() as "s" | "a"].base), x + 94, 338, 38, SIM_COLORS[rank], 182, "SimNumber");
    words(ctx, "基礎機率", x + 96, 372, 22, SIM_COLORS.muted);
  }
  words(ctx, "基礎機率未計入保底加成。", 36, 427, 24, SIM_COLORS.muted);
  return canvas.encode("png");
}
export async function renderItemGrid(title: string, subtitle: string, items: Array<{ id: string; label?: string; detail?: string; selected?: boolean }>) {
  const columns = 5, rows = Math.max(1, Math.ceil(items.length / columns));
  const { canvas, ctx } = cardCanvas(132 + rows * 198, title, subtitle);
  for (const [i, item] of items.entries()) {
    const x = 32 + (i % columns) * 190, y = 126 + Math.floor(i / columns) * 198;
    box(ctx, x, y, 176, 180, item.selected ? "#343b24" : SIM_COLORS.card);
    if (item.selected) { ctx.strokeStyle = SIM_COLORS.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 145, y + 17); ctx.lineTo(x + 151, y + 23); ctx.lineTo(x + 161, y + 10); ctx.stroke(); }
    await picture(ctx, item.id, x + 39, y + 5, 98);
    words(ctx, item.label ?? itemName(item.id), x + 12, y + 129, 24, SIM_COLORS.ink, 152);
    if (item.detail) words(ctx, item.detail, x + 12, y + 160, 22, SIM_COLORS.muted, 152);
  }
  if (!items.length) words(ctx, "尚無調頻紀錄。", 48, 205, 30, SIM_COLORS.muted);
  return canvas.encode("png");
}

export async function renderDetailsCard(b: SimulationBanner, rules: SimulationRules, state: SimulationState, stats: ReturnType<typeof analyzeSimulation>, subtitle: string) {
  const { canvas, ctx } = cardCanvas(604, "調頻總覽", subtitle);
  box(ctx, 32, 124, 285, 117);
  await picture(ctx, "tapes", 47, 144, 74);
  words(ctx, stats.total.toLocaleString(), 133, 181, 48, SIM_COLORS.ink, 172, "SimNumber");
  words(ctx, "累計抽數", 135, 220, 24, SIM_COLORS.muted);
  for (const [i, rank] of (["S", "A", "B"] as const).entries()) {
    const x = 332 + i * 215; box(ctx, x, 124, 204, 117);
    await picture(ctx, rank, x + 13, 146, 62);
    words(ctx, stats.counts[rank].toLocaleString(), x + 90, 183, 40, SIM_COLORS[rank], 109, "SimNumber");
    words(ctx, "取得", x + 91, 219, 23, SIM_COLORS.muted);
  }
  box(ctx, 32, 258, 936, 184);
  await picture(ctx, b.featuredS, 48, 289, 119);
  words(ctx, "目前保底進度", 186, 298, 23, SIM_COLORS.muted);
  words(ctx, rules.s.hard ? `再 ${Math.max(1, rules.s.hard - state.sinceS)} 抽內必出 S` : `已累積 ${state.sinceS} 抽未出 S`, 186, 342, 35, SIM_COLORS.S, 730, "SimTitle");
  box(ctx, 188, 361, 738, 12, "#41424a", 6);
  if (rules.s.hard && state.sinceS) box(ctx, 188, 361, 738 * Math.min(1, state.sinceS / rules.s.hard), 12, SIM_COLORS.S, 6);
  words(ctx, state.guaranteedS && rules.s.guarantee ? `下一個 S 必為 UP：${itemName(b.featuredS)}` : `下一個 S 有 ${percent(rules.s.up)} 是 UP：${itemName(b.featuredS)}`, 186, 413, 24, SIM_COLORS.ink, 750);
  const recent = stats.rows.filter(p => p.rank === "S").slice(-5).reverse();
  words(ctx, "近期 S 級", 34, 482, 25, SIM_COLORS.muted);
  if (!recent.length) words(ctx, "尚未抽到 S，出貨後會顯示頭像與抽數。", 170, 537, 25, SIM_COLORS.muted);
  for (const [i, p] of recent.entries()) {
    const x = 168 + i * 157; await picture(ctx, p.id, x, 464, 68);
    words(ctx, `${p.pity} 抽 · ${p.up ? "UP" : "歪"}`, x - 7, 567, 22, p.up ? SIM_COLORS.S : SIM_COLORS.muted, 155);
  }
  return canvas.encode("png");
}

export async function renderResourceCard(input: ResourcePlan) {
  const budget = resourceBudget(input.resources), { canvas, ctx } = cardCanvas(578, "資源試算", "依可用資源與保底進度估算目標達成機率");
  box(ctx, 32, 126, 936, 117);
  await picture(ctx, "tapes", 50, 146, 76);
  words(ctx, `${budget.pulls.toLocaleString()} 抽`, 143, 181, 48, SIM_COLORS.accent, 286, "SimTitle");
  words(ctx, "本次可用", 145, 221, 23, SIM_COLORS.muted);
  await picture(ctx, "polychrome", 454, 144, 51);
  words(ctx, `${input.resources.polychrome.toLocaleString()} 菲林`, 520, 180, 25, SIM_COLORS.ink, 420);
  words(ctx, `母帶 ${input.resources.tapes} · 可換底片 ${input.resources.monochrome - input.resources.reserve}`, 453, 223, 24, SIM_COLORS.muted, 480);
  for (const [i, stage] of input.stages.entries()) {
    const y = 264 + i * 137; box(ctx, 32, y, 936, 121);
    await picture(ctx, stage.banner.featuredS, 45, y + 13, 96);
    words(ctx, `${i + 1} · ${poolName(stage.banner.pool)} ${itemName(stage.banner.featuredS)}`, 162, y + 37, 28, SIM_COLORS.ink, 563);
    words(ctx, stage.target ? `目標 ${stage.target} 份` : "略過", 735, y + 38, 26, stage.target ? SIM_COLORS.S : SIM_COLORS.muted, 210);
    words(ctx, `已墊 ${stage.sinceS} 抽 · ${stage.guaranteed === null ? "不確定大小保底" : stage.guaranteed ? "大保底（下個 S 必 UP）" : "小保底（下個 S 可能歪）"}`, 164, y + 80, 24, SIM_COLORS.muted, 756);
    if (stage.rules.mode === "custom") words(ctx, "自訂機率", 783, y + 107, 21, SIM_COLORS.A, 145);
  }
  words(ctx, "依序抽取，達標後切換卡池；試算不計入模擬調頻紀錄。", 35, 563, 23, SIM_COLORS.muted);
  return canvas.encode("png");
}

export async function renderResourceSummary(input: ResourcePlan, scenario: any) {
  const budget = resourceBudget(input.resources), { canvas, ctx } = cardCanvas(462, "目標達成機率", `可用 ${budget.pulls.toLocaleString()} 抽 · ${scenario.label || "依輸入的保底進度"}`);
  for (const [i, stage] of input.stages.entries()) {
    const x = 32 + i * 477; box(ctx, x, 129, 458, 179);
    await picture(ctx, stage.banner.featuredS, x + 12, 147, 99);
    words(ctx, itemName(stage.banner.featuredS), x + 127, 172, 27, SIM_COLORS.ink, 313);
    words(ctx, stage.target ? friendlyPercent(scenario.successes[stage.banner.pool] / scenario.completed) : "不抽", x + 127, 235, 53, i ? SIM_COLORS.A : SIM_COLORS.S, 313, "SimNumber");
    words(ctx, stage.target ? `取得至少 ${stage.target} 份` : "未設定目標", x + 127, 281, 25, SIM_COLORS.muted, 313);
  }
  box(ctx, 32, 326, 936, 102, "#2e3521");
  words(ctx, "全部目標達成", 56, 370, 29, SIM_COLORS.ink);
  const value = friendlyPercent(scenario.successes.both / scenario.completed);
  words(ctx, value, 680, 392, 62, SIM_COLORS.accent, 268, "SimNumber");
  words(ctx, "抽樣估計，並非保證", 57, 409, 23, SIM_COLORS.muted);
  return canvas.encode("png");
}
