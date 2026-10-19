import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, type ChatInputCommandInteraction, type Client } from "discord.js";
import { assertSimulationAssets, configuredSimulationBanner, getSimulationCatalog, selectSimulationBanner } from "../../../utilities/zzz/gachaSimulationCatalog.js";
import { getGachaSimulationStore } from "../../../utilities/zzz/gachaSimulationStore.js";
import { playSimulation } from "../../../utilities/zzz/gachaSimulationPlayback.js";

export default {
  autoDefer: true,
  ephemeral: false,
  data: new SlashCommandBuilder().setName("gacha-simulate")
    .setNameLocalizations({ "zh-TW": "模擬調頻", "zh-CN": "模拟调频" })
    .setDescription("Simulate Signal Search with saved pity, animation, and result cards")
    .setDescriptionLocalizations({ "zh-TW": "模擬調頻：播放動畫、查看結果，並保存模擬保底進度" })
    .addStringOption(o => o.setName("banner").setNameLocalizations({ "zh-TW": "卡池", "zh-CN": "卡池" })
      .setDescription("Search current or past banners by version, banner, or featured character; defaults to latest")
      .setDescriptionLocalizations({ "zh-TW": "輸入版本、卡池或 UP 名稱搜尋當期／過往卡池；預設最新角色池" }).setAutocomplete(true))
    .addIntegerOption(o => o.setName("count").setNameLocalizations({ "zh-TW": "抽取次數", "zh-CN": "抽取次数" })
      .setDescription("Single or ten-pull (default: ten)").setDescriptionLocalizations({ "zh-TW": "單抽或十抽，預設十抽" })
      .addChoices({ name: "單抽", value: 1 }, { name: "十抽", value: 10 })),
  async execute(_client: Client, interaction: ChatInputCommandInteraction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
    try {
      const catalog = getSimulationCatalog();
      const store = getGachaSimulationStore(), preferences = store.preferences(interaction.user.id);
      const banner = configuredSimulationBanner(selectSimulationBanner(catalog, interaction.options.getString("banner")), preferences, catalog);
      const count = interaction.options.getInteger("count") ?? 10;
      if (count !== 1 && count !== 10) throw new Error("只能選擇單抽或十抽。");
      assertSimulationAssets(banner, catalog);
      const selected = store.rules(interaction.user.id, banner.pool, preferences.active[banner.pool]);
      const session = store.draw(interaction.user.id, interaction.id, banner, count, undefined, Date.now(), { rules: selected.rules, ruleVersion: selected.version, animation: preferences.animation });
      if (session.messageId) return;
      await playSimulation(session, catalog, store, {
        attachmentLimit: interaction.attachmentSizeLimit || 10 * 1024 * 1024,
        applicationId: interaction.applicationId, channelId: interaction.channelId, guildId: interaction.guildId,
        send: payload => interaction.editReply(payload),
      });
    } catch (error) {
      console.error("[gacha-simulate]", error);
      const message = error instanceof Error ? error.message : "調頻暫時無法完成，請稍後重試。";
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, attachments: [],
        components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(message))],
        allowedMentions: { parse: [] } });
    }
  },
};
