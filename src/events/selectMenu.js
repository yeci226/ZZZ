import { client } from "../index.js";
import {
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} from "discord.js";
import {
  getUserLang,
  getNewsList,
  getPostFull,
  parsePostContent,
  getRandomColor,
  getUserZZZData,
  drawInQueueReply,
  getUserHoyolabData,
} from "../utilities/utilities.js";
import { handleSignalLogDraw } from "../utilities/zzz/gacha.js";
import { drawMainImage, drawCharacterImage } from "../utilities/zzz/profile.js";
import { createTranslator, toI18nLang } from "../utilities/core/i18n.js";
import Queue from "queue";
import emoji from "../assets/emoji.js";
const db = client.db;
const drawQueue = new Queue({ autostart: true });
const elementId = {
  200: "physic",
  201: "fire",
  202: "ice",
  203: "thunder",
  205: "ether",
};

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  await interaction.update({ fetchReply: true }).catch(() => {});
  const { locale, customId } = interaction;
  const userLocale =
    (await getUserLang(interaction.user.id)) || toI18nLang(locale) || "en";
  const tr = createTranslator(userLocale);

  if (customId == "profile_CharacterMindScape") {
    handleMindScapeChange(interaction, tr);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  const { locale, customId, values } = interaction;
  const userLocale =
    (await getUserLang(interaction.user.id)) || toI18nLang(locale) || "en";
  const tr = createTranslator(userLocale);

  if (!customId.startsWith("account"))
    await interaction.update({ fetchReply: true }).catch(() => {});
  if (customId.startsWith("news")) handleNews(interaction, tr, values[0]);
  if (customId.startsWith("account"))
    handleAccountAction(interaction, tr, customId, values[0]);
  if (customId == "profile_SelectCharacter")
    handleSelectCharacter(interaction, tr, values[0], userLocale);
  // if (customId == "signalLogSelect")
  //   handleSignalLogDraw(interaction, tr, userLocale, values[0], values[1]); //interaction, tr, userLocale, type = "character", url
});

async function handleMindScapeChange(interaction) {
  const [row1, row2] = interaction.message.components;

  const mindScapeKey = `${interaction.user.id}.mindscape`;
  const mindScape = (await db.get(mindScapeKey)) ?? true;

  row2.components = row2.components.map((button) =>
    button.customId === interaction.customId
      ? ButtonBuilder.from(button).setStyle(
          mindScape ? ButtonStyle.Secondary : ButtonStyle.Success
        )
      : button
  );

  await interaction.message.edit({ components: [row1, row2] });
  await db.set(mindScapeKey, !mindScape);
}

async function handleSelectCharacter(interaction, tr, value, userLocale) {
  const drawTask = async () => {
    try {
      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(tr("Searching"))
            .setColor(getRandomColor())
            .setImage(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif"
            ),
        ],
        components: [],
        fetchReply: true,
      });

      const requestStartTime = Date.now();
      const [userId, characterId] = value.split("-");
      const zzz = await getUserZZZData(interaction, tr, userId, userLocale);
      if (!zzz) return;

      const characters = await zzz.record.characters();
      const requestEndTime = Date.now();
      const drawStartTime = Date.now();
      let imageBuffer;

      if (characterId == "main") {
        const record = await zzz.record.records();
        const userData = await getUserHoyolabData(interaction, tr, userId);
        imageBuffer = await drawMainImage(tr, userLocale, userData, record);
      } else {
        imageBuffer = await drawCharacterImage(
          interaction,
          tr,
          userLocale,
          zzz.uid,
          (await zzz.record.character(characterId))[0]
        );
      }

      if (!imageBuffer) throw new Error(tr("profile_NoImageData"));
      const drawEndTime = Date.now();

      const image = new AttachmentBuilder(imageBuffer, {
        name: `CharacterPage_${zzz.uid}.png`,
      });

      const userMindScape =
        (await db.get(`${interaction.user.id}.mindscape`)) ?? true;
      const rowSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setPlaceholder(tr("profile_SelectCharacter"))
          .setCustomId("profile_SelectCharacter")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            characterId === "main"
              ? characters.map((character) => ({
                  emoji: emoji[elementId[character.element_type]],
                  label: `${character.name_mi18n}`,
                  value: `${userId}-${character.id}`,
                }))
              : [
                  {
                    emoji: emoji.avatarIcon,
                    label: tr("MainPage"),
                    value: `${userId}-main`,
                  },
                  ...characters.map((character) => ({
                    emoji: emoji[elementId[character.element_type]],
                    label: `${character.name_mi18n}`,
                    description: `${tr("profile_CharactersFormat", {
                      level: character.level,
                      rank: character.rank,
                    })}`,
                    value: `${userId}-${character.id}`,
                  })),
                ]
          )
      );
      const rowMindScape = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("profile_CharacterMindScape")
          .setLabel(tr("MindScape"))
          .setStyle(userMindScape ? ButtonStyle.Success : ButtonStyle.Secondary)
      );

      interaction.editReply({
        embeds: [
          new EmbedBuilder().setImage(`attachment://${image.name}`).setFooter({
            text: tr("CostTime", {
              requestTime: ((requestEndTime - requestStartTime) / 1000).toFixed(
                2
              ),
              drawTime: ((drawEndTime - drawStartTime) / 1000).toFixed(2),
            }),
          }),
        ],
        components: [rowSelect, rowMindScape],
        files: [image],
      });
    } catch (error) {
      console.log(error);
      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#E76161")
            .setTitle(tr("DrawError"))
            .setDescription(`\`${error}\``)
            .setThumbnail(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png"
            ),
        ],
        fetchReply: true,
      });
    }
  };

  drawQueue.push(drawTask);

  if (drawQueue.length !== 1) {
    drawInQueueReply(
      interaction,
      tr("DrawInQueue", { position: drawQueue.length - 1 })
    );
  }
}

