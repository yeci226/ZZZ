import { commandTipContent } from "../../../utilities/core/commandTips.js";
import {
  resolveDailySignIn,
  dailyAwardAt,
} from "../../../utilities/core/dailyRewards.js";
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  LocalizationMap,
  Client,
} from "discord.js";
import { buildZZZDailyCard } from "../../../utilities/canvas/dailyCard.js";
import { getRandomColor, getUserLang } from "../../../utilities/utilities.js";
import { QuickDB } from "quick.db";
import {
  getLegacyAccounts,
  markGeneralInvalid,
  restoreGeneralValidity,
} from "../../../utilities/accountStore.js";
import {
  createZzzDailyClient,
  getZzzClientLanguage,
} from "../../../utilities/zzz/clientFactory.js";
import {
  isExplicitAuthenticationError,
  isDailyRoleMissingError,
} from "../../../utilities/zzz/autoDailyAuth.js";
import { getDailyMissingRoleKey } from "../../../utilities/core/dailyAuthState.js";
import { buildDailySignInPresentation } from "../../../utilities/zzz/dailyPresentation.js";
import { automationText } from "../../../utilities/settings/automationCopy.js";
import { blockExpiredAccount } from "../../../utilities/accountAccess.js";

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

    const hintLocale =
      (await getUserLang(interaction.user.id)) || interaction.locale;
    const hint = commandTipContent(interaction, "daily", hintLocale);
    // Reject cached automatic options without signing in or opening a settings panel.
    if (
      ["autosign", "time", "tag", "notify_type"].some(
        (name) => interaction.options.getString(name) != null,
      )
    ) {
      return interaction.editReply({
        content: automationText(hintLocale, "hintDaily"),
      });
    }
    const user = interaction.options.getUser("user") ?? interaction.user;
    const accountOwnerId = user.id;
    const haveAccount = await getLegacyAccounts(db as any, accountOwnerId);
    if (!haveAccount.length) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setConfig("#E76161", "sob")
            .setTitle(tr("daily_NonAccount"))
            .setDescription(tr("daily_NonAccountDesc")),
        ],
      });
    }

    const accountOption = interaction.options.getString("account");
    const accountIndex = accountOption === null ? 0 : Number(accountOption);
    const account =
      Number.isInteger(accountIndex) && accountIndex >= 0
        ? haveAccount[accountIndex]
        : undefined;
    if (!account?.cookie || !account.uid) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#E76161")
            .setTitle(tr("daily_NonAccount"))
            .setDescription(tr("daily_NonAccountDesc")),
        ],
      });
    }

    const nickname = account.nickname || "Unknown";
    if (
      await blockExpiredAccount(interaction, db, {
        ownerId: accountOwnerId,
        accountIndex,
        account,
      })
    )
      return;
    const locale = await getUserLang(accountOwnerId);
    const zzz = createZzzDailyClient({
      cookie: account.cookie,
      lang: getZzzClientLanguage(locale || interaction.locale),
    });
    let rewards;
    let res;
    try {
      const result = await resolveDailySignIn(zzz.daily);
      await db.delete(
        getDailyMissingRoleKey(
          accountOwnerId,
          String(account.cookie),
          String(account.uid),
        ),
      );
      rewards = result.rewards;
      res = { info: result.info };
      const status = result.status;
      await restoreGeneralValidity(
        db as any,
        accountOwnerId,
        String(account.uid),
      );
      if (status === "already_signed") {
        return interaction.editReply({
          content: hint,
          embeds: [
            new EmbedBuilder().setColor("#A2CDB0").setTitle(tr("daily_Signed")),
          ],
        });
      }
    } catch (error: any) {
      const authenticationError = isExplicitAuthenticationError(error);
      if (authenticationError) {
        await markGeneralInvalid(
          db as any,
          accountOwnerId,
          String(account.uid),
        );
      }
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#E76161")
            .setTitle(tr("daily_Failed"))
            .setDescription(
              authenticationError
                ? tr("daily_AuthExpiredDesc")
                : isDailyRoleMissingError(error)
                  ? tr("daily_MissingRoleDesc")
                  : String(error?.message || error),
            ),
        ],
      });
    }

    const signedInfo = res.info;
    const presentation = buildDailySignInPresentation(
      signedInfo,
      rewards.awards,
    );
    const signedDay = presentation.signedDays;
    const todaySign = dailyAwardAt(signedInfo, rewards);
    const tmrSign = dailyAwardAt(signedInfo, rewards, 1);

    try {
      const cardBuf = await buildZZZDailyCard({
        nickname,
        uid: String(account.uid),
        status: "success",
        rewardName: todaySign?.name || "",
        rewardIcon: todaySign?.icon,
        rewardCount: todaySign?.cnt,
        totalDays: signedDay,
        shortSignDay: signedDay,
        signCntMissed: presentation.missedDays,
        tomorrowRewardName: tmrSign?.name,
        tomorrowRewardIcon: tmrSign?.icon,
        tomorrowRewardCount: tmrSign?.cnt,
        labelTodayReward: tr("card_TodayReward"),
        labelCheckedIn: tr("daily_Signed"),
        labelTomorrowReward: tr("card_TomorrowReward"),
        labelMonthSignIn: tr("card_MonthSignIn"),
        labelMonthMissed: tr("card_MonthMissed"),
      });
      const { AttachmentBuilder } = await import("discord.js");
      await interaction.editReply({
        content: hint,
        files: [new AttachmentBuilder(cardBuf, { name: "daily-zzz.png" })],
      });
    } catch (e) {
      // Fallback to embed
      await interaction.editReply({
        content: hint,
        embeds: [
          new EmbedBuilder()
            .setColor(getRandomColor() as any)
            .setTitle(`${nickname} (${account.uid}) ${tr("daily_SignSuccess")}`)
            .setThumbnail(todaySign?.icon || null)
            .setDescription(
              todaySign
                ? tr("daily_Description", {
                    a: `${todaySign.name} ×${todaySign.cnt}`,
                  })
                : null,
            ),
        ],
      });
    }
  },
};
