import { client } from "../index.js";
import Logger from "../utilities/core/logger.js";
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
  MessageFlags,
  BaseInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
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
import { drawMainImage, drawCharacterImage } from "../utilities/zzz/profile.js";
import { handleTeamDraw } from "../utilities/zzz/team.js";
import { createTranslator, toI18nLang } from "../utilities/core/i18n.js";
import Queue from "queue";
import emoji from "../assets/emoji.js";
// Use client.db directly
const drawQueue = new Queue({ autostart: true });
const elementId: Record<string, string> = {
  "200": "physic",
  "201": "fire",
  "202": "ice",
  "203": "thunder",
  "205": "ether",
};

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
  if (!interaction.isButton()) return;
  const buttonInteraction = interaction as ButtonInteraction;
  const { locale, customId } = buttonInteraction;
  const userLocale =
    (await getUserLang(buttonInteraction.user.id)) ||
    toI18nLang(locale) ||
    "en";
  const tr = createTranslator(userLocale);

  // Buttons that show a modal must NOT call deferUpdate first
  if (customId === "account_OpenEmailVerifyModal") {
    const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = await import("discord.js");
    const modal = new ModalBuilder()
      .setCustomId("account_EmailVerifyModal")
      .setTitle("輸入 Email 驗證碼")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("emailCode")
            .setLabel("Hoyoverse 寄給你的 6 位數驗證碼")
            .setPlaceholder("123456")
            .setMinLength(6)
            .setMaxLength(6)
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    return buttonInteraction.showModal(modal);
  }

  await buttonInteraction.deferUpdate().catch(() => {});

  if (customId == "profile_CharacterMindScape") {
    handleMindScapeChange(buttonInteraction, tr);
  }

  if (customId.startsWith("profile_MainPage-")) {
    handleProfileMainPage(buttonInteraction, tr, userLocale);
  }

  if (customId === "settings_togglePainting" || customId === "settings_toggleRankPainting") {
    handleSettingsToggle(buttonInteraction, customId, tr);
  }
});

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
  if (!interaction.isStringSelectMenu()) return;
  const selectInteraction = interaction as StringSelectMenuInteraction;
  const { locale, customId, values } = selectInteraction;
  const userLocale =
    (await getUserLang(selectInteraction.user.id)) ||
    toI18nLang(locale) ||
    "en";
  const tr = createTranslator(userLocale);

  if (!customId.startsWith("account"))
    await selectInteraction.deferUpdate().catch(() => {});
  if (customId.startsWith("news")) handleNews(selectInteraction, tr, values[0]);
  if (customId.startsWith("account"))
    handleAccountAction(selectInteraction, tr, customId, values[0]);
  if (customId.startsWith("profile_SelectCharacter"))
    handleSelectCharacter(selectInteraction, tr, values, userLocale);
  if (customId === "settings_selectLocale")
    handleSettingsLocale(selectInteraction, values[0], tr);
});

async function handleMindScapeChange(interaction: ButtonInteraction, tr: any) {
  const [row1, row2] = interaction.message.components as any[];

  const mindScapeKey = `${interaction.user.id}.mindscape`;
  const mindScape = (await client.db.get(mindScapeKey)) ?? true;

  row2.components = row2.components.map((button: any) =>
    button.customId === interaction.customId
      ? ButtonBuilder.from(button as any).setStyle(
          mindScape ? ButtonStyle.Secondary : ButtonStyle.Success,
        )
      : button,
  );

  await interaction.message.edit({ components: [row1, row2] });
  await client.db.set(mindScapeKey, !mindScape);
}

async function handleSettingsToggle(
  interaction: ButtonInteraction,
  customId: string,
  tr: any,
) {
  const userId = interaction.user.id;
  const dbKey = customId === "settings_togglePainting" ? `${userId}.paintingMode` : `${userId}.rankPainting`;
  const current: boolean = (await client.db.get(dbKey)) ?? false;
  await client.db.set(dbKey, !current);

  // Rebuild the settings message with updated values
  const { buildSettingsComponents } = await import("../commands/slash/settings.js");
  // tr may reflect old locale; re-derive from DB to be safe
  const userLocale = (await getUserLang(userId)) || "en";
  const newTr = createTranslator(userLocale);
  const { container } = await buildSettingsComponents(userId, newTr);

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2 as any,
    components: [container],
  });
}

