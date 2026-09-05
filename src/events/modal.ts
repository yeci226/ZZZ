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
  getUserGameUid,
  getAllGameRoles,
  updateAccountInfo,
} from "../utilities/utilities.js";
import { createTranslator, toI18nLang } from "../utilities/core/i18n.js";
import loginAccount, {
  generateDeviceId,
} from "../utilities/zzz/login.js";
import { storeUserCredentials } from "../utilities/utilities.js";
import { getLegacyAccounts, updateLegacyAccountAtIndex } from "../utilities/accountStore.js";
// Use client.db directly

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
  if (!interaction.isModalSubmit()) return;
  const modalInteraction = interaction as ModalSubmitInteraction;

  const { locale, customId, fields } = modalInteraction;
  const userLocale =
    (await getUserLang(interaction.user.id)) || toI18nLang(locale) || "en";
  const tr = createTranslator(userLocale);

  if (customId.startsWith("accountEdit"))
    handleAccountEdit(modalInteraction, tr, customId, fields as any);
  if (customId == "account_SetUserIDModal")
    handleUidSet(modalInteraction, tr, fields as any);
  if (customId == "account_SetUserCookieModal")
    handleSetUserCookieModal(modalInteraction, tr, fields as any);
  if (customId.startsWith("cookie_set-"))
    handleCookieSet(modalInteraction, tr, customId, fields as any);
  if (customId == "signal_log")
    handleWarplog(modalInteraction, tr, fields as any);
  if (customId.startsWith("glog-import:")) {
    const { handleSignalLogImport } = await import("../utilities/zzz/signalLogView.js");
    await handleSignalLogImport(modalInteraction);
  }
});

async function finalizeMultiLogin(
  interaction: any,
  cookie: string,
  roles: any[],
  tr: any,
) {
  const zzzRoles = roles.filter((role: any) => role.gameId === 8);

  if (zzzRoles.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("綁定失敗")
      .setDescription("此 Hoyolab 帳號中找不到任何《絕區零》角色資料。")
      .setColor("#E76161" as any);

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
  const embed = new EmbedBuilder()
    .setTitle(`綁定成功，歡迎 ${welcomeName}！`)
    .setColor("#F6F1F1" as any);

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed], components: [] });
  } else {
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function finalizeLogin(interaction: any, loginData: any, tr: any) {
  const { cookie } = loginData;
  const roles = await getAllGameRoles(cookie);
  return finalizeMultiLogin(interaction, cookie, roles, tr);
}

async function handleWarplog(
  interaction: ModalSubmitInteraction,
  _tr: any,
  _fields: any,
) {
  await interaction.reply({
    content: "這是舊版調頻匯入視窗，請重新執行 `/調頻 紀錄`，切換至「手動匯入」後使用「匯入 URL」。",
    flags: MessageFlags.Ephemeral,
  });
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

  const accounts = await getLegacyAccounts(client.db as any, interaction.user.id);

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

  interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setConfig("#F6F1F1", "wiggle")
        .setTitle(tr("account_UidSetSuccess", { z: `${uid}` })),
    ],
  });

  await updateLegacyAccountAtIndex(client.db as any, interaction.user.id, Number(accountIndex), { uid });
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

  {
    const accounts = await getLegacyAccounts(client.db as any, interaction.user.id);
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
  await updateAccountInfo(interaction.user.id, { uid, cookie: "" });
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
