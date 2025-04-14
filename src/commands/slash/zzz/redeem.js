import {
  CommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import {
  failedReply,
  getRedeemCodes,
  getRandomColor,
  getUserZZZData,
  getUserUid,
  updateCookie,
} from "../../../utilities/utilities.js";

export default {
  data: new SlashCommandBuilder()
    .setName("codes")
    .setDescription("Redeem codes for rewards")
    .setNameLocalizations({
      "zh-TW": "兌換碼",
      vi: "mãcode",
      fr: "codes",
    })
    .setDescriptionLocalizations({
      "zh-TW": "兌換代碼獲取獎勵",
      vi: "Đổi mã nhận thưởng",
      fr: "Échanger les codes pour les récompenses",
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("Check available codes")
        .setNameLocalizations({
          "zh-TW": "列表",
          vi: "danhsách",
          fr: "liste",
        })
        .setDescriptionLocalizations({
          "zh-TW": "查看當前可用兌換碼",
          vi: "Kiểm tra các mã đổi thưởng hiện có",
          fr: "Voir les codes de racheté disponibles",
        })
        .addStringOption((option) =>
          option
            .setName("account")
            .setDescription("...")
            .setNameLocalizations({
              "zh-TW": "帳號",
              vi: "tàikhoản",
              fr: "compte",
            })
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("redeem")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "兌換",
          vi: "đổithưởng",
          fr: "racheté",
        })
        .addStringOption((option) =>
          option
            .setName("code")
            .setDescription("Enter the code to redeem")
            .setNameLocalizations({
              "zh-TW": "禮包碼",
              vi: "mãđổithưởng",
              fr: "code",
            })
            .setDescriptionLocalizations({
              "zh-TW": "在這裡輸入要兌換的禮包碼",
              vi: "Nhập mã code bạn muốn đổi thưởng tại đây",
              fr: "Entrer le code",
            })
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("account")
            .setDescription("...")
            .setNameLocalizations({
              "zh-TW": "帳號",
              vi: "tàikhoản",
              fr: "compte",
            })
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Help other user redeem code")
            .setNameLocalizations({
              "zh-TW": "使用者",
              vi: "ngườidùng",
              fr: "utilisateur",
            })
            .setDescriptionLocalizations({
              "zh-TW": "幫其他使用者兌換代碼",
              vi: "Đổi mã đổi thưởng cho người dùng khác",
              fr: "Échange contre d'autres utilisateurs",
            })
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("redeemall")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "兌換全部",
        })
        .setDescriptionLocalizations({
          "zh-TW": "...",
        })
        .addStringOption((option) =>
          option
            .setName("account")
            .setDescription("...")
            .setNameLocalizations({
              "zh-TW": "帳號",
              vi: "tàikhoản",
              fr: "compte",
            })
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Help other user redeem code")
            .setNameLocalizations({
              "zh-TW": "使用者",
              vi: "ngườidùng",
              fr: "utilisateur",
            })
            .setDescriptionLocalizations({
              "zh-TW": "幫其他使用者兌換代碼",
              vi: "Đổi mã đổi thưởng cho người dùng khác",
              fr: "Échange contre d'autres utilisateurs",
            })
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("autoredeem")
        .setDescription(
          "Automatic when theres available codes, messages will be sent wherever command used!"
        )
        .setNameLocalizations({
          "zh-TW": "自動兌換",
          vi: "tựđộngđổithưởng",
          fr: "rachetéautomatique",
        })
        .setDescriptionLocalizations({
          "zh-TW": "自動兌換代碼，訊息會在使用指令的地方自動發送！",
          vi: "Bot sẽ trả lời tự động ngay dưới câu hỏi!",
          fr: "Racheté automatique activée, des notifications seront envoyées là où cette commande a été utilisée",
        })
        .addStringOption((option) =>
          option
            .setName("enable")
            .setDescription("...")
            .setNameLocalizations({
              "zh-TW": "開啟",
              vi: "bật",
              fr: "activée",
            })
            .setRequired(true)
            .addChoices(
              {
                name: "On",
                name_localizations: {
                  "zh-TW": "開啟",
                  vi: "Bật",
                  fr: "Activée",
                },
                value: "on",
              },
              {
                name: "Off",
                name_localizations: {
                  "zh-TW": "關閉",
                  vi: "Tắt",
                  fr: "Désactivé",
                },
                value: "off",
              }
            )
        )
        .addStringOption((option) =>
          option
            .setName("tag")
            .setDescription(
              "Whether mark in the automatic redeem, turn on this also turn on the automatic redeem"
            )
            .setNameLocalizations({
              "zh-TW": "標註",
              vi: "thôngbáo",
              fr: "mentionner",
            })
            .setDescriptionLocalizations({
              "zh-TW": "是否在自動兌換中標註，開啟這個也相當於開啟了自動兌換",
              vi: "Chọn Bật sẽ tự động kích hoạt chế độ nhận code tự động nếu bạn chưa kích hoạt.",
              fr: "Mentionner dans le racheté automatique, activer cela activera également le racheté automatique",
            })
            .setRequired(false)
            .addChoices(
              {
                name: "On",
                name_localizations: {
                  "zh-TW": "開啟",
                  vi: "Bật",
                  fr: "Activée",
                },
                value: "true",
              },
              {
                name: "Off",
                name_localizations: {
                  "zh-TW": "關閉",
                  vi: "Tắt",
                  fr: "Désactivé",
                },
                value: "false",
              }
            )
        )
    ),
  /**
   *
   * @param {Client} client
   * @param {CommandInteraction} interaction
   * @param {String[]} args
   */
  async execute(client, interaction, args, tr, db) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (subcommand == "list") {
      const accountIndex = interaction.options.getString("account") || 0;
      const codes = await getRedeemCodes();
      const uid = await getUserUid(interaction.user.id, accountIndex);
      const userRedeemedCodes = (await db.get(`${uid}.redeemedCodes`)) || [];

      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTimestamp()
            .setColor(getRandomColor())
            .setTitle(tr("redeem_Codelist"))
            .setFooter({ text: tr("redeem_CodeTip") })
            .setDescription(
              `${codes
                .map((code, index) => {
                  const redeemed = userRedeemedCodes.includes(code.code);
                  return `${index}. ${code.code} ${redeemed ? tr("redeem_Redeemed") : tr("redeem_NoRedeem")}`;
                })
                .join("\n")}`
            ),
        ],
        ephemeral: true,
      });
    } else if (subcommand == "redeemall") {
      const accountIndex = interaction.options.getString("account") || 0;
      const targetUser =
        interaction.options.getUser("user") || interaction.user;
      const zzz = await getUserZZZData(
        interaction,
        tr,
        targetUser.id,
        null,
        accountIndex
      );
      if (!zzz) return;

      const uid = await getUserUid(targetUser.id, accountIndex);
      const codes = await getRedeemCodes();
      let userRedeemedCodes = (await db.get(`${uid}.redeemedCodes`)) || [];
      const noRedeemedCodes = codes.filter(
        (code) => !userRedeemedCodes.includes(code.code)
      );

      if (!noRedeemedCodes.length) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setConfig("#A2CDB0", "wiggle")
              .setTitle(tr("redeem_NoCode")),
          ],
        });
      }

      for (let i = 0; i < noRedeemedCodes.length; i++) {
        const code = noRedeemedCodes[i];
        try {
          await interaction.editReply({
            embeds: [createProgressEmbed(noRedeemedCodes, i, tr)],
            ephemeral: true,
          });

          const res = await zzz.redeem.claim(code.code);
          const result = await handleRedeemResult(
            code.code,
            res,
            userRedeemedCodes,
            db,
            uid,
            tr
          );
          code.status = result.status;
          code.message = result.message;

          await new Promise((resolve) => setTimeout(resolve, 3000));
        } catch (e) {
          code.status = "failed";
          code.message = e.message;
        }
      }

      // 最終結果顯示
      const results = {
        success: noRedeemedCodes.filter((c) => c.status === "success"),
        already: noRedeemedCodes.filter((c) => c.status === "already"),
        invalid: noRedeemedCodes.filter((c) => c.status === "invalid"),
        failed: noRedeemedCodes.filter((c) => c.status === "failed"),
      };

      if (
        results.success.length +
          results.already.length +
          results.invalid.length +
          results.failed.length ===
        0
      ) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(getRandomColor())
              .setTitle(tr("redeem_NoCode")),
          ],
          ephemeral: true,
        });
      }

      if (results.success.length > 0) {
        try {
          await updateCookie(targetUser.id, accountIndex, zzz.cookie);
          new Logger("Redeem").info(
            `使用者 ${targetUser.id} 的帳號 #${accountIndex} 成功兌換 ${results.success.length} 個禮包碼並更新 Cookie`
          );
        } catch (e) {
          new Logger("Redeem").error(
            `使用者 ${targetUser.id} 的帳號 #${accountIndex} 更新 Cookie 失敗: ${e.message}`
          );
        }
      }

      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(getRandomColor())
            .setTitle(tr("redeem_SuccessDesc"))
            .setDescription(
              results.success
                .map((code) => `✅ **${code.code}** (${code.message})`)
                .join("\n") +
                (results.already.length
                  ? "\n" +
                    results.already
                      .map((code) => `ℹ️ **${code.code}** (${code.message})`)
                      .join("\n")
                  : "") +
                (results.invalid.length
                  ? "\n" +
                    results.invalid
                      .map((code) => `⚠️ **${code.code}** (${code.message})`)
                      .join("\n")
                  : "") +
                (results.failed.length
                  ? "\n" +
                    results.failed
                      .map((code) => `❌ **${code.code}** (${code.message})`)
                      .join("\n")
                  : "") +
                `\n### ${tr("redeem_RedeemStats")}\n` +
                `✅ ${tr("redeem_Success")}: ${results.success.length}\n` +
                `ℹ️ ${tr("redeem_Already")}: ${results.already.length}\n` +
                `⚠️ ${tr("redeem_Invalid")}: ${results.invalid.length}\n` +
                `❌ ${tr("redeem_Failed")}: ${results.failed.length}`
            )
            .setThumbnail(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4c/Item_Polychrome.png/revision/latest?cb=20240807185318"
            ),
        ],
      });
    } else if (subcommand == "redeem") {
      const code = interaction.options.getString("code");
      const targetUser =
        interaction.options.getUser("user") || interaction.user;
      const accountIndex = interaction.options.getString("account") || 0;

      const zzz = await getUserZZZData(
        interaction,
        tr,
        targetUser.id,
        null,
        accountIndex
      );
      if (!zzz) return;

      const uid = await getUserUid(targetUser.id, accountIndex);
      let userRedeemedCodes = (await db.get(`${uid}.redeemedCodes`)) || [];

      try {
        const res = await zzz.redeem.claim(code);
        if (res.retcode == 0 || res.message == "OK") {
          if (!userRedeemedCodes.includes(code)) userRedeemedCodes.push(code);
          userRedeemedCodes = Array.from(new Set(userRedeemedCodes));
          await db.set(`${uid}.redeemedCodes`, userRedeemedCodes);

          interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(getRandomColor())
                .setTitle(tr("redeem_Success"))
                .setThumbnail(
                  "https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4c/Item_Polychrome.png"
                ),
            ],
            ephemeral: true,
          });
        } else if (res.retcode == -2017 || res.retcode == -2018) {
          if (!userRedeemedCodes.includes(code)) userRedeemedCodes.push(code);
          userRedeemedCodes = Array.from(new Set(userRedeemedCodes));
          await db.set(`${uid}.redeemedCodes`, userRedeemedCodes);
          failedReply(interaction, res.message);
        } else {
          const userCookie = await db.get(`${targetUser.id}.account`)[
            accountIndex
          ];
          if (
            userCookie.cookie.includes("cookie_token_v2") ||
            userCookie.cookie.includes("account_mid_v2")
          ) {
            failedReply(interaction, tr("redeem_CookieTokenInvalid"));
          } else {
            failedReply(interaction, tr("redeem_NoCookie"));
          }
        }
      } catch (e) {
        failedReply(interaction, e.message);
      }
    } else if (subcommand == "autoredeem") {
      const zzz = await getUserZZZData(interaction, tr, interaction.user.id);
      if (!zzz) return;
      const userAccount = await db.get(`${interaction.user.id}.account`);
      if (
        !userAccount[0].cookie.includes("cookie_token_v2") &&
        !userAccount[0].cookie.includes("account_mid_v2")
      ) {
        return failedReply(interaction, tr("redeem_NoCookie"));
      }

      const enable = interaction.options.getString("enable");
      const tag = interaction.options.getString("tag") || false;

      if (enable == "on") {
        await db.set(`autoRedeem.${interaction.user.id}`, {
          channelId: interaction.channel.id,
          tag: tag || false,
        });

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setConfig("#A2CDB0", "smirk")
              .setTitle(tr("autoRedeem_On"))
              .setDescription(
                tr("autoRedeem_Tag", {
                  z:
                    tag === "true"
                      ? "`" + tr("True") + "`"
                      : "`" + tr("False") + "`",
                })
              ),
          ],
        });
      } else {
        await db.delete(`autoRedeem.${interaction.user.id}`);
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setConfig("#E76161", "smirk")
              .setColor("#E76161")
              .setTitle(tr("autoDaily_Off")),
          ],
        });
      }
    }
  },
};

