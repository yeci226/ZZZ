import { client } from "../index.js";
import { AxiosError } from "axios";
import { Events, EmbedBuilder } from "discord.js";
import { ZenlessZoneZero } from "hoyoapi";
import { getUserLang } from "../utilities/utilities.js";
import { createTranslator, toI18nLang } from "../utilities/core/i18n.js";

const db = client.db;

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  const { locale, customId, fields } = interaction;
  const userLocale =
    (await getUserLang(interaction.user.id)) || toI18nLang(locale) || "en";
  const tr = createTranslator(userLocale);

  if (customId.startsWith("accountEdit"))
    handleAccountEdit(interaction, tr, customId, fields);
  if (customId == "account_SetUserIDModal")
    handleUidSet(interaction, tr, fields);
  if (customId.startsWith("cookie_set"))
    handleCookieSet(interaction, tr, customId, fields);
});

async function handleAccountEdit(interaction, tr, customId, fields) {
  await interaction.deferReply({ ephemeral: true });
  const accountIndex = customId.split("-")[1];
  const uid = fields.getTextInputValue("uid");
  // const data = await requestPlayerData(uid, interaction);
  // if (!data.playerData?.player.uid)
  // 	return interaction.editReply({
  // 		embeds: [
  // 			new EmbedBuilder()
  //        .setConfig("#E76161", "sob")
  // 				.setTitle(tr("profile_UidNotFound") + " - " + uid)
  // 		]
  // 	});

  const accounts = (await db.get(`${interaction.user.id}.account`)) ?? "";

  if (accounts.some((account) => account.uid == uid))
    return interaction.editReply({
      embeds: [
        new EmbedBuilder().setConfig("#E76161", "sob").setTitle(
          tr("account_AlreadySet", {
            z: `${uid}`,
          })
        ),
      ],
    });

  accounts[accountIndex].uid = uid;

  interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setConfig("#F6F1F1", "wiggle")
        .setTitle(tr("account_UidSetSuccess", { z: `${uid}` })),
    ],
  });

  await db.set(`${interaction.user.id}.account`, accounts);
}

async function handleUidSet(interaction, tr, fields) {
  await interaction.deferReply({ ephemeral: true });
  const uid = fields.getTextInputValue("account_SetUserIDModalField");
  //   try {
  //     const data = await requestPlayerData(uid, interaction);
  //     if (!data.playerData?.player.uid)
  //       return interaction.editReply({
  //         embeds: [
  //           new EmbedBuilder()
  //             .setConfig("#E76161", "sob")
  //             .setTitle(tr("profile_UidNotFound") + " - " + uid),
  //         ],
  //       });
  //   } catch (e) {
  //     if (e instanceof AxiosError) {
  //       await interaction.followUp({
  //         ephemeral: true,
  //         content: `未知的UID - \`${e}\``,
  //       });
  //     }
  //     throw e;
  //   }

  if (await db.has(`${interaction.user.id}.account`)) {
    const accounts = await db.get(`${interaction.user.id}.account`);
    if (accounts.size >= 3)
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setConfig("#E76161", "sob")
            .setTitle(`${tr("account_LimitExceeded")} `),
        ],
      });

    if (accounts.some((account) => account.uid == uid))
      return interaction.editReply({
        embeds: [
          new EmbedBuilder().setConfig("#E76161", "sob").setTitle(
            `${tr("account_AlreadySet", {
              z: `${uid}`,
            })}`
          ),
        ],
      });
  }

  interaction.editReply({
    embeds: [
      new EmbedBuilder().setConfig("#F6F1F1", "wiggle").setTitle(
        `${tr("account_UidSetSuccess", {
          z: `${uid}`,
        })}`
      ),
    ],
  });
  await db.push(`${interaction.user.id}.account`, {
    uid: uid,
    cookie: "",
  });
}

async function handleCookieSet(interaction, tr, customId, fields) {
  const accountIndex = customId.split("-")[1];
  const ltoken = fields.getTextInputValue("ltoken")
    ? `ltoken_v2=${fields.getTextInputValue("ltoken")}; `
    : "";
  const ltuid = fields.getTextInputValue("ltuid")
    ? `ltuid_v2=${fields.getTextInputValue("ltuid")}; `
    : "";
  const cookieToken = fields.getTextInputValue("cookieToken")
    ? `cookie_token_v2=${fields.getTextInputValue("cookieToken")}; `
    : "";
  const accountMid = fields.getTextInputValue("accountMid")
    ? `account_mid_v2=${fields.getTextInputValue("accountMid")}; `
    : "";
  const cookie = ltoken + ltuid + cookieToken + accountMid;
  const account = (await db.get(`${interaction.user.id}.account`)) ?? "";

  try {
    const zzz = new ZenlessZoneZero({
      cookie: cookie,
    });
    await zzz.daily.info();

    account[accountIndex].cookie = cookie;
    await db.set(`${interaction.user.id}.account`, account);

    return interaction.reply({
      embeds: [
        new EmbedBuilder().setConfig("#F6F1F1", "wiggle").setTitle(
          tr("account_CookieSetSuccess", {
            z: `${account[accountIndex].uid}`,
          })
        ),
      ],
      ephemeral: true,
    });
  } catch (error) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            tr("account_CookieSetFailed", {
              z: `${account[accountIndex].uid}`,
            })
          )
          .setDescription(
            tr("account_CookieSetFailedDesc") +
              "\n\n" +
              "`" +
              error.message +
              "`"
          )
          .setColor("#E76161"),
      ],
    });
  }
}
