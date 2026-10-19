import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { GachaSimulationStore } from "../src/utilities/zzz/gachaSimulationStore.js";
import { getSimulationCatalog, selectSimulationBanner } from "../src/utilities/zzz/gachaSimulationCatalog.js";
import { recoverSimulationResults } from "../src/utilities/zzz/gachaSimulationRecovery.js";
import { deliverSimulationResult, isSimulationResult, skipSimulation } from "../src/utilities/zzz/gachaSimulationPlayback.js";
import { withoutSimulationContinuation } from "../src/utilities/zzz/gachaSimulationPresentation.js";

let directory: string, store: GachaSimulationStore;
const catalog = getSimulationCatalog();
beforeEach(() => { directory = mkdtempSync(path.join(os.tmpdir(), "gacha-recovery-")); store = new GachaSimulationStore(path.join(directory, "state.sqlite")); });
afterEach(() => { jest.restoreAllMocks(); store.close(); rmSync(directory, { recursive: true, force: true }); });
function setup(owner = "owner", app = "test-bot") {
  const session = store.draw(owner, owner, selectSimulationBanner(catalog), 1, () => 0, 10_000);
  store.setGifHeight(session.id, 540);
  store.attachMessage(session.id, "existing-message", { applicationId: app, channelId: "channel", guildId: "guild", completeAt: 24_000, attachmentLimit: 10_000_000 });
  const message = { id: "existing-message", components: [] as unknown[], edit: jest.fn().mockResolvedValue(undefined) };
  const transport = { applicationId: app, owns: jest.fn().mockReturnValue(true), fetchMessage: jest.fn().mockResolvedValue(message), onError: jest.fn() };
  const deps = {
    loadAnimation: jest.fn().mockResolvedValue({ gifs: [{ height: 540, lastFrame: "saved-gif-last.png" }] }),
    readGif: jest.fn(), render: jest.fn().mockResolvedValue(Buffer.from("result-png")),
  };
  const finish: typeof skipSimulation = (s, c, db, m, limit) => skipSimulation(s, c, db, m, limit, deps);
  return { session, message, transport, deps, finish };
}

function discordComponents(id: string, mode: "animation" | "result", loadingState = 2) {
  return [{ type: 17, components: [
    { type: 12, items: [{ media: { url: `https://cdn.example/${mode === "animation" ? "animation.gif" : "gacha-result.png"}`,
      loading_state: loadingState, width: 1280, height: 720 } }] },
    { type: 1, components: (mode === "animation" ? ["skip"] : ["a", "s", "one", "ten"]).map(action => ({ type: 2, custom_id: `gsim:${action}:${id}` })) },
  ] }];
}

it("recovers an overdue message after reopening the database without a redraw, upload, or changed pity", async () => {
  const x = setup();
  store.close(); store = new GachaSimulationStore(path.join(directory, "state.sqlite"));
  expect(store.pendingResults("test-bot", 23_999)).toEqual([]);
  expect(store.pendingResults("other-bot", 25_000)).toEqual([]);
  expect(store.get(x.session.id)?.gifHeight).toBe(540);
  expect(await recoverSimulationResults(store, catalog, x.transport, 25_000, x.finish)).toBe(1);
  expect(x.message.edit).toHaveBeenCalledTimes(1);
  expect(x.message.edit.mock.calls[0][0].files[0].name).toBe("gacha-result.png");
  expect(x.deps.render.mock.calls[0][0]).toBe("saved-gif-last.png");
  expect(x.deps.readGif).not.toHaveBeenCalled();
  expect(store.get(x.session.id)?.pulls).toEqual(x.session.pulls);
  expect(store.state("owner", "character")).toEqual(x.session.state);
  expect(await recoverSimulationResults(store, catalog, x.transport, 30_000, x.finish)).toBe(0);
  expect(x.message.edit).toHaveBeenCalledTimes(1);
});

it("retries a failed Discord edit and does not advance the draw", async () => {
  const x = setup(); x.message.edit.mockRejectedValueOnce(new Error("network timeout"));
  expect(await recoverSimulationResults(store, catalog, x.transport, 25_000, x.finish)).toBe(0);
  expect(store.get(x.session.id)?.finished).toBe(false);
  expect(x.transport.onError).toHaveBeenCalledTimes(1);
  expect(await recoverSimulationResults(store, catalog, x.transport, 30_000, x.finish)).toBe(1);
  expect(store.state("owner", "character").total).toBe(1);
});

