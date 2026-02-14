import { client } from "../index.js";
import {
  Events,
  EmbedBuilder,
  MessageFlags,
  ModalSubmitInteraction,
  BaseInteraction,
  ColorResolvable,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputBuilder,
} from "discord.js";
import { ZenlessZoneZero } from "@yeci226/hoyoapi";
import {
  getUserHoyolabData,
  getUserLang,
  getRandomColor,
  getUserGameUid,
  getAllGameRoles,
  updateAccountInfo,
} from "../utilities/utilities.js";
import { createTranslator, toI18nLang } from "../utilities/core/i18n.js";
import { handleSignalLogDraw, getSingalLog } from "../utilities/zzz/gacha.js";
import loginAccount from "../utilities/zzz/login.js";
import { VerificationServer } from "../utilities/core/VerificationServer.js";

// Use client.db directly

// eslint-disable-next-line @typescript-eslint/no-explicit-any
client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
  if (!interaction.isModalSubmit()) return;
  const modalInteraction = interaction as ModalSubmitInteraction;

  const { locale, customId, fields } = modalInteraction;
  const userLocale =
    (await getUserLang(interaction.user.id)) || toI18nLang(locale) || "en";
  const tr = createTranslator(userLocale);

  if (customId.startsWith("accountEdit"))
    handleAccountEdit(modalInteraction, tr, customId, fields as any);
  if (customId == "account_QuickLinkModal")
    handleAccountLogin(modalInteraction, tr, fields as any);
  if (customId == "account_SetUserIDModal")
    handleUidSet(modalInteraction, tr, fields as any);
  if (customId == "account_SetUserCookieModal")
    handleSetUserCookieModal(modalInteraction, tr, fields as any);
  if (customId.startsWith("cookie_set-"))
    handleCookieSet(modalInteraction, tr, customId, fields as any);
  if (customId == "signal_log")
    handleWarplog(modalInteraction, tr, fields as any);
});

async function handleAccountLogin(
  interaction: ModalSubmitInteraction,
  tr: any,
  fields: any,
) {
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

    const loginRes = await loginAccount(email, password);

    if ((loginRes as any).captcha) {
      const {
        geetestId,
        riskType,
        risk_type,
        challenge,
        success,
        new_captcha,
        aigisSessionId,
      } = (loginRes as any).data.captcha;
      const sessionId = Math.random().toString(36).substring(2, 12);

      // If challenge is undefined/empty, it's likely Geetest v4 (mmt_type: 2)
      // But we should respect the server's original mmt_type (riskType)
      const finalRiskType = riskType;
      const config = (await import("../utilities/core/config.js")).getConfig();
      const baseUrl =
        (config as any).VERIFY_PUBLIC_URL ||
        `http://localhost:${(config as any).WEBSERVER_PORT || 3000}`;

      // Generate a fake challenge UUID if missing (required for v4 init)
      // Simple UUID v4 generator
      const generatedChallenge = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
          const r = (Math.random() * 16) | 0,
            v = c == "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        },
      );

      const finalChallenge =
        challenge && challenge !== "undefined" ? challenge : generatedChallenge;

      const params = new URLSearchParams({
        captchaId: geetestId,
        challenge: finalChallenge,
        session: sessionId,
      });
      if (finalRiskType) params.append("riskType", finalRiskType.toString());
      if (risk_type) params.append("risk_type", risk_type); // Append the raw v4 string
      if (success !== undefined) params.append("success", success.toString());
      if (new_captcha !== undefined)
        params.append("new_captcha", new_captcha.toString());
      if (aigisSessionId) params.append("aigisSessionId", aigisSessionId);

      const verifyUrl = `${baseUrl}/verify?${params.toString()}`;

      VerificationServer.onResult(sessionId, async (captchaResult: any) => {
        try {
          const retryRes = await loginAccount(email, password, captchaResult);
          if (retryRes && (retryRes as any).captcha) {
            // If it requires captcha again (shouldn't usually happen immediately)
            await interaction.followUp({
              content: "❌ 驗證逾期或失敗，請重新嘗試登入。",
              flags: MessageFlags.Ephemeral,
            });
          } else if (retryRes) {
            await finalizeLogin(interaction, retryRes, tr);
          }
        } catch (e: any) {
          console.error("[Login] Captcha auto-retry failed:", e);
          await interaction.followUp({
            content: `❌ 驗證後登入失敗：\`${e.message}\``,
            flags: MessageFlags.Ephemeral,
          });
        }
      });

      const verifyBtn = new ButtonBuilder()
        .setLabel("進行驗證 (Verify)")
        .setURL(verifyUrl)
        .setStyle(ButtonStyle.Link);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        verifyBtn,
      );

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("需要進行安全驗證")
            .setDescription(
              "為了保護您的帳號安全，請點擊下方按鈕在瀏覽器中完成 Geetest 驗證。驗證完成後，機器人將會自動繼續登入流程。",
            )
            .setColor("#FFE9D0"),
        ],
        components: [row as any],
      });
    }

    if (!loginRes.cookie) {
      throw new Error("登入後未取得必要的 Cookie 資訊");
    }
    const roles = await getAllGameRoles(loginRes.cookie);
    await finalizeMultiLogin(interaction, loginRes.cookie, roles, tr);
  } catch (error: any) {
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

async function finalizeMultiLogin(
  interaction: any,
  cookie: string,
  roles: any[],
  tr: any,
) {
  const zzzRoles = roles.filter((role: any) => role.gameId === 8);

  if (zzzRoles.length === 0) {
    const embed = new EmbedBuilder()
      .setConfig("#E76161", "sob")
      .setTitle("綁定失敗")
      .setDescription("在此 Hoyolab 帳號中找不到任何《絕區零》的角色資料。");

    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({ embeds: [embed], components: [] });
    } else {
      return await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  for (const role of zzzRoles) {
    await updateAccountInfo(interaction.user.id, {
      uid: role.uid,
      cookie: cookie,
      nickname: role.nickname,
    });
  }

  const welcomeName = zzzRoles[0].nickname;
  const welcomeTitle = `歡迎繩匠，${welcomeName}`;

  const embed = new EmbedBuilder()
    .setConfig("#F6F1F1", "wiggle")
    .setTitle(`綁定成功！${welcomeTitle}`);

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed], components: [] });
  } else {
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}

