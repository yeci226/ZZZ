import { client } from "../index.js";
import {
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  getUserLang,
  getNewsList,
  getPostFull,
  parsePostContent,
  getRandomColor,
} from "../utilities/utilities.js";
import { i18nMixin, toI18nLang } from "../utilities/core/i18n.js";

const db = client.db;

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  const { locale, customId, values } = interaction;
  const userLocale = await getUserLang(interaction.user.id);
  const tr = i18nMixin(userLocale || toI18nLang(locale) || "en");

  if (!customId.startsWith("account"))
    await interaction.update({ fetchReply: true }).catch(() => {});
  if (customId.startsWith("news")) handleNews(interaction, tr, values[0]);
  if (customId.startsWith("account"))
    handleAccountAction(interaction, tr, customId, values[0]);
});

async function handleAccountAction(interaction, tr, customId, value) {
  const account = await db.get(`${interaction.user.id}.account`);
  if (!account)
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#E76161")
          .setThumbnail(
            "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png"
          )
          .setTitle(`${tr("account_nonAcc")}`),
      ],
      ephemeral: true,
    });

  if (customId == "account_EditAccountSelect") {
    await interaction.update({ fetchReply: true }).catch(() => {});
    const accountIndex = value;
    interaction.editReply({
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(tr("account_SelectAccountEdit"))
            .setCustomId("account_EditAccountSelectType")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              {
                label: "UID",
                value: `uid-${accountIndex}`,
              },
              {
                label: "Cookie",
                value: `cookie-${accountIndex}`,
              }
            )
        ),
      ],
      fetchReply: true,
      ephemeral: true,
    });
    return;
  } else if (customId == "account_EditAccountSelectType") {
    const [type, accountIndex] = value.split("-");
    const accountData = account[accountIndex];

    if (type == "uid") {
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`accountEdit-${accountIndex}`)
          .setTitle(tr("account_SetUserID"))
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("uid")
                .setLabel(tr("account_SetUserIDDesc"))
                .setValue(accountData.uid || "")
                .setPlaceholder("e.g. 809279679")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(9)
                .setMaxLength(10)
            )
          )
      );
    } else if (type == "cookie") {
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`cookie_set-${accountIndex}`)
          .setTitle(tr("account_SetUserCookie"))
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("ltoken")
                .setLabel("ltoken_2")
                .setPlaceholder("v2_...")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMinLength(10)
                .setMaxLength(1000)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("ltuid")
                .setLabel("ltuid_v2")
                .setPlaceholder("30...")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMinLength(1)
                .setMaxLength(30)
            )
          )
      );
    }
  } else if (interaction.customId == "account_DeleteAccountSelect") {
    await interaction.update({ fetchReply: true }).catch(() => {});
    const accountIndex = value;
    const accounts = (await db.get(`${interaction.user.id}.account`)) ?? "";
    const uid = accounts[accountIndex].uid;

    if (accounts.length <= 1) await db.delete(`${interaction.user.id}.account`);
    else {
      accounts.splice(accountIndex, 1);
      await db.set(`${interaction.user.id}.account`, accounts);
    }

    interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("#F6F1F1")
          .setThumbnail(
            "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bd/Sticker_Set_1_Billy_wiggle.png/revision/latest?cb=20220617042050"
          )
          .setTitle(`${tr("account_DeletedSuccess")} \`${uid}\``),
      ],
      components: [],
      ephemeral: true,
    });
    return;
  } else if (interaction.customId == "account_SetUserCookieSelect") {
    const accountIndex = value;

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`cookie_set-${accountIndex}`)
        .setTitle(tr("account_SetUserCookie"))
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ltoken")
              .setLabel("ltoken_2")
              .setPlaceholder("v2_...")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMinLength(10)
              .setMaxLength(1000)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ltuid")
              .setLabel("ltuid_v2")
              .setPlaceholder("30...")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMinLength(1)
              .setMaxLength(30)
          )
        )
    );
  }
}

async function handleNews(interaction, tr, value) {
  if (interaction.customId == "news_type") {
    const type = value;
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
    const postId = value;
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
}
