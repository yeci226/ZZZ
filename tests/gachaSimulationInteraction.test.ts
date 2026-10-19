import { MessageFlags } from "discord.js";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import * as storage from "../src/utilities/zzz/gachaSimulationStore.js";
import * as playback from "../src/utilities/zzz/gachaSimulationPlayback.js";
import { getSimulationCatalog } from "../src/utilities/zzz/gachaSimulationCatalog.js";
import { handleGachaSimulationButton } from "../src/utilities/zzz/gachaSimulationInteraction.js";
import { simulationMessage } from "../src/utilities/zzz/gachaSimulationPresentation.js";

let store: storage.GachaSimulationStore;
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "gacha-buttons-"));
  store = new storage.GachaSimulationStore(path.join(directory, "state.sqlite"));
  jest.spyOn(storage, "getGachaSimulationStore").mockReturnValue(store);
});
afterEach(() => { jest.restoreAllMocks(); store.close(); rmSync(directory, { recursive: true, force: true }); });
function setup(action: "one" | "ten" | "skip" = "ten", age = 5000) {
  const banner = getSimulationCatalog().banners.find(b => b.pool === "character")!;
  const session = store.draw("owner", "original-request", banner, 10, () => .99, Date.now() - age);
  store.attachMessage(session.id, "original-message");
  if (action !== "skip") store.finish(session.id);
  const next = { id: "followup-message", edit: jest.fn() };
  const interaction: any = { id: "next-request", customId: `gsim:${action}:${session.id}`, user: { id: "owner" },
    applicationId: "test-bot", channelId: "channel", guildId: "guild",
    message: { id: "original-message", components: simulationMessage(session, getSimulationCatalog(), action === "skip" ? "animation" : "result",
      "https://cdn.example/gacha-result.png").components, edit: jest.fn().mockResolvedValue(undefined) }, attachmentSizeLimit: 10_000_000,
    reply: jest.fn().mockResolvedValue(undefined), deferUpdate: jest.fn().mockResolvedValue(undefined), followUp: jest.fn().mockResolvedValue(next) };
  return { session, interaction, next };
}

