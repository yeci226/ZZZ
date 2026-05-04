import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  LocalizationMap,
  Client,
  ChatInputApplicationCommandData,
} from "discord.js";
import { buildZZZDailyCard } from "../../../utilities/canvas/dailyCard.js";
import {
  getRandomColor,
  getUserZZZData,
} from "../../../utilities/utilities.js";
import { QuickDB } from "quick.db";

const timeChoices = Array.from({ length: 24 }, (_, i) => ({
  name: i < 10 ? `0${i}` : `${i}`,
  value: `${i}`,
}));

export default {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Daily check-in")
    .setNameLocalizations({
      "zh-TW": "每日簽到",
    } as LocalizationMap)
    .setDescriptionLocalizations({
      "zh-TW": "領取每日簽到獎勵",
      vi: "Nhận phần thưởng điểm danh hằng ngày",
      fr: "Obtenez des récompenses de connexion quotidiennes",
    } as LocalizationMap)
    .addStringOption((option) =>
      option
        .setName("account")
        .setDescription("Account")
        .setNameLocalizations({
          "zh-TW": "帳號",
          vi: "tàikhoản",
          fr: "compte",
        } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("autosign")
        .setDescription(
          "Automatic check-in every day, messages will be sent wherever command used!",
        )
        .setNameLocalizations({
          "zh-TW": "自動簽到",
          vi: "điểmdanhhàngngày",
          fr: "signéautomatique",
        } as LocalizationMap)
        .setDescriptionLocalizations({
          "zh-TW": "每天自動簽到，訊息會在使用指令的地方自動發送！",
          vi: "Thông báo điểm danh tự động hằng ngày: không giới hạn kênh thông báo!",
          fr: "Signé automatique activée, des notifications seront envoyées là où cette commande a été utilisée",
        } as LocalizationMap)
        .setRequired(false)
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
          },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("Automatic check-in time")
        .setNameLocalizations({
          "zh-TW": "簽到時間",
          vi: "thờigianđiểmdanh",
          fr: "letempsdesigné",
        } as LocalizationMap)
        .setDescriptionLocalizations({
          "zh-TW": "自動簽到的時間",
          vi: "Thời gian tự động điểm danh",
          fr: "Le temps de signé automatiquement",
        } as LocalizationMap)
        .setRequired(false)
        .addChoices(...timeChoices),
    )
    .addStringOption((option) =>
      option
        .setName("tag")
        .setDescription(
          "Whether tag in the automatic check-in, turn on this also turn on the automatic check-in",
        )
        .setNameLocalizations({
          "zh-TW": "標註",
          vi: "thôngbáo",
          fr: "mentionner",
        } as LocalizationMap)
        .setDescriptionLocalizations({
          "zh-TW": "是否在自動簽到中標註，開啟這個也相當於開啟了自動簽到",
          vi: "Chọn Bật sẽ tự động kích hoạt chế độ điểm danh tự động nếu bạn chưa kích hoạt.",
          fr: "Mentionner dans le signé automatique, activer cela activera également le signé automatique",
        } as LocalizationMap)
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
          },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("notify_type")
        .setDescription("Notification method")
        .setNameLocalizations({
          "zh-TW": "通知管道",
          vi: "kênhthôngbáo",
          fr: "canaldenotifiction",
        } as LocalizationMap)
        .setDescriptionLocalizations({
          "zh-TW": "自動簽到訊息的通知管道，預設為私訊",
        } as LocalizationMap)
        .setRequired(false)
        .addChoices(
          {
            name: "Private Message (DM)",
            name_localizations: {
              "zh-TW": "私訊",
              vi: "Tin nhắn riêng",
              fr: "Message privé",
            },
            value: "dm",
          },
          {
            name: "Channel",
            name_localizations: {
              "zh-TW": "頻道",
              vi: "Kênh",
              fr: "Canal",
            },
            value: "channel",
          },
        ),
    ),

  async execute(
    client: Client,
    interaction: ChatInputCommandInteraction,
    args: any[],
    tr: any,
    db: QuickDB,
    emoji: any,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const haveAccount = await db.get(`${interaction.user.id}.account`);
    if (!haveAccount) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setConfig("#E76161", "sob")
            .setTitle(tr("daily_NonAccount"))
            .setDescription(tr("daily_NonAccountDesc")),
        ],
      });
    }

    const user = interaction.options.getUser("user") ?? interaction.user;
    const auto = interaction.options.getString("autosign");
    const time = interaction.options.getString("time");
    const tag = interaction.options.getString("tag");
    const notifyType = interaction.options.getString("notify_type");

    if (auto === "off") {
      await db.delete(`autoDaily.${interaction.user.id}`);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(tr("autoDaily_Off"))
            .setConfig("#E76161", "smirk"),
        ],
      });
    } else if (time || tag || auto === "on") {
      const existingSettings =
        (await db.get(`autoDaily.${interaction.user.id}`)) || {};
      const finalTime = time || existingSettings.time || "12";
      const finalTag = tag || existingSettings.tag || "false";
      const finalNotifyType = notifyType || existingSettings.notifyType || "dm";

      await db.set(`autoDaily.${interaction.user.id}`, {
        channelId: interaction.channelId,
        time: finalTime,
        tag: finalTag,
        notifyType: finalNotifyType,
      });

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setConfig("#A2CDB0", "smirk")
            .setTitle(tr("autoDaily_On"))
            .setDescription(
              tr("autoDaily_Time", {
                time: "`" + finalTime + ":00`",
              }) +
                "\n" +
                tr("autoDaily_Tag", {
                  z:
                    finalTag === "true"
                      ? "`" + tr("True") + "`"
                      : "`" + tr("False") + "`",
                }) +
                "\n" +
                tr("autoDaily_NotifyType", {
                  z:
                    finalNotifyType === "dm"
                      ? "`" + tr("autoDaily_NotifyType_DM") + "`"
                      : "`" + tr("autoDaily_NotifyType_Channel") + "`",
                }),
            ),
        ],
      });
    }

    const zzz = await getUserZZZData(interaction, tr, user.id);
    if (!zzz) return;

    const rewards = await zzz.daily.rewards();
    const res = await zzz.daily.claim();

    if (
      (res as any).code !== 0 &&
      (res as any).code !== -5003 &&
      !res.info.is_sign
    ) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setConfig("#E76161", "sob")
            .setTitle(`${tr("daily_Failed")}`)
            .setDescription(`Code: ${(res as any).code}`),
        ],
      });
    }

    if ((res as any).code === -5003 || res.info.is_sign)
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setConfig("#E76161", "sob")
            .setTitle(`${tr("daily_Failed")} ${tr("daily_Signed")}`),
        ],
      });

    // Use post-claim info so total_sign_day reflects today's sign-in
    const signedDay = res.info.total_sign_day;
    const todaySign = rewards.awards[signedDay - 1] || rewards.awards[0];
    const tmrSign = rewards.awards[signedDay];

    const accounts = await db.get(`${interaction.user.id}.account`);
    const account =
      accounts.find((acc: any) => acc.uid === zzz.uid) || accounts[0];
    const nickname = account?.nickname || "Unknown";

    try {
      const cardBuf = await buildZZZDailyCard({
        nickname,
        uid: String(zzz.uid),
        status: "success",
        rewardName: todaySign?.name || "",
        rewardIcon: todaySign?.icon,
        rewardCount: todaySign?.cnt ?? 1,
        totalDays: signedDay,
        shortSignDay: signedDay,
        signCntMissed: Math.max(0, new Date().getDate() - 1 - signedDay),
        tomorrowRewardName: tmrSign?.name,
        tomorrowRewardIcon: tmrSign?.icon,
        tomorrowRewardCount: tmrSign?.cnt,
        labelTodayReward: tr("card_TodayReward"),
        labelTomorrowReward: tr("card_TomorrowReward"),
        labelMonthSignIn: tr("card_MonthSignIn"),
        labelMonthMissed: tr("card_MonthMissed"),
      });
      const { AttachmentBuilder } = await import("discord.js");
      await interaction.editReply({
        files: [new AttachmentBuilder(cardBuf, { name: "daily-zzz.png" })],
      });
    } catch (e) {
      // Fallback to embed
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(getRandomColor() as any)
            .setTitle(`${nickname} (${zzz.uid}) ${tr("daily_SignSuccess")}`)
            .setThumbnail(todaySign?.icon)
            .setDescription(
              `${tr("daily_Description", { a: `\`${todaySign?.name}x${todaySign?.cnt}\`` })}${res.info.month_last_day ? "" : `\n\n${tr("daily_DescriptionTmr", { b: `\`${tmrSign?.name}x${tmrSign?.cnt}\`` })}`}`,
            )
            .addFields(
              { name: `${tr("daily_Month")}`, value: "\u200b", inline: true },
              { name: tr("daily_SignedDay", { z: "`" + signedDay + "`" }), value: "\u200b", inline: true },
              { name: tr("daily_MissedDay", { z: "`" + Math.max(0, new Date().getDate() - 1 - signedDay) + "`" }), value: "\u200b", inline: true },
            ),
        ],
      });
    }
  },
};
