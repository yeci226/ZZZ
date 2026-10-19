import { commandTipContent } from "../../../utilities/core/commandTips.js";
import { automationText } from "../../../utilities/settings/automationCopy.js";
import { getUserLang as getCardLocale } from "../../../utilities/utilities.js";
import { uiText } from "../../../utilities/settings/presentation.js";
import { recordedRedeemCodes, recordManualRedeem, classifyRedeem, safeRedeemMessage } from "../../../utilities/core/redeemEngine.js";
import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  LocalizationMap,
  Client,
  ChatInputCommandInteraction,
  escapeMarkdown,
} from "discord.js";
import {
  failedReply,
  getRedeemCodes,
  getRandomColor,
  getUserUid,
  getUserCookie,
  updateCookie,
} from "../../../utilities/utilities.js";
import Logger from "../../../utilities/core/logger.js";
import { QuickDB } from "quick.db";
import { getLegacyAccountAtIndex } from "../../../utilities/accountStore.js";
import { blockExpiredAccount } from "../../../utilities/accountAccess.js";
import { resolveZzzRegion } from "../../../utilities/zzz/region.js";

async function redeemCodeDirect(
  uid: string,
  cookie: string,
  code: string,
  accountRegion?: unknown,
): Promise<{ retcode: number; message: string }> {
  const region = resolveZzzRegion(uid, accountRegion);

  const url =
    "https://public-operation-nap.hoyoverse.com/common/apicdkey/api/webExchangeCdkeyRisk";
  const params = new URLSearchParams({
    uid: String(uid),
    region,
    lang: "zh-tw",
    cdkey: code,
    game_biz: "nap_global",
    t: String(Date.now()),
  });

  const response = await fetch(`${url}?${params.toString()}`, {
    method: "POST",
    headers: {
      cookie: cookie,
      "x-rpc-signgame": "nap",
      "x-rpc-app_id": "c9oqaq3s3gu8",
      "x-rpc-client_type": "4",
    },
  });

  const result = (await response.json()) as any;
  return { retcode: result.retcode ?? -1, message: result.message ?? "" };
}

import { buildZZZRedeemCards, redeemSummaryText, type ZZZRedeemCardPayload } from "../../../utilities/canvas/redeemCard.js";
import { getFirstRedeemRewardIcon } from "../../../utilities/zzz/redeemLayout.js";


type ManualRedeemStatus =
  | "success"
  | "already_claimed"
  | "invalid"
  | "failed";

function toManualRedeemStatus(status?: string): ManualRedeemStatus {
  switch (status) {
    case "success":
      return "success";
    case "already":
    case "already_claimed":
      return "already_claimed";
    case "invalid":
      return "invalid";
    default:
      return "failed";
  }
}

