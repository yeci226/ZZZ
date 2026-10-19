import fixture from "./fixtures/liveCombat.json";
import {
  importLiveBuild,
  importLiveTeam,
} from "../src/utilities/zzz/combat/liveBuild.js";
import {
  importBuildSpec,
  parseBuildSpec,
} from "../src/utilities/zzz/combat/catalog.js";
import {
  burniceAwakening,
  importAwakening,
} from "../src/utilities/zzz/combat/awakening.js";
import {
  buildBattlePanel,
  calculateLiveRotation,
  referenceAttacks,
} from "../src/utilities/zzz/combat/liveCalculator.js";
import { createLiveCalculatorApp } from "../src/utilities/zzz/combat/liveCalculatorApp.js";
import { combatReleased } from "../src/utilities/zzz/combat/release.js";
import { AddressInfo } from "node:net";
import { get } from "node:http";

const team = () => importLiveTeam(structuredClone(fixture));
const target = {
  defense: 953,
  resistance: 0,
  stunned: false,
  stunMultiplier: 1.5,
};
const one = (actor = "1171", attack = "afterburn", conditions = {}) => ({
  target,
  conditions,
  entries: [{ actor, attack, count: 1 }],
});

test("live import keeps the real panel separate from passives and strips unrelated data", () => {
  const raw: any = structuredClone(fixture[2]);
  raw.cookie = "do-not-keep";
  raw.owner = "private";
  const a = importLiveBuild(raw);
  expect(a.displayed.atk).toBe(2403);
  expect(a.baseAttack).toBe(1547);
  expect(a.displayed.energyRegen).toBe(2.8);
  expect(a.awakening).toBe(6);
  expect(a.elementBonuses.fire).toBe(30);
  expect(a.sets.map((s) => s.pieces)).toEqual([4, 2]);
  expect(JSON.stringify(a)).not.toMatch(/cookie|do-not-keep|private/);
  expect(() => importLiveTeam([fixture[0], fixture[0]])).toThrow("Duplicate");
  raw.properties = raw.properties.filter((p: any) => p.property_id !== 8);
  expect(() => importLiveBuild(raw)).toThrow("Missing displayed property");
});
test("unknown, duplicate and malformed live stats fail instead of becoming zero", () => {
  for (const property of [
    { property_id: 9999, final: "5" },
    { property_id: 2, final: "100" },
  ]) {
    const raw = structuredClone(fixture[0]);
    raw.properties.push({ ...property, base: "" });
    expect(() => importLiveBuild(raw)).toThrow();
  }
  const raw = structuredClone(fixture[0]);
  raw.properties[0].final = "NaN";
  expect(() => importLiveBuild(raw)).toThrow("displayed property");
});
test("activated awakening level survives build import and saved build validation", () => {
  const build = importBuildSpec(fixture[2], { agent: 6, weapon: 6 });
  expect(build.awakening).toBe(6);
  expect(parseBuildSpec(build).awakening).toBe(6);
  expect(() => parseBuildSpec({ ...build, awakening: 7 })).toThrow("awakening");
  expect(importAwakening(fixture[0])).toBe(0);
  expect(() => importAwakening({ ...fixture[2], skill_awaken: {} })).toThrow(
    "awakening",
  );
});
test("Burnice awakening levels, threshold, cap and interval are independent", () => {
  expect(burniceAwakening(0, 2.8)).toEqual({
    anomalyMastery: 0,
    damageBonus: 0,
    afterburnCooldownMs: 1500,
  });
  expect(burniceAwakening(1, 2.8).afterburnCooldownMs).toBe(1500);
  expect(burniceAwakening(2, 2.8).anomalyMastery).toBeCloseTo(10);
  expect(burniceAwakening(3, 2.8).damageBonus).toBeCloseTo(12.5);
  expect(burniceAwakening(6, 1.7)).toEqual({
    anomalyMastery: 0,
    damageBonus: 0,
    afterburnCooldownMs: 1350,
  });
  expect(burniceAwakening(6, 9)).toEqual({
    anomalyMastery: 25,
    damageBonus: 20,
    afterburnCooldownMs: 1350,
  });
});
test("live team adds missing engine talents and four-piece effects exactly once", () => {
  const t = team(),
    before = structuredClone(t);
  const rem = buildBattlePanel(t, "1581", referenceAttacks(t[0])[0]);
  expect(rem.panel.atk).toBeCloseTo(3988 + 1595.2);
  expect(rem.panel.anomalyProficiency).toBe(493 + 96 + 50);
  const alice = buildBattlePanel(t, "1401", referenceAttacks(t[1])[0]);
  expect(alice.panel.anomalyProficiency).toBe(399 + 88);
  expect(alice.elementBonuses.physical).toBe(40 + 36);
  const burn = buildBattlePanel(
    t,
    "1171",
    referenceAttacks(t[2]).find((a) => a.id === "afterburn")!,
  );
  expect(burn.panel.atk).toBeCloseTo(2403 + 1547 * 0.15 + 1595.2);
  expect(burn.panel.anomalyMastery).toBeCloseTo(143);
  expect(burn.panel.damageBonus).toBeCloseTo(40); // awakening + eligible Jazz, not fire/AP bonuses
  expect(burn.elementBonuses.fire).toBe(45);
  expect(burn.afterburnCooldownMs).toBe(1350);
  expect(t).toEqual(before);
});
test("actual afterburn hand calculation matches every damage domain", () => {
  const result = calculateLiveRotation(team(), one());
  const base = 2403 + 1547 * 0.15 + 1595.2;
  const bonus = 1 + (30 + 15 + 20 + 20 + 30) / 100;
  const defense = 794 / (794 + 953 * (1 - 0.24) - 18);
  const noncrit = base * 3.5 * bonus * defense;
  expect(result.rows[0].breakdown.nonCritical).toBeCloseTo(noncrit, 7);
  expect(result.total).toBeCloseTo(noncrit * (1 + 0.098 * 0.788), 7);
  expect(result.modeledDps).toBeNull();
  expect(result.completeSimulation).toBe(false);
  expect(result.references).toHaveLength(3);
});
test("anomaly and ordinary damage receive different conditional bonuses", () => {
  const t = team(),
    state = {
      phase: true,
      phantom: true,
      signatureActive: true,
      compilerStacks: 3,
      fangedMetal: true,
    };
  const burn = calculateLiveRotation(t, one("1171", "burn-tick", state))
    .rows[0];
  const direct = calculateLiveRotation(t, one("1171", "afterburn", state))
    .rows[0];
  expect(burn.stats.panel.penRatio).toBe(39);
  expect(direct.stats.panel.penRatio).toBe(24);
  expect(burn.stats.panel.anomalyProficiency).toBe(452);
  expect(burn.stats.anomalyBonus).toBe(10);
  expect(burn.breakdown.domain).toBeCloseTo(2 * 4.52 * 1.1);
  expect(burn.breakdown.critical).toBe(burn.breakdown.nonCritical);
  expect(direct.breakdown.bonus - burn.breakdown.bonus).toBeCloseTo(0.5); // Jazz assist + afterburn AP bonus
});
test("resistance and stun controls change damage without changing the imported build", () => {
  const t = team(),
    base = calculateLiveRotation(t, one()).total;
  expect(
    calculateLiveRotation(t, {
      ...one(),
      target: { ...target, resistance: 20 },
    }).total,
  ).toBeCloseTo(base * 0.8);
  expect(
    calculateLiveRotation(t, { ...one(), target: { ...target, stunned: true } })
      .total,
  ).toBeCloseTo(base * 1.5);
});
test("supported rows use the character's actual skill level; ambiguous totals are omitted", () => {
  const t = team(),
    a = referenceAttacks(t[1]);
  expect(a.find((a) => a.name.includes("劍舞之風"))?.level).toBe(7);
  expect(a.find((a) => a.name.includes("星芒終章"))?.level).toBe(11);
  const burn = referenceAttacks(t[2]);
  expect(burn.some((a) => /持續|最大|搖盪閃|提神特飲/.test(a.name))).toBe(
    false,
  );
  expect(burn.find((a) => a.id === "afterburn")?.spec.multiplier).toBe(3.5);
});
test("unsupported models and invalid conditions cannot silently yield results", () => {
  const t = team();
  t[0].weapon!.refinement = 2;
  expect(() => calculateLiveRotation(t, one())).toThrow("W-Engine");
  expect(() => calculateLiveRotation(team(), one("1171", "missing"))).toThrow(
    "Unsupported attack",
  );
  expect(() =>
    calculateLiveRotation(team(), one("1171", "afterburn", { phase: "yes" })),
  ).toThrow("condition");
  expect(() =>
    calculateLiveRotation(
      team(),
      one("1171", "afterburn", { compilerStacks: 4 }),
    ),
  ).toThrow();
  expect(() =>
    calculateLiveRotation(team(), {
      ...one(),
      entries: [{ actor: "1171", attack: "afterburn", count: 1.2 }],
    }),
  ).toThrow("count");
  expect(() =>
    calculateLiveRotation(team(), { ...one(), durationSeconds: 0 }),
  ).toThrow("duration");
});
test("single-character calculations do not activate another-character entry passives", () => {
  const [rem, alice] = team();
  const solo = calculateLiveRotation(
    [rem],
    one("1581", referenceAttacks(rem)[0].id, { phase: true }),
  ).rows[0];
  expect(solo.stats.panel.atk).toBe(3988);
  expect(solo.stats.panel.damageBonus).toBe(18);
  const a = calculateLiveRotation([alice], one("1401", "assault")).rows[0];
  expect(a.stats.panel.anomalyProficiency).toBe(399);
});
test("manual rotation preserves per-entry conditions and reconciles ownership and subtotal", () => {
  const t = team(),
    first = one("1171", "afterburn"),
    second = one("1401", "assault", { fangedMetal: true });
  const a = calculateLiveRotation(t, first).total,
    b = calculateLiveRotation(t, second).total;
  const request = {
    target,
    durationSeconds: 30,
    entries: [
      { ...first.entries[0], count: 4 },
      { ...second.entries[0], conditions: second.conditions },
    ],
  };
  const result = calculateLiveRotation(t, request);
  expect(result.total).toBeCloseTo(4 * a + b);
  expect(result.byActor.reduce((sum, a) => sum + a.damage, 0)).toBeCloseTo(
    result.total,
  );
  expect(result.modeledDps).toBeCloseTo(result.total / 30);
  expect(result.completeSimulation).toBe(false);
  expect(combatReleased()).toBe(false);
});
test("local calculator serves only sanitized data and requires same-session access", async () => {
  const app = createLiveCalculatorApp({
    team: fixture,
    fetchedAt: "2026-10-02T04:40:52.967Z",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const html = await (await fetch(base)).text();
    const token = html.match(/const token = ["']([a-f0-9]+)["']/)![1];
    expect((await fetch(base + "/api/team")).status).toBe(403);
    const headers = {
      "X-Calculator-Token": token,
      "Content-Type": "application/json",
    };
    const teamResult = (await (
      await fetch(base + "/api/team", { headers })
    ).json()) as any;
    expect(teamResult.team[2].awakening).toBe(6);
    expect(JSON.stringify(teamResult)).not.toMatch(/"(?:cookie|owner|uid)"\s*:/);
    const result = (await (
      await fetch(base + "/api/calculate", {
        method: "POST",
        headers,
        body: JSON.stringify(one()),
      })
    ).json()) as any;
    expect(result.total).toBeGreaterThan(0);
    expect(
      (
        await fetch(base + "/api/calculate", {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status,
    ).toBe(400);
    const forbidden = await new Promise<number | undefined>(
      (resolve, reject) => {
        get(base, { headers: { host: "example.com" } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        }).on("error", reject);
      },
    );
    expect(forbidden).toBe(403);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
