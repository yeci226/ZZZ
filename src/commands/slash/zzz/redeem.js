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
      const codes = await getRedeemCodes();
      const userRedeemedCodes =
        (await db.get(`${interaction.user.id}.redeemedCodes`)) || [];

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

      let userRedeemedCodes =
        (await db.get(`${targetUser.id}.redeemedCodes`)) || [];

      try {
        const res = await zzz.redeem.claim(code);
        if (res.retcode == 0 || res.message == "OK") {
          if (!userRedeemedCodes.includes(code)) userRedeemedCodes.push(code);
          userRedeemedCodes = Array.from(new Set(userRedeemedCodes));
          await db.set(`${targetUser.id}.redeemedCodes`, userRedeemedCodes);

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
        } else if (res.retcode == -2017) {
          if (!userRedeemedCodes.includes(code)) userRedeemedCodes.push(code);
          userRedeemedCodes = Array.from(new Set(userRedeemedCodes));
          await db.set(`${targetUser.id}.redeemedCodes`, userRedeemedCodes);
          failedReply(interaction, res.message);
        } else {
          failedReply(interaction, res.message);
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
        return failedReply(interaction, tr("redeen_NoCookie"));
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