it("continues in a new followup message on the same banner and shares saved pity", async () => {
  const x = setup();
  const play = jest.spyOn(playback, "playSimulation").mockImplementation(async (session, _catalog, persistence, transport) => {
    const message = await transport.send({ flags: MessageFlags.IsComponentsV2, components: [], allowedMentions: { parse: [] } });
    persistence.attachMessage(session.id, message.id);
  });
  await handleGachaSimulationButton(x.interaction);
  expect(x.interaction.deferUpdate).toHaveBeenCalledTimes(1);
  expect(x.interaction.followUp).toHaveBeenCalledTimes(1); expect(x.interaction.message.edit).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(x.interaction.message.edit.mock.calls[0][0])).not.toMatch(/gsim:(one|ten):/);
  expect(JSON.stringify(x.interaction.message.edit.mock.calls[0][0])).toContain("https://cdn.example/gacha-result.png");
  expect(store.get(x.session.id)?.continuationId).toBe(play.mock.calls[0][0].id);
  expect(play.mock.calls[0][0].parentId).toBe(x.session.id);
  expect(play.mock.calls[0][0].banner).toEqual(x.session.banner);
  expect(play.mock.calls[0][0].pulls).toHaveLength(10);
  expect(store.state("owner", "character").total).toBe(20);
  expect(store.state("owner", "weapon").total).toBe(0);
  await handleGachaSimulationButton(x.interaction);
  expect(x.interaction.followUp).toHaveBeenCalledTimes(1); expect(store.state("owner", "character").total).toBe(20);
});
it("does not allow another user or a copied message to consume someone's pity", async () => {
  const x = setup(); x.interaction.user.id = "other";
  await handleGachaSimulationButton(x.interaction);
  expect(x.interaction.followUp.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
  expect(x.interaction.deferUpdate).toHaveBeenCalledTimes(1); expect(store.state("owner", "character").total).toBe(10);
  x.interaction.user.id = "owner"; x.interaction.message.id = "copied-message";
  await handleGachaSimulationButton(x.interaction);
  expect(x.interaction.followUp.mock.calls[1][0].content).toContain("訊息不符");
});
it("skip delivers the stored result without generating a new draw or followup", async () => {
  const x = setup("skip"), skip = jest.spyOn(playback, "skipSimulation").mockResolvedValue(undefined);
  await handleGachaSimulationButton(x.interaction);
  expect(skip.mock.calls[0][0].pulls).toEqual(x.session.pulls); expect(x.interaction.followUp).not.toHaveBeenCalled();
  expect(store.state("owner", "character").total).toBe(10);
});
it.each(["one", "ten"] as const)("%s still continues a month-old message after later draws and a database restart", async action => {
  const x = setup(action, 30 * 24 * 60 * 60 * 1000);
  // Later draws used to prune every session older than a week.
  store.draw("another-user", "recent-request", x.session.banner, 1, () => .99);
  store.close(); store = new storage.GachaSimulationStore(path.join(directory, "state.sqlite"));
  jest.spyOn(storage, "getGachaSimulationStore").mockReturnValue(store);
  expect(store.get(x.session.id)?.banner).toEqual(x.session.banner);
  expect(store.draw("owner", "original-request", x.session.banner, 10).id).toBe(x.session.id);
  const play = jest.spyOn(playback, "playSimulation").mockImplementation(async (session, _catalog, persistence, transport) => {
    const message = await transport.send({ flags: MessageFlags.IsComponentsV2, components: [], allowedMentions: { parse: [] } });
    persistence.attachMessage(session.id, message.id);
  });
  await handleGachaSimulationButton(x.interaction);
  expect(play.mock.calls[0][0].banner).toEqual(x.session.banner);
  expect(play.mock.calls[0][0].pulls).toHaveLength(action === "one" ? 1 : 10);
  expect(x.interaction.followUp).toHaveBeenCalledTimes(1);
  expect(x.interaction.message.edit).toHaveBeenCalledTimes(1);
  expect(store.state("owner", "character").total).toBe(action === "one" ? 11 : 20);
});

it("allows only one of simultaneous single/ten clicks, even while the old message edit is pending", async () => {
  const x = setup("one");
  let release!: () => void;
  x.interaction.message.edit.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  const play = jest.spyOn(playback, "playSimulation").mockResolvedValue(undefined);
  const first = handleGachaSimulationButton(x.interaction);
  await Promise.resolve();
  const duplicate = { ...x.interaction, id: "other-click", customId: `gsim:ten:${x.session.id}`,
    deferUpdate: jest.fn().mockResolvedValue(undefined), followUp: jest.fn().mockResolvedValue(undefined) };
  await handleGachaSimulationButton(duplicate);
  expect(duplicate.followUp.mock.calls[0][0].content).toContain("已使用");
  expect(store.state("owner", "character").total).toBe(11);
  expect(play).not.toHaveBeenCalled();
  release(); await first;
  expect(play).toHaveBeenCalledTimes(1);
  expect(x.interaction.message.edit).toHaveBeenCalledTimes(1);
});

it("keeps old actions consumed after restart and gives only the latest result a new pair", async () => {
  const x = setup();
  const play = jest.spyOn(playback, "playSimulation").mockImplementation(async (s, _c, db) => {
    db.attachMessage(s.id, `message-${s.id}`); db.finish(s.id);
  });
  await handleGachaSimulationButton(x.interaction);
  const child = play.mock.calls[0][0];
  store.close(); store = new storage.GachaSimulationStore(path.join(directory, "state.sqlite"));
  jest.spyOn(storage, "getGachaSimulationStore").mockReturnValue(store);
  jest.spyOn(Date, "now").mockReturnValue(child.createdAt + 5000);
  const oldClick = { ...x.interaction, id: "old-click", followUp: jest.fn().mockResolvedValue(undefined) };
  await handleGachaSimulationButton(oldClick);
  expect(oldClick.followUp.mock.calls[0][0].content).toContain("最新");
  expect(play).toHaveBeenCalledTimes(1);
  const nextClick = { ...x.interaction, id: "latest-click", customId: `gsim:one:${child.id}`,
    message: { id: `message-${child.id}`, components: simulationMessage(child, getSimulationCatalog(), "result").components,
      edit: jest.fn().mockResolvedValue(undefined) } };
  await handleGachaSimulationButton(nextClick);
  expect(play).toHaveBeenCalledTimes(2);
  expect(store.state("owner", "character").total).toBe(21);
  const latest = play.mock.calls[1][0];
  for (const s of [store.get(x.session.id)!, store.get(child.id)!]) {
    expect(JSON.stringify(simulationMessage(s, getSimulationCatalog(), "result"))).not.toMatch(/gsim:(one|ten):/);
  }
  expect(JSON.stringify(simulationMessage(latest, getSimulationCatalog(), "result"))).toContain(`gsim:ten:${latest.id}`);
});

it.each(["retiring the old buttons", "sending the followup"])("saves one recoverable continuation when %s fails", async failure => {
  const x = setup();
  if (failure === "retiring the old buttons") x.interaction.message.edit.mockRejectedValue(new Error("Discord unavailable"));
  const play = jest.spyOn(playback, "playSimulation").mockRejectedValue(new Error("Discord unavailable"));
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  await handleGachaSimulationButton(x.interaction);
  const child = store.get(store.get(x.session.id)!.continuationId!)!;
  expect(child.messageId).toBeUndefined();
  expect(child.parentId).toBe(x.session.id);
  expect(child.delivery?.applicationId).toBe("test-bot");
  expect(x.interaction.followUp.mock.calls[0][0].content).toContain("已保存");
  expect(store.state("owner", "character").total).toBe(20);
  await handleGachaSimulationButton({ ...x.interaction, id: "retry-click" });
  expect(store.state("owner", "character").total).toBe(20);
  expect(play).toHaveBeenCalledTimes(failure === "sending the followup" ? 1 : 0);
  expect(error).toHaveBeenCalledTimes(1);
});
it("acknowledges a click before opening the store and does not draw if acknowledgement fails", async () => {
  const x = setup();
  const getStore = jest.spyOn(storage, "getGachaSimulationStore").mockClear();
  let reject!: (error: Error) => void;
  x.interaction.deferUpdate.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  const handled = handleGachaSimulationButton(x.interaction);
  expect(getStore).not.toHaveBeenCalled();
  reject(new Error("Unknown interaction"));
  await expect(handled).rejects.toThrow("Unknown interaction");
  expect(getStore).not.toHaveBeenCalled();
  expect(store.state("owner", "character").total).toBe(10);
});
it("explains missing saved data without claiming that the button expired or consuming pity", async () => {
  const x = setup(); x.interaction.customId = `gsim:ten:${"0".repeat(24)}`;
  await handleGachaSimulationButton(x.interaction);
  expect(x.interaction.followUp.mock.calls[0][0].content).toContain("保存資料");
  expect(x.interaction.followUp.mock.calls[0][0].content).not.toContain("過期");
  expect(x.interaction.followUp.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
  expect(store.state("owner", "character").total).toBe(10);
});