async function handleSettingsLocale(
  interaction: StringSelectMenuInteraction,
  locale: string,
  _tr: any,
) {
  const userId = interaction.user.id;
  await client.db.set(`${userId}.locale`, locale);

  const newTr = createTranslator(locale);
  const { buildSettingsComponents } = await import("../commands/slash/settings.js");
  const { container } = await buildSettingsComponents(userId, newTr);

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2 as any,
    components: [container],
  });
}

function buildProfileCharacterSelectRows(
  tr: any,
  characters: any[],
  userId: string,
  accountIndex: string | number,
) {
  const allCharacterOptions = characters.map((character: any) => ({
    emoji: (emoji as any)[elementId[character.element_type]],
    label: `${character.name_mi18n}`,
    description: `${tr("profile_CharactersFormat", {
      level: character.level,
      rank: character.rank,
    })}`,
    value: `${userId}-${accountIndex}-${character.id}`,
  }));

  const optionChunks = Array.from(
    { length: Math.ceil(allCharacterOptions.length / 25) },
    (_, index) => allCharacterOptions.slice(index * 25, (index + 1) * 25),
  );

  return optionChunks.slice(0, 4).map((optionsChunk, index) =>
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setPlaceholder(`${tr("profile_SelectCharacter")} (${index + 1})`)
        .setCustomId(`profile_SelectCharacter-${index}`)
        .setMinValues(1)
        .setMaxValues(Math.min(3, optionsChunk.length))
        .addOptions(optionsChunk),
    ),
  ) as any[];
}

async function handleProfileMainPage(
  interaction: ButtonInteraction,
  tr: any,
  userLocale: string,
) {
  try {
    const [, , userId, accountIndexRaw] = interaction.customId.split("-");
    const accountIndex = parseInt(accountIndexRaw || "0");
    const zzz = await getUserZZZData(
      interaction as any,
      tr,
      userId,
      userLocale,
      accountIndex,
    );
    if (!zzz) return;

    const [record, characters, userData] = await Promise.all([
      zzz.record.records(),
      zzz.record.characters(),
      getUserHoyolabData(interaction as any, tr, userId),
    ]);

    const imageBuffer = await drawMainImage(tr, userLocale, userData, record);
    if (!imageBuffer) throw new Error(tr("profile_NoImageData"));

    const image = new AttachmentBuilder(imageBuffer as Buffer, {
      name: `MainImage_${zzz.uid}.png`,
    });
    const rowSelects = buildProfileCharacterSelectRows(
      tr,
      characters,
      userId,
      accountIndex,
    );

    await interaction.editReply({
      embeds: [],
      components: rowSelects,
      files: [image],
    });
  } catch (error) {
    console.log(error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("#E76161")
          .setTitle(tr("DrawError"))
          .setDescription(`\`${(error as Error).message}\``),
      ],
    });
  }
}

