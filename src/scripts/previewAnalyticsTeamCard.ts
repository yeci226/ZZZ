/** First visual draft only; uses a saved public reference, not account data. */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ensureZzzCanvasFonts,
  getZzzCanvasFont,
} from "../utilities/zzz/canvasFonts.js";
import { getPaperAccent } from "../utilities/zzz/profileColors.js";
import type { ReferenceRun } from "../utilities/zzz/analyticsSource.js";

ensureZzzCanvasFonts();
const saved = JSON.parse(
  await readFile("previews/analytics-reference/payloads.json", "utf8"),
);
const evidence = Object.values(saved.pages)
  .map((p: any) => p.download?.text)
  .filter(Boolean)
  .map((text: string) => JSON.parse(text));
const record =
  evidence.find((e: any) => e.run.id === "run_1791936182676_7sc6ox9") ??
  evidence[0];
if (!record) throw new Error("Generate previewAnalyticsReference first");
const run: ReferenceRun = record.run;
const names = JSON.parse(
  await readFile("src/assets/disc-leaderboard-names.json", "utf8"),
).tw;
const catalog = JSON.parse(
  await readFile("src/assets/gacha-simulation/catalog.json", "utf8"),
).items;
// Source item_codes.json maps these English aliases to stable game IDs.
const weaponIds: Record<string, string> = {
  "Hailstrom Shrine": "14109",
  "Hailstorm Shrine": "14109",
  Timeweaver: "14122",
  Thoughtbop: "14149",
};
const suits: Record<string, { id: string; name: string }> = {
  "Branch & Blade Song": { id: "32700", name: "折枝劍歌" },
  "Puffer Electro": { id: "31100", name: "河豚電音" },
  "Chaos Jazz": { id: "31800", name: "混沌爵士" },
  "Freedom Blues": { id: "31300", name: "自由藍調" },
  "Moonlight Lullaby": { id: "33400", name: "月光騎士頌" },
  "Phaethon's Melody": { id: "33000", name: "法厄同之歌" },
};
const stats: Record<string, string> = {
  "CRIT Rate": "暴擊率",
  "CRIT DMG": "暴擊傷害",
  "PEN Ratio": "穿透率",
  "ATK%": "攻擊力%",
  AP: "異常精通",
  AM: "異常掌控",
  ER: "能量自動回復",
  "DMG%": "屬性傷害%",
};
const artwork: Record<string, { path: string; face: number }> = {
  "1091": { path: "src/assets/images/icons/mindscape/1091.png", face: 0.6 },
  "1221": {
    path: "src/assets/images/zzz/wiki_paintings/529/2.png",
    face: 0.69,
  },
  "1411": { path: "src/assets/images/icons/mindscape/1411.png", face: 0.6 },
};
const canvas = createCanvas(1000, 780);
const ctx = canvas.getContext("2d");
// Match the alternate `current` profile palette and cut-corner modules.
const paper = "#e9e5da",
  bright = "#f7f3e8",
  ink = "#0b0c0d",
  muted = "#9ea2a3",
  panel = "#24282a";
