import { client } from "../../index.js";
import { EmbedBuilder, WebhookClient, AttachmentBuilder } from "discord.js";
import { sendRestMessage, sendRestDm } from "../core/sendRestMessage.js";
import { ZenlessZoneZero, LanguageEnum } from "@yeci226/hoyoapi";
import moment from "moment-timezone";
import Logger from "../core/logger.js";
import { createTranslator } from "../core/i18n.js";
import { getUserCookie, getUserLang } from "../utilities.js";
import { getConfig, getVerifyBaseUrl } from "../core/config.js";
import { buildZZZDailyCard } from "../canvas/dailyCard.js";

const CONFIG = {
  TAIPEI_TIMEZONE: "Asia/Taipei",
  API_TIMEOUT: 15000,
  MAX_RETRIES: 3,
  DEFAULT_LANGUAGE: "tw",
  ERROR_CODES: {
    ALREADY_SIGNED: -5003,
    GEETEST: 10035,
  },
};

const LANGUAGE_MAPPING = {
  tw: LanguageEnum.TRADIIONAL_CHINESE,
  cn: LanguageEnum.SIMPLIFIED_CHINESE,
  vi: LanguageEnum.VIETNAMESE,
  jp: LanguageEnum.JAPANESE,
  kr: LanguageEnum.KOREAN,
  fr: LanguageEnum.FRENCH,
  default: LanguageEnum.ENGLISH,
};

interface AutoDailyConfig {
  time: string | number;
  channelId?: string;
  tag?: string | boolean;
  notifyType?: "dm" | "channel";
}

interface SignInResult {
  uid: string;
  nickname: string;
  status: "success" | "already_signed" | "failed";
  rewardName?: string;
  rewardCount?: number;
  rewardIcon?: string;
  totalDays?: number;
  shortSignDay?: number;
  signCntMissed?: number;
  tomorrowRewardName?: string;
  tomorrowRewardIcon?: string;
  tomorrowRewardCount?: number;
  error?: string;
}

interface ProcessUserStats {
  total: number;
  success: number;
  alreadySigned: number;
  failed: number;
  skipped: number;
  shouldMarkProcessed: boolean;
}

export class AutoDailyService {
  private client: any;
  private db: any;
  private webhook: WebhookClient | null;
  private errorWebhook: WebhookClient | null;
  private logger: Logger;
  private isRunning: boolean = false;

  constructor() {
    const config = getConfig();
    this.client = client;
    this.db = client.db;
    this.webhook = config.LOGWEBHOOK
      ? new WebhookClient({ url: config.LOGWEBHOOK })
      : null;
    this.errorWebhook = config.ERRWEBHOOK
      ? new WebhookClient({ url: config.ERRWEBHOOK })
      : null;
    this.logger = new Logger("自動簽到");
  }

  private getLanguage(locale: string) {
    return (
      LANGUAGE_MAPPING[locale as keyof typeof LANGUAGE_MAPPING] ||
      LANGUAGE_MAPPING.default
    );
  }

