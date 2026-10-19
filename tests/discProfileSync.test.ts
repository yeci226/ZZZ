import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiscLeaderboardStore } from "../src/utilities/zzz/discLeaderboardStore.js";
import { syncProfileDiscs } from "../src/utilities/zzz/discProfileSync.js";
import { adaptScoringSource } from "../src/utilities/zzz/combat/scoring.js";
import raw from "./fixtures/liveCombat.json";
const seed = JSON.parse(readFileSync("src/assets/combat/scoring-source.json", "utf8"));
const snapshot = adaptScoringSource(seed.data, seed.revision, seed.fetchedAt);
const character = { ...raw[0], element_type: 300 };
const input = { ownerId: "1", requesterId: "1", uid: "100", requestId: "200", requestedAt: 200, guildId: "a", playerName: "Player", characters: [{ id: 1581 }, { id: 1491 }] };
let store: DiscLeaderboardStore;
const details = (id: number) => ({ ...structuredClone(character), id });
const options = () => ({ store, pause: async () => {}, now: () => 1000 });
beforeEach(() => { store = new DiscLeaderboardStore(":memory:", snapshot); });
afterEach(() => store.close());
test("syncs the entire owned roster sequentially and deduplicates IDs", async () => {
  let inFlight = false;
  const character = jest.fn(async (id: number) => {
    expect(inFlight).toBe(false); inFlight = true;
    await Promise.resolve(); inFlight = false;
    return [details(id)];
  });
  const result = await syncProfileDiscs({ ...input, characters: [...input.characters, { id: 1581 }] }, { record: { character } }, options());
  expect(result).toEqual({ status: "complete", updated: 2, total: 2 });
  expect(character.mock.calls.map(c => c[0])).toEqual([1581, 1491]);
  expect(store.page("1581", "1", "a").participantCount).toBe(1);
  expect(store.page("1491", "1", "a").participantCount).toBe(1);
});
test.each(["other-owner", "hidden"])("%s does not make authenticated API calls", async status => {
  if (status === "hidden") store.setEnabled("1", false);
  const character = jest.fn();
  const result = await syncProfileDiscs({ ...input, requesterId: status === "other-owner" ? "2" : "1" }, { record: { character } }, options());
  expect(result.status).toBe(status); expect(character).not.toHaveBeenCalled();
});
test("cross-worker leases prevent duplicate requests, expire after crashes, and honor newer tokens", () => {
  const dir = mkdtempSync(join(tmpdir(), "disc-sync-")), filename = join(dir, "sync.sqlite");
  const first = new DiscLeaderboardStore(filename, snapshot), second = new DiscLeaderboardStore(filename, snapshot);
  try {
    expect(first.beginProfileSync(input, 1000)).toBe("started");
    expect(second.beginProfileSync({ ...input, requestId: "201" }, 1100)).toBe("busy");
    expect(second.beginProfileSync({ ...input, requestId: "202" }, 182000)).toBe("started");
    first.finishProfileSync(input.uid, input.requestId, true, 182001);
    expect(second.profileSyncActive(input.uid, "202", 182002)).toBe(true);
    expect(first.profileSyncActive(input.uid, "200", 182002)).toBe(false);
  } finally { first.close(); second.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("duplicate or recent profiles enroll their server, including characters still being fetched", async () => {
  const character = jest.fn(async (id: number) => {
    expect(store.beginProfileSync({ ...input, requestId: "201", guildId: "b" }, 1001)).toBe("busy");
    return details(id);
  });
  await syncProfileDiscs(input, { record: { character } }, options());
  for (const id of ["1581", "1491"]) expect(store.page(id, "1", "b").participantCount).toBe(1);
  expect(await syncProfileDiscs({ ...input, guildId: "c" }, { record: { character } }, options())).toMatchObject({ status: "recent" });
  expect(character).toHaveBeenCalledTimes(2);
  expect(store.page("1491", "1", "c").participantCount).toBe(1);
});
test("missing details retain a previous build; explicit empty gear removes it", async () => {
  store.record({ ...input, requestedAt: 100, requestId: "100", character });
  const result = await syncProfileDiscs(input, { record: { character: jest.fn(async id => id === 1581 ? { id } : details(id)) } }, options());
  expect(result).toEqual({ status: "partial", updated: 1, total: 2 });
  expect(store.page("1581", "1").viewer?.total).toBe(490.5);
  await syncProfileDiscs({ ...input, requestId: "300", requestedAt: 300 }, { record: { character: jest.fn(async id => ({ ...details(id), equip: [] })) } }, { ...options(), now: () => 17000 });
  expect(store.page("1581", "1").participantCount).toBe(0);
});
test("an older full-profile result never overwrites a newer single-character query", async () => {
  const lower = details(1581); lower.equip.forEach(d => { d.properties = []; });
  const character = jest.fn(async (id: number) => {
    store.record({ ...input, requestedAt: 300, requestId: "300", character: lower });
    return details(id);
  });
  await syncProfileDiscs(input, { record: { character } }, options());
  expect(store.page("1581", "1").viewer!.total).toBeLessThan(490.5);
});
test.each(["leave", "unbind"])("%s during an API request cancels all subsequent enrollment", async action => {
  const character = jest.fn(async (id: number) => {
    if (action === "leave") { store.setEnabled("1", false); store.setEnabled("1", true); }
    else store.unlink("1", "100", 250);
    return details(id);
  });
  const result = await syncProfileDiscs(input, { record: { character } }, options());
  expect(result.status).toBe("cancelled"); expect(character).toHaveBeenCalledTimes(1);
  expect(store.page("1581", "1").participantCount).toBe(0);
});
test("three consecutive failures stop requests and leave saved data intact", async () => {
  store.record({ ...input, requestedAt: 100, requestId: "100", character });
  const fetch = jest.fn().mockRejectedValue(new Error("Provider unavailable"));
  const result = await syncProfileDiscs({ ...input, characters: [1581, 1491, 1011, 1021].map(id => ({ id })) }, { record: { character: fetch } }, options());
  expect(result).toMatchObject({ status: "partial", updated: 0 }); expect(fetch).toHaveBeenCalledTimes(3);
  expect(store.page("1581", "1").viewer?.total).toBe(490.5);
});
test("a timed-out SDK request cannot later enroll data or run concurrently with the next character", async () => {
  let finish: (value: any) => void = () => {};
  const character = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const result = await syncProfileDiscs(input, { record: { character } }, { ...options(), timeoutMs: 5 });
  expect(result.status).toBe("partial"); expect(character).toHaveBeenCalledTimes(1);
  finish(details(1581)); await Promise.resolve();
  expect(store.page("1581", "1").participantCount).toBe(0);
});
test("full account uses groups of ten and skips individual requests when all batch data is valid", async () => {
  const ids = Object.keys(snapshot.agents).slice(0, 23).map(Number);
  const fetchBatch = jest.fn(async (ids: readonly string[]) => ids.map(id => details(Number(id))));
  const character = jest.fn();
  const result = await syncProfileDiscs({ ...input, characters: ids.map(id => ({ id })) }, { record: { character } }, { ...options(), fetchBatch });
  expect(result).toEqual({ status: "complete", updated: 23, total: 23 });
  expect(fetchBatch.mock.calls.map(([ids]) => ids.length)).toEqual([10, 10, 3]);
  expect(character).not.toHaveBeenCalled();
});
test("partial batch replies fall back only for missing IDs without double enrollment", async () => {
  const fetchBatch = jest.fn(async () => [details(1581), details(1581), details(9999)]);
  const character = jest.fn(async (id: number) => details(id));
  const result = await syncProfileDiscs(input, { record: { character } }, { ...options(), fetchBatch });
  expect(result).toEqual({ status: "complete", updated: 2, total: 2 });
  expect(character.mock.calls).toEqual([[1491]]);
});
test("event-tool authentication errors fall back to existing chronicle access", async () => {
  const fetchBatch = jest.fn().mockRejectedValue(new Error("Batch unavailable"));
  const character = jest.fn(async (id: number) => details(id));
  const result = await syncProfileDiscs(input, { record: { character } }, { ...options(), fetchBatch });
  expect(result.status).toBe("complete"); expect(character).toHaveBeenCalledTimes(2);
});
test("unlink during batch fetching cancels enrollment and the individual fallback", async () => {
  const fetchBatch = jest.fn(async () => { store.unlink("1", "100", 300); return [details(1581)]; });
  const character = jest.fn();
  const result = await syncProfileDiscs(input, { record: { character } }, { ...options(), fetchBatch });
  expect(result.status).toBe("cancelled"); expect(character).not.toHaveBeenCalled();
  expect(store.page("1581", "1").participantCount).toBe(0);
});
