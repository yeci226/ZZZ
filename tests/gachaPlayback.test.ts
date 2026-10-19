import { gachaCacheKey, gachaRanks, type GachaAnimation, type GachaGifFile } from "../src/utilities/zzz/gachaAnimationCache.js";
import { playGachaPreview } from "../src/utilities/zzz/gachaPlayback.js";
import { gachaPreviewItems } from "../src/utilities/zzz/gachaPreviewSamples.js";
import { getInteractionPreflight } from "../src/utilities/shared/interactionPreflight.js";
import { getCommandAckPlan } from "../src/utilities/shared/index.js";
import command from "../src/commands/slash/zzz/gachaPreview.js";

const file: GachaGifFile = { file: "animation.gif", bytes: 1000, width: 1280, height: 720, fps: 30, durationMs: 13_000, lastFrame: "gif-final.png" };
const animation: GachaAnimation = { key: "single-s", ranks: "S", directory: ".", gifs: [file], lastFrame: "master-final.png" };
const items = gachaPreviewItems("single");
const pending = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};
function setup() {
  const interaction = { deferred: true, replied: false, attachmentSizeLimit: 10_000, deferReply: jest.fn().mockResolvedValue(undefined), editReply: jest.fn().mockResolvedValue(undefined) };
  const dependencies = { renderResult: jest.fn().mockResolvedValue(Buffer.from("png")), readGif: jest.fn().mockResolvedValue(Buffer.from("gif")), sleep: jest.fn().mockResolvedValue(undefined) };
  return { interaction, dependencies };
}

it("prepares the PNG, waits for GIF upload, then replaces the original attachment", async () => {
  const { interaction, dependencies } = setup(), upload = pending(), playback = pending();
  interaction.editReply.mockImplementationOnce(() => upload.promise);
  dependencies.sleep.mockImplementationOnce(() => playback.promise);
  const task = playGachaPreview(interaction, animation, items, dependencies);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(dependencies.renderResult).toHaveBeenCalledWith("gif-final.png", items);
  expect(interaction.editReply).toHaveBeenCalledTimes(1);
  expect(dependencies.sleep).not.toHaveBeenCalled();
  upload.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(dependencies.sleep).toHaveBeenCalledWith(13_750);
  expect(interaction.editReply).toHaveBeenCalledTimes(1);
  playback.resolve(); await task;
  expect(interaction.deferReply).not.toHaveBeenCalled();
  const final = interaction.editReply.mock.calls[1][0];
  expect(final.attachments).toEqual([]);
  expect(final.files).toEqual([{ attachment: Buffer.from("png"), name: "gacha-result.png" }]);
  expect(final.embeds[0].image.url).toBe("attachment://gacha-result.png");
});

it("uses a smaller GIF within the per-interaction upload limit and its own last frame", async () => {
  const { interaction, dependencies } = setup();
  interaction.attachmentSizeLimit = 500;
  const small = { ...file, file: "small.gif", bytes: 400, width: 640, height: 360, lastFrame: "small-final.png" };
  await playGachaPreview(interaction, { ...animation, gifs: [file, small] }, items, dependencies);
  expect(dependencies.readGif).toHaveBeenCalledWith(small);
  expect(dependencies.renderResult).toHaveBeenCalledWith("small-final.png", items);
});

it("shows a static result when no GIF fits, without an upload or timer", async () => {
  const { interaction, dependencies } = setup(); interaction.attachmentSizeLimit = 500;
  expect(await playGachaPreview(interaction, animation, items, dependencies)).toEqual({ animated: false, durationMs: 0 });
  expect(dependencies.readGif).not.toHaveBeenCalled(); expect(dependencies.sleep).not.toHaveBeenCalled();
  expect(interaction.editReply).toHaveBeenCalledTimes(1);
});

it("still delivers the prepared result if the GIF upload fails", async () => {
  const { interaction, dependencies } = setup();
  interaction.editReply.mockRejectedValueOnce(new Error("upload failed"));
  await playGachaPreview(interaction, animation, items, dependencies);
  expect(dependencies.sleep).not.toHaveBeenCalled();
  expect(interaction.editReply.mock.calls[1][0].files[0].name).toBe("gacha-result.png");
});

it("does not start playback if result generation fails", async () => {
  const { interaction, dependencies } = setup(); dependencies.renderResult.mockRejectedValue(new Error("missing portrait"));
  await expect(playGachaPreview(interaction, animation, items, dependencies)).rejects.toThrow("missing portrait");
  expect(interaction.editReply).not.toHaveBeenCalled(); expect(dependencies.sleep).not.toHaveBeenCalled();
});

it("keeps simultaneous invocations independent", async () => {
  const one = setup(), two = setup(), firstTimer = pending(), secondTimer = pending();
  one.dependencies.sleep.mockImplementationOnce(() => firstTimer.promise);
  two.dependencies.sleep.mockImplementationOnce(() => secondTimer.promise);
  const a = playGachaPreview(one.interaction, animation, items, one.dependencies);
  const b = playGachaPreview(two.interaction, animation, items, two.dependencies);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  secondTimer.resolve(); await b;
  expect(two.interaction.editReply).toHaveBeenCalledTimes(2); expect(one.interaction.editReply).toHaveBeenCalledTimes(1);
  firstTimer.resolve(); await a; expect(one.interaction.editReply).toHaveBeenCalledTimes(2);
});

it("rejects count mismatches before publishing any attachment", async () => {
  const { interaction, dependencies } = setup();
  await expect(playGachaPreview(interaction, animation, gachaPreviewItems("ten"), dependencies)).rejects.toThrow("ranks differ");
  expect(interaction.editReply).not.toHaveBeenCalled();
});

it("keys animations by pull count and rank counts without mutating item order", () => {
  const ten = gachaPreviewItems("ten").reverse(), before = ten.map(i => i.id);
  expect(gachaCacheKey(ten)).toBe("ten-s01-a02-b07"); expect(gachaCacheKey(items)).toBe("single-s");
  expect(gachaRanks(ten)).toBe("SAABBBBBBB"); expect(ten.map(i => i.id)).toEqual(before);
  expect(() => gachaRanks([])).toThrow(); expect(() => gachaRanks([{ rank: "X" as "S" }])).toThrow();
});

it("acknowledges the preview publicly before account or locale work", () => {
  expect(getInteractionPreflight({ commandName: command.data.name })).toEqual({ deferBeforeDrain: true, skipPendingLoginDrain: true, skipLocaleLookup: true });
  expect(getCommandAckPlan(command)).toEqual({ shouldDefer: true, ephemeral: false, usesModal: false });
  expect(command.data.toJSON().options).toHaveLength(1);
});
