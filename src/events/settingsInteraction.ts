import { Events } from "discord.js";
import { client } from "../index.js";
import Logger from "../utilities/core/logger.js";
import { handleSettingPanel } from "../utilities/settings/panel.js";

const logger = new Logger("設定互動");
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isMessageComponent() || !interaction.customId.startsWith("settingui:")) return;
  const action = interaction.customId.split(":")[2];
  logger.info(`收到 ${action}（分片 ${interaction.guild?.shardId ?? "DM"}，延遲 ${Date.now() - interaction.createdTimestamp}ms）`);
  try {
    await handleSettingPanel(interaction);
  } catch (error) {
    const e = error as Error & { code?: string | number };
    logger.error(`${action}：${e.name} ${e.code ?? ""} ${e.message}`);
  }
});