it("recovers an unfinished month-old animation without expiring its saved result", async () => {
  const x = setup();
  const now = 30 * 24 * 60 * 60 * 1000;
  expect(await recoverSimulationResults(store, catalog, x.transport, now, x.finish)).toBe(1);
  expect(x.message.edit).toHaveBeenCalledTimes(1);
  expect(store.get(x.session.id)?.finished).toBe(true);
  expect(store.state("owner", "character").total).toBe(1);
});

it("leaves other shards alone and stops retrying deleted messages while retaining their results", async () => {
  const x = setup(); x.transport.owns.mockReturnValue(false);
  await recoverSimulationResults(store, catalog, x.transport, 25_000, x.finish);
  expect(x.transport.fetchMessage).not.toHaveBeenCalled();
  x.transport.owns.mockReturnValue(true); x.transport.fetchMessage.mockResolvedValue(undefined);
  await recoverSimulationResults(store, catalog, x.transport, 25_000, x.finish);
  expect(store.get(x.session.id)?.finished).toBe(true);
  expect(store.get(x.session.id)?.pulls).toEqual(x.session.pulls);
  expect(x.message.edit).not.toHaveBeenCalled();
  expect(store.pendingResultChecks("test-bot", 100_000)).toEqual([]);
});

it("repairs a finished message that regressed to a failed GIF, then verifies the actual result after restart", async () => {
  const x = setup();
  store.finish(x.session.id, 25_000);
  x.message.components = discordComponents(x.session.id, "animation", 3);
  store.close(); store = new GachaSimulationStore(path.join(directory, "state.sqlite"));
  expect(store.pendingResultChecks("test-bot", 54_999)).toEqual([]);
  expect(store.pendingResultChecks("other-bot", 60_000)).toEqual([]);
  const clock = jest.spyOn(Date, "now").mockReturnValue(60_000);
  expect(await recoverSimulationResults(store, catalog, x.transport, 60_000, x.finish)).toBe(1);
  expect(x.message.edit).toHaveBeenCalledTimes(1);
  expect(store.get(x.session.id)?.pulls).toEqual(x.session.pulls);
  expect(store.state("owner", "character")).toEqual(x.session.state);
  expect(store.pendingResultChecks("test-bot", 89_999)).toEqual([]);
  x.message.components = discordComponents(x.session.id, "result");
  clock.mockReturnValue(90_000);
  expect(await recoverSimulationResults(store, catalog, x.transport, 90_000, x.finish)).toBe(0);
  expect(x.message.edit).toHaveBeenCalledTimes(1);
  expect(store.get(x.session.id)?.resultVerifiedAt).toBe(90_000);
  expect(store.pendingResultChecks("test-bot", 999_999)).toEqual([]);
});

it("lets a visible skip button restore a saved result even when the database already says finished", async () => {
  const x = setup(); store.finish(x.session.id);
  x.message.components = discordComponents(x.session.id, "animation", 3);
  await x.finish(store.get(x.session.id)!, catalog, store, x.message, 10_000_000);
  expect(x.message.edit).toHaveBeenCalledTimes(1);
  expect(store.state("owner", "character")).toEqual(x.session.state);
  x.message.components = discordComponents(x.session.id, "result");
  await x.finish(store.get(x.session.id)!, catalog, store, x.message, 10_000_000);
  expect(x.message.edit).toHaveBeenCalledTimes(1);
});

it("does not certify the wrong session, a failed PNG, or a still-loading result", () => {
  const x = setup();
  for (const status of [1, 3]) {
    x.message.components = discordComponents(x.session.id, "result", status);
    expect(isSimulationResult(x.message, x.session.id)).toBe(false);
  }
  x.message.components = discordComponents("another-session", "result");
  expect(isSimulationResult(x.message, x.session.id)).toBe(false);
  x.message.components = discordComponents(x.session.id, "result");
  expect(isSimulationResult(x.message, x.session.id)).toBe(true);
});

it("keeps a failed repair pending and retries without advancing pity", async () => {
  const x = setup(); store.finish(x.session.id, 25_000);
  x.message.components = discordComponents(x.session.id, "animation", 3);
  x.message.edit.mockRejectedValueOnce(new Error("network timeout"));
  expect(await recoverSimulationResults(store, catalog, x.transport, 60_000, x.finish)).toBe(0);
  expect(store.get(x.session.id)?.finished).toBe(false);
  expect(await recoverSimulationResults(store, catalog, x.transport, 65_000, x.finish)).toBe(1);
  expect(x.message.edit).toHaveBeenCalledTimes(2);
  expect(store.state("owner", "character")).toEqual(x.session.state);
});