// finalizeLogin 已由 finalizeMultiLogin 取代，保持相容性或移除
async function finalizeLogin(interaction: any, loginData: any, tr: any) {
  const { cookie } = loginData;
  const roles = await getAllGameRoles(cookie);
  return finalizeMultiLogin(interaction, cookie, roles, tr);
}

async function handleWarplog(
  interaction: ModalSubmitInteraction,
  tr: any,
  fields: any,
) {
  const url = fields.getTextInputValue("signalUrl");

  await interaction.deferReply();
  interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(tr("Searching"))
        .setColor(getRandomColor() as any)
        .setImage(
          "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif",
        ),
    ],
  });

  const userLocale =
    (await getUserLang(interaction.user.id)) ||
    toI18nLang(interaction.locale) ||
    "en";

  const requestStartTime = Date.now();
  let signalResults;
  if (url != "")
    signalResults = await getSingalLog(interaction as any, tr, userLocale, url);

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
    "character",
  );
  // handleSignalLogDraw(interaction, tr, userLocale, "character", url);
}

async function handleAccountEdit(
  interaction: ModalSubmitInteraction,
  tr: any,
  customId: string,
  fields: any,
) {
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

  const accounts =
    (await client.db.get(`${interaction.user.id}.account`)) ?? "";

  if (accounts.some((account: any) => account.uid == uid))
    return interaction.editReply({
      embeds: [
        new EmbedBuilder().setConfig("#E76161", "sob").setTitle(
          tr("account_AlreadySet", {
            z: `${uid}`,
          }),
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

  await client.db.set(`${interaction.user.id}.account`, accounts);
}

async function handleUidSet(
  interaction: ModalSubmitInteraction,
  tr: any,
  fields: any,
) {
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

  if (await client.db.has(`${interaction.user.id}.account`)) {
    const accounts =
      (await client.db.get(`${interaction.user.id}.account`)) || [];
    if (accounts.length >= 5)
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setConfig("#E76161", "sob")
            .setTitle(`${tr("account_LimitExceeded")} `),
        ],
      });

    if (accounts.some((account: any) => account.uid == uid))
      return interaction.editReply({
        embeds: [
          new EmbedBuilder().setConfig("#E76161", "sob").setTitle(
            `${tr("account_AlreadySet", {
              z: `${uid}`,
            })}`,
          ),
        ],
      });
  }

  interaction.editReply({
    embeds: [
      new EmbedBuilder().setConfig("#F6F1F1", "wiggle").setTitle(
        `${tr("account_UidSetSuccess", {
          z: `${uid}`,
        })}`,
      ),
    ],
  });
  await client.db.push(`${interaction.user.id}.account`, {
    uid: uid,
    cookie: "",
    invalid: false,
  });
}

async function handleCookieSet(
  interaction: ModalSubmitInteraction,
  tr: any,
  customId: string,
  fields: any,
) {
  const accountIndex = customId.split("-")[1];
  const ltokenRaw = fields.getTextInputValue("ltoken");
  const ltuidRaw = fields.getTextInputValue("ltuid");
  const cookieTokenRaw = fields.getTextInputValue("cookieToken");
  const accountMidRaw = fields.getTextInputValue("accountMid");

  const isV2 = ltokenRaw.startsWith("v2_");

  const ltoken = ltokenRaw
    ? `${isV2 ? "ltoken_v2" : "ltoken"}=${ltokenRaw}; `
    : "";
  const ltuid = ltuidRaw ? `${isV2 ? "ltuid_v2" : "ltuid"}=${ltuidRaw}; ` : "";
  const cookieToken = cookieTokenRaw
    ? `${cookieTokenRaw.startsWith("v2_") ? "cookie_token_v2" : "cookie_token"}=${cookieTokenRaw}; `
    : "";
  const accountMid = accountMidRaw ? `account_mid_v2=${accountMidRaw}; ` : "";
  const ltmid = isV2 && accountMidRaw ? `ltmid_v2=${accountMidRaw}; ` : "";

  const cookie = ltoken + ltuid + cookieToken + accountMid + ltmid;
  const account = (await client.db.get(`${interaction.user.id}.account`)) ?? "";

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const roles = await getAllGameRoles(cookie);
    await finalizeMultiLogin(interaction, cookie, roles, tr);
  } catch (error: any) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(tr("account_CookieSetFailed"))
          .setDescription(
            tr("account_CookieSetFailedDesc") +
              "\n\n" +
              "`" +
              error.message +
              "`",
          )
          .setColor("#E76161"),
      ],
    });
  }
}

