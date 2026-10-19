jest.mock("../src/utilities/zzz/discLeaderboardRenderer.js", () => ({
  renderDiscLeaderboard: jest.fn().mockResolvedValue(Buffer.from("png")),
}));
jest.mock("../src/utilities/settings/general.js", () => ({
  openGeneralSettings: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/utilities/zzz/discLeaderboardPlayer.js", () => ({
  showDiscLeaderboardPlayer: jest.fn().mockResolvedValue(undefined),
}));
import { readFileSync } from "node:fs";
import { MessageFlags } from "discord.js";
import { DiscLeaderboardStore } from "../src/utilities/zzz/discLeaderboardStore.js";
import * as stores from "../src/utilities/zzz/discLeaderboardStore.js";
import { adaptScoringSource } from "../src/utilities/zzz/combat/scoring.js";
import {
  buildDiscLeaderboardEntry,
  discLeaderboardPayload,
  handleDiscLeaderboardInteraction,
  leaderboardControls,
  leaderboardCharacterSelect,
  leaderboardPlayerSelect,
  openDiscLeaderboard,
  recordDiscCharacters,
  discLeaderboardChoices,
  discLeaderboardAgents,
} from "../src/utilities/zzz/discLeaderboard.js";
import {
  PROFILE_SELECT_NEXT_PAGE,
  PROFILE_SELECT_PREVIOUS_PAGE,
} from "../src/utilities/zzz/profileCharacterSelect.js";
import { getScoringStore } from "../src/utilities/zzz/combat/scoringStore.js";
import { renderDiscLeaderboard } from "../src/utilities/zzz/discLeaderboardRenderer.js";
import {
  DISC_LOCALES,
  discCopyKeys,
  discText,
  discContent,
} from "../src/utilities/zzz/discLeaderboardCopy.js";
import command from "../src/commands/slash/zzz/leaderboard.js";
import { getInteractionPreflight } from "../src/utilities/shared/interactionPreflight.js";
import raw from "./fixtures/liveCombat.json";
import { showDiscLeaderboardPlayer } from "../src/utilities/zzz/discLeaderboardPlayer.js";
const envelope = JSON.parse(
  readFileSync("src/assets/combat/scoring-source.json", "utf8"),
);
const snapshot = adaptScoringSource(
  envelope.data,
  envelope.revision,
  envelope.fetchedAt,
);
const character = { ...raw[0], element_type: 300 };
let store: DiscLeaderboardStore;
const db = { get: jest.fn().mockResolvedValue("en") };
function interaction(id = "1", customId = "zdisc:open:1581"): any {
  return {
    user: {
      id,
      displayName: "Example",
      displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png",
    },
    guildId: "123",
    createdTimestamp: 200,
    id: "200",
    customId,
    locale: "en-US",
    client: { db },
    isButton: () => true,
    isStringSelectMenu: () => false,
    deferReply: jest.fn().mockResolvedValue(undefined),
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}
beforeEach(() => {
  store = new DiscLeaderboardStore(":memory:", snapshot);
  jest.spyOn(stores, "getDiscLeaderboardStore").mockReturnValue(store);
});
afterEach(() => {
  store.close();
  jest.restoreAllMocks();
});
test("successful self queries enroll; other-user queries and board opens do not", async () => {
  const i = interaction();
  expect(recordDiscCharacters(i, "2", "100", [character], "en", store)).toBe(
    "",
  );
  expect(store.page("1581", "1").participantCount).toBe(0);
  await openDiscLeaderboard(i, "1581");
  expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  expect(store.page("1581", "1").participantCount).toBe(0);
  expect(
    recordDiscCharacters(i, "1", "100", [character], "en", store),
  ).toContain("Rankings updated");
  expect(store.page("1581", "1").participantCount).toBe(1);
});
test("card buttons are read-only entry points; team buttons include only selected characters", () => {
  const rows = buildDiscLeaderboardEntry(
    [character, { id: 1491, name_mi18n: "Sunna" }],
    "en",
  );
  expect(
    rows[0]
      .toJSON()
      .components.map((button) =>
        "custom_id" in button ? button.custom_id : "",
      ),
  ).toEqual(["zdisc:open:1581", "zdisc:open:1491"]);
});

test("original outfits have no label and equipped skins retain their actual names", async () => {
  for (const [suffix, expected] of [
    ["1581", null],
    ["1581_3115810", null],
    ["1581_3115811", "蕾米埃爾·月夜密語"],
  ] as const) {
    recordDiscCharacters(
      interaction(),
      "1",
      `10${suffix.replaceAll("_", "")}`,
      [
        {
          ...character,
          role_vertical_painting_url: `https://act-webstatic.hoyoverse.com/game_record/zzzv2/role_vertical_painting/role_vertical_painting_${suffix}.png`,
        },
      ],
      "tw",
      store,
    );
    await discLeaderboardPayload("1", "1581", "global", null, 1, store, "tw");
    // Use a fresh store so tied builds cannot select the previous outfit.
    expect(
      jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0].entries[0]
        .skinName,
    ).toBe(expected);
    store.close();
    store = new DiscLeaderboardStore(":memory:", snapshot);
  }
});
test("leaving a shared board opts out only the player who clicked, not its original viewer", async () => {
  recordDiscCharacters(interaction("1"), "1", "100", [character], "en", store);
  recordDiscCharacters(interaction("2"), "2", "200", [character], "en", store);
  const i = interaction("2", "zdisc:panel:1:1581:g:1:leave");
  await handleDiscLeaderboardInteraction(i, db);
  expect(i.reply).not.toHaveBeenCalled();
  expect(i.deferUpdate).toHaveBeenCalled();
  expect(store.enabled("1")).toBe(true);
  expect(store.enabled("2")).toBe(false);
  expect(store.page("1581", "1").viewer?.ownerId).toBe("1");
  expect(jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0]).toMatchObject({
    participantCount: 1, viewer: undefined,
  });
  const join = i.editReply.mock.calls[0][0].components[1].toJSON().components[2];
  expect(join.custom_id).toContain("zdisc:panel:2:1581:g:1:join");
  // Reusing an old leave button is idempotent, never a toggle based on another user's state.
  await handleDiscLeaderboardInteraction(interaction("2", i.customId), db);
  expect(store.enabled("2")).toBe(false);
  await handleDiscLeaderboardInteraction(interaction("2", "zdisc:panel:1:1581:g:1:join"), db);
  expect(store.enabled("1")).toBe(true);
  expect(store.enabled("2")).toBe(true);
  expect(jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0].viewer).toMatchObject({ ownerId: "2", isViewer: true });
});
test.each([
  ["global", "s", null, 1],
  ["server", "g", "123", 1],
  ["refresh", "g", null, 3],
  ["previous", "g", null, 2],
  ["next", "g", null, 4],
] as const)("any player can use %s and the refreshed board shows their own rank", async (action, scope, guildId, page) => {
  recordDiscCharacters(interaction("1"), "1", "100", [character], "en", store);
  recordDiscCharacters(interaction("2"), "2", "200", [character], "en", store);
  const read = jest.spyOn(store, "page"), write = jest.spyOn(store, "setEnabled");
  const i = interaction("2", `zdisc:panel:1:1581:${scope}:3:${action}:0`);
  await handleDiscLeaderboardInteraction(i, db);
  expect(i.reply).not.toHaveBeenCalled();
  expect(i.deferUpdate).toHaveBeenCalled();
  expect(read).toHaveBeenCalledWith("1581", "2", guildId, page);
  expect(write).not.toHaveBeenCalled();
  expect(jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0].viewer).toMatchObject({ ownerId: "2", isViewer: true });
});
test("leave and rejoin persist through stateless component interactions", async () => {
  recordDiscCharacters(interaction(), "1", "100", [character], "en", store);
  await handleDiscLeaderboardInteraction(
    interaction("1", "zdisc:panel:1:1581:g:1:leave"),
    db,
  );
  expect(store.enabled("1")).toBe(false);
  expect(
    jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0].participantCount,
  ).toBe(0);
  expect(
    recordDiscCharacters(interaction(), "1", "100", [character], "en", store),
  ).toContain("opted out");
  await handleDiscLeaderboardInteraction(
    interaction("1", "zdisc:panel:1:1581:g:1:join"),
    db,
  );
  expect(store.enabled("1")).toBe(true);
  expect(
    jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0].participantCount,
  ).toBe(1);
});
test("settings opt-out belongs to its owner and refreshes settings", async () => {
  await handleDiscLeaderboardInteraction(
    interaction("1", "zdisc:settings:1:off"),
    db,
  );
  expect(store.enabled("1")).toBe(false);
  const other = interaction("2", "zdisc:settings:1:on");
  await handleDiscLeaderboardInteraction(other, db);
  expect(store.enabled("1")).toBe(false);
  expect(store.enabled("2")).toBe(true);
  expect(other.reply).toHaveBeenCalledWith({ content: discContent("en", "forbidden"), flags: MessageFlags.Ephemeral });
  expect(other.deferUpdate).not.toHaveBeenCalled();
});
test("DM server control is disabled, invalid server requests receive a localized explanation", async () => {
  const controls = leaderboardControls(
    "1",
    "1581",
    "global",
    1,
    1,
    false,
    true,
    "en",
  );
  const server = controls[0].toJSON().components[1];
  expect("disabled" in server && server.disabled).toBe(true);
  const i = interaction();
  i.guildId = null;
  await openDiscLeaderboard(i, "1581", "server");
  expect(i.editReply).toHaveBeenCalledWith({
    content: discContent("en", "guildOnly"),
  });
});
test.each(DISC_LOCALES)(
  "%s has complete ranking UI, PNG copy, and controls",
  async (locale) => {
    for (const key of discCopyKeys) expect(discText(locale, key)).not.toBe("");
    const payload = await discLeaderboardPayload(
      "1",
      "1491",
      "global",
      null,
      1,
      store,
      locale,
    );
    expect(payload.content).toBe(discContent(locale, "guide"));
    const refresh = payload.components[0].toJSON().components[2];
    expect("label" in refresh ? refresh.label : "").toBe(
      discText(locale, "refresh"),
    );
    expect(
      jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0].locale,
    ).toBe(locale);
    expect(discLeaderboardChoices("1491", locale)).toHaveLength(1);
  },
);
test("command localizations validate, no account API is needed before acknowledgement", () => {
  const json = command.data.toJSON();
  expect(Object.keys(json.description_localizations!)).toHaveLength(7);
  expect(json.options).toHaveLength(2);
  expect(json.contexts).toEqual([0, 1, 2]);
  expect(json.integration_types).toEqual([0, 1]);
  expect(getInteractionPreflight({ commandName: "leaderboard" })).toMatchObject(
    { deferBeforeDrain: true, skipPendingLoginDrain: true },
  );
});

