import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adaptScoringSource, grade, scoreCharacter, scoreDisc, type ScoringBuild } from "../src/utilities/zzz/combat/scoring.js";
import { normalizeDiscStat, normalizeDisc, type DriveDisc } from "../src/utilities/zzz/combat/stats.js";
import { ScoringStore } from "../src/utilities/zzz/combat/scoringStore.js";

const source = JSON.parse(readFileSync("src/assets/combat/scoring-source.json", "utf8"));
const weights = {main: 3, subs: {"ATK%": 1, CRIT_Rate: 1, CRIT_DMG: 1, Anomaly_Proficiency: 1}};
const build: ScoringBuild = {id: "CRIT", slots: {1: {HP: weights}, 2: {ATK: weights}, 3: {DEF: weights}, 4: {CRIT_Rate: weights}, 5: {Element_DMG: weights}, 6: {"ATK%": weights}}};
const ideal: DriveDisc = {slot: 1, rarity: "S", level: 15, main: {stat: "HP", value: 2200}, subs: [{stat: "ATK%", value: 18}, {stat: "CRIT_Rate", value: 2.4}, {stat: "CRIT_DMG", value: 4.8}, {stat: "Anomaly_Proficiency", value: 9}]};

test("legal perfect disc scores 100 and uses the same unrounded grade boundaries", () => {
  expect(scoreDisc(ideal, build).score).toBe(100);
  expect(grade(89.999)).toBe("SSS"); expect(grade(90)).toBe("ACE"); expect(grade(0)).toBe("D");
  const lower = {...ideal, subs: [{stat: "ATK%" as const, value: 3}]};
  expect(scoreDisc(lower, build).score).toBeCloseTo(40 + 60 / 9);
});
test("wrong main and wrong element are not awarded main points", () => {
  expect(scoreDisc({...ideal, slot: 4, main: {stat: "DEF%", value: 48}}, build).main).toBe(0);
  expect(scoreDisc({...ideal, slot: 5, main: {stat: "Element_DMG", value: 30, element: "fire"}}, build, "ice").main).toBe(0);
  expect(() => scoreDisc({...ideal, slot: 5, main: {stat: "Element_DMG", value: 30}}, build)).toThrow("Unknown damage element");
});
test("flat/percent are separated despite shared system IDs; unknown stats fail closed", () => {
  expect(normalizeDiscStat({system_id: 121, property_id: 2, base: "57"}).stat).toBe("ATK");
  expect(normalizeDiscStat({system_id: 121, property_id: 2, base: "9%"}).stat).toBe("ATK%");
  expect(normalizeDiscStat({property_id: 12102, base: "9%"}).stat).toBe("ATK%");
  expect(() => normalizeDiscStat({property_id: 9999, base: "12"})).toThrow("Unknown");
  expect(() => normalizeDiscStat({property_id: 2, base: "NaN"})).toThrow();
});
const raw = () => ({equipment_type: 1, rarity: "S", level: 15, main_properties: [{property_id: 1, base: "2200"}], properties: [{property_id: 2, base: "18%"}, {property_id: 5, base: "2.4%"}, {property_id: 6, base: "4.8%"}, {property_id: 8, base: "9"}]});
test("normalization rejects duplicate subs, conflicting main, missing level and excessive rolls", () => {
  expect(normalizeDisc(raw())).toEqual(ideal);
  expect(() => normalizeDisc({...raw(), level: undefined})).toThrow();
  expect(() => normalizeDisc({...raw(), properties: [...raw().properties, raw().properties[0]]})).toThrow();
  expect(() => normalizeDisc({...raw(), level: 0})).toThrow("rolls exceed");
});
test("empty slots count zero, malformed slots block total, input is immutable", () => {
  const snapshot = adaptScoringSource(source.data, source.revision, source.fetchedAt);
  snapshot.agents["1011"] = {name: "test", builds: [build]};
  const character = {id: 1011, equip: [raw()]}; const before = structuredClone(character);
  expect(scoreCharacter(character, snapshot)?.total).toBe(100);
  expect(scoreCharacter(character, snapshot)?.complete).toBe(false);
  expect(character).toEqual(before);
  expect(scoreCharacter({id: 1011, equip: [raw(), raw()]}, snapshot)?.total).toBeNull();
  expect(scoreCharacter({id: 9999, equip: []}, snapshot)).toBeNull();
  expect(() => scoreCharacter(character, snapshot, "invented")).toThrow();
});
test("bundled upstream has all 58 currently catalogued agents; future IDs don't bypass release review", () => {
  const snapshot = adaptScoringSource(source.data, source.revision, source.fetchedAt);
  const release = JSON.parse(readFileSync("src/assets/combat/release.json", "utf8"));
  for (const a of release.agents) expect(snapshot.agents[a.id]).toBeDefined();
});
test("sync coalesces requests, atomically persists validated data and retains last good snapshot on failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zzz-score-test-"));
  try {
    const fetch = jest.fn(async () => source), path = join(dir, "cache.json");
    const store = new ScoringStore({seed: source, required: ["1011"], fetch, cachePath: path});
    const original = store.snapshot(); expect(Object.isFrozen(original.agents)).toBe(true);
    await Promise.all([store.refresh(), store.refresh()]); expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(path, "utf8")).revision).toBe(source.revision);
    const valid = store.snapshot();
    fetch.mockResolvedValueOnce({...source, data: {agents: {}}});
    await expect(store.refresh()).rejects.toThrow(); expect(store.snapshot()).toBe(valid);
    const restored = new ScoringStore({seed: source, required: ["1011"], cachePath: path}); expect(restored.snapshot().hash).toBe(original.hash);
  } finally { await rm(dir, {recursive: true, force: true}); }
});
