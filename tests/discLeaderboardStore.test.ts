import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DiscLeaderboardStore,
  scoringInput,
  type DiscEnrollment,
} from "../src/utilities/zzz/discLeaderboardStore.js";
import {
  adaptScoringSource,
  hash,
  scoreCharacter,
} from "../src/utilities/zzz/combat/scoring.js";
import raw from "./fixtures/liveCombat.json";
const seed = JSON.parse(
  readFileSync("src/assets/combat/scoring-source.json", "utf8"),
);
const snapshot = adaptScoringSource(seed.data, seed.revision, seed.fetchedAt);
const character = { ...raw[0], element_type: 300 };
const input = (
  owner = "1",
  uid = "100",
  overrides: Partial<DiscEnrollment> = {},
): DiscEnrollment => ({
  ownerId: owner,
  requesterId: owner,
  uid,
  playerName: `Player ${owner}`,
  character: structuredClone(character),
  requestedAt: 100,
  requestId: "100",
  guildId: "guild-a",
  ...overrides,
});
let store: DiscLeaderboardStore;
beforeEach(() => {
  store = new DiscLeaderboardStore(":memory:", snapshot);
});
afterEach(() => store.close());
test("only self queries enroll; reads never enroll", () => {
  expect(store.record(input("1", "100", { requesterId: "2" }))).toBe(
    "other-owner",
  );
  expect(store.page("1581", "1").participantCount).toBe(0);
  store.record(input());
  expect(store.page("1581", "1").viewer?.total).toBe(490.5);
  expect(store.page("1491", "1").participantCount).toBe(0);
});
test("latest lower and incomplete gear replace the account score; stale responses cannot restore it", () => {
  store.record(input());
  const lower = structuredClone(character);
  lower.equip.forEach((d) => {
    d.properties = [];
  });
  store.record(
    input("1", "100", { requestedAt: 200, requestId: "200", character: lower }),
  );
  expect(store.page("1581", "1").viewer!.total).toBeLessThan(490.5);
  expect(store.record(input())).toBe("stale");
  store.record(
    input("1", "100", {
      requestedAt: 300,
      requestId: "300",
      character: { ...character, equip: character.equip.slice(1) },
    }),
  );
  expect(store.page("1581", "1").participantCount).toBe(0);
});
test("opt-out persists, future queries do not rejoin, explicit rejoin restores stored scores", () => {
  store.record(input());
  store.setEnabled("1", false);
  expect(store.page("1581", "1").participantCount).toBe(0);
  expect(store.record(input("1", "100", { requestedAt: 500 }))).toBe("hidden");
  expect(store.enabled("1")).toBe(false);
  store.setEnabled("1", true);
  expect(store.page("1581", "1").viewer?.total).toBe(490.5);
});
test("one seat per player uses their best latest account; a UID cannot occupy two players' seats", () => {
  store.record(input());
  store.record(input("1", "101"));
  store.record(input("2", "102"));
  expect(store.record(input("3", "100"))).toBe("other-owner");
  const page = store.page("1581", "1");
  expect(page.participantCount).toBe(2);
  expect(page.entries.map((e) => e.rank)).toEqual([1, 1]);
  const lower = structuredClone(character);
  lower.equip.forEach((d) => {
    d.properties = [];
  });
  store.record(input("3", "103", { character: lower }));
  expect(store.page("1581", "3").viewer?.rank).toBe(3);
});
test("global and server population is per character and per server query", () => {
  store.record(input());
  store.record(input("2", "102", { guildId: "guild-b" }));
  store.record(input("3", "103", { guildId: null }));
  expect(store.page("1581", "1").participantCount).toBe(3);
  expect(store.page("1581", "1", "guild-a").participantCount).toBe(1);
  expect(store.page("1581", "1", "guild-b").viewer).toBeUndefined();
  store.record(input("1", "100", { requestedAt: 200, guildId: "guild-b" }));
  expect(store.page("1581", "1", "guild-b").participantCount).toBe(2);
});
test("the displayed UID always belongs to the account whose build won the player's seat", () => {
  const lower = structuredClone(character);
  lower.equip.forEach(disc => { disc.properties = []; });
  store.record(input("1", "100", { character: lower }));
  store.record(input("1", "101"));
  expect(store.page("1581", "1").viewer).toMatchObject({ ownerId: "1", uid: "101", total: 490.5 });
  store.record(input("1", "101", { requestedAt: 300, requestId: "300", character: { ...character, equip: [] } }));
  expect(store.page("1581", "1").viewer?.uid).toBe("100");
});
test("pagination clamps pages and always returns the viewer outside the page", () => {
  for (let i = 1; i <= 23; i++)
    store.record(input(String(i), String(1000 + i)));
  const page = store.page("1581", "9", null, 99);
  expect(page.page).toBe(3);
  expect(page.entries).toHaveLength(3);
  expect(page.viewer).toBeDefined();
});
test("unlink deletes all account scores and guild links and rejects in-flight queries", () => {
  store.record(input());
  store.unlink("1", "100", 200);
  expect(store.page("1581", "1").participantCount).toBe(0);
  expect(store.record(input())).toBe("stale");
  expect(store.record(input("1", "100", { requestedAt: 300 }))).toBe(
    "recorded",
  );
  expect(store.page("1581", "1", "guild-a").participantCount).toBe(1);
});
test("scoring snapshot includes no credentials or unrelated profile data", () => {
  const sanitized = scoringInput({
    ...character,
    cookie: "secret",
    nickname: "private",
    skills: [{ token: "secret" }],
  });
  expect(JSON.stringify(sanitized)).not.toContain("secret");
  expect(scoreCharacter(sanitized, snapshot)?.total).toBe(
    scoreCharacter(character, snapshot)?.total,
  );
});

