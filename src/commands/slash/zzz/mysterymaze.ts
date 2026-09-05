import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  LocalizationMap,
  SlashCommandBuilder,
} from "discord.js";
import { QuickDB } from "quick.db";

import { getUserLang } from "../../../utilities/utilities.js";
import { buildMysteryMazeMessage } from "../../../utilities/zzz/mysteryMazeView.js";

export default {
  data: new SlashCommandBuilder()
    .setName("mysterymaze")
    .setDescription("View Mystery Maze overview and records")
    .setNameLocalizations({ "zh-TW": "迷宮詭域" } as LocalizationMap)
    .setDescriptionLocalizations({
      "zh-TW": "查看迷宮詭域總覽、收藏與關卡紀錄",
    } as LocalizationMap)
    .addStringOption((option) =>
      option
        .setName("account")
        .setDescription("Account")
        .setNameLocalizations({ "zh-TW": "帳號" } as LocalizationMap)
        .setAutocomplete(true),
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User")
        .setNameLocalizations({ "zh-TW": "使用者" } as LocalizationMap),
    ),

  async execute(
    _client: Client,
    interaction: ChatInputCommandInteraction,
    _args: any[],
    tr: any,
    _db: QuickDB,
  ) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const accountIndex = Number.parseInt(
      interaction.options.getString("account") || "0",
      10,
    );
    const locale = (await getUserLang(interaction.user.id)) || "tw";
    await interaction.deferReply();
    try {
      const payload = await buildMysteryMazeMessage(interaction, tr, locale, {
        invokerId: interaction.user.id,
        targetId: target.id,
        accountIndex,
        page: 0,
        mapId: "0",
        difficulty: 0,
        mapPage: 0,
      });
      if (payload) await interaction.editReply(payload);
    } catch (error: any) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#E76161")
            .setTitle("無法取得迷宮詭域資料")
            .setDescription(`\`${String(error?.message || error)}\``),
        ],
        components: [],
        files: [],
      });
    }
  },
};
