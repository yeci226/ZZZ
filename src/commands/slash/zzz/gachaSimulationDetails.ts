import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction, type Client } from "discord.js";
import { configuredSimulationBanner, getSimulationCatalog, selectSimulationBanner } from "../../../utilities/zzz/gachaSimulationCatalog.js";
import { getGachaSimulationStore } from "../../../utilities/zzz/gachaSimulationStore.js";
import { createDetailsPanel, detailsPayload } from "../../../utilities/zzz/gachaSimulationDetailsUi.js";
import { privateReply } from "../../../utilities/zzz/gachaSimulationUi.js";
export default {
  autoDefer: true, ephemeral: true,
  data: new SlashCommandBuilder().setName("gacha-simulation-details")
    .setNameLocalizations({ "zh-TW": "模擬調頻詳情" })
    .setDescription("查看調頻紀錄、保底進度、統計圖表與資源試算")
    .addStringOption(o => o.setName("banner").setNameLocalizations({ "zh-TW": "卡池" }).setDescription("搜尋當期或過往卡池；預設最新角色池").setAutocomplete(true)),
  async execute(_client: Client, interaction: ChatInputCommandInteraction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const store = getGachaSimulationStore(), catalog = getSimulationCatalog();
    const banner = configuredSimulationBanner(selectSimulationBanner(catalog, interaction.options.getString("banner")), store.preferences(interaction.user.id), catalog);
    const panel = createDetailsPanel(store, interaction.user.id, banner);
    panel.value.applicationId = interaction.applicationId; store.savePanel(panel);
    await privateReply(interaction, await detailsPayload(store, panel));
  },
};
