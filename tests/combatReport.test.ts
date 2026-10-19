import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  renderCombatResult,
  exportCombatResult,
  exportCombatCsv,
} from "../src/utilities/zzz/combat/combatReport.js";
import { simulate } from "../src/utilities/zzz/combat/engine.js";
import {
  compareDamage,
  damageSummary,
} from "../src/utilities/zzz/combat/results.js";
import { testScenario } from "./fixtures/combat.js";

test("summary, action and timeline cards show synthetic provenance and support zero/kill results", async () => {
  const scenario = testScenario();
  scenario.mode = "kill";
  scenario.enemy.hp = 750;
  const result = simulate(scenario);
  const prototype = Object.getPrototypeOf(createCanvas(1, 1).getContext("2d"));
  const draw = jest.spyOn(prototype, "fillText");
  try {
    for (const page of ["summary", "actions", "timeline"] as const) {
      const png = await renderCombatResult(result, scenario, "tw", page),
        image = await loadImage(png);
      expect([image.width, image.height]).toEqual([1100, 900]);
    }
    expect(
      draw.mock.calls.some((c) => String(c[0]).includes("合成引擎測試")),
    ).toBe(true);
    expect(draw.mock.calls.some((c) => /NaN|Infinity/.test(String(c[0])))).toBe(
      false,
    );
    expect(
      draw.mock.calls.some((c) => String(c[0]).includes("戰鬥 / 動畫")),
    ).toBe(true);
    const zero = testScenario();
    zero.team[0].panel.atk = 0;
    expect(await renderCombatResult(simulate(zero), zero, "en")).toBeInstanceOf(
      Buffer,
    );
  } finally {
    draw.mockRestore();
  }
});
test("exports keep first-seed events distinct from average metrics and omit account metadata", () => {
  const scenario: any = testScenario();
  scenario.owner = "private-owner";
  scenario.cookie = "private-cookie";
  scenario.team[0].uid = "private-uid";
  const result: any = simulate(scenario);
  result.trace.events[0].cookie = "private-event-cookie";
  const raw = exportCombatResult(result, scenario),
    report = JSON.parse(raw);
  expect(raw).not.toMatch(/private-|cookie|"owner"|"uid"/);
  expect(report.trace.seed).toBe(scenario.seed);
  expect(report.configuration.trials).toBe(100);
  expect(report.synthetic).toBe(true);
  expect(report.meanDamage).toBe(15000);
  expect(report.engineVersion).toBe(result.engineVersion);
  expect(report.trace.animationElapsedMs).toBe(30000);
  expect(
    report.trace.events.find((e: any) => e.kind === "damage"),
  ).toMatchObject({ damageEventId: "damage-1", atMs: 0, animationAtMs: 0 });
  expect(
    report.trace.events
      .filter((e: any) => e.kind === "damage")
      .reduce((sum: number, e: any) => sum + e.amount, 0),
  ).toBe(report.trace.total);
  result.trace.events[0].action = '=HYPERLINK("bad")';
  const csv = exportCombatCsv(result);
  expect(csv).toContain("'=");
  expect(csv).toContain('""bad""');
  expect(csv.startsWith("\uFEFFseed,")).toBe(true);
});
test("comparisons reject different enemy/rotation/seed contexts and never invent kill-mode actor DPS", () => {
  const baseline = testScenario(),
    next = structuredClone(baseline);
  next.team[0].panel.atk *= 2;
  expect(compareDamage(simulate(baseline), simulate(next)).percent).toBe(100);
  next.seed++;
  expect(() => compareDamage(simulate(baseline), simulate(next))).toThrow(
    "settings",
  );
  baseline.mode = "kill";
  baseline.enemy.hp = 500;
  const r = simulate(baseline);
  expect(r.meanDps).toBeNull();
  expect(compareDamage(r, r).dps).toBeNull();
  expect(damageSummary(r, baseline)[0].dps).toBeNull();
});
