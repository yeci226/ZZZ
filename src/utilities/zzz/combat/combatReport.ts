import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { join } from "node:path";
import { getZzzCanvasFont, normalizeZzzLocale } from "../canvasFonts.js";
import { combatText } from "./copy.js";
import { hash } from "./scoring.js";
import type {
  SimulationResult,
  SimulationScenario,
  CombatEvent,
} from "./types.js";

export type CombatReportPage = "summary" | "actions" | "timeline";
const labels = {
  en: [
    "Fixed duration",
    "Time to defeat",
    "Defeat rate",
    "Mean defeat time · successful trials",
    "Not defeated",
    "Effective damage",
    "Overkill",
    "Damage categories",
    "Direct",
    "Anomaly",
    "Disorder",
    "Sheer",
    "Special",
    "Average damage / second",
    "First trial timeline",
    "Synthetic engine test · not game combat",
    "Model validation pending",
    "All trials",
    "Successful trials only",
    "Remaining HP",
    "Top actions",
    "Buff uptime",
    "Complete events in JSON / CSV",
    "Target",
    "Defense",
    "HP",
    "Elapsed",
    "First-trial final resources",
    "Mean trial DPS",
  ],
  tw: [
    "固定時間",
    "擊殺時間",
    "擊殺率",
    "平均擊殺時間・成功場次",
    "尚未擊殺",
    "有效扣血",
    "溢出傷害",
    "傷害分類",
    "直傷",
    "異常",
    "紊亂",
    "穿透傷害",
    "特殊傷害",
    "每秒平均傷害",
    "首場事件時間軸",
    "合成引擎測試・非遊戲實戰結果",
    "模型待驗證",
    "全部場次",
    "僅成功場次",
    "剩餘血量",
    "主要傷害招式",
    "增益覆蓋率",
    "完整事件可匯出 JSON / CSV",
    "目標",
    "防禦",
    "血量",
    "經過時間",
    "首場結束資源",
    "各場 DPS 平均",
  ],
  cn: [
    "固定时间",
    "击杀时间",
    "击杀率",
    "平均击杀时间・成功场次",
    "尚未击杀",
    "有效扣血",
    "溢出伤害",
    "伤害分类",
    "直伤",
    "异常",
    "紊乱",
    "穿透伤害",
    "特殊伤害",
    "每秒平均伤害",
    "首场事件时间轴",
    "合成引擎测试・非游戏实战结果",
    "模型待验证",
    "全部场次",
    "仅成功场次",
    "剩余血量",
    "主要伤害招式",
    "增益覆盖率",
    "完整事件可导出 JSON / CSV",
    "目标",
    "防御",
    "血量",
    "经过时间",
    "首场结束资源",
    "各场 DPS 平均",
  ],
  jp: [
    "固定時間",
    "撃破時間",
    "撃破率",
    "平均撃破時間・成功試行",
    "未撃破",
    "実効ダメージ",
    "超過ダメージ",
    "ダメージ分類",
    "直接",
    "異常",
    "混沌",
    "透徹",
    "特殊",
    "秒ごとの平均ダメージ",
    "初回試行のタイムライン",
    "合成テスト・ゲームの実測ではありません",
    "モデル検証待ち",
    "全試行",
    "成功試行のみ",
    "残りHP",
    "主な攻撃",
    "バフ稼働率",
    "全イベントは JSON / CSV で出力可能",
    "対象",
    "防御",
    "HP",
    "経過時間",
    "初回終了時リソース",
    "各試行の平均DPS",
  ],
  kr: [
    "고정 시간",
    "처치 시간",
    "처치율",
    "평균 처치 시간 · 성공 시도",
    "미처치",
    "실제 피해",
    "초과 피해",
    "피해 분류",
    "직접",
    "이상",
    "혼돈",
    "관통",
    "특수",
    "초당 평균 피해",
    "첫 시도 타임라인",
    "합성 엔진 테스트 · 실제 게임 아님",
    "모델 검증 대기",
    "전체 시도",
    "성공 시도만",
    "남은 HP",
    "주요 공격",
    "버프 유지율",
    "전체 이벤트 JSON / CSV 내보내기",
    "대상",
    "방어",
    "HP",
    "경과 시간",
    "첫 시도 종료 자원",
    "시도별 평균 DPS",
  ],
  vi: [
    "Thời lượng cố định",
    "Thời gian hạ gục",
    "Tỷ lệ hạ gục",
    "Thời gian trung bình · lần thành công",
    "Chưa hạ gục",
    "Sát thương hiệu dụng",
    "Sát thương dư",
    "Loại sát thương",
    "Trực tiếp",
    "Dị thường",
    "Rối loạn",
    "Xuyên thấu",
    "Đặc biệt",
    "Sát thương trung bình mỗi giây",
    "Dòng thời gian lần đầu",
    "Kiểm thử tổng hợp · không phải trận trong game",
    "Mô hình chờ xác minh",
    "Mọi lần thử",
    "Chỉ lần thành công",
    "HP còn lại",
    "Đòn gây sát thương chính",
    "Thời gian hiệu lực buff",
    "Xuất toàn bộ sự kiện JSON / CSV",
    "Mục tiêu",
    "Phòng thủ",
    "HP",
    "Thời gian đã qua",
    "Tài nguyên cuối lần đầu",
    "DPS trung bình các lần thử",
  ],
  fr: [
    "Durée fixe",
    "Temps de défaite",
    "Taux de victoire",
    "Temps moyen · essais réussis",
    "Non vaincu",
    "Dégâts effectifs",
    "Dégâts excédentaires",
    "Types de dégâts",
    "Directs",
    "Anomalie",
    "Désordre",
    "Transperçants",
    "Spéciaux",
    "Dégâts moyens par seconde",
    "Chronologie du premier essai",
    "Test synthétique · pas un combat du jeu",
    "Modèle en attente de validation",
    "Tous les essais",
    "Essais réussis uniquement",
    "PV restants",
    "Attaques principales",
    "Durée des bonus",
    "Tous les événements en JSON / CSV",
    "Cible",
    "Défense",
    "PV",
    "Temps écoulé",
    "Ressources finales du premier essai",
    "DPS moyen des essais",
  ],
} as const;
const categories = [
  "direct",
  "anomaly",
  "disorder",
  "sheer",
  "special",
] as const;
const colors = ["#ffc76c", "#b8a0ef", "#eb8db8", "#82cbc3", "#f28d70"];
const clockLabels = {
  en: ["Combat", "Animation", "Shield absorbed"],
  tw: ["戰鬥", "動畫", "護盾吸收"],
  cn: ["战斗", "动画", "护盾吸收"],
  jp: ["戦闘", "アニメーション", "シールド吸収"],
  kr: ["전투", "애니메이션", "보호막 흡수"],
  vi: ["Chiến đấu", "Hoạt ảnh", "Khiên hấp thụ"],
  fr: ["Combat", "Animation", "Absorbé par le bouclier"],
} as const;
const number = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-US");
const seconds = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${(n / 1000).toFixed(2)}s`;
function isSynthetic(s: SimulationScenario) {
  return (
    /synthetic/i.test(s.modelVersion) ||
    s.team.some((a) => a.provenance.sources.some((v) => /synthetic/i.test(v)))
  );
}
async function portrait(id: string, bangboo: boolean): Promise<Image | null> {
  if (!/^\d{4,6}$/.test(id)) return null;
  try {
    return await loadImage(
      join(
        process.cwd(),
        "src/assets/images/icons",
        bangboo ? "gacha/bangboo" : "roleCircle",
        `${id}.webp`,
      ),
    );
  } catch {
    return null;
  }
}

/** Rendering consumes computed results; no game data or coefficients are invented here. */
export async function renderCombatResult(
  result: SimulationResult,
  scenario: SimulationScenario,
  locale: string,
  page: CombatReportPage = "summary",
): Promise<Buffer> {
  const tr = combatText(locale),
    t = labels[normalizeZzzLocale(locale) as keyof typeof labels] ?? labels.en,
    clocks =
      clockLabels[normalizeZzzLocale(locale) as keyof typeof clockLabels] ??
      clockLabels.en;
  const actors = [
    ...scenario.team,
    ...(scenario.bangboo ? [scenario.bangboo] : []),
  ];
  const portraits = await Promise.all(
    actors.map((a) =>
      isSynthetic(scenario) ? null : portrait(a.id, a.kind === "bangboo"),
    ),
  );
  const c = createCanvas(1100, 900),
    g = c.getContext("2d"),
    font = getZzzCanvasFont(locale);
  const text = (
    value: string,
    x: number,
    y: number,
    size = 20,
    color = "#f2f3f7",
    max = 1030,
  ) => {
    g.font = `${size}px ${font}`;
    g.fillStyle = color;
    let fitted = value;
    while (g.measureText(fitted).width > max && fitted.length)
      fitted = fitted.slice(0, -1);
    g.fillText(fitted === value ? fitted : fitted.slice(0, -1) + "…", x, y);
  };
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    color = "#22262e",
  ) => {
    g.beginPath();
    g.roundRect(x, y, w, h, 14);
    g.fillStyle = color;
    g.fill();
  };
  const killMode = (result.mode ?? scenario.mode) === "kill";
  g.fillStyle = "#101318";
  g.fillRect(0, 0, 1100, 900);
  g.fillStyle = "#ffc76c";
  g.fillRect(0, 0, 1100, 5);
  text(tr.simulation, 32, 46, 29);
  const status = isSynthetic(scenario)
    ? t[15]
    : scenario.team.some((a) => !a.provenance.verified)
      ? t[16]
      : scenario.modelVersion;
  text(status, 32, 77, 16, "#ddbd87", 710);
  text(
    `${killMode ? t[1] : t[0]} · ${scenario.durationMs / 1000}s · n=${result.trials}`,
    760,
    47,
    17,
    "#b7bfce",
    305,
  );
  const width = (1036 - (actors.length - 1) * 12) / actors.length;
  actors.forEach((a, i) => {
    const x = 32 + i * (width + 12);
    box(x, 97, width, 80);
    if (portraits[i]) g.drawImage(portraits[i]!, x + 8, 105, 64, 64);
    else {
      box(x + 9, 111, 52, 52, "#3c4451");
      text(String(i + 1), x + 26, 146, 25, colors[i]);
    }
    text(a.name, x + 81, 128, 21, colors[i], width - 91);
    text(
      `Lv.${a.level} · ${number(result.byActor[a.id] ?? 0)}`,
      x + 81,
      155,
      16,
      "#abb5c7",
      width - 91,
    );
  });
  const metric = (x: number, label: string, value: string, note: string) => {
    box(x, 194, 332, 112);
    text(label, x + 20, 221, 17, "#aab4c4", 294);
    let size = 37;
    g.font = `${size}px ${font}`;
    while (g.measureText(value).width > 297 && size > 12) {
      size--;
      g.font = `${size}px ${font}`;
    }
    text(value, x + 18, 264, size, "#ffcf7b", 300);
    text(note, x + 20, 289, 14, "#aab4c4", 293);
  };
  if (killMode) {
    metric(
      32,
      t[2],
      `${((result.kill?.rate ?? 0) * 100).toFixed(1)}%`,
      `n=${result.trials} · ${t[17]}`,
    );
    metric(
      384,
      t[3],
      result.kill?.meanTimeMs == null ? t[4] : seconds(result.kill.meanTimeMs),
      `${t[18]} · P10 ${seconds(result.kill?.p10TimeMs)} / P90 ${seconds(result.kill?.p90TimeMs)}`,
    );
    metric(
      736,
      t[5],
      number(result.meanEffectiveDamage),
      `${t[6]} ${number(result.meanOverkill)} · ${t[19]} ${number(result.kill?.meanRemainingHp)}`,
    );
  } else {
    metric(
      32,
      tr.damage,
      number(result.meanDamage),
      `${t[17]} · ${scenario.durationMs / 1000}s`,
    );
    metric(384, tr.dps, number(result.meanDps), t[13]);
    metric(
      736,
      "P10 / P90",
      `${number(result.p10)} / ${number(result.p90)}`,
      tr.damage,
    );
  }
  text(
    `${t[23]} · Lv.${scenario.enemy.level} · ${t[24]} ${scenario.enemy.defense}${killMode ? ` · ${t[25]} ${number(scenario.enemy.hp)}` : ""}${result.meanShieldDamage > 0 ? ` · ${clocks[2]} ${number(result.meanShieldDamage)}` : ""}`,
    35,
    335,
    17,
    "#aeb8c9",
    1030,
  );
  if (page === "summary") {
    text(tr.share, 35, 382, 22);
    actors.forEach((a, i) => {
      const y = 417 + 43 * i,
        ratio =
          result.meanDamage > 0
            ? (result.byActor[a.id] ?? 0) / result.meanDamage
            : 0;
      text(a.name, 35, y, 18, "#e6eaf1", 180);
      box(225, y - 16, 605, 17, "#282d37");
      if (ratio > 0) box(225, y - 16, Math.max(2, 605 * ratio), 17, colors[i]);
      text(
        `${number(result.byActor[a.id] ?? 0)} · ${(ratio * 100).toFixed(1)}%`,
        846,
        y,
        17,
        "#e6eaf1",
        224,
      );
    });
    text(t[7], 35, 606, 21);
    categories.forEach((key, i) => {
      const x = 33 + i * 211;
      box(x, 619, 194, 66);
      text(t[8 + i], x + 13, 643, 15, colors[i], 172);
      text(
        number(result.byCategory?.[key] ?? 0),
        x + 13,
        670,
        23,
        "#eef0f5",
        174,
      );
    });
    const values = result.perSecond,
      max = Math.max(1, ...values);
    text(t[13], 35, 718, 16, "#aeb8c9");
    g.strokeStyle = "#ffca78";
    g.lineWidth = 2;
    g.beginPath();
    values.forEach((n, i) => {
      const x = 36 + (i / Math.max(1, values.length - 1)) * 1027,
        y = 815 - (n / max) * 80;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
    text("0s", 35, 839, 13, "#aeb8c9");
    text(`${scenario.durationMs / 1000}s`, 1000, 839, 13, "#aeb8c9", 65);
  } else if (page === "actions") {
    text(t[20], 35, 380, 22);
    const actions = Object.entries(result.byAction)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    actions.forEach(([key, damage], i) => {
      const slash = key.indexOf("/"),
        owner = actors.find((a) => a.id === key.slice(0, slash)),
        action = key.slice(slash + 1);
      const y = 420 + 40 * i;
      text(
        `${i + 1}. ${owner?.name ?? key.slice(0, slash)} / ${owner?.actions[action]?.name ?? action}`,
        35,
        y,
        19,
        "#e4e8ef",
        780,
      );
      text(number(damage), 862, y, 21, "#ffce7c", 204);
    });
    text(t[21], 35, 759, 19, "#aeb8c9");
    Object.entries(result.buffUptime ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .forEach(([name, uptime], i) => {
        text(
          `${name}  ${(uptime * 100).toFixed(1)}%`,
          35 + (i % 2) * 522,
          792 + Math.floor(i / 2) * 29,
          16,
          "#bdc6d7",
          494,
        );
      });
  } else {
    text(`${t[14]} · seed ${result.trace.seed}`, 35, 379, 21);
    text(
      `${clocks[0]} ${seconds(result.trace.elapsedMs ?? scenario.durationMs)} · ${clocks[1]} ${seconds(result.trace.animationElapsedMs)} · ${t[19]} ${number(result.trace.remainingHp)}`,
      35,
      409,
      16,
      "#adb7c8",
    );
    text(`${clocks[0]} / ${clocks[1]}`, 36, 435, 12, "#adb7c8", 210);
    result.trace.events
      .filter((e) => e.kind !== "resource")
      .slice(0, 11)
      .forEach((event, i) => {
        const y = 463 + i * 29,
          owner = actors.find((a) => a.id === event.actor);
        text(
          `${seconds(event.atMs)} / ${seconds(event.animationAtMs)}`,
          36,
          y,
          15,
          "#ffce7c",
          205,
        );
        text(
          `${owner?.name ?? "—"} · ${event.kind} · ${owner?.actions[event.action ?? ""]?.name ?? event.action ?? event.detail ?? ""}`,
          255,
          y,
          16,
          "#c6cede",
          630,
        );
        text(
          event.amount === undefined ? "" : number(event.amount),
          906,
          y,
          17,
          "#e6eaf1",
          160,
        );
      });
    text(t[27], 35, 800, 16, "#adb7c8");
    const resources = Object.entries(result.trace.finalResources ?? {}).flatMap(
      ([id, values]) =>
        Object.entries(values).map(
          ([name, value]) =>
            `${actors.find((a) => a.id === id)?.name ?? id}/${name}: ${Number(value.toFixed(2))}`,
        ),
    );
    text(resources.join(" · "), 35, 827, 15, "#c6cede", 1030);
  }
  g.fillStyle = "#323944";
  g.fillRect(32, 853, 1036, 1);
  text(
    `${t[22]} · ${result.modelVersion} · ${result.fingerprint.slice(0, 10)}`,
    35,
    879,
    14,
    "#8e9aad",
    1025,
  );
  return c.toBuffer("image/png");
}

const cleanEvent = (e: CombatEvent) => ({
  atMs: e.atMs,
  animationAtMs: e.animationAtMs,
  damageEventId: e.damageEventId,
  kind: e.kind,
  actor: e.actor,
  sourceActor: e.sourceActor,
  action: e.action,
  amount: e.amount,
  critical: e.critical,
  detail: e.detail,
  weight: e.weight,
  category: e.category,
  effectiveAmount: e.effectiveAmount,
  overkill: e.overkill,
  shieldAmount: e.shieldAmount,
  element: e.element,
  triggerActor: e.triggerActor,
  resource: e.resource,
  value: e.value,
  delta: e.delta,
  breakdown:
    e.breakdown &&
    Object.fromEntries(
      [
        "basis",
        "multiplier",
        "bonus",
        "defense",
        "resistance",
        "vulnerability",
        "stun",
        "domain",
        "nonCritical",
        "critical",
        "expected",
      ].map((k) => [
        k,
        e.breakdown![k as keyof NonNullable<CombatEvent["breakdown"]>],
      ]),
    ),
});
/** A calculation report, not an executable imported model. Saved plans are exported separately. */
export function exportCombatResult(
  result: SimulationResult,
  scenario: SimulationScenario,
): string {
  const configuration = {
    gameDataVersion: scenario.gameDataVersion,
    rotationVersion: scenario.rotationVersion,
    mode: scenario.mode ?? "fixed-duration",
    durationMs: scenario.durationMs,
    seed: scenario.seed,
    trials: scenario.trials,
    loop: scenario.loop,
    switchMs: scenario.switchMs,
    // The scenario hash binds this report to the separately exportable replay plan.
    scenarioHash: hash(scenario),
    team: [
      ...scenario.team,
      ...(scenario.bangboo ? [scenario.bangboo] : []),
    ].map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      level: a.level,
      cinema: a.cinema,
      modelVersion: a.modelVersion,
      sources: a.provenance.sources,
      verified: a.provenance.verified,
    })),
    target: {
      level: scenario.enemy.level,
      defense: scenario.enemy.defense,
      hp: scenario.enemy.hp,
    },
  };
  const output = {
    reportSchemaVersion: 1,
    synthetic: isSynthetic(scenario),
    configuration,
    fingerprint: result.fingerprint,
    comparisonFingerprint: result.comparisonFingerprint,
    engineVersion: result.engineVersion,
    modelVersion: result.modelVersion,
    meanDamage: result.meanDamage,
    meanDps: result.meanDps,
    dpsBasis:
      (result.mode ?? scenario.mode) === "kill"
        ? "mean of each trial's effective HP damage / elapsed combat seconds; null if any trial ends at zero seconds"
        : "mean total damage / configured combat seconds",
    p10: result.p10,
    p90: result.p90,
    meanEffectiveDamage: result.meanEffectiveDamage,
    meanOverkill: result.meanOverkill,
    meanShieldDamage: result.meanShieldDamage,
    kill: result.kill && {
      rate: result.kill.rate,
      meanTimeMs: result.kill.meanTimeMs,
      p10TimeMs: result.kill.p10TimeMs,
      p90TimeMs: result.kill.p90TimeMs,
      meanRemainingHp: result.kill.meanRemainingHp,
    },
    byActor: result.byActor,
    byAction: result.byAction,
    byCategory: result.byCategory,
    perSecond: result.perSecond,
    buffUptime: result.buffUptime,
    trace: {
      seed: result.trace.seed,
      elapsedMs: result.trace.elapsedMs,
      animationElapsedMs: result.trace.animationElapsedMs,
      killed: result.trace.killed,
      total: result.trace.total,
      effectiveDamage: result.trace.effectiveDamage,
      overkill: result.trace.overkill,
      shieldDamage: result.trace.shieldDamage,
      remainingShield: result.trace.remainingShield,
      remainingHp: result.trace.remainingHp,
      finalResources: result.trace.finalResources,
      buffUptimeMs: result.trace.buffUptimeMs,
      buffAnimationUptimeMs: result.trace.buffAnimationUptimeMs,
      events: result.trace.events.map(cleanEvent),
    },
  };
  return JSON.stringify(output, null, 2);
}
function csvCell(v: unknown): string {
  let text = v === undefined || v === null ? "" : String(v);
  // Neutralize formula interpretation when a user-supplied model/name is opened in a spreadsheet.
  if (/^[\s]*[=+@-]/.test(text) && typeof v !== "number") text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
/** First trial trace only; average totals are never presented as a chronological battle. */
export function exportCombatCsv(result: SimulationResult): string {
  const keys = [
    "seed",
    "atMs",
    "animationAtMs",
    "damageEventId",
    "kind",
    "actor",
    "sourceActor",
    "triggerActor",
    "action",
    "category",
    "element",
    "amount",
    "effectiveAmount",
    "overkill",
    "shieldAmount",
    "critical",
    "resource",
    "value",
    "delta",
    "detail",
  ] as const;
  return (
    "\uFEFF" +
    [
      keys.join(","),
      ...result.trace.events.map((e) => {
        const event = { seed: result.trace.seed, ...cleanEvent(e) };
        return keys.map((key) => csvCell(event[key])).join(",");
      }),
    ].join("\r\n")
  );
}
