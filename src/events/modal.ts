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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
import loginAccount, {
  generateDeviceId,
} from "../utilities/zzz/login.js";
import { storeUserCredentials } from "../utilities/utilities.js";
import { VerificationServer } from "../utilities/core/VerificationServer.js";
import { getConfig } from "../utilities/core/config.js";
import { AuthClient } from "@yeci226/hoyoapi";

// In-memory store for pending email verification sessions (ttl: 10 min)
interface EmailVerifySession {
  email: string;
  password: string;
  deviceId: string;
  actionTicket: any;
  expiresAt: number;
}

async function proxyLoginByPassword(opts: {
  account: string;
  password: string;
  aigisHeaderObject?: string;
  deviceId?: string;
}): Promise<any> {
  const config = getConfig();
  const proxyUrl = (config as any).PROXY_API_URL as string | undefined;
  if (proxyUrl) {
    const res = await fetch(`${proxyUrl}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(config as any).PROXY_API_TOKEN}`,
      },
      body: JSON.stringify(opts),
    });
    return res.json();
  }
  // Fallback: direct call (no IP protection)
  const auth = new AuthClient();
  return auth.loginByPassword(opts);
}
const emailVerifySessions = new Map<string, EmailVerifySession>();

function setEmailVerifySession(userId: string, session: Omit<EmailVerifySession, "expiresAt">) {
  emailVerifySessions.set(userId, { ...session, expiresAt: Date.now() + 10 * 60 * 1000 });
  setTimeout(() => emailVerifySessions.delete(userId), 10 * 60 * 1000);
}

function getEmailVerifySession(userId: string): EmailVerifySession | undefined {
  const s = emailVerifySessions.get(userId);
  if (!s || Date.now() > s.expiresAt) { emailVerifySessions.delete(userId); return undefined; }
  return s;
}

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
  if (customId == "account_EmailVerifyModal")
    handleEmailVerify(modalInteraction, tr, fields as any);
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

  // Retrieve or create a stable device ID for this user
  const userId = interaction.user.id;
  let deviceId: string = (await client.db.get(`${userId}.deviceId`)) || "";
  if (!deviceId) {
    deviceId = generateDeviceId();
    await client.db.set(`${userId}.deviceId`, deviceId);
  }

  const doLogin = async (aigisHeaderObject?: string) =>
    proxyLoginByPassword({ account: email, password, deviceId, ...(aigisHeaderObject ? { aigisHeaderObject } : {}) });

  try {
    const loginRes = await doLogin();

    if (loginRes.status === "require_email_verify") {
      return handleEmailVerificationStep(interaction, loginRes.action_ticket, email, password, deviceId, tr, true);
    }

    if (loginRes.status === "require_geetest") {
      const sessionId = Math.random().toString(36).substring(2, 12);
      const { getVerifyBaseUrl } = await import("../utilities/core/config.js");
      const baseUrl = getVerifyBaseUrl();
      // Build captcha data from aigis_data (same fields ZZZ verify page expects)
      const captchaData = {
        geetestId: loginRes.aigis_data?.gt || loginRes.aigis_data?.captcha_id,
        challenge: loginRes.aigis_data?.challenge,
        riskType: loginRes.aigis_data?.mmt_type,
        risk_type: loginRes.aigis_data?.risk_type,
        success: loginRes.aigis_data?.success,
        new_captcha: loginRes.aigis_data?.new_captcha,
        aigisSessionId: loginRes.aigis_data?.session_id,
      };
      const verifyUrl = buildVerifyUrl(captchaData, sessionId, baseUrl);

      VerificationServer.onResult(sessionId, async (captchaResult: any) => {
        try {
          // Build aigis header string from captcha result (genshin.py format)
          const isV4 = !!captchaResult.lot_number;
          const sessionIdStr = String(captchaResult.session_id || captchaResult.aigisSessionId || loginRes.aigis_data?.session_id || "");
          const mmtData = isV4
            ? { captcha_id: captchaResult.captcha_id || captchaResult.gt, lot_number: captchaResult.lot_number, pass_token: captchaResult.pass_token, gen_time: captchaResult.gen_time, captcha_output: captchaResult.captcha_output }
            : { geetest_challenge: captchaResult.geetest_challenge, geetest_validate: captchaResult.geetest_validate, geetest_seccode: captchaResult.geetest_seccode };
          const aigisHeader = `${sessionIdStr};${Buffer.from(JSON.stringify(mmtData)).toString("base64")}`;

          const retryRes = await doLogin(aigisHeader);
          if (retryRes.status === "require_geetest") {
            await interaction.followUp({ content: "❌ 驗證逾期或失敗，請重新嘗試登入。", flags: MessageFlags.Ephemeral });
          } else if (retryRes.status === "require_email_verify") {
            await handleEmailVerificationStep(interaction, retryRes.action_ticket, email, password, deviceId, tr);
          } else if (retryRes.status === "success" && retryRes.cookies) {
            await finalizeAppLogin(interaction, { cookie: retryRes.cookies }, email, password, deviceId, tr);
          } else {
            await interaction.followUp({ content: `❌ 登入失敗：\`${retryRes.message || "未知錯誤"}\``, flags: MessageFlags.Ephemeral });
          }
        } catch (e: any) {
          await interaction.followUp({ content: `❌ 驗證後登入失敗：\`${e.message}\``, flags: MessageFlags.Ephemeral });
        }
      });

      const verifyBtn = new ButtonBuilder()
        .setLabel("進行驗證 (Verify)")
        .setURL(verifyUrl)
        .setStyle(ButtonStyle.Link);

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("需要進行安全驗證")
            .setDescription("請點擊下方按鈕完成 Geetest 驗證，驗證後機器人將自動繼續登入。")
            .setColor("#FFE9D0"),
        ],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(verifyBtn) as any],
      });
    }

    if (loginRes.status !== "success" || !loginRes.cookies) throw new Error(loginRes.message || "登入後未取得必要的 Cookie 資訊");
    await finalizeAppLogin(interaction, { cookie: loginRes.cookies }, email, password, deviceId, tr);
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

