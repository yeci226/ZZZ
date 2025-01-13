import { client } from "../../index.js";
import { EmbedBuilder, WebhookClient } from "discord.js";
import { ZenlessZoneZero, LanguageEnum } from "hoyoapi";
import { Logger } from "../core/logger.js";
import { createTranslator } from "../core/i18n.js";

// Constants
const CONFIG = {
  TAIPEI_TIMEZONE: "Asia/Taipei",
  API_TIMEOUT: 10000,
  WEBHOOK_RETRIES: 3,
  DEFAULT_LANGUAGE: "en",
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

class AutoDailySignSystem {
  constructor(client, webhookUrl) {
    this.client = client;
    this.db = client.db;
    this.webhook = new WebhookClient({ url: webhookUrl });
    this.logger = new Logger("AutoDailySign");
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      signed: 0,
    };
  }

  async initialize() {
    if (!this.webhook?.url) {
      throw new Error("Invalid webhook configuration");
    }
  }

  getLanguage(locale) {
    return LANGUAGE_MAPPING[locale] || LANGUAGE_MAPPING.default;
  }

  async getUserPreferences(userId) {
    try {
      const userLang =
        (await this.db.get(`${userId}.locale`)) || CONFIG.DEFAULT_LANGUAGE;
      const accounts = await this.db.get(`${userId}.account`);
      return { userLang, accounts };
    } catch (error) {
      this.logger.error(
        `Failed to get user preferences for ${userId}: ${error.message}`
      );
      return { userLang: CONFIG.DEFAULT_LANGUAGE, accounts: [] };
    }
  }

  async processDailySign(userId, dailyData) {
    const { userLang, accounts } = await this.getUserPreferences(userId);
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return;
    }

    const tr = createTranslator(userLang);
    const channelId = dailyData[userId].channelId;
    const tag = dailyData[userId].tag === "true" ? `<@${userId}>` : "";

    const signPromises = accounts.map(async (account) => {
      if (!account.cookie || !account.uid) {
        return;
      }

      try {
        await this.performSignIn(account, userLang, userId, channelId, tag, tr);
      } catch (error) {
        this.logger.error(
          `Sign-in failed for UID ${account.uid}: ${error.message}`
        );
        this.stats.failed++;
      }
    });

    await Promise.allSettled(signPromises);
  }

  async performSignIn(account, userLang, userId, channelId, tag, tr) {
    this.stats.total++;

    const zzz = new ZenlessZoneZero({
      cookie: account.cookie,
      lang: this.getLanguage(userLang),
    });

    try {
      const result = await zzz.daily.claim();
      if (result.code === -5003 || result.info.is_sign === true) {
        this.stats.signed++;
        return;
      }

      const [info, reward, rewards] = await Promise.all([
        zzz.daily.info(),
        zzz.daily.reward(),
        zzz.daily.rewards(),
      ]);
      const todaySign =
        rewards.awards[info.total_sign_day - 1] || rewards.awards[0];
      const tmrSign = rewards.awards[info.total_sign_day];

      this.stats.success++;
      await this.sendSuccessMessage(channelId, {
        tag,
        uid: account.uid,
        tr,
        info,
        reward,
        todaySign,
        tmrSign,
        userId,
      });
    } catch (error) {
      throw new Error(`API Error: ${error.message}`);
    }
  }

  async sendSuccessMessage(channelId, data) {
    const embed = new EmbedBuilder()
      .setColor(this.getRandomColor())
      .setTitle(`${data.uid} ${data.tr("Auto")}${data.tr("daily_SignSuccess")}`)
      .setThumbnail(data.todaySign?.icon)
      .setDescription(this.buildDescription(data))
      .addFields(this.buildEmbedFields(data));

    try {
      await this.client.cluster.broadcastEval(
        async (c, { channelId, content, embed }) => {
          const channel = c.channels.cache.get(channelId);
          if (channel) {
            await channel.send({ content, embeds: [embed] });
          }
        },
        {
          context: { channelId, embed },
          timeout: CONFIG.API_TIMEOUT,
        }
      );
    } catch (error) {
      this.logger.error(
        `Failed to send message to channel ${channelId}: ${error.message}`
      );
    }
  }

  buildDescription(data) {
    const baseDesc = data.tr("daily_Description", {
      a: `\`${data.todaySign?.name}x${data.todaySign?.cnt}\``,
    });

    if (data.info.month_last_day) {
      return baseDesc;
    }

    return `${baseDesc}\n\n<@${data.userId}> ${data.tr("daily_DescriptionTmr", {
      b: `\`${data.tmrSign?.name}x${data.tmrSign?.cnt}\``,
    })}`;
  }

  buildEmbedFields(data) {
    return [
      {
        name: `${data.reward.month} ${data.tr("daily_Month")}`,
        value: "\u200b",
        inline: true,
      },
      {
        name: data.tr("daily_SignedDay", {
          z: `\`${data.info.total_sign_day}\``,
        }),
        value: "\u200b",
        inline: true,
      },
      {
        name: data.tr("daily_MissedDay", {
          z: `\`${data.info.sign_cnt_missed}\``,
        }),
        value: "\u200b",
        inline: true,
      },
    ];
  }

  getRandomColor() {
    return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
  }

  async updateStatistics(startTime, currentHour) {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const averageTime = this.stats.total > 0 ? duration / this.stats.total : 0;

    this.logger.success(
      `Completed ${currentHour}:00 auto sign-in: ${this.stats.total} total, ` +
        `${this.stats.success} successful, ${this.stats.signed} already signed, ` +
        `${this.stats.failed} failed`
    );

    const statsEmbed = new EmbedBuilder()
      .setColor("#F2BE22")
      .setTitle(`${currentHour}:00 Auto Sign-in Stats`)
      .setTimestamp()
      .addFields(this.buildStatsFields(duration, averageTime));

    await this.webhook.send({ embeds: [statsEmbed] });
  }

  buildStatsFields(duration, averageTime) {
    return [
      {
        name: `Total Users: \`${this.stats.total}\``,
        value: "\u200b",
        inline: false,
      },
      {
        name: `Successful: \`${this.stats.success}\``,
        value: "\u200b",
        inline: true,
      },
      {
        name: `Already Signed: \`${this.stats.signed}\``,
        value: "\u200b",
        inline: true,
      },
      {
        name: `Failed: \`${this.stats.failed}\``,
        value: "\u200b",
        inline: true,
      },
      {
        name: `Total Duration: \`${duration.toFixed(3)}\` seconds`,
        value: "\u200b",
        inline: true,
      },
      {
        name: `Average Time: \`${averageTime.toFixed(3)}\` seconds`,
        value: "\u200b",
        inline: true,
      },
    ];
  }
}

export default async function autoDailySign() {
  const system = new AutoDailySignSystem(client, process.env.LOGWEBHOOK);
  await system.initialize();

  const dailyData = await system.db.get("autoDaily");
  if (!dailyData) return;

  const currentHour = new Date().toLocaleString("en-US", {
    timeZone: CONFIG.TAIPEI_TIMEZONE,
    hour: "numeric",
    hour12: false,
  });

  const startTime = Date.now();
  system.logger.success(`Starting ${currentHour}:00 auto sign-in`);

  for (const userId of Object.keys(dailyData)) {
    const scheduledTime = dailyData[userId]?.time || "13";

    if (parseInt(scheduledTime) === parseInt(currentHour)) {
      try {
        await system.processDailySign(userId, dailyData);
      } catch (error) {
        system.logger.error(
          `Error processing user ${userId}: ${error.message}`
        );
      }
    }
  }

  await system.updateStatistics(startTime, currentHour);
}
