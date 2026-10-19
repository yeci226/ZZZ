jest.mock("../src/utilities/zzz/clientFactory.js", () => ({
  createZzzClient: jest.fn(),
  getZzzClientLanguage: jest.fn(locale => locale),
}));
jest.mock("../src/utilities/zzz/profile.js", () => ({ drawCharacterImage: jest.fn() }));
jest.mock("../src/utilities/core/config.js", () => ({ getConfig: jest.fn(() => ({})) }));

import { readFileSync } from "node:fs";
import { MessageFlags } from "discord.js";
import { DiscLeaderboardStore } from "../src/utilities/zzz/discLeaderboardStore.js";
import { adaptScoringSource } from "../src/utilities/zzz/combat/scoring.js";
import { createZzzClient } from "../src/utilities/zzz/clientFactory.js";
import { drawCharacterImage } from "../src/utilities/zzz/profile.js";
import { rankedPlayerAccount, showDiscLeaderboardPlayer } from "../src/utilities/zzz/discLeaderboardPlayer.js";
import { discContent } from "../src/utilities/zzz/discLeaderboardCopy.js";
import raw from "./fixtures/liveCombat.json";

const envelope = JSON.parse(readFileSync("src/assets/combat/scoring-source.json", "utf8"));
const snapshot = adaptScoringSource(envelope.data, envelope.revision, envelope.fetchedAt);
const character = { ...raw[0], element_type: 300 };
const target = { ownerId: "1", uid: "100", agentId: "1581", guildId: null as string | null };
let store: DiscLeaderboardStore;
let state: Record<string, any>;
const db = { get: jest.fn(async (key: string) => state[key]), set: jest.fn(), delete: jest.fn(), has: jest.fn() };
const fetchCharacter = jest.fn();
function interaction(): any {
  const i: any = { user: { id: "2" }, deferred: false, replied: false,
    reply: jest.fn(), editReply: jest.fn(), followUp: jest.fn(), deferUpdate: jest.fn() };
  i.deferReply = jest.fn(async () => { i.deferred = true; });
  return i;
}
function enroll(uid = "100", at = 100) {
  const clock = jest.spyOn(Date, "now").mockReturnValue(at);
  try {
    store.record({ ownerId: "1", requesterId: "1", uid, character, guildId: "123",
      playerName: "Discord user", requestedAt: at, requestId: String(at) });
  } finally { clock.mockRestore(); }
}
beforeEach(() => {
  store = new DiscLeaderboardStore(":memory:", snapshot);
  enroll();
  state = {
    "1.hoyolabs": [{ cookie: "correct-cookie", characters: [
      { uid: "200", nickname: "Other account" }, { uid: "100", nickname: "Game name" },
    ] }],
    "2.profileStyle": "current", "2.paintingMode": true, "2.rankPainting": true,
  };
  fetchCharacter.mockReset().mockResolvedValue([character]);
  jest.mocked(createZzzClient).mockReturnValue({ record: { character: fetchCharacter } } as any);
  jest.mocked(drawCharacterImage).mockReset().mockResolvedValue(Buffer.from("png"));
});
afterEach(() => { store.close(); jest.useRealTimers(); jest.restoreAllMocks(); });

test("reads the exact ranked UID from canonical groups or legacy accounts without writing", async () => {
  expect(await rankedPlayerAccount(db, "1", "100")).toMatchObject({ uid: "100", nickname: "Game name", cookie: "correct-cookie" });
  state["1.hoyolabs"] = { hoyolabs: state["1.hoyolabs"] };
  expect((await rankedPlayerAccount(db, "1", "100"))?.nickname).toBe("Game name");
  state["1.hoyolabs"] = undefined;
  state["1.account"] = [{ uid: "200", cookie: "wrong" }, { uid: "100", cookie: "legacy", nickname: "Legacy name" }];
  expect(await rankedPlayerAccount(db, "1", "100")).toMatchObject({ uid: "100", cookie: "legacy" });
  expect(await rankedPlayerAccount(db, "1", "300")).toBeNull();
  expect(db.set).not.toHaveBeenCalled();
});

test("does not revive a stale legacy account when canonical groups no longer contain the UID", async () => {
  state["1.hoyolabs"][0].characters = [{ uid: "200" }];
  state["1.account"] = [{ uid: "100", cookie: "stale" }];
  expect(await rankedPlayerAccount(db, "1", "100")).toBeNull();
});

