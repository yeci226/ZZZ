import { client } from "../index.js";
import { Events, EmbedBuilder, MessageFlags } from "discord.js";
import { ZenlessZoneZero } from "@yeci226/hoyoapi";
import {
  getUserHoyolabData,
  getUserLang,
  getRandomColor,
} from "../utilities/utilities.js";
import { createTranslator, toI18nLang } from "../utilities/core/i18n.js";
import { handleSignalLogDraw, getSingalLog } from "../utilities/zzz/gacha.js";
import loginAccount from "../utilities/zzz/login.js";

const db = client.db;

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  const { locale, customId, fields } = interaction;
  const userLocale =
    (await getUserLang(interaction.user.id)) || toI18nLang(locale) || "en";
  const tr = createTranslator(userLocale);

  if (customId.startsWith("accountEdit"))
    handleAccountEdit(interaction, tr, customId, fields);
  if (customId == "account_LoginAccountModal")
    handleAccountLogin(interaction, tr, fields);
  if (customId == "account_SetUserIDModal")
    handleUidSet(interaction, tr, fields);
  if (customId.startsWith("cookie_set"))
    handleCookieSet(interaction, tr, customId, fields);
  if (customId == "signal_log") handleWarplog(interaction, tr, fields);
});

async function handleAccountLogin(interaction, tr, fields) {
  const email = fields.getTextInputValue("account_LoginAccountModalField");
  const password = fields.getTextInputValue("account_LoginAccountModalField2");

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Make sure Email is correct
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailRegex.test(email)) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(tr("account_LoginFailed"))
            .setDescription(tr("account_LoginFailedDesc"))
            .setColor("#E76161"),
        ],
      });
    }

    const loginData = await loginAccount(email, password);
    const { uid, nickname, cookie } = loginData;
    const existedAccounts =
      (await db.get(`${interaction.user.id}.account`)) || [];

    await db.delete(`${uid}.cookieExpired`);

    // 檢查是否已經綁定過這個UID
    const existingAccountIndex = existedAccounts.findIndex(
      (account) => account.uid == uid
    );

    if (existingAccountIndex !== -1) {
      // 如果已經綁定過，直接更新該帳號的Cookie
      existedAccounts[existingAccountIndex].cookie = cookie;
      existedAccounts[existingAccountIndex].nickname = nickname;

      await db.set(`${interaction.user.id}.account`, existedAccounts);

      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setConfig("#F6F1F1", "wiggle")
            .setTitle(tr("account_LoginSuccess"))
            .setDescription(tr("account_LoginSuccessDesc", { z: `${uid}` })),
        ],
      });
    } else {
      // 如果是新帳號，檢查數量限制
      if (existedAccounts.length >= 5) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(tr("account_LimitExceeded"))
              .setConfig("#E76161", "sob"),
          ],
        });
      }

      // 添加新帳號
      await db.push(`${interaction.user.id}.account`, {
        uid: uid,
        cookie: cookie,
        nickname: nickname,
      });

      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setConfig("#F6F1F1", "wiggle")
            .setTitle(tr("account_LoginSuccess")),
        ],
      });
    }
  } catch (error) {
    console.log(error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(tr("account_LoginFailed"))
          .setDescription(`${tr("account_LoginFailedDesc")}\n${error.message}`)
          .setColor("#E76161"),
      ],
    });
  }
}

async function handleWarplog(interaction, tr, fields) {
  const url = fields.getTextInputValue("signalUrl");

  await interaction.deferReply();
  interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(tr("Searching"))
        .setColor(getRandomColor())
        .setImage(
          "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif"
        ),
    ],
    withResponse: true,
  });

  const userLocale =
    (await getUserLang(interaction.user.id)) ||
    toI18nLang(interaction.locale) ||
    "en";

  const requestStartTime = Date.now();
  let signalResults;
  if (url != "")
    signalResults = await getSingalLog(interaction, tr, userLocale, url);

  if (!signalResults)
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(tr("gacha_NoSignal"))
          .setConfig("#E76161", "sob"),
      ],
    });

  const requestEndTime = Date.now();
  const requestTime = ((requestEndTime - requestStartTime) / 1000).toFixed(2);

  handleSignalLogDraw(
    interaction,
    tr,
    userLocale,
    requestTime,
    signalResults,
    "character"
  );
  // handleSignalLogDraw(interaction, tr, userLocale, "character", url);
}

async function handleAccountEdit(interaction, tr, customId, fields) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
    const accounts = (await db.get(`${interaction.user.id}.account`)) || [];
    if (accounts.length >= 5)
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

    const userData = await getUserHoyolabData(
      interaction,
      tr,
      interaction.user.id,
      null,
      accountIndex
    );

    await db.delete(`${account[accountIndex].uid}.cookieExpired`);

    account[accountIndex].nickname = userData.nickname;
    await db.set(`${interaction.user.id}.account`, account);

    return interaction.reply({
      embeds: [
        new EmbedBuilder().setConfig("#F6F1F1", "wiggle").setTitle(
          tr("account_CookieSetSuccess", {
            z: `${account[accountIndex].uid}`,
          })
        ),
      ],
      flags: MessageFlags.Ephemeral,
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

// 輔助函數：獲取類別顯示名稱
function getCategoryDisplayName(category) {
  const categoryNames = {
    general: "全部",
    official: "官方",
    discussion: "討論",
    question: "提問",
    info: "資訊",
  };
  return categoryNames[category] || category;
}
