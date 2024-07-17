import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { getShiyu } from "../../../utilities/zzz/shiyu.js";
import { getUserZZZData, getUserLang } from "../../../utilities/utilities.js";

export default {
  data: new SlashCommandBuilder()
    .setName("shiyu")
    .setDescription("saldsald")
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
    const targetUser = interaction.options.getUser("user") || interaction.user;

    const zzz = await getUserZZZData(
      interaction,
      tr,
      targetUser.id,
      await getUserLang(interaction.user.id)
    );
    if (!zzz) return;

    await interaction.deferReply();
    getShiyu(interaction, tr, targetUser, zzz);
  },
};
