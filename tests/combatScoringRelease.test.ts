jest.mock("node:fs", () => ({
  ...jest.requireActual("node:fs"),
  readFileSync: jest.fn(jest.requireActual("node:fs").readFileSync),
}));

import { readFileSync } from "node:fs";
import { discScoringReleased } from "../src/utilities/zzz/combat/scoringRelease.js";
import { combatReleased } from "../src/utilities/zzz/combat/release.js";
import { profileScore } from "../src/utilities/zzz/combat/render.js";
import { buildCombatEntry } from "../src/utilities/zzz/combat/workbench.js";

const read = jest.requireActual("node:fs").readFileSync;
const character = () =>
  JSON.parse(read("tests/fixtures/liveCombat.json", "utf8"))[0];
afterEach(() => jest.mocked(readFileSync).mockImplementation(read));

test("production scoring can be enabled while all combat entries remain closed", () => {
  expect(discScoringReleased()).toBe(true);
  const result = profileScore(character());
  expect(result?.complete).toBe(true);
  expect(result?.total).toBeGreaterThan(0);
  expect(result?.discs).toHaveLength(6);
  expect(combatReleased()).toBe(false);
  expect(buildCombatEntry("test-owner", "tw", [character()])).toEqual([]);
});

test.each([
  JSON.stringify({ schemaVersion: 1, enabled: false }),
  JSON.stringify({ schemaVersion: 1, enabled: "true" }),
  JSON.stringify({ schemaVersion: 2, enabled: true }),
  "invalid-json",
  null,
])("disabled or malformed scoring release fails closed (%s)", (value) => {
  jest.mocked(readFileSync).mockImplementation(((
    path: unknown,
    ...args: unknown[]
  ) => {
    if (String(path).endsWith("/scoring-release.json")) {
      if (value === null) throw new Error("Missing config");
      return value;
    }
    return read(path, ...args);
  }) as typeof readFileSync);
  expect(discScoringReleased()).toBe(false);
  expect(profileScore(character())).toBeNull();
  expect(combatReleased()).toBe(false);
});
