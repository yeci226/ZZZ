import { client } from "../../index.js";
import {
  ColorResolvable,
  EmbedBuilder,
  WebhookClient,
  MessageFlags,
} from "discord.js";
import { ZenlessZoneZero, LanguageEnum } from "@yeci226/hoyoapi";
import moment from "moment-timezone";
import Logger from "../core/logger.js";
import { createTranslator } from "../core/i18n.js";
import { getUserCookie, getUserLang, getRandomColor } from "../utilities.js";
import { getConfig } from "../core/config.js";

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
  error?: string;
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

  private isSkippableError(errorMessage: string) {
    const skipPatterns = [
      "failed to fetch",
      "network error",
      "timeout",
      "eai_again",
    ];
    return skipPatterns.some((pattern) =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase()),
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
        let scheduledTime = config.time || "13";
        if (parseInt(scheduledTime as string) === 24) scheduledTime = 0;

        if (parseInt(scheduledTime as string) !== currentHour) continue;

        // Skip if already processed today
        const lastProcessed = await this.db.get(`${userId}.lastAutoDaily`);
        if (lastProcessed === today) continue;

        const result = await this.processUser(userId, config);
        if (result) {
          stats.total += result.total;
          stats.success += result.success;
          stats.alreadySigned += result.alreadySigned;
          stats.failed += result.failed;
          stats.skipped += result.skipped;
        }

        // Mark as processed
        await this.db.set(`${userId}.lastAutoDaily`, today);
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

    if (!accounts || accounts.length === 0) return null;

    const results: SignInResult[] = [];
    const stats = {
      total: 0,
      success: 0,
      alreadySigned: 0,
      failed: 0,
      skipped: 0,
    };

    const invalidAccountIndices: number[] = [];

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      if (account.invalid) {
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
          rewards.awards[signResult.info.total_sign_day - 1] ||
          rewards.awards[0];

        results.push({
          uid: account.uid,
          nickname: account.nickname || "Unknown",
          status: signResult.status as any,
          rewardName: reward.name,
          rewardCount: reward.cnt,
          rewardIcon: reward.icon,
          totalDays: signResult.info.total_sign_day,
        });

        if (signResult.status === "success") stats.success++;
        else stats.alreadySigned++;
      } catch (error: any) {
        const errorMessage = error.message;
        if (this.isSkippableError(errorMessage)) {
          stats.skipped++;
        } else {
          stats.failed++;
          results.push({
            uid: account.uid,
            nickname: account.nickname || "Unknown",
            status: "failed",
            error: errorMessage,
          });

          // Track indices of accounts to mark as invalid
          if (
            errorMessage.includes("login") ||
            errorMessage.includes("cookie") ||
            error.code === -100
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
    }

    if (results.length > 0) {
      await this.sendNotification(userId, config, results, tr);
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
    const embeds = results.map((res) => {
      if (res.status === "failed") {
        const embed = new EmbedBuilder()
          .setColor("#E76161")
          .setTitle(`${res.uid} ${tr("daily_Failed")}`);
        if (res.error?.includes("10035")) {
          const appConfig = getConfig();
          embed
            .setTitle(`${res.uid} 請先通過 Geetest 來繼續自動簽到！`)
            .setURL(
              `${(appConfig as any).VERIFY_PUBLIC_URL || "https://verify.yeci.lol/zzz"}/verify?session=${Math.random().toString(36).substring(2, 12)}&userid=${userId}`,
            );
        } else {
          embed.setDescription(`Error: ${res.error}`);
        }
        return embed;
      }

      return new EmbedBuilder()
        .setColor(getRandomColor() as ColorResolvable)
        .setTitle(
          `${res.nickname} (${res.uid}) ${tr("Auto")}${tr("daily_SignSuccess")}`,
        )
        .setThumbnail(res.rewardIcon || null)
        .setDescription(
          tr("daily_Description", {
            a: `\`${res.rewardName}x${res.rewardCount || 1}\``,
          }) +
            `\n\n### ${tr("daily_SignedDay", { z: `\`${res.totalDays}\`` })}`,
        );
    });

    const tag =
      config.tag === "true" || config.tag === true ? `<@${userId}>` : "";

    // Improved notify method logic
    let notifyMethod = config.notifyType || "dm";
    if (!config.notifyType && config.channelId) {
      notifyMethod = "channel"; // Default to channel if ID exists but type is unset
    }

    try {
      await this.client.cluster.broadcastEval(
        async (c: any, context: any) => {
          const { userId, channelId, notifyMethod, content, embeds } = context;
          try {
            if (notifyMethod === "dm") {
              const user = await c.users.fetch(userId).catch(() => null);
              if (user) {
                await user.send({ content, embeds }).catch(async () => {
                  // Fallback to channel if DM fails
                  const channel = c.channels.cache.get(channelId);
                  if (channel) await channel.send({ content, embeds });
                });
                return;
              }
            }
            const channel = c.channels.cache.get(channelId);
            if (channel) await channel.send({ content, embeds });
          } catch (e) {}
        },
        {
          context: {
            userId,
            channelId: config.channelId,
            notifyMethod,
            content: tag,
            embeds: embeds.map((e) => e.toJSON()),
          },
        },
      );
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