it("verifies consumed results without restoring their old buttons, and repairs stale controls after restart", async () => {
  const x = setup(); store.finish(x.session.id, 25_000);
  const child = store.continueDraw(x.session.id, "owner", "continue", 1, undefined, () => .99, 30_000)!;
  x.message.components = discordComponents(x.session.id, "result");
  expect(isSimulationResult(x.message, x.session.id, true)).toBe(false);
  store.close(); store = new GachaSimulationStore(path.join(directory, "state.sqlite"));
  expect(await recoverSimulationResults(store, catalog, x.transport, 60_000, x.finish)).toBe(1);
  expect(JSON.stringify(x.message.edit.mock.calls[0][0])).not.toMatch(/gsim:(one|ten):/);
  expect(store.get(x.session.id)?.continuationId).toBe(child.id);
  x.message.components = withoutSimulationContinuation(discordComponents(x.session.id, "result"), x.session.id).components;
  expect(isSimulationResult(x.message, x.session.id, true)).toBe(true);
  await recoverSimulationResults(store, catalog, x.transport, Date.now() + 35_000, x.finish);
  expect(x.message.edit).toHaveBeenCalledTimes(1);
  expect(store.get(x.session.id)?.resultVerifiedAt).toBeDefined();
  expect(store.state("owner", "character").total).toBe(2);
});

it("recovers a saved but unsent continuation after restart, retiring old controls before sending its result", async () => {
  const x = setup(); store.finish(x.session.id, 25_000);
  const child = store.continueDraw(x.session.id, "owner", "continue", 10, store.get(x.session.id)!.delivery, () => .99, 30_000)!;
  expect(store.pendingContinuations("test-bot", 89_999)).toEqual([]);
  expect(store.pendingContinuations("other-bot", 90_000)).toEqual([]);
  const state = store.state("owner", "character");
  x.message.components = discordComponents(x.session.id, "result");
  const sent = { id: "recovered-followup", components: [] as unknown[], edit: jest.fn() };
  const transport = { ...x.transport, sendMessage: jest.fn().mockImplementation(async (_session, payload) => {
    expect(x.message.edit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(x.message.edit.mock.calls[0][0])).not.toMatch(/gsim:(one|ten):/);
    sent.components = payload.components; return sent;
  }) };
  x.message.edit.mockImplementation(async payload => { x.message.components = payload.components; });
  const deliver: typeof deliverSimulationResult = (s, c, db, t) => deliverSimulationResult(s, c, db, t, x.deps);
  store.close(); store = new GachaSimulationStore(path.join(directory, "state.sqlite"));
  expect(await recoverSimulationResults(store, catalog, transport, 90_000, x.finish, deliver)).toBe(1);
  expect(transport.sendMessage).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(sent.components)).toContain(`gsim:ten:${child.id}`);
  expect(store.get(child.id)?.messageId).toBe(sent.id);
  expect(store.get(child.id)?.finished).toBe(true);
  expect(store.get(child.id)?.pulls).toEqual(child.pulls);
  expect(store.state("owner", "character")).toEqual(state);
  await recoverSimulationResults(store, catalog, transport, 95_000, x.finish, deliver);
  expect(transport.sendMessage).toHaveBeenCalledTimes(1);
});

it("leases an interrupted continuation across workers and retries removal failure without advancing pity", async () => {
  const x = setup(); store.finish(x.session.id, 25_000);
  const child = store.continueDraw(x.session.id, "owner", "continue", 10, store.get(x.session.id)!.delivery, () => .99, 30_000)!;
  const second = new GachaSimulationStore(path.join(directory, "state.sqlite"));
  expect(store.claimPendingContinuation(child.id, 90_000)?.id).toBe(child.id);
  expect(second.claimPendingContinuation(child.id, 90_000)).toBeUndefined(); second.close();
  x.message.components = discordComponents(x.session.id, "result");
  x.message.edit.mockRejectedValue(new Error("Discord unavailable"));
  const transport = { ...x.transport, sendMessage: jest.fn() };
  const deliver = jest.fn();
  await recoverSimulationResults(store, catalog, transport, 150_000, x.finish, deliver);
  expect(deliver).not.toHaveBeenCalled();
  expect(transport.sendMessage).not.toHaveBeenCalled();
  expect(store.pendingContinuations("test-bot", 209_999)).toEqual([]);
  expect(store.pendingContinuations("test-bot", 210_000)).toHaveLength(1);
  expect(store.state("owner", "character").total).toBe(11);
});
