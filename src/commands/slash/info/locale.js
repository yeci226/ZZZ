import {
  CommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { i18nMixin, toI18nLang } from "../../../utilities/core/i18n.js";
import { getRandomColor, getUserLang } from "../../../utilities/utilities.js";

export default {
  data: new SlashCommandBuilder()
    .setName("locale")
    .setDescription("Set the language displayed by the bot")
    .setNameLocalizations({
      "zh-TW": "語言",
    })
    .setDescriptionLocalizations({
      "zh-TW": "設定機器人所顯示的語言",
    })
    .addStringOption((option) =>
      option
        .setName("locale")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "語言",
        })
        .setDescriptionLocalizations({
          "zh-TW": "...",
        })
        .setRequired(true)
        .addChoices(
          {
            name: "en",
            name_localizations: {
              "zh-TW": "英文",
            },
            value: "en",
          },
          {
            name: "tw",
            name_localizations: {
              "zh-TW": "中文(台灣)",
            },
            value: "tw",
          },
          {
            name: "cn",
            name_localizations: {
              "zh-TW": "中文(中國)",
            },
            value: "cn",
          }
        )
    ),
  /**
   *
   * @param {Client} client
   * @param {CommandInteraction} interaction
   * @param {String[]} args
   */
  async execute(client, interaction, args, tr, db) {
    const locale = interaction.options.getString("locale");

    await db.set(`${interaction.user.id}.locale`, locale);

    const userLocale = await getUserLang(interaction.user.id);
    const newTr = i18nMixin(userLocale || toI18nLang(locale) || "en");

    interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(getRandomColor())
          .setTitle(
            newTr("NewLocale", {
              locale:
                locale === "en"
                  ? "English"
                  : locale === "tw"
                    ? "中文(台灣)"
                    : "中文(中國)",
            })
          )
          .setThumbnail(
            "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bd/Sticker_Set_1_Billy_wiggle.png/revision/latest?cb=20220617042050"
          ),
      ],
      ephemeral: true,
    });
  },
};