async function editManualRedeemCard(
  interaction: ChatInputCommandInteraction,
  data: {
    uid: string;
    nickname?: string;
    codes: Array<{
      code: string;
      rewards?: string[] | string;
      rewardIcons?: string[];
      status: ManualRedeemStatus;
      message?: string;
    }>;
  },
): Promise<void> {
  const locale = (await getCardLocale(interaction.user.id)) || "en";
  const payload: ZZZRedeemCardPayload = {
    locale, source: "manual",
    accounts: [
      {
        title: "兌換結果",
        nickname: data.nickname || data.uid || "Unknown",
        uid: data.uid,
        codes: data.codes,
      },
    ],
  };
  const buffers = await buildZZZRedeemCards(payload).catch(() => []);
  const fallback = redeemSummaryText(payload);
  const content = data.codes.some(code => code.status === "success" || code.status === "already_claimed")
    ? commandTipContent(interaction, "codes", locale, buffers.length ? uiText(locale, "result") : fallback.slice(0, 1700))
    : buffers.length ? uiText(locale, "result") : fallback.slice(0, 1700);
  const failures = data.codes.filter(code => code.status === "failed" && code.message)
    .map(code => `${escapeMarkdown(code.code)}: ${escapeMarkdown(safeRedeemMessage(code.message))}`).join("\n");
  await interaction.editReply({
    embeds: [],
    content: [content, failures].filter(Boolean).join("\n\n").slice(0, 1950),
    allowedMentions: { parse: [] },
    attachments: [],
    files: buffers.length ? [{ attachment: buffers[0], name: "redeem-zzz-1.png" }] : [{ attachment: Buffer.from(fallback), name: "redeem-results.txt" }],
  });
  for (let i = 1; i < buffers.length; i++) await interaction.followUp({
    flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] }, files: [{ attachment: buffers[i], name: `redeem-zzz-${i + 1}.png` }],
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName("codes")
    .setDescription("Redeem codes for rewards")
    .setNameLocalizations({
      "zh-TW": "兌換碼",
      vi: "mãcode",
      fr: "codes",
    } as LocalizationMap)
    .setDescriptionLocalizations({
      "zh-TW": "兌換代碼獲取獎勵",
      vi: "Đổi mã nhận thưởng",
      fr: "Échanger les codes pour les récompenses",
    } as LocalizationMap)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("Check available codes")
        .setNameLocalizations({
          "zh-TW": "列表",
          vi: "danhsách",
          fr: "liste",
        } as LocalizationMap)
        .setDescriptionLocalizations({
          "zh-TW": "查看當前可用兌換碼",
          vi: "Kiểm tra các mã đổi thưởng hiện có",
          fr: "Voir les codes de racheté disponibles",
        } as LocalizationMap)
        .addStringOption((option) =>
          option
            .setName("account")
            .setDescription("...")
            .setNameLocalizations({
              "zh-TW": "帳號",
              vi: "tàikhoản",
              fr: "compte",
            } as LocalizationMap)
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("redeem")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "兌換",
          vi: "đổithưởng",
          fr: "racheté",
        } as LocalizationMap)
        .addStringOption((option) =>
          option
            .setName("code")
            .setDescription("Enter the code to redeem")
            .setNameLocalizations({
              "zh-TW": "禮包碼",
              vi: "mãđổithưởng",
              fr: "code",
            } as LocalizationMap)
            .setDescriptionLocalizations({
              "zh-TW": "在這裡輸入要兌換的禮包碼",
              vi: "Nhập mã code bạn muốn đổi thưởng tại đây",
              fr: "Entrer le code",
            } as LocalizationMap)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("account")
            .setDescription("...")
            .setNameLocalizations({
              "zh-TW": "帳號",
              vi: "tàikhoản",
              fr: "compte",
            } as LocalizationMap)
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Help other user redeem code")
            .setNameLocalizations({
              "zh-TW": "使用者",
              vi: "ngườidùng",
              fr: "utilisateur",
            } as LocalizationMap)
            .setDescriptionLocalizations({
              "zh-TW": "幫其他使用者兌換代碼",
              vi: "Đổi mã đổi thưởng cho người dùng khác",
              fr: "Échange contre d'autres utilisateurs",
            } as LocalizationMap)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("redeemall")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "兌換全部",
        } as LocalizationMap)
        .setDescriptionLocalizations({
          "zh-TW": "...",
        } as LocalizationMap)
        .addStringOption((option) =>
          option
            .setName("account")
            .setDescription("...")
            .setNameLocalizations({
              "zh-TW": "帳號",
              vi: "tàikhoản",
              fr: "compte",
            } as LocalizationMap)
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Help other user redeem code")
            .setNameLocalizations({
              "zh-TW": "使用者",
              vi: "ngườidùng",
              fr: "utilisateur",
            } as LocalizationMap)
            .setDescriptionLocalizations({
              "zh-TW": "幫其他使用者兌換代碼",
              vi: "Đổi mã đổi thưởng cho người dùng khác",
              fr: "Échange contre d'autres utilisateurs",
            } as LocalizationMap)
            .setRequired(false),
        ),
    ),
  async execute(
    client: Client,
    interaction: ChatInputCommandInteraction,
    args: any[],
    tr: any,
    db: QuickDB,
  ) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const hintLocale = (await getCardLocale(interaction.user.id)) || interaction.locale;
    const hint = commandTipContent(interaction, "codes", hintLocale);

    if (!["list", "redeem", "redeemall"].includes(subcommand)) {
      return interaction.editReply({ content: automationText(hintLocale, "hintRedeem") });
    }

    if (subcommand == "list") {
      const accountIndex = parseInt(
        interaction.options.getString("account") || "0",
      );
      if (isNaN(accountIndex)) {
        return failedReply(interaction, 'Invalid account index.');
      }
      const codes = await getRedeemCodes();
      const uid = await getUserUid(interaction.user.id, accountIndex);
      const userRedeemedCodes = await recordedRedeemCodes(db, String(uid));

      interaction.editReply({
        content: hint,
        embeds: [
          new EmbedBuilder()
            .setTimestamp()
            .setColor(getRandomColor() as any)
            .setTitle(tr("redeem_Codelist"))
            .setFooter({ text: tr("redeem_CodeTip") })
            .setDescription(
              `${codes
                .map((code: any, index: number) => {
                  const redeemed = userRedeemedCodes.includes(code.code);
                  return `${index}. ${code.code} ${redeemed ? tr("redeem_Redeemed") : tr("redeem_NoRedeem")}`;
                })
                .join("\n")}`,
            ),
        ],
      });
    } else if (subcommand == "redeemall") {
      const accountIndex = parseInt(
        interaction.options.getString("account") || "0",
      );
      if (isNaN(accountIndex)) {
        return failedReply(interaction, 'Invalid account index.');
      }
      const targetUser =
        interaction.options.getUser("user") || interaction.user;
      if (targetUser && targetUser.id !== interaction.user.id && !interaction.memberPermissions?.has('Administrator')) {
        return failedReply(interaction, 'You can only perform this action for yourself.');
      }
      const redeemAllAccount = await getLegacyAccountAtIndex(db as any, targetUser.id, accountIndex);
      const redeemAllCookie = redeemAllAccount?.cookie;
      if (!redeemAllCookie) {
        return failedReply(interaction, tr("error_NoAccount"));
      }
      const uid = await getUserUid(targetUser.id, accountIndex);
      const codes = await getRedeemCodes();
      let userRedeemedCodes: string[] =
        await recordedRedeemCodes(db, String(uid));
      const noRedeemedCodes = codes.filter(
        (code: any) => !userRedeemedCodes.includes(code.code),
      );

      if (!noRedeemedCodes || noRedeemedCodes.length === 0) {
        return interaction.editReply({
          content: hint,
          embeds: [
            new EmbedBuilder()
              .setConfig("#A2CDB0", "wiggle")
              .setTitle(tr("redeem_NoCode")),
          ],
        });
      }

      // No authentication is needed when every code is already recorded.
      if (await blockExpiredAccount(interaction, db, { ownerId: targetUser.id, accountIndex, account: redeemAllAccount, scope: "redeem" })) return;

      for (let i = 0; i < noRedeemedCodes.length; i++) {
        const code = noRedeemedCodes[i];
        try {
          await interaction.editReply({
            content: "",
            embeds: [createProgressEmbed(noRedeemedCodes, i, tr)],
          });

          const res = await redeemCodeDirect(uid || "", redeemAllCookie, code.code, redeemAllAccount?.region);
          recordManualRedeem(db, String(uid), code.code, res);
          const result = await handleRedeemResult(
            code.code,
            res,
            userRedeemedCodes,
            tr,
          );
          code.status = result.status;
          code.message = result.message;

          await new Promise((resolve) => setTimeout(resolve, 3000));
        } catch (e: any) {
          code.status = "failed";
          code.message = safeRedeemMessage(e.message);
        }
      }


      // Update cookie after successful redeemall (mirrors redeem subcommand behavior)
      try {
        const cookieStr = await getUserCookie(targetUser.id, accountIndex) ?? "";
        await updateCookie(targetUser.id, accountIndex, cookieStr, "redeem");
        new Logger("Redeem").info(
          `使用者 ${targetUser.id} 的帳號 #${accountIndex} 成功兌換全部禮包碼並更新 Cookie`,
        );
      } catch (e: any) {
        new Logger("Redeem").error(
          `使用者 ${targetUser.id} 的帳號 #${accountIndex} 更新 Cookie 失敗: ${e.message}`,
        );
      }

      // 最終結果顯示
      const results = {
        success: noRedeemedCodes.filter((c: any) => c.status === "success"),
        already: noRedeemedCodes.filter((c: any) => c.status === "already"),
        invalid: noRedeemedCodes.filter((c: any) => c.status === "invalid"),
        failed: noRedeemedCodes.filter((c: any) => c.status === "failed"),
      };

      if (
        results.success.length +
          results.already.length +
          results.invalid.length +
          results.failed.length ===
        0
      ) {
        return interaction.editReply({
          content: hint,
          embeds: [
            new EmbedBuilder()
              .setColor(getRandomColor() as any)
              .setTitle(tr("redeem_NoCode")),
          ],
        });
      }

      const manualCodes = noRedeemedCodes.map((code: any) => {
        const rewardIcon = getFirstRedeemRewardIcon(code);

        return {
          code: code.code,
          ...(code.rewards
            ? { rewards: code.rewards }
            : {}),
          ...(rewardIcon
            ? { rewardIcons: code.rewardIcons || [rewardIcon] }
            : {}),
          status: toManualRedeemStatus(code.status),
          message: code.message,
        };
      });

      await editManualRedeemCard(interaction, {
        uid: String(uid || ""),
        nickname:
          redeemAllAccount?.nickname ||
          String(uid || "Unknown"),
        codes: manualCodes,
      });
    } else if (subcommand == "redeem") {
      const code = interaction.options.getString("code")!;
      const targetUser =
        interaction.options.getUser("user") || interaction.user;

      if (
        targetUser &&
        targetUser.id !== interaction.user.id &&
        !interaction.memberPermissions?.has("Administrator")
      ) {
        return failedReply(
          interaction,
          "You can only perform this action for yourself.",
        );
      }

      const accountIndex = parseInt(
        interaction.options.getString("account") || "0",
      );

      if (isNaN(accountIndex)) {
        return failedReply(interaction, "Invalid account index.");
      }

      const uid = await getUserUid(targetUser.id, accountIndex);

      if (!uid) {
        return failedReply(interaction, tr("error_NoAccount"));
      }

      const userAccount = await getLegacyAccountAtIndex(
        db as any,
        targetUser.id,
        accountIndex,
      );

      if (await blockExpiredAccount(interaction, db, { ownerId: targetUser.id, accountIndex, account: userAccount, scope: "redeem" })) return;

      if (!userAccount?.cookie) {
        return failedReply(interaction, tr("error_NoAccount"));
      }

      let userRedeemedCodes: string[] =
        await recordedRedeemCodes(db, String(uid));

      let matchedCode: any;

      try {
        const availableCodes: any[] = await getRedeemCodes();
        matchedCode = availableCodes.find(
          (item: any) => item.code === code,
        );
      } catch {}

      const rewardIcon =
        getFirstRedeemRewardIcon(matchedCode);

      try {
        const res = await redeemCodeDirect(
          uid,
          userAccount.cookie,
          code,
          userAccount.region,
        );

        recordManualRedeem(db, String(uid), code, res);
      const result = await handleRedeemResult(
          code,
          res,
          userRedeemedCodes,
          tr,
        );

        // 成功時保留原本 Cookie 更新行為
        if (result.status === "success") {
          try {
            const refreshedAccount =
              await getLegacyAccountAtIndex(
                db as any,
                targetUser.id,
                accountIndex,
              );

            if (refreshedAccount?.cookie) {
              await updateCookie(
                targetUser.id,
                accountIndex,
                refreshedAccount.cookie,
                "redeem",
              );

              new Logger("Redeem").info(
                `使用者 ${targetUser.id} 的帳號 #${accountIndex} 成功兌換禮包碼 ${code} 並更新 Cookie`,
              );
            }
          } catch (e: any) {
            new Logger("Redeem").error(
              `使用者 ${targetUser.id} 的帳號 #${accountIndex} 更新 Cookie 失敗: ${e.message}`,
            );
          }
        }

        await editManualRedeemCard(interaction, {
          uid: String(uid),
          nickname:
            userAccount.nickname ||
            String(uid),
          codes: [
            {
              code,
              ...(matchedCode?.rewards
                ? { rewards: matchedCode.rewards }
                : {}),
              ...(rewardIcon
                ? { rewardIcons: matchedCode?.rewardIcons || [rewardIcon] }
                : {}),
              status: toManualRedeemStatus(
                result.status,
              ),
              message: result.message,
            },
          ],
        });
      } catch (e: any) {
        await editManualRedeemCard(interaction, {
          uid: String(uid),
          nickname:
            userAccount.nickname ||
            String(uid),
          codes: [
            {
              code,
              rewards:
                e?.message ||
                tr("redeem_Failed"),
              status: "failed",
              message: safeRedeemMessage(e?.message) || tr("redeem_Failed"),
            },
          ],
        });
      }
    }
  },
};

