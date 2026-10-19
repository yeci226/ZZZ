import { readFileSync } from "node:fs";
import { advanceBurniceAwakening, burniceAnomalyReleaseRatio, initialBurniceAwakeningState } from "../src/utilities/zzz/combat/referenceBurniceState.js";
import { evidenceSnapshotIssues } from "../src/utilities/zzz/combat/sourceEvidence.js";

test("the twelfth ally trigger grants one token, holding it pauses counts, and swap-in spends and resets it", () => {
  let state = initialBurniceAwakeningState(6);
  for (let i = 0; i < 11; i++) state = advanceBurniceAwakening(state, {type: "ally-afterburn-triggered"}).state;
  expect(state).toEqual({level: 6, afterburnCount: 11, flowingFire: false});
  const old = structuredClone(state);
  state = advanceBurniceAwakening(state, {type: "ally-afterburn-triggered"}).state;
  expect(old.afterburnCount).toBe(11);
  expect(state).toEqual({level: 6, afterburnCount: 12, flowingFire: true});
  for (let i = 0; i < 30; i++) state = advanceBurniceAwakening(state, {type: "enhanced-basic-afterburn-hit"}).state;
  expect(state.afterburnCount).toBe(12);
  const entered = advanceBurniceAwakening(state, {type: "swap-in"});
  expect(entered.entryAttack).toEqual({action: "awakening-ex-entry", entryType: "quick-assist", flowingFireSpent: 1});
  expect(entered.state).toEqual(initialBurniceAwakeningState(6));
  expect(advanceBurniceAwakening(entered.state, {type: "swap-in"}).entryAttack).toBeNull();
});

test("enhanced basic contributes exactly two at awakening I, caps threshold overshoot and preserves partial counters on ordinary entry", () => {
  let state = initialBurniceAwakeningState(1);
  state = advanceBurniceAwakening(state, {type: "enhanced-basic-afterburn-hit"}).state;
  expect(state.afterburnCount).toBe(2);
  const entered = advanceBurniceAwakening(state, {type: "swap-in"});
  expect(entered.entryAttack).toBeNull(); expect(entered.state.afterburnCount).toBe(2);
  for (let i = 0; i < 9; i++) state = advanceBurniceAwakening(state, {type: "ally-afterburn-triggered"}).state;
  state = advanceBurniceAwakening(state, {type: "enhanced-basic-afterburn-hit"}).state;
  expect(state.afterburnCount).toBe(12); expect(state.flowingFire).toBe(true);
});

test("inactive awakening cannot gain or consume tokens and invalid state cannot generate free entries", () => {
  const inactive = Object.freeze(initialBurniceAwakeningState(0));
  for (const type of ["ally-afterburn-triggered", "enhanced-basic-afterburn-hit", "swap-in"] as const) expect(advanceBurniceAwakening(inactive, {type})).toEqual({state: inactive, entryAttack: null});
  expect(() => advanceBurniceAwakening({level: 1, afterburnCount: 0, flowingFire: true}, {type: "swap-in"})).toThrow("state");
  expect(() => initialBurniceAwakeningState(7)).toThrow();
});

test("anomaly release uses the six published fractions without treating luminous as an ordinary anomaly", () => {
  expect(["ether", "electric", "fire", "physical", "ice", "wind"].map(element => burniceAnomalyReleaseRatio(element as any))).toEqual([4.8, 2.4, 6, 0.4, 0.6, 0.24]);
  expect(burniceAnomalyReleaseRatio("luminous")).toBeNull();
  const facts = JSON.parse(readFileSync("src/assets/combat/evidence/account-combat-text.json", "utf8"));
  expect(evidenceSnapshotIssues(facts, "official")).toEqual([]);
  const title = facts.actors.find((actor: any) => actor.id === "1171").awakening[0].skills.find((skill: any) => skill.name === "強化特殊技：灼熱拋接法");
  expect(title.text).toContain("12次"); expect(title.text).toContain("增加2次計數");
  expect(title.text).toContain("480%/240%/600%/40%/60%/24%");
});
