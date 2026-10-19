import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { loadGachaAnimation } from "../../../utilities/zzz/gachaAnimationCache.js";
import { playGachaPreview } from "../../../utilities/zzz/gachaPlayback.js";
import { gachaPreviewItems } from "../../../utilities/zzz/gachaPreviewSamples.js";

export default {
  developmentOnly: true,
  autoDefer: true,
  ephemeral: false,
  data: new SlashCommandBuilder()
    .setName("gacha-preview")
    .setNameLocalizations({ "zh-TW": "抽卡預覽", "zh-CN": "抽卡预览" })
    .setDescription("Preview the gacha animation and result image with fixed sample results")
    .setDescriptionLocalizations({ "zh-TW": "用固定範例預覽抽卡動畫與結果圖片" })
    .addStringOption(option => option.setName("mode")
      .setNameLocalizations({ "zh-TW": "模式", "zh-CN": "模式" })
      .setDescription("Choose a sample").setRequired(true)
      .addChoices(
        { name: "S single", name_localizations: { "zh-TW": "S 級單抽" }, value: "single" },
        { name: "1S / 2A / 7B ten-pull", name_localizations: { "zh-TW": "1S／2A／7B 十連抽" }, value: "ten" },
      )),
  async execute(_client: Client, interaction: ChatInputCommandInteraction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
    const mode = interaction.options.getString("mode", true);
    if (mode !== "single" && mode !== "ten") throw new Error("Unknown gacha preview mode");
    try {
      const items = gachaPreviewItems(mode);
      const animation = await loadGachaAnimation(items);
      await playGachaPreview(interaction, animation, items);
    } catch (error) {
      console.error("[gacha-preview]", error);
      // Replace the original response even if a previous upload already completed.
      await interaction.editReply({ content: "抽卡預覽暫時無法完成，請稍後重試。", attachments: [], embeds: [], components: [] });
    }
  },
};