async function handleSelectCharacter(
  interaction: StringSelectMenuInteraction,
  tr: any,
  values: string[],
  userLocale: string,
) {
  const drawTask = async () => {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => {});
      }
      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(tr("Searching"))
            .setImage(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif",
            ),
        ],
        components: [],
      });

      const requestStartTime = Date.now();

      // Multi-select: use first value to get userId/accountIndex
      const [userId, accountIndex, firstCharacterId] = values[0]
        .split("-")
        .map((v) => v.trim());

      const zzz = await getUserZZZData(
        interaction as any,
        tr,
        userId,
        userLocale,
        parseInt(accountIndex),
      );
      if (!zzz) return;

      const characters = await zzz.record.characters();
      const requestEndTime = Date.now();
      const drawStartTime = Date.now();

      // Read painting preferences saved when /profile was invoked
      const usePainting: boolean =
        (await client.db.get(`${interaction.user.id}.paintingMode`)) ?? false;
      const rankPainting: boolean =
        (await client.db.get(`${interaction.user.id}.rankPainting`)) ?? false;

      // ── Multi-select (2–3 agents) → Team view ──
      const agentValues = values.filter((v) => !v.endsWith("-main"));
      if (agentValues.length >= 2) {
        const agentIds = agentValues.map((v) => v.split("-")[2]);
        const rowSelects = buildProfileCharacterSelectRows(
          tr,
          characters,
          userId,
          accountIndex,
        );
        const rowButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`profile_MainPage-${userId}-${accountIndex}`)
            .setLabel(tr("MainPage"))
            .setStyle(ButtonStyle.Secondary),
        ) as any;
        handleTeamDraw(
          interaction as any,
          tr,
          zzz,
          agentIds,
          null,
          usePainting,
          rankPainting,
          [...rowSelects, rowButtons],
        );
        return;
      }

      // ── Single select → Profile view ──
      const value = values[0];
      const characterId = firstCharacterId;
      let selectedCharacter = null;

      if (characterId !== "main") {
        // Manually fetch character details
        const record = zzz.record as any;
        const rawRes = await record.request
          .setQueryParams({
            server: record.region,
            role_id: record.uid,
            lang: record.lang,
            "id_list[]": characterId,
          })
          .send(
            "https://sg-public-api.hoyolab.com/event/game_record_zzz/api/zzz/avatar/info",
          );

        if (rawRes.response.retcode === 0 && rawRes.response.data) {
          const resData = rawRes.response.data as any;
          selectedCharacter = resData.avatar_list?.[0];
        }
      }

      let imageBuffer;

      if (characterId == "main") {
        const record = await zzz.record.records();
        const userData = await getUserHoyolabData(
          interaction as any,
          tr,
          userId,
        );
        imageBuffer = await drawMainImage(tr, userLocale, userData, record);
      } else {
        if (!selectedCharacter) throw new Error(tr("AccountNotFound"));

        imageBuffer = await drawCharacterImage(
          interaction,
          tr,
          userLocale,
          String(zzz.uid || ""),
          selectedCharacter,
          usePainting,
          rankPainting,
        );
      }

      if (!imageBuffer) throw new Error(tr("profile_NoImageData"));
      const drawEndTime = Date.now();

      const image = new AttachmentBuilder(imageBuffer as Buffer, {
        name: `CharacterPage_${zzz.uid}.png`,
      });

      // ── Build character options (no "main" entry — main is a button) ──
      const rowSelects = buildProfileCharacterSelectRows(
        tr,
        characters,
        userId,
        accountIndex,
      );

      const userMindScape =
        (await client.db.get(`${interaction.user.id}.mindscape`)) ?? true;

      // ── Button row: MindScape + MainPage (only when not on main) ──
      const buttons: any[] = [
        new ButtonBuilder()
          .setCustomId("profile_CharacterMindScape")
          .setLabel(tr("MindScape"))
          .setStyle(userMindScape ? ButtonStyle.Success : ButtonStyle.Secondary),
      ];
      if (characterId !== "main") {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`profile_MainPage-${userId}-${accountIndex}`)
            .setLabel(tr("MainPage"))
            .setStyle(ButtonStyle.Secondary),
        );
      }
      const rowButtons = new ActionRowBuilder().addComponents(...buttons) as any;

      interaction.editReply({
        embeds: [],
        components: [...rowSelects, rowButtons] as any[],
        files: [image],
      });
    } catch (error) {
      console.log(error);
      new Logger("系統").warn(`警告訊息：${error}`);
      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#E76161")
            .setTitle(tr("DrawError"))
            .setDescription(`\`${(error as Error).message}\``)
            .setThumbnail(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png",
            ),
        ],
      });
    }
  };

  drawQueue.push(drawTask);

  if (drawQueue.length !== 1) {
    drawInQueueReply(
      interaction as any,
      tr("DrawInQueue", { position: drawQueue.length - 1 }),
    );
  }
}

