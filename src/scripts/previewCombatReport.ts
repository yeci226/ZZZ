/** Clearly labeled synthetic engine fixture: this does not assert any real character's output. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { ELEMENTS } from "../utilities/zzz/combat/stats.js";
import { simulate } from "../utilities/zzz/combat/engine.js";
import {
  exportCombatCsv,
  exportCombatResult,
  renderCombatResult,
} from "../utilities/zzz/combat/combatReport.js";
import type {
  BuildSnapshot,
  SimulationScenario,
} from "../utilities/zzz/combat/types.js";

const directory = resolve(process.argv[2] ?? "previews/combat");
await mkdir(directory, { recursive: true });
const actor = (
  id: string,
  name: string,
  atk: number,
  element: (typeof ELEMENTS)[number],
): BuildSnapshot => ({
  id,
  name,
  kind: "agent",
  level: 60,
  cinema: 0,
  modelVersion: "synthetic-report-1",
  panel: {
    hp: 10000,
    atk,
    def: 600,
    critRate: 45,
    critDmg: 100,
    impact: 100,
    anomalyProficiency: 100,
    anomalyMastery: 100,
    energyRegen: 1,
    penRatio: 0,
    penFlat: 0,
    damageBonus: 0,
    resIgnore: 0,
    defReduction: 0,
    vulnerability: 0,
  },
  levelCoefficient: 1000,
  resources: { energy: { initial: 20, max: 100, regenPerSecond: 1 } },
  actions: {
    basic: {
      id: "basic",
      name: "合成測試攻擊",
      durationMs: 1000,
      cooldownMs: 0,
      cost: {},
      hits: [
        {
          atMs: 250,
          damage: {
            kind: "direct",
            element,
            basis: "atk",
            multiplier: 1,
            canCrit: true,
          },
          daze: 8,
        },
      ],
    },
  },
  defaultPriority: ["basic"],
  provenance: {
    verified: true,
    sources: ["synthetic deterministic UI/engine fixture — not game data"],
    unsupported: [],
  },
});
const team = [
  actor("test_a", "測試角色 A", 2000, "physical"),
  actor("test_b", "測試角色 B", 1500, "fire"),
  actor("test_c", "測試角色 C", 1000, "ether"),
];
const scenario: SimulationScenario = {
  schemaVersion: 1,
  modelVersion: "synthetic-report-1",
  mode: "fixed-duration",
  durationMs: 90_000,
  team,
  enemy: {
    level: 60,
    defense: 1000,
    resistance: Object.fromEntries(
      ELEMENTS.map((e) => [e, 0]),
    ) as SimulationScenario["enemy"]["resistance"],
    stunThreshold: 100,
    stunDurationMs: 3000,
    stunMultiplier: 1.5,
    anomaly: {},
  },
  rotation: team.flatMap((a) => [
    { type: "switch", actor: a.id },
    {
      type: "repeat",
      count: 5,
      steps: [{ type: "action", actor: a.id, action: "basic" }],
    },
  ]) as SimulationScenario["rotation"],
  loop: true,
  incoming: [],
  switchMs: 100,
  seed: 12345,
  trials: 100,
};
const escape = (v: string) =>
  v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
for (const mode of ["fixed-duration", "kill"] as const) {
  scenario.mode = mode;
  if (mode === "kill") {
    scenario.enemy.hp = 50_000;
    scenario.enemy.shield = { hp: 4000, sources: ["synthetic test shield"] };
  }
  const result = simulate(scenario);
  for (const page of ["summary", "actions", "timeline"] as const) {
    const image = await renderCombatResult(result, scenario, "tw", page);
    const filename = `full-report-${mode}-${page}`;
    await writeFile(join(directory, `${filename}.png`), image);
    const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>完整戰鬥引擎・合成驗證</title><style>*{box-sizing:border-box}body{margin:0;background:#313338;color:#eef0f5;font:15px -apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif}.top{padding:20px 28px;border-bottom:1px solid #22252d;color:#d7dbe7}.wrap{max-width:900px;margin:26px auto;padding:0 18px}.author{margin-bottom:12px;font-weight:600}.app{padding:2px 6px;border-radius:4px;background:#5865f2;font-size:10px;margin-left:8px}.embed{background:#2b2d31;border-left:4px solid #ffc568;padding:16px;border-radius:4px}.title{font-weight:600;margin:0 0 9px}.note{color:#afb7c5;font-size:13px;line-height:1.6}img{display:block;width:100%;margin-top:12px}.controls{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}button{border:0;border-radius:4px;background:#4e5058;color:white;padding:10px 14px;font:13px inherit}button.active{background:#5865f2}</style><body><div class="top"># 模擬開發預覽 · 本機截圖</div><div class="wrap"><div class="author">柯琳小助手<span class="app">APP</span></div><div class="embed"><p class="title">${mode === "kill" ? "擊殺時間" : "固定時間"}・${escape(page)}</p><div class="note">以下使用合成角色驗證引擎與圖片版面，並非你的隊伍或遊戲角色的實戰傷害。<br>真實角色模型仍需完成資料與實測驗證後，才會共同開放。</div><img src="data:image/png;base64,${image.toString("base64")}"></div><div class="controls"><button class="${page === "summary" ? "active" : ""}">總覽</button><button class="${page === "actions" ? "active" : ""}">招式明細</button><button class="${page === "timeline" ? "active" : ""}">時間軸</button><button>下載 JSON / CSV</button></div></div></body></html>`;
    await writeFile(join(directory, `${filename}.html`), html);
  }
  await writeFile(
    join(directory, `full-report-${mode}.json`),
    exportCombatResult(result, scenario),
  );
  await writeFile(
    join(directory, `full-report-${mode}.csv`),
    exportCombatCsv(result),
  );
}
console.log(`Synthetic report previews generated: ${directory}`);
