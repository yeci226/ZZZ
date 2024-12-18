import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { handleShiyuDraw } from "../../../utilities/zzz/shiyu.js";
import { getUserZZZData, getUserLang } from "../../../utilities/utilities.js";

export default {
  data: new SlashCommandBuilder()
    .setName("shiyu")
    .setDescription("saldsald")
    .addStringOption((option) =>
      option
        .setName("account")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "帳號",
          vi: "tàikhoản",
          fr: "compte",
        })
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "使用者",
          vi: "ngườidùng",
        })
        .setDescriptionLocalizations({
          "zh-TW": "...",
          vi: "...",
        })
        .setRequired(false)
    ),
  /**
   *
   * @param {Client} client
   * @param {CommandInteraction} interaction
   * @param {String[]} args
   */
  async execute(_client, interaction, _args, tr, db, emoji) {
    const accountIndex = interaction.options.getString("account") || 0;
    const targetUser = interaction.options.getUser("user") || interaction.user;

    const zzz = await getUserZZZData(
      interaction,
      tr,
      targetUser.id,
      await getUserLang(interaction.user.id),
      accountIndex
    );
    if (zzz == null) return;

    await interaction.deferReply();
    handleShiyuDraw(interaction, tr, targetUser, zzz);
  },
};
