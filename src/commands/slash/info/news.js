const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

module.exports = {
  name: "news",
  description: "Get the latest news from the offical",
  name_localizations: {
    "zh-TW": "新聞",
  },
  description_localizations: {
    "zh-TW": "從官方獲取最新消息",
  },

  run: async (client, interaction, args, tr) => {
    interaction.reply({
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(`${tr("news_seltype")}`)
            .setCustomId("news_type")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              {
                label: `${tr("news_notice")}`,
                emoji: "🔔",
                value: "1",
              },
              {
                label: `${tr("news_events")}`,
                emoji: "🔥",
                value: "2",
              },
              {
                label: `${tr("news_info")}`,
                emoji: "🗞️",
                value: "3",
              }
            )
        ),
      ],
    });
  },
};