test("shows one private full character card using the ranked account and viewer preferences; never enrolls", async () => {
  const write = jest.spyOn(store, "record"), i = interaction();
  await showDiscLeaderboardPlayer(i, db, target, store, "tw");
  expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  expect(createZzzClient).toHaveBeenCalledWith({ uid: 100, cookie: "correct-cookie", lang: "tw" });
  expect(fetchCharacter).toHaveBeenCalledWith(1581);
  expect(drawCharacterImage).toHaveBeenCalledWith(i, expect.any(Function), "tw", "100", character, true, true, "current");
  const payload = i.editReply.mock.calls[0][0];
  expect(payload.files).toHaveLength(1);
  expect(payload.content).toContain("Game name · Discord user · UID 100");
  expect(payload.content).toContain(discContent("tw", "playerLiveBuild"));
  expect(payload.allowedMentions).toEqual({ parse: [] });
  expect(i.deferUpdate).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(db.set).not.toHaveBeenCalled();
});

test.each(["hidden", "unlinked", "wrong-owner", "wrong-uid", "wrong-guild", "new-winning-account"])("rejects %s before reading credentials", async kind => {
  const selected = { ...target };
  if (kind === "hidden") store.setEnabled("1", false);
  if (kind === "unlinked") store.unlink("1", "100");
  if (kind === "wrong-owner") selected.ownerId = "2";
  if (kind === "wrong-uid") selected.uid = "200";
  if (kind === "wrong-guild") selected.guildId = "456";
  if (kind === "new-winning-account") enroll("200", 200);
  const i = interaction();
  await showDiscLeaderboardPlayer(i, db, selected, store, "en");
  expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: discContent("en", "playerUnavailable") }));
  expect(db.get).not.toHaveBeenCalled();
  expect(createZzzClient).not.toHaveBeenCalled();
});

test.each(["missing", "expired-group", "expired-character", "no-cookie"])("reports %s privately without fetching a different account", async kind => {
  const group = state["1.hoyolabs"][0];
  if (kind === "missing") group.characters = [];
  if (kind === "expired-group") group.invalid = true;
  if (kind === "expired-character") group.characters[1].invalid = true;
  if (kind === "no-cookie") group.cookie = "";
  const i = interaction();
  await showDiscLeaderboardPlayer(i, db, target, store, "en");
  expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: discContent("en", "playerAccountUnavailable") }));
  expect(createZzzClient).not.toHaveBeenCalled();
});

test.each(["hidden", "unlinked", "new-winning-account"])("rechecks %s after rendering and does not publish revoked data", async kind => {
  jest.mocked(drawCharacterImage).mockImplementationOnce(async () => {
    if (kind === "hidden") store.setEnabled("1", false);
    if (kind === "unlinked") store.unlink("1", "100");
    if (kind === "new-winning-account") enroll("200", 200);
    return Buffer.from("png");
  });
  const i = interaction();
  await showDiscLeaderboardPlayer(i, db, target, store, "en");
  expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: discContent("en", "playerUnavailable") }));
  expect(i.editReply.mock.calls[0][0].files).toBeUndefined();
});

test("uses a lock while loading and releases it for retries", async () => {
  let finish!: (value: any) => void;
  const pending = new Promise(resolve => { finish = resolve; });
  fetchCharacter.mockReturnValueOnce(pending);
  const first = interaction();
  const task = showDiscLeaderboardPlayer(first, db, target, store, "en");
  const second = interaction();
  await showDiscLeaderboardPlayer(second, db, target, store, "en");
  expect(second.reply).toHaveBeenCalledWith({ content: discContent("en", "playerBusy"), flags: MessageFlags.Ephemeral });
  finish([character]);
  await task;
  await showDiscLeaderboardPlayer(interaction(), db, target, store, "en");
  expect(fetchCharacter).toHaveBeenCalledTimes(2);
});

test.each(["error", "empty", "wrong-character", "no-image"])("handles %s without leaking an error or leaving a deferred response", async kind => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  if (kind === "error") fetchCharacter.mockRejectedValueOnce(new Error("secret-cookie"));
  if (kind === "empty") fetchCharacter.mockResolvedValueOnce([]);
  if (kind === "wrong-character") fetchCharacter.mockResolvedValueOnce([{ ...character, id: 1091 }]);
  if (kind === "no-image") jest.mocked(drawCharacterImage).mockResolvedValueOnce(null);
  const i = interaction();
  await showDiscLeaderboardPlayer(i, db, target, store, "en");
  expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: discContent("en", "playerLoadFailed") }));
  expect(JSON.stringify(i.editReply.mock.calls)).not.toContain("secret-cookie");
});

test("times out an API request and releases the loading lock", async () => {
  jest.useFakeTimers();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  fetchCharacter.mockReturnValueOnce(new Promise(() => {}));
  const i = interaction();
  const task = showDiscLeaderboardPlayer(i, db, target, store, "en");
  await jest.advanceTimersByTimeAsync(12_001);
  await task;
  expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: discContent("en", "playerLoadFailed") }));
  await showDiscLeaderboardPlayer(interaction(), db, target, store, "en");
  expect(fetchCharacter).toHaveBeenCalledTimes(2);
});