async function handleAccountAction(interaction, tr, customId, value) {
  const account = await db.get(`${interaction.user.id}.account`);
  if (!account)
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setConfig("#E76161", "sob")
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
      const userAccountCookie = accountData.cookie;
      const cookieObject = {
        ltoken: "",
        ltuid: "",
        cookieToken: "",
        accountMid: "",
      };

      const keyMap = {
        ltoken_v2: "ltoken",
        ltuid_v2: "ltuid",
        cookie_token_v2: "cookieToken",
        account_mid_v2: "accountMid",
      };

      userAccountCookie.split("; ").reduce((obj, cookie) => {
        const [key, value] = cookie.split("=");
        if (key in keyMap) {
          obj[keyMap[key]] = value;
        }
        return obj;
      }, cookieObject);

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
                .setValue(cookieObject.ltoken || "")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0)
                .setMaxLength(1000)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("ltuid")
                .setLabel("ltuid_v2")
                .setPlaceholder("30...")
                .setValue(cookieObject.ltuid || "")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0)
                .setMaxLength(30)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("cookieToken")
                .setLabel("cookie_token_v2")
                .setPlaceholder("v2_...")
                .setValue(cookieObject.cookieToken || "")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0)
                .setMaxLength(1000)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("accountMid")
                .setLabel("account_mid_v2")
                .setPlaceholder("1lyq...")
                .setValue(cookieObject.accountMid || "")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0)
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
          .setConfig("#F6F1F1", "wiggle")
          .setTitle(`${tr("account_DeletedSuccess")} \`${uid}\``),
      ],
      components: [],
      ephemeral: true,
    });
    return;
  } else if (interaction.customId == "account_SetUserCookieSelect") {
    const accountIndex = value;
    const userAccountCookie = account[accountIndex].cookie;
    const cookieObject = {
      ltoken: "",
      ltuid: "",
      cookieToken: "",
      accountMid: "",
    };

    const keyMap = {
      ltoken_v2: "ltoken",
      ltuid_v2: "ltuid",
      cookie_token_v2: "cookieToken",
      account_mid_v2: "accountMid",
    };

    userAccountCookie.split("; ").reduce((obj, cookie) => {
      const [key, value] = cookie.split("=");
      if (key in keyMap) {
        obj[keyMap[key]] = value;
      }
      return obj;
    }, cookieObject);

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
              .setValue(cookieObject.ltoken || "")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(0)
              .setMaxLength(1000)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ltuid")
              .setLabel("ltuid_v2")
              .setPlaceholder("30...")
              .setValue(cookieObject.ltuid || "")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(0)
              .setMaxLength(30)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("cookieToken")
              .setLabel("cookie_token_v2")
              .setPlaceholder("v2_...")
              .setValue(cookieObject.cookieToken || "")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(0)
              .setMaxLength(1000)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("accountMid")
              .setLabel("account_mid_v2")
              .setPlaceholder("1lyq...")
              .setValue(cookieObject.accountMid || "")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(0)
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
              : (content.slice(0, 4096 - 3).concat("...") ?? tr("None"))
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
