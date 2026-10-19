import { readFileSync } from "node:fs";
import { COVERAGE_KINDS, REQUIRED_MECHANICS, coverageIssues, focusCoverageReport, loadCombatCoverage, type CombatCoverage, type RuntimeCoverage } from "../src/utilities/zzz/combat/coverage.js";
import { evidenceSnapshotHash, evidenceSnapshotIssues, extractAccountCombatFacts, extractOfficialCombatFacts, parseEvidenceCsv } from "../src/utilities/zzz/combat/sourceEvidence.js";
import { REFERENCE_TEAM } from "../src/utilities/zzz/combat/referenceSkills.js";
import { releaseIssues, loadCombatRelease, combatReleased } from "../src/utilities/zzz/combat/release.js";

function reviewedFixture(): {coverage: CombatCoverage; runtime: RuntimeCoverage} {
  const coverage: CombatCoverage = {
    schemaVersion: 1, revision: "fixture-1", gameVersion: "test-game-1", modelVersion: "fixture-model-1",
    sources: Object.fromEntries(["official", "in-game"].map(authority => [authority, {url: `https://example.test/${authority}`, sha256: "a".repeat(64), fetchedAt: "2026-10-02T00:00:00.000Z", gameVersion: "test-game-1", authority}])) as CombatCoverage["sources"],
    inventories: Object.fromEntries(COVERAGE_KINDS.map(kind => [kind, {status: "verified", ids: [kind], sources: ["official"]}])) as CombatCoverage["inventories"],
    models: {}, focusTeam: [],
  };
  for (const kind of COVERAGE_KINDS) coverage.models[`${kind}:${kind}`] = {
    gameVersion: coverage.gameVersion, modelVersion: coverage.modelVersion,
    mechanics: Object.fromEntries(REQUIRED_MECHANICS[kind].map(key => [key, {numeric: "verified", timing: "verified", implemented: true, verification: key === "in-game-validation" ? "in-game" : "unit-tested", sources: [key === "in-game-validation" ? "in-game" : "official"], tests: ["independent-regression"], captures: key === "in-game-validation" ? ["capture:build/enemy/rotation"] : [], notes: []}])),
  };
  return {coverage, runtime: {modelVersion: coverage.modelVersion, agents: ["agent"], bangboo: ["bangboo"], weapons: ["weapon"], sets: ["set"], enemies: ["enemy"]}};
}

test("complete versioned evidence accepts registered model components; a weapon or enemy inventory cannot stand in for an adapter", () => {
  const {coverage, runtime} = reviewedFixture();
  expect(coverageIssues(coverage, runtime)).toEqual([]);
  runtime.weapons = []; runtime.enemies = [];
  expect(coverageIssues(coverage, runtime)).toEqual(expect.arrayContaining(["Missing runtime weapon:weapon", "Missing runtime enemy:enemy"]));
});

test("required mechanisms cannot be bypassed by deleting coverage or substituting one passing mechanic", () => {
  const {coverage} = reviewedFixture();
  delete coverage.models["agent:agent"].mechanics["hit-timing"];
  delete coverage.models["set:set"];
  coverage.models["bangboo:bangboo"].mechanics.skills.numeric = "reference";
  expect(coverageIssues(coverage)).toEqual(expect.arrayContaining(["Missing mechanic agent:agent/hit-timing", "Missing coverage set:set", "bangboo:bangboo/skills: numeric evidence reference"]));
});

test("source/page dates and upstream support claims cannot replace version pinning or independent in-game captures", () => {
  const {coverage, runtime} = reviewedFixture();
  coverage.sources.official.gameVersion = null;
  coverage.models["agent:agent"].gameVersion = "older-game";
  coverage.models["agent:agent"].mechanics["in-game-validation"].captures = [];
  runtime.modelVersion = "older-model";
  const issues = coverageIssues(coverage, runtime);
  expect(issues).toContain("Runtime and evidence model versions differ");
  expect(issues).toContain("agent:agent: model evidence version mismatch");
  expect(issues).toContain("agent:agent/in-game-validation: reproducible in-game validation missing");
  expect(issues.some(issue => issue.includes("does not establish the target game version"))).toBe(true);
});

test("missing hashes, unexplained nonapplicability and nonofficial inventories fail evidence checks", () => {
  const {coverage} = reviewedFixture();
  coverage.sources.official.sha256 = "not-a-hash";
  coverage.sources.official.authority = "community";
  coverage.models["set:set"].mechanics["two-piece"].timing = "not-applicable";
  const issues = coverageIssues(coverage);
  expect(issues).toContain("agent inventory: invalid source official");
  expect(issues).toContain("agent inventory: no official released-content evidence");
  expect(issues).toContain("set:set/two-piece: applicability needs an evidence-backed explanation");
});

