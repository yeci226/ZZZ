import { uiText } from "../settings/presentation.js";
import { getUserLang } from "../utilities.js";
import { MessageFlags, type ButtonInteraction, type ModalSubmitInteraction, type StringSelectMenuInteraction } from "discord.js";
import { getGachaSimulationStore } from "./gachaSimulationStore.js";
import { createSettingsPanel, settingsAction, settingsPayload } from "./gachaSimulationSettingsUi.js";
import { createDetailsPanel, detailsAction, detailsPayload } from "./gachaSimulationDetailsUi.js";
import { createResourcePanel, resourceAction, resourcePayload } from "./gachaSimulationResourceUi.js";
import { privateReply } from "./gachaSimulationUi.js";

const settingsInFlight = new Set<string>();
type PanelInteraction = ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction;
export async function handleGachaSimulationPanel(interaction: PanelInteraction) {
  const store = getGachaSimulationStore(), owner = interaction.user.id;
  try {
    const source = /^gsim:(settings|details):([a-f0-9]{24})$/.exec(interaction.customId);
    if (source) {
      const session = store.get(source[2]);
      if (!session || session.ownerId !== owner) throw new Error("只有發起這次調頻的人可以操作，請用自己的模擬調頻指令。");
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const panel = source[1] === "settings" ? createSettingsPanel(store, owner, session.banner) : createDetailsPanel(store, owner, session.banner, session);
      panel.value.locale = (await getUserLang(owner)) || interaction.locale; panel.value.applicationId = interaction.applicationId; store.savePanel(panel);
      await privateReply(interaction, source[1] === "settings" ? await settingsPayload(store, panel) : await detailsPayload(store, panel));
      return;
    }
    const match = /^gsim:panel:([a-f0-9]{24}):([a-zA-Z0-9-]+)$/.exec(interaction.customId);
    if (!match) return;
    const panel = store.panel(match[1], owner), action = match[2];
    if (!panel) throw new Error("找不到此面板，請重新開啟自己的模擬調頻設定或詳情。");
    panel.value.locale = (await getUserLang(owner)) || interaction.locale; panel.value.applicationId = interaction.applicationId;
    if (action === "cancel") {
      await interaction.deferUpdate(); store.finishJob(panel.id, "cancelled");
      await interaction.followUp({ content: "已要求取消試算，日常進度未變更。", flags: MessageFlags.Ephemeral }); return;
    }
    if (store.jobStatus(panel.id) === "running" || (panel.value.running && Date.now() - panel.updatedAt < 120000)) throw new Error("試算執行中，請等待完成或按取消。");
    if (["resource", "settings", "details"].includes(action) && interaction.isButton()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const banner = panel.value.banner;
      const next = action === "resource" ? createResourcePanel(store, owner, banner) : action === "settings" ? createSettingsPanel(store, owner, banner) : createDetailsPanel(store, owner, banner);
      next.value.locale = (await getUserLang(owner)) || interaction.locale; next.value.applicationId = interaction.applicationId; store.savePanel(next);
      await privateReply(interaction, action === "resource" ? await resourcePayload(store, next) : action === "settings" ? await settingsPayload(store, next) : await detailsPayload(store, next)); return;
    }
    if (panel.kind === "bulk" && action === "export") { await interaction.deferUpdate(); await interaction.followUp({ flags: 64, files: [{ attachment: Buffer.from(JSON.stringify(panel.value, null, 2)), name: "bulk-simulation.json" }] }); return; }
    if (panel.kind === "settings") {
      if (settingsInFlight.has(panel.id)) { await interaction.reply({ content: uiText(panel.value.locale, "busy"), flags: MessageFlags.Ephemeral }); return; }
      settingsInFlight.add(panel.id);
      try { await settingsAction(store, panel, action, interaction); } finally { settingsInFlight.delete(panel.id); }
    }
    else if (panel.kind === "details") await detailsAction(store, panel, action, interaction);
    else if (panel.kind === "resource") await resourceAction(store, panel, action, interaction);
  } catch (error) {
    const payload = { content: error instanceof Error ? error.message : "操作暫時無法完成，請重試。", flags: MessageFlags.Ephemeral as const, allowedMentions: { parse: [] as never[] } };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
}