test("boards use official per-character colors even before any build is enrolled", async () => {
  const names = JSON.parse(
    readFileSync("src/assets/disc-leaderboard-names.json", "utf8"),
  );
  expect(names.tw["1511"].skins["3115111"]).toBe("南宮羽·狂想繆斯");
  for (const id of ["1511", "1581", "1491"]) {
    await discLeaderboardPayload("1", id, "global", null, 1, store, "tw");
    expect(
      jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0].accent,
    ).toBe(names.tw[id].color);
  }
});
test("game nicknames match the ranked UID while retaining Discord names and reading each owner once", async () => {
  const lower = structuredClone(character);
  lower.equip.forEach(disc => { disc.properties = []; });
  recordDiscCharacters(interaction("1"), "1", "100", [lower], "en", store);
  recordDiscCharacters(interaction("1"), "1", "101", [character], "en", store);
  recordDiscCharacters(interaction("2"), "2", "200", [character], "en", store);
  const values: Record<string, unknown> = {
    "1.hoyolabs": [{ cookie: "never-render-this-secret", characters: [{ uid: "100", nickname: "Wrong account" }, { uid: "101", nickname: "  遊戲暱稱  " }] }],
    "1.account": [{ uid: "101", nickname: "Stale nickname" }],
    "2.hoyolabs": { hoyolabs: [{ characters: [{ uid: "200", nickname: "第二位玩家" }] }] },
  };
  const accounts = { get: jest.fn(async (key: string): Promise<any> => values[key]), set: jest.fn(), delete: jest.fn() };
  await discLeaderboardPayload("1", "1581", "global", null, 1, store, "en", undefined, accounts);
  const rendered = jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0];
  expect(rendered.viewer).toMatchObject({ uid: "101", nickname: "遊戲暱稱", playerName: "Example" });
  expect(rendered.entries.find(entry => entry.uid === "200")).toMatchObject({ nickname: "第二位玩家", playerName: "Example" });
  expect(accounts.get).toHaveBeenCalledTimes(4);
  expect(accounts.set).not.toHaveBeenCalled();
  expect(accounts.delete).not.toHaveBeenCalled();
  expect(JSON.stringify(rendered)).not.toContain("never-render-this-secret");
});
test("legacy names and missing account data remain readable without migrating the account store", async () => {
  recordDiscCharacters(interaction("1"), "1", "100", [character], "en", store);
  const accounts = { get: jest.fn(async (key: string): Promise<any> => {
    if (key.endsWith(".hoyolabs")) throw new Error("Temporarily unavailable");
    return [{ uid: "999", nickname: "Unrelated account" }, { uid: 100, nickname: "Legacy player" }];
  }) };
  await discLeaderboardPayload("1", "1581", "global", null, 1, store, "en", undefined, accounts);
  expect(jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0].viewer).toMatchObject({ uid: "100", nickname: "Legacy player" });
  accounts.get.mockResolvedValue([]);
  await discLeaderboardPayload("1", "1581", "global", null, 1, store, "en", undefined, accounts);
  expect(jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0].viewer).toMatchObject({ uid: "100", nickname: undefined, playerName: "Example" });
});
function selectInteraction(
  page = 0,
  scope: "global" | "server" = "global",
  rankPage = 1,
  owner = "1",
) {
  const rows = leaderboardControls(
    owner,
    "1581",
    scope,
    rankPage,
    5,
    true,
    true,
    "en",
    page,
  );
  const menu = leaderboardCharacterSelect(
    owner,
    "1581",
    scope,
    rankPage,
    "en",
    page,
  ).row.toJSON().components[0];
  const i = interaction("1", menu.custom_id);
  i.isButton = () => false;
  i.isStringSelectMenu = () => true;
  i.message = { components: rows };
  i.values = [];
  return i;
}
test("selector pages reach every scoreable character without exceeding Discord's 25-option cap", () => {
  const expected = discLeaderboardAgents()
    .filter((c) => getScoringStore().snapshot().agents[c.id])
    .map((c) => c.id);
  const seen: string[] = [];
  for (let page = 0; ; page++) {
    const menu = leaderboardCharacterSelect(
      "1",
      "1581",
      "global",
      1,
      "en",
      page,
    ).row.toJSON().components[0];
    expect(menu.options.length).toBeLessThanOrEqual(25);
    for (const option of menu.options.filter(o => /^\d{4}$/.test(o.value))) expect(option.emoji?.id).toMatch(/^\d+$/);
    expect(menu.max_values).toBe(1);
    expect(menu.custom_id.length).toBeLessThanOrEqual(100);
    seen.push(
      ...menu.options.map((o) => o.value).filter((v) => /^\d{4}$/.test(v)),
    );
    if (!menu.options.some((o) => o.value === PROFILE_SELECT_NEXT_PAGE)) break;
  }
  expect(seen).toEqual(expected);
  expect(new Set(seen).size).toBe(expected.length);
});
test.each(["1", "2"])("player %s can browse agent pages while preserving the ranking page, scope and PNG", async actor => {
  const i = selectInteraction(0, "server", 3);
  i.user.id = actor;
  i.values = [PROFILE_SELECT_NEXT_PAGE];
  await handleDiscLeaderboardInteraction(i, db);
  const payload = i.editReply.mock.calls[0][0];
  expect(Object.keys(payload)).toEqual(["components"]);
  expect(payload.components[2].components[0].custom_id).toBe(
    "zdisc:select:1:1581:s:3:1",
  );
  expect(payload.components[0].components[2].custom_id).toBe(
    "zdisc:panel:1:1581:s:3:refresh:1",
  );
  expect(renderDiscLeaderboard).not.toHaveBeenCalled();
  expect(store.page("1581", "1").participantCount).toBe(0);
});
test.each(["1", "2"])("player %s can change character while preserving scope and selector page", async actor => {
  const menu = leaderboardCharacterSelect(
    "1",
    "1581",
    "server",
    3,
    "en",
    1,
  ).row.toJSON().components[0];
  const target = menu.options.find((o) => /^\d{4}$/.test(o.value))!.value;
  const i = selectInteraction(1, "server", 3);
  i.user.id = actor;
  i.values = [target];
  await handleDiscLeaderboardInteraction(i, db);
  expect(
    jest.mocked(renderDiscLeaderboard).mock.calls.at(-1)![0],
  ).toMatchObject({
    characterId: target,
    page: 1,
    scopeLabel: discText("en", "server"),
  });
  const payload = i.editReply.mock.calls[0][0];
  expect(payload.components[2].toJSON().components[0].custom_id).toBe(
    `zdisc:select:${actor}:${target}:s:1:1`,
  );
  expect(i.reply).not.toHaveBeenCalled();
  expect(store.page("1581", "1").participantCount).toBe(0);
});
test("invalid selections from any player cannot change the panel", async () => {
  for (const [owner, value] of [
    ["2", PROFILE_SELECT_PREVIOUS_PAGE],
    ["1", PROFILE_SELECT_PREVIOUS_PAGE],
    ["1", "9999"],
  ]) {
    const i = selectInteraction(0, "global", 1, owner);
    i.values = [value];
    await handleDiscLeaderboardInteraction(i, db);
    expect(i.reply).toHaveBeenCalled();
    expect(i.editReply).not.toHaveBeenCalled();
  }
});
test.each(["zdisc:panel:1:9999:g:1:leave", "zdisc:panel:1:1581:g:1:invalid", "zdisc:panel:bad:1581:g:1:leave"])("invalid shared control %s cannot change participation", async customId => {
  const write = jest.spyOn(store, "setEnabled");
  const i = interaction("2", customId);
  await handleDiscLeaderboardInteraction(i, db);
  expect(i.reply).toHaveBeenCalledWith({ content: discContent("en", "expired"), flags: MessageFlags.Ephemeral });
  expect(write).not.toHaveBeenCalled();
  expect(i.deferUpdate).not.toHaveBeenCalled();
});
test("server actions from a DM are rejected before any participation changes", async () => {
  const write = jest.spyOn(store, "setEnabled");
  const i = interaction("2", "zdisc:panel:1:1581:s:1:leave");
  i.guildId = null;
  await handleDiscLeaderboardInteraction(i, db);
  expect(i.reply).toHaveBeenCalledWith({ content: discContent("en", "guildOnly"), flags: MessageFlags.Ephemeral });
  expect(write).not.toHaveBeenCalled();
});

