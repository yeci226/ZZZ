const client = require("../index");
const {
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");
const { getNews } = require("../util/request");
const { i18nMixin, toI18nLang } = require("../util/i18n");

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  await interaction.deferUpdate();
  const tr = i18nMixin(toI18nLang(interaction.locale) || "en");

  if (interaction.customId == "news_type") {
    const type = interaction.values[0];
    const newsData = await getNews(interaction.locale.toLowerCase(), type);

    return interaction.message.edit({
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(`${tr("news_selpost")}`)
            .setCustomId("news_post")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              newsData.data.list.map((data, i) => {
                const date = new Date(data.post.created_at * 1000);
                return {
                  label: `${
                    data.post.subject.length < 100
                      ? data.post.subject
                      : data.post.subject.slice(0, 97).concat("...")
                  }`,
                  description: `${date.getUTCFullYear()} ${tr("year")} ${
                    date.getUTCMonth() + 1
                  } ${tr("month")} ${date.getUTCDate()} ${tr("day")}`,
                  value: `${type}-${i}`,
                };
              })
            )
        ),
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
  } else if (interaction.customId == "news_post") {
    const [type, index] = interaction.values[0].split("-");
    const newsData = await getNews(interaction.locale.toLowerCase(), type);
    const data = newsData.data.list[index];

    return interaction.message.edit({
      embeds: [
        new EmbedBuilder()
          .setAuthor({
            iconURL: data.user.avatar_url ?? "",
            name: data.user.nickname ?? "",
          })
          .setTitle(`${data.post.subject ?? `${tr("none")}`}`)
          .setDescription(
            `${
              data.post.content.length < 2000
                ? data.post.content
                : data.post.content.slice(0, 1997).concat("...") ??
                  `${tr("none")}`
            }`
          )
          .setImage(data.image_list[0]?.url ?? data.cover_list[0]?.url),
      ],
    });
  }
});
