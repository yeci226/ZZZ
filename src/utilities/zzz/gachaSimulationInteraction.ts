import { MessageFlags, type ButtonInteraction } from "discord.js";
import { getSimulationCatalog, assertSimulationAssets } from "./gachaSimulationCatalog.js";
import { getGachaSimulationStore } from "./gachaSimulationStore.js";
import { playSimulation, skipSimulation } from "./gachaSimulationPlayback.js";
import { withoutSimulationContinuation } from "./gachaSimulationPresentation.js";

export async function handleGachaSimulationButton(interaction: ButtonInteraction) {
  const match = /^gsim:(skip|one|ten):([a-f0-9]{24})$/.exec(interaction.customId);
  if (!match) return;
  const [, action, id] = match;
  // Each click has a fresh interaction token, even on an old message. Acknowledge
  // it before opening SQLite or preparing assets; only this router owns gsim:.
  if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
  const reject = (content: string) => interaction.followUp({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  let continuationSaved = false;
  try {
    const store = getGachaSimulationStore(), session = store.get(id);
    if (!session) {
      await reject("找不到這則調頻的保存資料，請重新使用 /模擬調頻。保底與抽數仍會保留。"); return;
    }
    if (session.ownerId !== interaction.user.id) { await reject("只有發起這次調頻的人可以操作。請使用 /模擬調頻 開始自己的模擬。"); return; }
    if (session.messageId && session.messageId !== interaction.message.id) { await reject("調頻訊息不符，請重新使用 /模擬調頻。"); return; }
    const catalog = getSimulationCatalog();
    if (action === "skip") {
      await skipSimulation(session, catalog, store, interaction.message, interaction.attachmentSizeLimit || 10 * 1024 * 1024);
      return;
    }
    if (!session.finished) { await interaction.followUp({ content: "請先等待動畫結束，或按「跳過動畫」。", flags: MessageFlags.Ephemeral }); return; }
    assertSimulationAssets(session.banner, catalog);
    const next = store.continueDraw(session.id, interaction.user.id, interaction.id, action === "one" ? 1 : 10, {
      applicationId: interaction.applicationId, channelId: interaction.channelId, guildId: interaction.guildId,
      attachmentLimit: interaction.attachmentSizeLimit || 10 * 1024 * 1024, completeAt: Date.now(),
    });
    if (!next) {
      // Redelivery of the same interaction should not send a second response.
      if (store.byRequest(interaction.id)?.parentId === session.id) return;
      await reject("這組續抽按鈕已使用，請到最新的調頻結果繼續抽取。"); return;
    }
    continuationSaved = true;
    // Remove both choices before showing the next animation; only its eventual
    // result gets a new action row. The database claim already blocks races.
    await interaction.message.edit(withoutSimulationContinuation(interaction.message.components, session.id));
    await playSimulation(next, catalog, store, {
      attachmentLimit: interaction.attachmentSizeLimit || 10 * 1024 * 1024,
      applicationId: interaction.applicationId, channelId: interaction.channelId, guildId: interaction.guildId,
      send: payload => interaction.followUp({ ...payload, fetchReply: true }),
    });
  } catch (error) {
    console.error("[gacha-simulate] Button failed", error instanceof Error ? error.message : "Request failed");
    await reject(continuationSaved ? "續抽結果已保存，訊息暫時無法顯示，稍後會自動補送。" : error instanceof Error ? error.message : "調頻暫時無法完成。");
  }
}