test("player menu lists only the current rank page and keeps Discord component limits", async () => {
  for (let n = 1; n <= 12; n++) recordDiscCharacters(interaction(String(n)), String(n), String(100 + n), [character], "en", store);
  for (const page of [1, 2]) {
    const payload = await discLeaderboardPayload("1", "1581", "global", null, page, store, "en");
    expect(payload.components).toHaveLength(4);
    const menu: any = payload.components[3].toJSON().components[0];
    expect(menu.custom_id).toBe(`zdisc:player:1:1581:g:${page}`);
    expect(menu.options.map((o: any) => o.value)).toEqual(store.page("1581", "1", null, page).entries.map(e => `${e.ownerId}:${e.uid}`));
    expect(menu.options).toHaveLength(page === 1 ? 10 : 2);
    expect(menu.min_values).toBe(1);
    expect(menu.max_values).toBe(1);
  }
});

test("empty boards omit the player selector; long identities fit in all seven languages", async () => {
  const empty = await discLeaderboardPayload("1", "1581", "global", null, 1, store, "en");
  expect(empty.components).toHaveLength(3);
  recordDiscCharacters(interaction(), "1", "100", [character], "en", store);
  const entry = { ...store.page("1581", "1").entries[0], nickname: "遊戲\n暱稱".repeat(40), playerName: "Long Discord name\n".repeat(40) };
  for (const locale of DISC_LOCALES) {
    const menu: any = leaderboardPlayerSelect("1", "1581", "global", 1, [entry], locale)[0].toJSON().components[0];
    expect(menu.placeholder).toBe(discText(locale, "selectPlayer"));
    expect(menu.placeholder.length).toBeLessThanOrEqual(150);
    expect(menu.options[0].label).toContain("#1 遊戲 暱稱");
    expect(menu.options[0].description).toContain("UID 100");
    expect(menu.options[0].label.length).toBeLessThanOrEqual(100);
    expect(menu.options[0].description.length).toBeLessThanOrEqual(100);
    expect(menu.options[0].label).not.toContain("\n");
  }
});

