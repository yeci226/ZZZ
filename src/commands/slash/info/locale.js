import {
  CommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} from "discord.js";
import { createTranslator, toI18nLang } from "../../../utilities/core/i18n.js";
import { getRandomColor, getUserLang } from "../../../utilities/utilities.js";

const languages = {
  vi: "Tiếng Việt",
  cn: "简体中文",
  tw: "繁體中文",
  jp: "日本語",
  kr: "한국어",
  fr: "Français",
  default: "English",
};

export default {
  data: new SlashCommandBuilder()
    .setName("locale")
    .setDescription("Set the language displayed by the bot")
    .setNameLocalizations({
      "zh-TW": "語言",
      vi: "ngônngữ",
      fr: "langue",
    })
    .setDescriptionLocalizations({
      "zh-TW": "設定機器人所顯示的語言",
      vi: "Thiết lập ngôn ngữ của bot",
      fr: "Définissez la langue affichée par le bot",
    })
    .addStringOption((option) =>
      option
        .setName("locale")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "語言",
          vi: "ngônngữ",
          fr: "langue",
        })
        .setDescriptionLocalizations({
          "zh-TW": "...",
          vi: "...",
        })
        .setRequired(true)
        .addChoices(
          {
            name: "English",
            value: "en",
          },
          {
            name: "Français",
            value: "fr",
          },
          {
            name: "繁體中文",
            value: "tw",
          },
          {
            name: "简体中文",
            value: "cn",
          },
          {
            name: "日本語",
            value: "jp",
          },
          {
            name: "한국어",
            value: "kr",
          },
          {
            name: "Tiếng Việt",
            value: "vi",
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
    const newTr = createTranslator(userLocale || toI18nLang(locale) || "en");
    const selectedLanguage = languages[locale] || languages.default;

    interaction.reply({
      embeds: [
        new EmbedBuilder().setConfig(getRandomColor(), "wiggle").setTitle(
          newTr("NewLocale", {
            locale: selectedLanguage,
          })
        ),
      ],
      flags: MessageFlags.Ephemeral
    });
  },
};
