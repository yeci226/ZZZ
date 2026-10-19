import type { InteractionEditReplyOptions } from "discord.js";
import { setTimeout as delay } from "node:timers/promises";
import { gachaRanks, readGachaGif, type GachaAnimation, type GachaResultItem } from "./gachaAnimationCache.js";
import { renderGachaResult } from "./gachaResultImage.js";

interface PlaybackInteraction {
  deferred: boolean;
  replied: boolean;
  attachmentSizeLimit: number;
  deferReply(): Promise<unknown>;
  editReply(options: InteractionEditReplyOptions): Promise<unknown>;
}
interface PlaybackDependencies {
  sleep?: (milliseconds: number) => Promise<unknown>;
  renderResult?: typeof renderGachaResult;
  readGif?: typeof readGachaGif;
}

/** Upload once, then replace that same response. Each invocation owns its timer. */
export async function playGachaPreview(
  interaction: PlaybackInteraction,
  animation: GachaAnimation,
  items: readonly GachaResultItem[],
  dependencies: PlaybackDependencies = {},
): Promise<{ animated: boolean; durationMs: number }> {
  if (animation.ranks !== gachaRanks(items)) throw new Error("Animation and result ranks differ");
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
  const limit = Number.isFinite(interaction.attachmentSizeLimit) && interaction.attachmentSizeLimit > 0 ? interaction.attachmentSizeLimit : 10 * 1024 * 1024;
  // Keep the preview's conservative 20 MB delivery budget, within the real interaction limit.
  const gif = [...animation.gifs].filter(f => f.bytes <= Math.min(limit, 20_000_000)).sort((a, b) => b.width * b.height - a.width * a.height || b.fps - a.fps)[0];
  // Prepare the PNG first, so rendering never delays the end of playback.
  const result = await (dependencies.renderResult || renderGachaResult)(gif?.lastFrame || animation.lastFrame, items);
  if (result.length > limit) throw new Error("結果圖片超過這個頻道的附件上限。");
  const resultPayload = (note = ""): InteractionEditReplyOptions => ({
    content: note,
    attachments: [],
    files: [{ attachment: result, name: "gacha-result.png" }],
    embeds: [{ title: "模擬調頻結果", description: items.map(i => `${i.rank} · ${i.name}`).join("　"), image: { url: "attachment://gacha-result.png" }, footer: { text: "展示用固定結果" } }],
    components: [], allowedMentions: { parse: [] },
  });
  if (!gif) {
    await interaction.editReply(resultPayload("此頻道的附件上限不足以播放動畫，已直接顯示結果。"));
    return { animated: false, durationMs: 0 };
  }
  const data = await (dependencies.readGif || readGachaGif)(gif);
  try {
    await interaction.editReply({
      content: "", attachments: [], files: [{ attachment: data, name: "gacha-animation.gif" }],
      embeds: [{ title: "模擬調頻", description: "正在搜尋訊號…", image: { url: "attachment://gacha-animation.gif" }, footer: { text: "展示用固定結果" } }],
      components: [], allowedMentions: { parse: [] },
    });
  } catch {
    await interaction.editReply(resultPayload("動畫上傳失敗，已直接顯示結果。"));
    return { animated: false, durationMs: 0 };
  }
  // Start after Discord acknowledges the GIF upload. Clients do not report playback completion.
  await (dependencies.sleep || delay)(gif.durationMs + 750);
  await interaction.editReply(resultPayload());
  return { animated: true, durationMs: gif.durationMs };
}
