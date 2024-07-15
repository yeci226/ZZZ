import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { getUserZZZData } from "../../../utilities/utilities.js";
import { handleProfileDraw } from "../../../utilities/zzz/profile.js";

export default {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Query a player's profile")
    .setNameLocalizations({
      "zh-TW": "個人簡介",
    })
    .setDescriptionLocalizations({
      "zh-TW": "查詢玩家的個人簡介",
    })
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "使用者",
        })
        .setDescriptionLocalizations({
          "zh-TW": "...",
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

    const zzz = await getUserZZZData(interaction, tr, targetUser.id);
    if (!zzz) return;

    await interaction.deferReply();
    handleProfileDraw(interaction, tr, targetUser, zzz);
  },
};