test("current user builds retain precise blockers and the production release remains closed", () => {
  const coverage = loadCombatCoverage();
  expect(coverage.focusTeam.map(build => [build.id, build.cinema, build.awakening, build.refinement])).toEqual([["1581", 2, 0, 1], ["1401", 0, 0, 1], ["1171", 0, 6, 2]]);
  expect(focusCoverageReport(coverage).flatMap(actor => actor.models).every(model => !model.ready)).toBe(true);
  expect(releaseIssues(loadCombatRelease(), coverage)).toContain("Combat game version has not been pinned");
  expect(combatReleased()).toBe(false);
  const timing = JSON.parse(readFileSync("src/assets/combat/evidence/timing-candidates.json", "utf8"));
  expect(timing.runtimeReady).toBe(false);
  expect(timing.actors.find((actor: any) => actor.id === "1581").actions).toHaveLength(0);
  expect(timing.actors.find((actor: any) => actor.id === "1171").blockers.join(" ")).toContain("awakening");
});

test("CSV timing fields preserve quoted comma lists and reject truncated data", () => {
  expect(parseEvidenceCsv('CID,tick_list,note\r\n1401,"[10,20]","a ""quoted"" fact"\r\n')).toEqual([{CID: "1401", tick_list: "[10,20]", note: 'a "quoted" fact'}]);
  expect(() => parseEvidenceCsv('CID,tick_list\n1401,"[10,20]')).toThrow("Unterminated");
  expect(() => parseEvidenceCsv('CID,tick_list\n1401,10,20')).toThrow("schema");
});

test("official source extraction keeps combat facts and cannot mark runtime timing verified", () => {
  const data = {retcode: 0, data: {page: {id: "1112", version: "wiki-page-revision", modules: [
    {name: "代理人技能", components: [{component_id: "agent_talent", data: JSON.stringify({list: [{title: "普通攻擊", attributes: [{key: "A", values: ["Lv.1"]}, {key: "倍率", values: ["100%"]}], children: [{title: "A", desc: "<p>獲得 5 點資源。</p>"}]}]})}]},
    {name: "角色設定", components: [{component_id: "story", data: '{"text":"unrelated lore"}'}]},
  ]}}};
  const facts = extractOfficialCombatFacts(data, REFERENCE_TEAM[0], "2026-10-02T00:00:00Z");
  expect(facts.skillDescriptions).toEqual([{category: "普通攻擊", name: "A", text: "獲得 5 點資源。"}]);
  expect(facts.source.gameVersion).toBeNull(); expect(facts.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(evidenceSnapshotIssues(facts, "official")).toEqual([]);
  expect(facts.runtimeReady).toBe(false); expect(JSON.stringify(facts)).not.toContain("unrelated lore");
  expect(() => extractOfficialCombatFacts(data, REFERENCE_TEAM[1], "2026-10-02T00:00:00Z")).toThrow("identity");
});

test("candidate source revision and normalized artifact hashes expose edited or unpinned evidence", () => {
  const timing = JSON.parse(readFileSync("src/assets/combat/evidence/timing-candidates.json", "utf8"));
  expect(evidenceSnapshotIssues(timing, "timing")).toEqual([]);
  timing.actors[1].actions[0].ticks = "1";
  expect(evidenceSnapshotIssues(timing, "timing")).toContain("Evidence snapshot hash mismatch");
  timing.snapshotSha256 = evidenceSnapshotHash(timing);
  timing.revision = "HEAD";
  expect(evidenceSnapshotIssues(timing, "timing")).toContain("Timing reference is not pinned to its source revision");
});

test("account text extraction never persists account IDs, credentials, equipment rolls or presentation URLs", () => {
  const facts = extractAccountCombatFacts({
    fetchedAt: "2026-10-02T00:00:00Z", uid: "private-uid", nickname: "private-nickname", cookie: "private-secret",
    team: [{id: 1171, owner: "private-owner", role_square_url: "https://private-image.test/", skills: [{skill_type: 0, level: 10, items: [{title: "Skill", text: "<color=#ffffff>12</color> triggers"}]}], ranks: [], equip: []}],
  });
  expect(JSON.stringify(facts)).not.toContain("private");
  expect(facts.actors[0].skills[0].descriptions).toEqual([{name: "Skill", text: "12 triggers"}]);
  expect(evidenceSnapshotIssues(facts, "official")).toEqual([]);
});