  public async run() {
    if (this.isRunning) return;
    this.isRunning = true;

    const startTime = Date.now();
    const currentHour = moment().tz(CONFIG.TAIPEI_TIMEZONE).hour();
    this.logger.success(`開始 ${currentHour}:00 自動簽到`);

    try {
      const dailyData = (await this.db.get("autoDaily")) as Record<
        string,
        AutoDailyConfig
      >;
      if (!dailyData) return;

      const userIds = Object.keys(dailyData);
      const today = moment().tz(CONFIG.TAIPEI_TIMEZONE).format("YYYY-MM-DD");

      const stats = {
        total: 0,
        success: 0,
        alreadySigned: 0,
        failed: 0,
        skipped: 0,
      };

      for (const userId of userIds) {
        const config = dailyData[userId];
        let scheduledHour = Number(config.time ?? 13);
        if (!Number.isFinite(scheduledHour)) scheduledHour = 13;
        if (scheduledHour < 0 || scheduledHour > 23) scheduledHour = 13;

        // Catch-up behavior: if the bot missed the exact hour (restart/offline),
        // run once later the same day as long as it has not been processed today.
        if (currentHour < scheduledHour) continue;

        // Skip if already processed today
        const lastProcessed = await this.db.get(`${userId}.lastAutoDaily`);
        if (lastProcessed === today) continue;

        const result = await this.processUser(userId, config);
        if (!result) continue;

        stats.total += result.total;
        stats.success += result.success;
        stats.alreadySigned += result.alreadySigned;
        stats.failed += result.failed;
        stats.skipped += result.skipped;

        if (result.shouldMarkProcessed) {
          // Mark as processed only when at least one account was actually handled.
          await this.db.set(`${userId}.lastAutoDaily`, today);
        }
      }

      await this.updateStatistics(stats, startTime, currentHour);
    } catch (error: any) {
      this.logger.error(`自動簽到全局錯誤: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async processUser(userId: string, config: AutoDailyConfig) {
    const userLang = (await getUserLang(userId)) || "tw";
    const accounts = await this.db.get(`${userId}.account`);
    const tr = createTranslator(userLang);

    const stats: ProcessUserStats = {
      total: 0,
      success: 0,
      alreadySigned: 0,
      failed: 0,
      skipped: 0,
      shouldMarkProcessed: false,
    };

    if (!Array.isArray(accounts) || accounts.length === 0) {
      // Stale autoDaily setting: user has no account data but still enabled auto sign.
      await this.db.delete(`autoDaily.${userId}`);
      stats.skipped = 1;
      this.logger.error(`用戶 ${userId} 無帳號資料，已自動移除 autoDaily 設定`);
      return stats;
    }

    const results: SignInResult[] = [];

    const recoveredAccountIndices: number[] = [];
    const invalidAccountIndices: number[] = [];

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];

      // Skip accounts that have been marked invalid (login/cookie failure).
      // They will be un-marked automatically when a successful API call goes through.
      if (account.invalid === true) {
        stats.skipped++;
        continue;
      }

      stats.total++;
      try {
        const zzz = new ZenlessZoneZero({
          uid: account.uid,
          cookie: account.cookie,
          lang: this.getLanguage(userLang),
        });

        const info = await zzz.daily.info();
        let signResult;

        if (info.is_sign) {
          signResult = { status: "already_signed", info };
        } else {
          const claim = await zzz.daily.claim();
          if (
            claim.code === CONFIG.ERROR_CODES.ALREADY_SIGNED ||
            claim.info?.is_sign
          ) {
            signResult = { status: "already_signed", info: claim.info || info };
          } else {
            signResult = { status: "success", info: claim.info || info };
          }
        }

        const rewards = await zzz.daily.rewards();
        const reward =
          rewards.awards[signResult.info.total_sign_day] ||
          rewards.awards[0];

        const tomorrowReward = rewards.awards[signResult.info.total_sign_day + 1] || null;
        results.push({
          uid: account.uid,
          nickname: account.nickname || "Unknown",
          status: signResult.status as any,
          rewardName: reward.name,
          rewardCount: reward.cnt,
          rewardIcon: reward.icon,
          totalDays: signResult.info.total_sign_day,
          shortSignDay: signResult.info.total_sign_day,
          signCntMissed: Math.max(0, new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCDate() - 1 - signResult.info.total_sign_day),
          tomorrowRewardName: tomorrowReward?.name,
          tomorrowRewardIcon: tomorrowReward?.icon,
          tomorrowRewardCount: tomorrowReward?.cnt,
        });

        if (signResult.status === "success") stats.success++;
        else stats.alreadySigned++;

        // Successful API access means this account is usable again.
        if (account.invalid === true) {
          recoveredAccountIndices.push(i);
        }
      } catch (error: any) {
        const errorMessage = error.message;
        const normalizedErrorMessage = String(errorMessage || "").toLowerCase();
        const errorCode = Number(error?.code);
        stats.failed++;
        results.push({
          uid: account.uid,
          nickname: account.nickname || "Unknown",
          status: "failed",
          error: errorMessage,
        });

        // Track indices of accounts to mark as invalid
        if (
          normalizedErrorMessage.includes("login") ||
          normalizedErrorMessage.includes("尚未登入") ||
          normalizedErrorMessage.includes("尚未登录") ||
          normalizedErrorMessage.includes("cookie") ||
          normalizedErrorMessage.includes("token") ||
          normalizedErrorMessage.includes("expired") ||
          (normalizedErrorMessage.includes("uid") &&
            normalizedErrorMessage.includes("invalid")) ||
          normalizedErrorMessage.includes("given uid") ||
          errorCode === -100 ||
          errorCode === -1071
        ) {
          invalidAccountIndices.push(i);
        }

        if (this.errorWebhook) {
          const errorEmbed = new EmbedBuilder()
            .setColor("#E76161")
            .setTitle(`[自動簽到失敗] 用戶: ${userId}`)
            .addFields(
              { name: "UID", value: account.uid, inline: true },
              { name: "錯誤訊息", value: errorMessage, inline: true },
            )
            .setTimestamp();
          await this.errorWebhook
            .send({ embeds: [errorEmbed] })
            .catch(() => {});
        }
      }
    }

    // Only mark the day as processed when at least one account completed successfully
    // (or was already signed). This allows retry on later hourly runs after transient errors.
    stats.shouldMarkProcessed = stats.success + stats.alreadySigned > 0;

    if (results.length > 0) {
      await this.sendNotification(userId, config, results, tr);
    }

    if (recoveredAccountIndices.length > 0) {
      for (const idx of recoveredAccountIndices) {
        accounts[idx].invalid = false;
      }
      await this.db.set(`${userId}.account`, accounts);
    }

    // Now mark accounts as invalid AFTER notification has been sent
    if (invalidAccountIndices.length > 0) {
      for (const idx of invalidAccountIndices) {
        accounts[idx].invalid = true;
      }
      await this.db.set(`${userId}.account`, accounts);
    }

    return stats;
  }

  private async sendNotification(
    userId: string,
    config: AutoDailyConfig,
    results: SignInResult[],
    tr: any,
  ) {
    const tag =
      config.tag === "true" || config.tag === true ? `<@${userId}>` : "";

    let notifyMethod = config.notifyType || "dm";
    if (!config.notifyType && config.channelId) {
      notifyMethod = "channel";
    }

    // Separate failed results (embed only) from sign results (canvas card)
    const failedResults = results.filter((r) => r.status === "failed");
    const signedResults = results.filter((r) => r.status !== "failed");

    // Build canvas card files for signed results
    const cardFiles: { buffer: string; name: string }[] = [];
    for (let i = 0; i < signedResults.length; i++) {
      const res = signedResults[i];
      try {
        const buf = await buildZZZDailyCard({
          nickname: res.nickname || "Unknown",
          uid: res.uid,
          status: res.status as "success" | "already_signed",
          rewardName: res.rewardName || "",
          rewardIcon: res.rewardIcon,
          rewardCount: res.rewardCount ?? 1,
          totalDays: res.totalDays ?? 0,
          shortSignDay: res.shortSignDay,
          signCntMissed: res.signCntMissed,
          tomorrowRewardName: res.tomorrowRewardName,
          tomorrowRewardIcon: res.tomorrowRewardIcon,
          tomorrowRewardCount: res.tomorrowRewardCount,
          labelTodayReward: tr("card_TodayReward"),
          labelTomorrowReward: tr("card_TomorrowReward"),
          labelMonthSignIn: tr("card_MonthSignIn"),
          labelMonthMissed: tr("card_MonthMissed"),
        });
        cardFiles.push({
          buffer: buf.toString("base64"),
          name: `daily-zzz-${i}.png`,
        });
      } catch (e) {
        this.logger.error(`Canvas card 生成失敗 (${res.uid}): ${e}`);
      }
    }

    // Build error embeds for failed results
    const errorEmbeds = failedResults.map((res) => {
      const embed = new EmbedBuilder()
        .setColor("#E76161")
        .setTitle(`${res.uid} ${tr("daily_Failed")}`);
      if (res.error?.includes("10035")) {
        embed
          .setTitle(tr("autoDaily_GeetestTitle").replace("<uid>", res.uid))
          .setURL(
            `${getVerifyBaseUrl()}/verify?session=${Math.random().toString(36).substring(2, 12)}&userid=${userId}`,
          );
      } else {
        embed.setDescription(`Error: ${res.error}`);
      }
      return embed.toJSON();
    });

    try {
      if (notifyMethod === "dm") {
        // Send via REST DM (bypasses IPC, safe during shard reconnects)
        for (let i = 0; i < cardFiles.length; i++) {
          const cardFile = cardFiles[i];
          const isFirst = i === 0;
          const content = isFirst && tag ? tag : undefined;
          const fileBuffer = Buffer.from(cardFile.buffer, "base64");
          const sent = await sendRestDm(
            userId,
            { ...(content && { content }) },
            { buffer: fileBuffer, name: cardFile.name },
          ).then(() => true).catch(() => false);
          // Fallback to channel if DM failed
          if (!sent && config.channelId) {
            await sendRestMessage(
              config.channelId,
              { ...(content && { content }) },
              { buffer: fileBuffer, name: cardFile.name },
            ).catch(() => {});
          }
        }
        // Send error embeds (if any) via REST
        if (errorEmbeds.length > 0) {
          const sent = await sendRestDm(userId, { embeds: errorEmbeds })
            .then(() => true).catch(() => false);
          if (!sent && config.channelId) {
            await sendRestMessage(config.channelId, { embeds: errorEmbeds }).catch(() => {});
          }
        }
      } else {
        // Channel mode: send via REST directly
        const channelId = config.channelId!;
        for (let i = 0; i < cardFiles.length; i++) {
          const cardFile = cardFiles[i];
          const isFirst = i === 0;
          const content = isFirst && tag ? tag : undefined;
          await sendRestMessage(
            channelId,
            { ...(content && { content }) },
            { buffer: Buffer.from(cardFile.buffer, "base64"), name: cardFile.name },
          ).catch(() => {});
        }
        if (errorEmbeds.length > 0) {
          await sendRestMessage(channelId, { embeds: errorEmbeds }).catch(() => {});
        }
      }
    } catch (error) {
      this.logger.error(`發送通知失敗 (User: ${userId}): ${error}`);
    }
  }

  private async updateStatistics(
    stats: any,
    startTime: number,
    currentHour: number,
  ) {
    const duration = (Date.now() - startTime) / 1000;
    this.logger.success(
      `已完成 ${currentHour}:00 自動簽到: ${stats.total} 總數, ${stats.success} 成功, ${stats.alreadySigned} 已簽到, ${stats.skipped} 跳過, ${stats.failed} 失敗`,
    );

    if (this.webhook) {
      const statsEmbed = new EmbedBuilder()
        .setColor("#F2BE22")
        .setTitle(`${currentHour}:00 自動簽到統計`)
        .addFields(
          { name: "總數", value: `\`${stats.total}\``, inline: true },
          { name: "成功", value: `\`${stats.success}\``, inline: true },
          { name: "已簽到", value: `\`${stats.alreadySigned}\``, inline: true },
          { name: "跳過", value: `\`${stats.skipped}\``, inline: true },
          { name: "失敗", value: `\`${stats.failed}\``, inline: true },
          { name: "耗時", value: `\`${duration.toFixed(2)}s\``, inline: true },
        )
        .setTimestamp();
      await this.webhook.send({ embeds: [statsEmbed] }).catch(() => {});
    }
  }
}

let service: AutoDailyService | null = null;

export default async function autoDaily() {
  if (!service) service = new AutoDailyService();
  await service.run();
}