const font = getZzzCanvasFont("tw");
function text(
  value: string,
  x: number,
  y: number,
  size: number,
  color = ink,
  numeric = false,
) {
  ctx.font = numeric ? `900 italic ${size}px Nunito` : `500 ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function poly(points: number[][], color: string) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
function line(x: number, y: number, w: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
ctx.fillStyle = "#111416";
ctx.fillRect(0, 0, 1000, 780);
for (let y = 8; y < 780; y += 12) {
  for (const x of [337, 659]) {
    ctx.fillStyle = y % 24 ? "#393d3f" : "#24282a";
    ctx.fillRect(x, y, 3, 5);
  }
}
poly(
  [
    [24, 14],
    [948, 14],
    [976, 40],
    [976, 108],
    [40, 108],
    [24, 92],
  ],
  "#191c1e",
);
ctx.strokeStyle = paper;
ctx.lineWidth = 1.5;
ctx.stroke();
ctx.fillStyle = "#68c2c3";
ctx.fillRect(38, 29, 4, 16);
text("TEAM REFERENCE", 52, 41, 12, muted, true);
text("參考隊伍", 39, 84, 35, bright);
text("01 / 03", 335, 74, 18, "#b2aaa0", true);
text("來源隊伍 DPS", 485, 31, 13, muted);
text(Math.round(run.dps).toLocaleString("en-US"), 480, 83, 55, bright, true);
text(
  `總傷害 ${Math.round(run.damage).toLocaleString("en-US")}`,
  485,
  103,
  12,
  muted,
);
line(788, 29, 1, muted);
text("測試時長", 814, 32, 13, muted);
text(`${run.duration}`, 810, 69, 31, bright, true);
text("秒", 880, 67, 14, muted);
text(run.date.replaceAll("-", "."), 813, 91, 13, muted, true);

for (const [index, actor] of run.actors.entries()) {
  const x = 24 + index * 322,
    w = 308,
    top = 124;
  const accent = names[actor.id]?.color ?? "#05777a";
  const readable = getPaperAccent(accent);
  const lightAccent =
    "#" +
    accent
      .slice(1)
      .match(/../g)!
      .map((hex: string) =>
        Math.round(parseInt(hex, 16) * 0.48 + 255 * 0.52)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  poly(
    [
      [x, top],
      [x + w - 18, top],
      [x + w, top + 18],
      [x + w, 405],
      [x + w - 18, 423],
      [x, 423],
    ],
    paper,
  );
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x + w - 18, top);
  ctx.lineTo(x + w, top + 18);
  ctx.lineTo(x + w, 380);
  ctx.lineTo(x, 380);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(x, top, w, 256);
  poly(
    [
      [x, top],
      [x + w, top],
      [x + w, top + 50],
      [x, top + 155],
    ],
    "#ffffff18",
  );
  const art = artwork[actor.id];
  const image = await loadImage(art.path);
  const height = 296,
    scale = height / image.height;
  ctx.drawImage(
    image,
    x + w / 2 - image.width * scale * art.face,
    top - 10,
    image.width * scale,
    height,
  );
  ctx.restore();
  poly(
    [
      [x, 356],
      [x + w, 374],
      [x + w, 398],
      [x, 398],
    ],
    paper,
  );
  ctx.fillStyle = accent;
  ctx.fillRect(x, top, 5, 34);
  poly(
    [
      [x, top],
      [x + 47, top],
      [x + 40, top + 31],
      [x, top + 31],
    ],
    ink,
  );
  text(`0${index + 1}`, x + 10, top + 22, 16, bright, true);
  text(names[actor.id]?.name ?? actor.name, x + 16, 407, 30, ink);
  const e = actor.equipment;
  const badge = e.mindscape || "—";
  poly(
    [
      [x + 236, 384],
      [x + 292, 384],
      [x + 286, 411],
      [x + 230, 411],
    ],
    accent,
  );
  text(badge, x + 243, 404, 19, bright, true);
  poly(
    [
      [x, 431],
      [x + w - 12, 431],
      [x + w, 443],
      [x + w, 484],
      [x + 12, 484],
      [x, 472],
    ],
    paper,
  );
  poly(
    [
      [x, 492],
      [x + w, 492],
      [x + w, 688],
      [x + w - 15, 703],
      [x, 703],
    ],
    panel,
  );
  const weapon = catalog[weaponIds[e.w_engine]];
  if (weapon?.image) {
    const icon = await loadImage(weapon.image);
    ctx.drawImage(icon, x + 12, 435, 48, 48);
  }
  text("音擎", x + 69, 447, 12, "#606365");
  text(weapon?.name ?? e.w_engine ?? "未提供", x + 69, 471, 20, ink);
  text(
    e.phase ? `${e.phase.replace(/^R/, "")}階` : "—",
    x + 257,
    469,
    16,
    readable,
  );
  for (const [row, [setName, count]] of [
    [e.disc_4pc, "4件"],
    [e.disc_2pc, "2件"],
  ].entries()) {
    const suit = suits[setName];
    const y = 516 + row * 30;
    if (suit) {
      const icon = await loadImage(
        `src/assets/images/icons/disk-suits/${suit.id}.webp`,
      );
      ctx.drawImage(icon, x + 16, y - 19, 25, 25);
    }
    text(suit?.name ?? setName ?? "未提供", x + 49, y + 1, 17, paper);
    text(count, x + 257, y, 13, lightAccent);
  }
  text("驅動盤主詞條", x + 16, 566, 12, muted);
  for (const [slot, value] of [e.slot4, e.slot5, e.slot6].entries()) {
    const sx = x + 16 + slot * 94;
    ctx.fillStyle = "#151719";
    ctx.fillRect(sx, 577, 87, 51);
    ctx.fillStyle = accent;
    ctx.fillRect(sx, 577, 2, 51);
    text(`${slot + 4}號位`, sx + 8, 594, 11, muted);
    text(stats[value] ?? value ?? "未提供", sx + 8, 617, 15, paper);
  }
  text("傷害貢獻", x + 16, 655, 12, muted);
  const percent = run.damage > 0 ? (actor.damage / run.damage) * 100 : 0;
  const damageText = (actor.damage / 10000).toFixed(1);
  text(damageText, x + 16, 680, 20, paper, true);
  const damageWidth = ctx.measureText(damageText).width;
  text("萬", x + 22 + damageWidth, 680, 13, muted);
  text(`${percent.toFixed(1)}%`, x + 205, 679, 25, lightAccent, true);
  ctx.fillStyle = "#373b3d";
  ctx.fillRect(x + 16, 691, w - 32, 5);
  ctx.fillStyle = lightAccent;
  ctx.fillRect(x + 16, 691, ((w - 32) * percent) / 100, 5);
}
line(24, 723, 952, "#373b3d");
text("外部測試紀錄 · 非此帳號傷害預測", 24, 747, 13, paper);
text("ZZZ ANALYTICS", 756, 747, 16, paper, true);
text(
  "中性訓練環境 · 角色占比未含其他傷害來源 · 影畫插圖不代表實際影畫等級",
  24,
  767,
  10,
  muted,
);
text("參考隊伍 / 影畫樣式 v3", 845, 767, 10, muted);
const directory = resolve("previews/analytics-reference");
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, "team-card-v3.png"),
  canvas.toBuffer("image/png"),
);
console.log(resolve(directory, "team-card-v3.png"));
