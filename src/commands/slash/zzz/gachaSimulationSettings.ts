import { getUserLang } from "../../../utilities/utilities.js";
import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction, type Client } from "discord.js";
import { configuredSimulationBanner, getSimulationCatalog, selectSimulationBanner } from "../../../utilities/zzz/gachaSimulationCatalog.js";
import { getGachaSimulationStore } from "../../../utilities/zzz/gachaSimulationStore.js";
import { createSettingsPanel, settingsPayload } from "../../../utilities/zzz/gachaSimulationSettingsUi.js";
import { privateReply } from "../../../utilities/zzz/gachaSimulationUi.js";
export default {
  autoDefer: true, ephemeral: true,
  data: new SlashCommandBuilder().setName("gacha-simulation-settings")
    .setNameLocalizations({ "zh-TW": "模擬調頻設定" })
    .setDescription("設定調頻機率、保底、非 UP 候選與動畫")
    .addStringOption(o => o.setName("banner").setNameLocalizations({ "zh-TW": "卡池" }).setDescription("搜尋當期或過往卡池；預設最新角色池").setAutocomplete(true)),
  async execute(_client: Client, interaction: ChatInputCommandInteraction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const store = getGachaSimulationStore(), catalog = getSimulationCatalog();
    const banner = selectSimulationBanner(catalog, interaction.options.getString("banner"));
    const panel = createSettingsPanel(store, interaction.user.id, banner);
    panel.value.locale = (await getUserLang(interaction.user.id)) || interaction.locale;
    panel.value.applicationId = interaction.applicationId; store.savePanel(panel);
    await privateReply(interaction, await settingsPayload(store, panel));
  },
};