async function handleSetUserCookieModal(
  interaction: ModalSubmitInteraction,
  tr: any,
  fields: any,
) {
  const cookie = fields.getTextInputValue("account_SetUserCookieModalField");

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const roles = await getAllGameRoles(cookie);
    await finalizeMultiLogin(interaction, cookie, roles, tr);
  } catch (error: any) {
    console.log(error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(tr("account_CookieSetFailed"))
          .setDescription(
            `${tr("account_CookieSetFailedDesc")}\n\n\`${error.message}\``,
          )
          .setColor("#E76161"),
      ],
    });
  }
}

async function handleQuickLink(
  interaction: ModalSubmitInteraction,
  tr: any,
  fields: any,
) {
  const ltokenRaw = fields.getTextInputValue("ltoken");
  const ltuidRaw = fields.getTextInputValue("ltuid");
  const cookieTokenRaw = fields.getTextInputValue("cookieToken");
  const accountMidRaw = fields.getTextInputValue("accountMid");

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const isV2 = ltokenRaw.startsWith("v2_");
  const ltoken = ltokenRaw
    ? `${isV2 ? "ltoken_v2" : "ltoken"}=${ltokenRaw}; `
    : "";
  const ltuid = ltuidRaw ? `${isV2 ? "ltuid_v2" : "ltuid"}=${ltuidRaw}; ` : "";
  const cookieToken = cookieTokenRaw
    ? `${cookieTokenRaw.startsWith("v2_") ? "cookie_token_v2" : "cookie_token"}=${cookieTokenRaw}; `
    : "";
  const accountMid = accountMidRaw ? `account_mid_v2=${accountMidRaw}; ` : "";
  const ltmid = isV2 && accountMidRaw ? `ltmid_v2=${accountMidRaw}; ` : "";

  const cookie = ltoken + ltuid + cookieToken + accountMid + ltmid;

  try {
    const roles = await getAllGameRoles(cookie);
    await finalizeMultiLogin(interaction, cookie, roles, tr);
  } catch (error: any) {
    console.log(error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(tr("account_CookieSetFailed"))
          .setDescription(
            `${tr("account_CookieSetFailedDesc")}\n\n\`${error.message}\``,
          )
          .setColor("#E76161"),
      ],
    });
  }
}

// 輔助函數：獲取類別顯示名稱
function getCategoryDisplayName(category: string) {
  const categoryNames = {
    general: "全部",
    official: "官方",
    discussion: "討論",
    question: "提問",
    info: "資訊",
  };
  return (categoryNames as any)[category] || category;
}