async function playerInteraction(scope: "global" | "server" = "global") {
  recordDiscCharacters(interaction(), "1", "100", [character], "en", store);
  const payload = await discLeaderboardPayload("1", "1581", scope, "123", 1, store, "en");
  const i = interaction("2", `zdisc:player:1:1581:${scope === "global" ? "g" : "s"}:1`);
  i.isButton = () => false;
  i.isStringSelectMenu = () => true;
  i.values = ["1:100"];
  i.message = { components: payload.components };
  return i;
}

test.each(["global", "server"] as const)("any viewer can open a player privately from a %s board without updating the shared message", async scope => {
  const i = await playerInteraction(scope);
  await handleDiscLeaderboardInteraction(i, db);
  expect(showDiscLeaderboardPlayer).toHaveBeenCalledWith(i, db,
    { agentId: "1581", ownerId: "1", uid: "100", guildId: scope === "server" ? "123" : null }, store, "en");
  expect(i.deferUpdate).not.toHaveBeenCalled();
  expect(i.editReply).not.toHaveBeenCalled();
  expect(store.page("1581", "2").participantCount).toBe(1);
});

test.each(["unoffered", "multi", "malformed", "dm-server", "zero-page", "missing-menu"])("rejects %s player selections", async kind => {
  const i = await playerInteraction(kind === "dm-server" ? "server" : "global");
  if (kind === "unoffered") i.values = ["2:200"];
  if (kind === "multi") i.values = ["1:100", "2:200"];
  if (kind === "malformed") i.values = ["1:100:1581"];
  if (kind === "dm-server") i.guildId = null;
  if (kind === "zero-page") i.customId = "zdisc:player:1:1581:g:0";
  if (kind === "missing-menu") i.message.components = [];
  await handleDiscLeaderboardInteraction(i, db);
  expect(i.reply).toHaveBeenCalledWith({ content: discContent("en", "expired"), flags: MessageFlags.Ephemeral });
  expect(showDiscLeaderboardPlayer).not.toHaveBeenCalled();
});

test("browsing character options preserves the displayed page's player selector", async () => {
  const i = await playerInteraction();
  i.customId = "zdisc:select:1:1581:g:1:0";
  i.values = [PROFILE_SELECT_NEXT_PAGE];
  const before = i.message.components[3].toJSON();
  await handleDiscLeaderboardInteraction(i, db);
  expect(i.editReply.mock.calls[0][0].components[3]).toEqual(before);
});
