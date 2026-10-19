import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { join } from "node:path";
import { getZzzCanvasFont } from "../canvasFonts.js";
import type { LiveBuild } from "./liveBuild.js";
import {
  referenceAttacks,
  type calculateLiveRotation,
} from "./liveCalculator.js";

export type LiveDamageResult = ReturnType<typeof calculateLiveRotation>;
const root = join(process.cwd(), "src/assets/images");
const pictures: Record<
  string,
  { art: string; element: string; color: string }
> = {
  "1581": { art: "1112", element: "lumen.png", color: "#ec99c2" },
  "1401": { art: "838", element: "physic.webp", color: "#daafeb" },
  "1171": { art: "382", element: "fire.webp", color: "#ffc568" },
};
const cache = new Map<string, Promise<Image | null>>();
function asset(path: string): Promise<Image | null> {
  let value = cache.get(path);
  if (!value) {
    value = loadImage(join(root, path)).catch(() => null);
    cache.set(path, value);
  }
  return value;
}
export const formatDamage = (n: number) =>
  Math.round(n).toLocaleString("en-US");

/** The same local game assets are used by the bot attachment and offline previews. */
export async function renderLiveDamageCard(
  team: LiveBuild[],
  result: LiveDamageResult,
  selected: string,
  totalView = false,
): Promise<Buffer> {
  const actor = team.find((a) => a.id === selected);
  if (!actor || !result.rows.length)
    throw new Error("Missing damage card data");
  const visual = pictures[actor.id];
  if (!visual) throw new Error("Unsupported damage card character");
  const row = result.rows[0],
    color = visual.color;
  const [art, skill, portraits, elements, weapon, discs] = await Promise.all([
    asset(`zzz/wiki_paintings/${visual.art}/2.png`),
    asset(
      `icons/skills/${row.attack === "afterburn" || ["assault", "polar-assault", "burn-tick"].includes(row.attack) ? 5 : row.name.startsWith("普通") ? 0 : row.name.includes("特殊技") ? 1 : row.name.includes("支援") ? 6 : row.name.includes("閃避") ? 2 : 3}.png`,
    ),
    Promise.all(team.map((a) => asset(`icons/roleCircle/${a.id}.webp`))),
    Promise.all(
      team.map((a) => asset(`icons/element/${pictures[a.id]?.element}`)),
    ),
    actor.weapon ? asset(`icons/gacha/weapon/${actor.weapon.id}.webp`) : null,
    Promise.all(actor.sets.map((s) => asset(`icons/disk-suits/${s.id}.webp`))),
  ]);
  const canvas = createCanvas(1000, 850),
    c = canvas.getContext("2d");
  const font = getZzzCanvasFont("tw");
  const text = (
    value: string,
    x: number,
    y: number,
    size = 20,
    fill = "#f5f5f7",
    max = 940,
  ) => {
    c.font = `${size}px ${font}`;
    c.fillStyle = fill;
    let fitted = value;
    while (c.measureText(fitted).width > max && fitted.length > 1)
      fitted = fitted.slice(0, -1);
    if (fitted !== value) fitted = `${fitted.slice(0, -1)}…`;
    c.fillText(fitted, x, y);
  };
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    radius = 16,
  ) => {
    c.beginPath();
    c.roundRect(x, y, w, h, radius);
    c.fillStyle = fill;
    c.fill();
  };
  const icon = (img: Image | null, x: number, y: number, size: number) => {
    if (img) c.drawImage(img, x, y, size, size);
  };
  c.fillStyle = "#101216";
  c.fillRect(0, 0, 1000, 850);
  c.fillStyle = color;
  c.fillRect(0, 0, 1000, 5);
  text("傷害試算", 30, 48, 28);
  text("實際配裝  /  手動條件", 675, 45, 18, "#a8adb9", 300);
  const width = (940 - (team.length - 1) * 12) / team.length;
  team.forEach((a, index) => {
    const x = 30 + index * (width + 12),
      active = a.id === selected;
    box(x, 72, width, 88, active ? "#36302b" : "#202329");
    if (active) {
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.stroke();
    }
    icon(portraits[index], x + 8, 79, 72);
    icon(elements[index], x + width - 39, 83, 27);
    text(a.name, x + 88, 108, 23, active ? color : "#e5e6eb", width - 132);
    text(
      `Lv.${a.level} · ${a.cinema}影${a.awakening ? ` · 覺醒${a.awakening}` : ""}`,
      x + 88,
      137,
      15,
      "#abb0bd",
      width - 94,
    );
  });

  c.save();
  c.beginPath();
  c.roundRect(30, 180, 940, 284, 18);
  c.clip();
  c.fillStyle = "#252526";
  c.fillRect(30, 180, 940, 284);
  if (art) {
    // The official landscape paintings put the character's face near the middle.
    const h = 420,
      w = (h * art.width) / art.height;
    c.drawImage(art, 772 - w * 0.4, 123, w, h);
  }
  const shade = c.createLinearGradient(30, 0, 970, 0);
  shade.addColorStop(0, "#1b1d23");
  shade.addColorStop(0.43, "#1b1d23");
  shade.addColorStop(0.77, "#1b1d2340");
  shade.addColorStop(1, "#1b1d2315");
  c.fillStyle = shade;
  c.fillRect(30, 180, 940, 284);
  const bottom = c.createLinearGradient(0, 330, 0, 464);
  bottom.addColorStop(0, "#1b1d2300");
  bottom.addColorStop(1, "#1b1d23");
  c.fillStyle = bottom;
  c.fillRect(30, 330, 940, 134);
  c.restore();
  icon(skill, 53, 200, 32);
  text(
    totalView ? "隊伍選定項目 · 手動合計" : `${actor.name}  /  ${row.name}`,
    96,
    225,
    23,
    "#f8f8fa",
    560,
  );
  text(
    totalView
      ? `${result.rows.length} 個項目・期望傷害合計`
      : `${row.count} 次・期望傷害`,
    56,
    266,
    18,
    "#bdc1cc",
  );
  text(formatDamage(result.total), 52, 343, 76, color, 560);
  if (totalView) {
    text("僅加總已加入項目，未模擬出招循環", 57, 383, 18, "#c8ccd5", 540);
  } else if (
    referenceAttacks(actor).find((a) => a.id === row.attack)?.spec.canCrit
  ) {
    text(`未暴擊  ${formatDamage(row.nonCritical)}`, 57, 383, 20);
    text(`暴擊  ${formatDamage(row.critical)}`, 285, 383, 20);
  } else {
    text("此項異常傷害不可暴擊", 57, 383, 20, "#c8ccd5");
  }
  const target = result.target;
  box(50, 413, 895, 32, "#0c0e14b0", 8);
  text(
    `敵人防禦 ${target.defense}    ·    全屬性抗性 ${target.resistance}%    ·    ${target.stunned ? `失衡 ×${target.stunMultiplier}` : "未失衡"}`,
    64,
    435,
    17,
    "#c1c6d0",
  );

  if (!totalView) {
    const p = row.stats.panel;
    const stats = [
      ["戰鬥攻擊力", formatDamage(p.atk)],
      ["異常精通", formatDamage(p.anomalyProficiency)],
      ["異常掌控", formatDamage(p.anomalyMastery)],
      ["暴擊率 / 暴擊傷害", `${p.critRate}% / ${p.critDmg}%`],
    ];
    stats.forEach(([label, value], n) => {
      const x = 30 + n * 239;
      box(x, 480, 223, 83, "#202329", 12);
      text(label, x + 17, 509, 16, "#a7aebb");
      text(value, x + 17, 543, 26, "#f3f3f5", 196);
    });
    box(30, 579, 940, 72, "#202329", 12);
    icon(weapon, 39, 585, 58);
    text(actor.weapon?.name ?? "未裝備音擎", 106, 609, 21, "#f5f5f7", 270);
    text(
      actor.weapon ? `音擎・精煉 ${actor.weapon.refinement}` : "",
      106,
      635,
      16,
      "#a7aebb",
    );
    actor.sets.slice(0, 2).forEach((s, n) => {
      const x = 399 + n * 280;
      icon(discs[n], x, 590, 48);
      text(s.name, x + 58, 609, 19, "#e6e8ec", 215);
      text(`${s.pieces} 件套`, x + 58, 635, 16, "#a7aebb");
    });
    text("已套用的加成", 32, 682, 18, color);
    if (row.stats.effects.length > 6)
      text(
        `共 ${row.stats.effects.length} 項，完整內容可匯出`,
        540,
        682,
        15,
        "#a7aebb",
        425,
      );
    row.stats.effects.slice(0, 6).forEach((effect: string, n: number) => {
      const x = n < 3 ? 34 : 512,
        y = 709 + (n % 3) * 24;
      text(`· ${effect}`, x, y, 16, "#b8bfcb", 450);
    });
  } else {
    const max = Math.max(...result.byActor.map((a) => a.damage), 1);
    result.byActor.forEach((a, n) => {
      const y = 481 + n * 57;
      icon(portraits[n], 36, y, 44);
      text(a.name, 94, y + 28, 20, "#d9dce3", 180);
      box(268, y + 14, 460, 14, "#2b3038", 7);
      if (a.damage > 0)
        box(
          268,
          y + 14,
          Math.max(14, (a.damage / max) * 460),
          14,
          pictures[a.id].color,
          7,
        );
      text(formatDamage(a.damage), 755, y + 29, 24, "#eaeef4", 210);
    });
    text("已加入的傷害項目", 32, 682, 18, color);
    result.rows
      .slice(0, 3)
      .forEach((r: LiveDamageResult["rows"][number], n: number) => {
        const name = team.find((a) => a.id === r.actor)?.name ?? r.actor;
        text(
          `${name} · ${r.name} ×${r.count}`,
          34,
          710 + n * 24,
          16,
          "#bdc4cf",
          740,
        );
        text(formatDamage(r.expected), 805, 710 + n * 24, 16, "#e4e9f0", 140);
      });
    if (result.rows.length > 3)
      text(
        `另有 ${result.rows.length - 3} 項，完整內容可匯出`,
        540,
        682,
        15,
        "#a7aebb",
        425,
      );
  }
  c.fillStyle = "#343840";
  c.fillRect(30, 778, 940, 1);
  text("逐項試算｜不代表完整隊伍傷害或自動循環 DPS", 32, 807, 17, "#e0bc7e");
  text(
    "未計異化／耀變、紊亂、異常積蓄與追加傷害；增益狀態及次數由使用者指定。",
    32,
    833,
    15,
    "#9ba3b2",
  );
  return canvas.toBuffer("image/png");
}