async function handleEmailVerify(
  interaction: ModalSubmitInteraction,
  tr: any,
  fields: any,
) {
  const code = fields.getTextInputValue("emailCode").trim();
  const userId = interaction.user.id;
  const session = getEmailVerifySession(userId);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!session) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("驗證逾期")
          .setDescription("Email 驗證 session 已過期（10 分鐘限制），請重新登入。")
          .setColor("#E76161"),
      ],
    });
  }

  try {
    const auth = new AuthClient();
    await auth.verifyActionTicket(session.actionTicket, code, session.deviceId);
    // Re-attempt login via proxy after email verification
    const loginRes: any = await proxyLoginByPassword({
      account: session.email,
      password: session.password,
      deviceId: session.deviceId,
    });
    emailVerifySessions.delete(userId);

    if (loginRes.status !== "success" || !loginRes.cookies) throw new Error(loginRes.message || "驗證後登入未取得 Cookie");
    await finalizeAppLogin(interaction, { cookie: loginRes.cookies }, session.email, session.password, session.deviceId, tr);
  } catch (error: any) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("驗證失敗")
          .setDescription(`\`${error.message}\``)
          .setColor("#E76161"),
      ],
    });
  }
}

function buildVerifyUrl(captchaData: any, sessionId: string, baseUrl: string): string {
  const { geetestId, riskType, risk_type, challenge, success, new_captcha, aigisSessionId } = captchaData;
  const generatedChallenge = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
  const finalChallenge = challenge && challenge !== "undefined" ? challenge : generatedChallenge;
  const params = new URLSearchParams({ captchaId: geetestId, challenge: finalChallenge, session: sessionId });
  if (riskType) params.append("riskType", riskType.toString());
  if (risk_type) params.append("risk_type", risk_type);
  if (success !== undefined) params.append("success", success.toString());
  if (new_captcha !== undefined) params.append("new_captcha", new_captcha.toString());
  if (aigisSessionId) params.append("aigisSessionId", aigisSessionId);
  return `${baseUrl}/verify?${params.toString()}`;
}

