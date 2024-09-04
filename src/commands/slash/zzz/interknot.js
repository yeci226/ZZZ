import {
  CommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { handleInterknotDraw } from "../../../utilities/zzz/interknot.js";
import { getUserLang } from "../../../utilities/utilities.js";
import { toI18nLang } from "../../../utilities/core/i18n.js";

export default {
  data: new SlashCommandBuilder()
    .setName("interknot")
    .setDescription(
      "The INTER-KNOT, also known as the Proxy Network, where everyone can read and write posts."
    )
    .setNameLocalizations({
      "zh-TW": "繩網",
    })
    .setDescriptionLocalizations({
      "zh-TW": "繩網，也稱為代理網絡，每個人都可以閱讀和發表帖子",
    }),

  /**
   *
   * @param {Client} client
   * @param {CommandInteraction} interaction
   * @param {String[]} args
   */
  async execute(client, interaction, args, tr, db, emoji) {
    await interaction.reply({
      content: "正在連線至繩網... 請稍後...",
      // ephemeral: true,
    });

    const userLocale =
      (await getUserLang(interaction.user.id)) ||
      toI18nLang(interaction.locale) ||
      "en";

    handleInterknotDraw(interaction, tr, userLocale);
  },
};
