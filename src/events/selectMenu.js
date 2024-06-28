import { client } from "../index.js";
import {
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from "discord.js";
import {
  getNewsList,
  getPostFull,
  parsePostContent,
  getRandomColor,
} from "../utilities/utilities.js";
import { i18nMixin, toI18nLang } from "../utilities/core/i18n.js";

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  await interaction.deferUpdate();
  const tr = i18nMixin(toI18nLang(interaction.locale) || "en");

  if (interaction.customId == "news_type") {
    const type = interaction.values[0];
    const newsData = await getNewsList(interaction.locale.toLowerCase(), type);

    return interaction.editReply({
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(tr("news_SelectPost"))
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
                  description:
                    date.getUTCFullYear() +
                    tr("Year") +
                    (date.getUTCMonth() + 1) +
                    tr("Month") +
                    date.getUTCDate() +
                    tr("Day"),
                  value: `${data.post.post_id}`,
                };
              })
            )
        ),
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
      fetchReply: true,
    });
  } else if (interaction.customId == "news_post") {
    const postId = interaction.values[0];
    const postData = await getPostFull(
      interaction.locale.toLowerCase(),
      postId
    );
    const { post, user, image_list, cover_list } = postData.post;
    const content = await parsePostContent(post.content);
    const date = new Date(post.created_at * 1000);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(getRandomColor())
          .setAuthor({
            iconURL: user.avatar_url ?? "",
            name: user.nickname ?? "",
            url: `https://www.hoyolab.com/accountCenter?id=${user.uid}`,
          })
          .setTitle(post.subject ?? tr("None"))
          .setURL(`https://www.hoyolab.com/article/${post.post_id}`)
          .setDescription(
            content.length < 4096
              ? content
              : content.slice(0, 4096 - 3).concat("...") ?? tr("None")
          )
          .setFooter({
            text:
              date.getUTCFullYear() +
              tr("Year") +
              (date.getUTCMonth() + 1) +
              tr("Month") +
              date.getUTCDate() +
              tr("Day"),
          })
          .setImage(image_list[0]?.url ?? cover_list[0]?.url),
      ],
      fetchReply: true,
    });
  }
});