async function handleEmailVerificationStep(
  interaction: ModalSubmitInteraction,
  ticket: any,
  email: string,
  password: string,
  deviceId: string,
  tr: any,
  useEditReply = false,
) {
  const { getVerifyBaseUrl } = await import("../utilities/core/config.js");
  const baseUrl = getVerifyBaseUrl();
  const auth = new AuthClient();
  const sendResult = await auth.sendVerificationCode(ticket, deviceId);

  if (sendResult.status === "error") {
    // sendVerificationCode doesn't support captcha retry in this client,
    // just show error
    const replyPayload = {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ 發送驗證信失敗")
          .setDescription(`\`${sendResult.message || "未知錯誤"}\``)
          .setColor("#E76161"),
      ],
    };
    return useEditReply
      ? interaction.editReply(replyPayload)
      : interaction.followUp({ ...replyPayload, flags: MessageFlags.Ephemeral });
  }

  // Email sent successfully — show code input button
  setEmailVerifySession(interaction.user.id, { email, password, deviceId, actionTicket: ticket });
  const openModalBtn = new ButtonBuilder()
    .setCustomId("account_OpenEmailVerifyModal")
    .setLabel("輸入驗證碼")
    .setStyle(ButtonStyle.Primary);
  const replyPayload = {
    embeds: [
      new EmbedBuilder()
        .setTitle("📧 需要 Email 驗證")
        .setDescription("已發送驗證碼到你的 Hoyoverse 帳號 Email。\n請點擊下方按鈕輸入驗證碼（10 分鐘內有效）。")
        .setColor("#FFE9D0"),
    ],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(openModalBtn) as any],
  };
  return useEditReply
    ? interaction.editReply(replyPayload)
    : interaction.followUp({ ...replyPayload, flags: MessageFlags.Ephemeral });
}

async function finalizeAppLogin(
  interaction: ModalSubmitInteraction,
  loginRes: { cookie: string; uid?: string; nickname?: string },
  email: string,
  password: string,
  deviceId: string,
  tr: any,
) {
  const roles = await getAllGameRoles(loginRes.cookie);
  await finalizeMultiLogin(interaction, loginRes.cookie, roles, tr);

  // Save credentials (including stoken) for auto-refresh
  const userId = interaction.user.id;
  const accounts: any[] = (await client.db.get(`${userId}.account`)) || [];
  for (let i = 0; i < accounts.length; i++) {
    await storeUserCredentials(
      userId, i, email, password, deviceId,
      (loginRes as any).stoken,
      (loginRes as any).ltuid_v2,
      (loginRes as any).ltmid_v2,
    );
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
  const ltoken_v2 = fields.getTextInputValue("ltoken_v2") || "";
  const ltuid_v2 = fields.getTextInputValue("ltuid_v2") || "";
  const cookie_token_v2 = fields.getTextInputValue("cookie_token_v2") || "";
  const account_mid_v2 = fields.getTextInputValue("account_mid_v2") || "";

  const cookie = `ltoken_v2=${ltoken_v2}; ltuid_v2=${ltuid_v2}; cookie_token_v2=${cookie_token_v2}; account_mid_v2=${account_mid_v2}; account_id_v2=${account_mid_v2}; ltmid_v2=${account_mid_v2};`;
  const account = (await (client as any).db.get(`${interaction.user.id}.account`)) ?? "";

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
  const ltoken_v2 = fields.getTextInputValue("ltoken_v2") || "";
  const ltuid_v2 = fields.getTextInputValue("ltuid_v2") || "";
  const cookie_token_v2 = fields.getTextInputValue("cookie_token_v2") || "";
  const account_mid_v2 = fields.getTextInputValue("account_mid_v2") || "";

  const cookie = `ltoken_v2=${ltoken_v2}; ltuid_v2=${ltuid_v2}; cookie_token_v2=${cookie_token_v2}; account_mid_v2=${account_mid_v2}; account_id_v2=${account_mid_v2}; ltmid_v2=${account_mid_v2};`;

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
  const ltoken_v2 = fields.getTextInputValue("ltoken_v2") || "";
  const ltuid_v2 = fields.getTextInputValue("ltuid_v2") || "";
  const cookie_token_v2 = fields.getTextInputValue("cookie_token_v2") || "";
  const account_mid_v2 = fields.getTextInputValue("account_mid_v2") || "";

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cookie = `ltoken_v2=${ltoken_v2}; ltuid_v2=${ltuid_v2}; cookie_token_v2=${cookie_token_v2}; account_mid_v2=${account_mid_v2}; account_id_v2=${account_mid_v2}; ltmid_v2=${account_mid_v2};`;

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