test("ranking stores the character card's effective rolls and never turns missing metadata into zero", () => {
  const detailed = structuredClone(character) as any;
  detailed.equip_plan_info = {
    plan_effective_property_list: [{ system_id: 121 }],
  };
  for (const disc of detailed.equip)
    for (const property of disc.properties) {
      property.system_id = Number(String(property.property_id).slice(0, 3));
      property.add = property.system_id === 121 ? 2 : 4;
      property.valid = property.system_id !== 121; // The selected plan takes precedence.
    }
  const expected =
    detailed.equip
      .flatMap((disc: any) => disc.properties)
      .filter((p: any) => p.system_id === 121).length * 3;
  store.record(input("1", "100", { character: detailed }));
  expect(store.page("1581", "1").viewer?.effectiveRolls).toBe(expected);

  const withoutMetadata = structuredClone(detailed);
  delete withoutMetadata.equip_plan_info;
  withoutMetadata.equip.forEach((disc: any) =>
    disc.properties.forEach((p: any) => {
      delete p.add;
      delete p.valid;
    }),
  );
  expect(scoringInput(withoutMetadata).effectiveRolls).toBeNull();
  store.record(
    input("1", "100", {
      character: withoutMetadata,
      requestedAt: 200,
      requestId: "200",
    }),
  );
  expect(store.page("1581", "1").viewer?.effectiveRolls).toBe(expected);
  withoutMetadata.equip[0].properties = [];
  store.record(
    input("1", "100", {
      character: withoutMetadata,
      requestedAt: 300,
      requestId: "300",
    }),
  );
  expect(store.page("1581", "1").viewer?.effectiveRolls).toBeNull();
  expect(
    scoringInput({ ...character, equip_plan_info: { valid_property_cnt: 36 } })
      .effectiveRolls,
  ).toBe(36);
  expect(
    scoringInput({ ...character, equip_plan_info: { valid_property_cnt: 0 } })
      .effectiveRolls,
  ).toBe(0);
  expect(
    scoringInput({ ...character, equip_plan_info: { valid_property_cnt: 999 } })
      .effectiveRolls,
  ).toBeNull();
});
test("multiple connections share latest scores, privacy, and restarts", () => {
  const folder = mkdtempSync(join(tmpdir(), "disc-rank-")),
    filename = join(folder, "rank.sqlite");
  const first = new DiscLeaderboardStore(filename, snapshot),
    second = new DiscLeaderboardStore(filename, snapshot);
  try {
    first.record(input());
    second.record(input("1", "100", { requestedAt: 200 }));
    expect(first.record(input())).toBe("stale");
    second.setEnabled("1", false);
    expect(first.enabled("1")).toBe(false);
    second.close();
    const restarted = new DiscLeaderboardStore(filename, snapshot);
    expect(restarted.enabled("1")).toBe(false);
    restarted.setEnabled("1", true);
    expect(restarted.page("1581", "1").participantCount).toBe(1);
    restarted.close();
  } finally {
    first.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("appearance metadata survives a batch response only while the displayed skin is unchanged", () => {
  const skin = {
    skin_name: "狂想繆斯",
    skin_vertical_painting_url: "skin.png",
    skin_vertical_painting_color: "#9c77f2",
    is_original: false,
  };
  store.record(
    input("1", "100", {
      character: {
        ...character,
        role_vertical_painting_url: "skin.png",
        skin_list: [skin],
      },
    }),
  );
  expect(store.page("1581", "1").viewer).toMatchObject({
    skinName: "狂想繆斯",
    portraitColor: "#9c77f2",
  });
  store.record(
    input("1", "100", {
      character: { ...character, role_vertical_painting_url: "skin.png" },
      requestedAt: 200,
      requestId: "200",
    }),
  );
  expect(store.page("1581", "1").viewer).toMatchObject({
    skinName: "狂想繆斯",
    portraitColor: "#9c77f2",
  });
  store.record(
    input("1", "100", {
      character: { ...character, role_vertical_painting_url: "different.png" },
      requestedAt: 300,
      requestId: "300",
    }),
  );
  expect(store.page("1581", "1").viewer).toMatchObject({
    skinName: null,
    portraitColor: null,
  });
});
test("recalculation publishes one version atomically and includes concurrent gear updates", async () => {
  for (let i = 1; i <= 101; i++)
    store.record(input(String(i), String(1000 + i)));
  const updated = structuredClone(snapshot);
  for (const build of updated.agents["1581"].builds)
    for (const slot of Object.values(build.slots))
      for (const main of Object.values(slot)) {
        if (main) main.subs = { "ATK%": 1, ATK: 1 };
      }
  updated.hash = hash(updated.agents);
  updated.fetchedAt = "2099-01-01T00:00:00Z";
  const pending = store.syncScoring(updated);
  expect(store.page("1581", "1").scoringHash).toBe(snapshot.hash);
  const lower = structuredClone(character);
  lower.equip.forEach((d) => {
    d.properties = [];
  });
  store.record(input("1", "1001", { requestedAt: 200, character: lower }));
  await pending;
  expect(store.page("1581", "1").scoringHash).toBe(updated.hash);
  expect(store.page("1581", "1").viewer!.total).toBe(
    Math.round(scoreCharacter(lower, updated)!.total! * 10) / 10,
  );
  await store.syncScoring(snapshot);
  expect(store.page("1581", "1").scoringHash).toBe(updated.hash);
});
