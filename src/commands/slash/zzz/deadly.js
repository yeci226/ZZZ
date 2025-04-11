import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { handleDeadlyDraw } from "../../../utilities/zzz/deadly.js";
import { getUserZZZData, getUserLang } from "../../../utilities/utilities.js";

export default {
  data: new SlashCommandBuilder()
    .setName("deadlyassault")
    .setNameLocalizations({
      "zh-TW": "危局強襲戰",
      vi: "tấncôngsiêuphẩm",
      fr: "assautmortel",
    })
    .setDescription("Show user's Deadly Assault data")
    .setDescriptionLocalizations({
      "zh-TW": "顯示使用者的危局強襲戰資料",
      vi: "Hiển thị dữ liệu tấn công siêu phẩm của người dùng",
      fr: "Afficher les données de l'assaut mortel de l'utilisateur",
    })
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
    )
    .addStringOption((option) =>
      option
        .setName("schedule")
        .setNameLocalizations({
          "zh-TW": "時間",
          vi: "thờigian",
          fr: "temps",
        })
        .setDescription("...")
        .setRequired(false)
        .addChoices(
          {
            name: "Live",
            name_localizations: {
              "zh-TW": "本期",
              vi: "kỳhiện tại",
              fr: "période actuelle",
            },
            value: "1",
          },
          {
            name: "End",
            name_localizations: {
              "zh-TW": "上期",
              vi: "kỳtrước",
              fr: "période précédente",
            },
            value: "2",
          }
        )
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
    const schedule = parseInt(interaction.options.getString("schedule")) || 1;

    const zzz = await getUserZZZData(
      interaction,
      tr,
      targetUser.id,
      await getUserLang(interaction.user.id),
      accountIndex
    );
    if (zzz == null) return;

    await interaction.deferReply();
    handleDeadlyDraw(interaction, tr, targetUser, zzz, schedule);
  },
};