async function handleRedeemResult(
  code: string,
  res: any,
  userRedeemedCodes: any[],
  tr: any,
) {
  let status = "failed";
  let message = "";

  switch (classifyRedeem(res)) {
    case "success":

      status = "success";
      message = tr("redeem_Success");
      break;
    case "already":
      status = "already";
      message = tr("redeem_Already");
      break;
    case "invalid":
      status = "invalid";
      message = tr("redeem_Invalid");
      break;
    case "auth":
      throw new Error(tr("redeem_CookieTokenInvalid"));
    case "retry":
      throw new Error(tr("redeem_SystemBusy"));
    default:
      status = "failed";
      message = `${safeRedeemMessage(res.message) || tr("redeem_Failed")} (${res.retcode ?? "unknown"})`;
  }

  if ((status === "success" || status === "already") && !userRedeemedCodes.includes(code)) {
    userRedeemedCodes.push(code);
  }

  return { status, message };
}

function createProgressEmbed(codes: any[], currentIndex: number, tr: any) {
  const processedResults = codes
    .slice(0, currentIndex)
    .map((code) => {
      const statusMap: any = {
        success: "✅",
        already: "ℹ️",
        invalid: "⚠️",
        failed: "❌",
        processing: "⏳",
      };
      const icon = statusMap[code.status || "processing"];
      return `${icon} ${code.code} (${code.message || tr("redeem_Processing")})`;
    })
    .join("\n");

  return new EmbedBuilder()
    .setColor(getRandomColor() as any)
    .setTitle(`${tr("redeem_Redeeming")} ${codes[currentIndex]?.code}`)
    .setDescription(
      tr("redeem_ProcessingDesc", {
        noRedeemedCodes: codes.length - currentIndex,
        seconds: (codes.length - currentIndex) * 3,
      }) +
        "\n\n" +
        (processedResults
          ? `${tr("redeem_Processed")}:\n${processedResults}`
          : ""),
    )
    .setThumbnail(
      "https://cdn.discordapp.com/attachments/1231256542419095623/1361321499549499432/bqqinrjkvtsd1.gif?ex=67fe54f1&is=67fd0371&hm=286f61395cfec0fa862d54c58dbc7b5b6aa20f89f76fd28756ca2cca0c7058aa&",
    );
}
