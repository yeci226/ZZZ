import {
  CommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("news")
    .setDescription("Get the latest news from the offical")
    .setNameLocalizations({
      "zh-TW": "新聞",
      vi: "tintức",
      fr: "journaux",
    })
    .setDescriptionLocalizations({
      "zh-TW": "從官方獲取最新消息",
      vi: "nhận tin tức chính thức mới nhất",
      fr: "Obtenez les dernières nouvelles",
    }),
  /**
   *
   * @param {Client} client
   * @param {CommandInteraction} interaction
   * @param {String[]} args
   */
  async execute(client, interaction, args, tr) {
    interaction.reply({
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(tr("news_SelectType"))
            .setCustomId("news_type")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              {
                label: tr("news_Notice"),
                emoji: "🔔",
                value: "1",
              },
              {
                label: tr("news_Events"),
                emoji: "🔥",
                value: "2",
              },
              {
                label: tr("news_Info"),
                emoji: "🗞️",
                value: "3",
              }
            )
        ),
      ],
    });
  },
};