async function handleRedeemResult(code, res, userRedeemedCodes, db, uid, tr) {
  let status = "failed";
  let message = "";

  switch (res.retcode) {
    case 0:
    case res.message === "OK":
      status = "success";
      message = tr("redeem_Success");
      break;
    case -2017:
    case -2018:
      status = "already";
      message = tr("redeem_Already");
      break;
    case -2001:
    case -2006:
      status = "invalid";
      message = tr("redeem_Invalid");
      break;
    case -1071:
      throw new Error(tr("redeem_CookieTokenInvalid"));
    case -1048:
      throw new Error(tr("redeem_SystemBusy"));
    default:
      status = "failed";
      message = tr("redeem_Failed");
  }

  if (status !== "failed" && !userRedeemedCodes.includes(code)) {
    userRedeemedCodes.push(code);
    await db.set(
      `${uid}.redeemedCodes`,
      Array.from(new Set(userRedeemedCodes))
    );
  }

  return { status, message };
}

function createProgressEmbed(codes, currentIndex, tr) {
  const processedResults = codes
    .slice(0, currentIndex)
    .map((code) => {
      const statusMap = {
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
    .setColor(getRandomColor())
    .setTitle(`${tr("redeem_Redeeming")} ${codes[currentIndex]?.code}`)
    .setDescription(
      tr("redeem_ProcessingDesc", {
        noRedeemedCodes: codes.length - currentIndex,
        seconds: (codes.length - currentIndex) * 3,
      }) +
        "\n\n" +
        (processedResults
          ? `${tr("redeem_Processed")}:\n${processedResults}`
          : "")
    )
    .setThumbnail(
      "https://cdn.discordapp.com/attachments/1231256542419095623/1361321499549499432/bqqinrjkvtsd1.gif?ex=67fe54f1&is=67fd0371&hm=286f61395cfec0fa862d54c58dbc7b5b6aa20f89f76fd28756ca2cca0c7058aa&"
    );
}