async function handleAccountAction(
  interaction: StringSelectMenuInteraction,
  tr: any,
  customId: string,
  value: string,
) {
  const account: any = await client.db.get(`${interaction.user.id}.account`);
  if (!account)
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setConfig("#E76161", "sob")
          .setTitle(`${tr("account_nonAcc")}`),
      ],
      flags: MessageFlags.Ephemeral,
    });

  if (customId == "account_EditAccountSelect") {
    await interaction.deferUpdate().catch(() => {});
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
              },
            ),
        ) as any,
      ],
      flags: MessageFlags.Ephemeral as any,
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
                .setMaxLength(10),
            ) as any,
          ),
      );
    } else if (type == "cookie") {
      const userAccountCookie = accountData.cookie || "";
      const parseCookie = (cookie: string, key: string) => {
        const match = cookie.match(new RegExp(`${key}=([^;]+)`));
        return match?.[1]?.trim() ?? "";
      };

      const ltokenV2 = parseCookie(userAccountCookie, "ltoken_v2");
      const ltuidV2 = parseCookie(userAccountCookie, "ltuid_v2");
      const cookieTokenV2 = parseCookie(userAccountCookie, "cookie_token_v2");
      const accountMidV2 = parseCookie(userAccountCookie, "account_mid_v2");

      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`cookie_set-${accountIndex}`)
          .setTitle(tr("account_SetUserCookie"))
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("ltoken_v2")
                .setLabel("ltoken_v2")
                .setValue(ltokenV2)
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("ltuid_v2")
                .setLabel("ltuid_v2")
                .setValue(ltuidV2)
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("cookie_token_v2")
                .setLabel("cookie_token_v2")
                .setValue(cookieTokenV2)
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("account_mid_v2")
                .setLabel("account_mid_v2")
                .setValue(accountMidV2)
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ) as any,
          ),
      );
    }
  } else if (interaction.customId == "account_DeleteAccountSelect") {
    await interaction.deferUpdate().catch(() => {});
    const accountIndex = value;
    const accounts =
      (await client.db.get(`${interaction.user.id}.account`)) ?? [];
    const uid = accounts[parseInt(accountIndex)].uid;

    if (accounts.length <= 1)
      await client.db.delete(`${interaction.user.id}.account`);
    else {
      accounts.splice(parseInt(accountIndex), 1);
      await client.db.set(`${interaction.user.id}.account`, accounts);
    }

    interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setConfig("#F6F1F1", "wiggle")
          .setTitle(`${tr("account_DeletedSuccess")} \`${uid}\``),
      ],
      components: [],
      flags: MessageFlags.Ephemeral as any,
    });
    return;
  } else if (interaction.customId == "account_SetUserCookieSelect") {
    const accountIndex = value;
    const userAccountCookie = account[accountIndex].cookie || "";
    const parseCookie = (cookie: string, key: string) => {
        const match = cookie.match(new RegExp(`${key}=([^;]+)`));
        return match?.[1]?.trim() ?? "";
    };

    const ltokenV2 = parseCookie(userAccountCookie, "ltoken_v2");
    const ltuidV2 = parseCookie(userAccountCookie, "ltuid_v2");
    const cookieTokenV2 = parseCookie(userAccountCookie, "cookie_token_v2");
    const accountMidV2 = parseCookie(userAccountCookie, "account_mid_v2");

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`cookie_set-${accountIndex}`)
        .setTitle(tr("account_SetUserCookie"))
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ltoken_v2")
              .setLabel("ltoken_v2")
              .setValue(ltokenV2)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ltuid_v2")
              .setLabel("ltuid_v2")
              .setValue(ltuidV2)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ) as any,
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("cookie_token_v2")
              .setLabel("cookie_token_v2")
              .setValue(cookieTokenV2)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("account_mid_v2")
              .setLabel("account_mid_v2")
              .setValue(accountMidV2)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        ) as any,
    );
  }
}

async function handleNews(
  interaction: StringSelectMenuInteraction,
  tr: any,
  value: string,
) {
  if (interaction.customId == "news_type") {
    const type = value;
    const newsData = await getNewsList(
      interaction.locale.toLowerCase(),
      parseInt(type),
    );

    return interaction.editReply({
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(tr("news_SelectPost"))
            .setCustomId("news_post")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              newsData.data.list.map((data: any, i: number) => {
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
              }),
            ),
        ) as any,
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
              },
            ),
        ),
      ],
    });
  } else if (interaction.customId == "news_post") {
    const postId = value;
    const postData = await getPostFull(
      interaction.locale.toLowerCase(),
      postId,
    );
    const { post, user, image_list, cover_list } = postData.post;
    const content = await parsePostContent(post.content);
    const date = new Date(post.created_at * 1000);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(getRandomColor() as any)
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
              : (content.slice(0, 4096 - 3).concat("...") ?? tr("None")),
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
    });
  }
}
