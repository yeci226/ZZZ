import { client } from "../../index.js";
import { EmbedBuilder, WebhookClient } from "discord.js";
import { ZenlessZoneZero, LanguageEnum } from "@yeci226/hoyoapi";
import Logger from "../core/logger.js";
import { createTranslator } from "../core/i18n.js";
import {
  getUserCookie,
  getUserLang,
  getUserUid,
  getRandomColor,
} from "../utilities.js";

const CONFIG = {
  TAIPEI_TIMEZONE: "Asia/Taipei",
  API_TIMEOUT: 10000,
  MAX_RETRIES: 3,
  DEFAULT_LANGUAGE: "en",
  ERROR_CODES: {
    ALREADY_SIGNED: -5003,
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

class AutoDailySignSystem {
  constructor(client, webhookUrl) {
    this.client = client;
    this.db = client.db;
    this.webhook = webhookUrl ? new WebhookClient({ url: webhookUrl }) : null;
    this.logger = new Logger("自動簽到");
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      alreadySigned: 0,
    };
  }

  async withRetry(operation, maxRetries = CONFIG.MAX_RETRIES) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  getLanguage(locale) {
    return LANGUAGE_MAPPING[locale] || LANGUAGE_MAPPING.default;
  }

  async processSignIn(zzz, context) {
    try {
      // 使用 Promise.all 並行獲取所需信息
      const [info, reward, rewards] = await Promise.all([
        this.withRetry(() => zzz.daily.info()),
        this.withRetry(() => zzz.daily.reward()),
        this.withRetry(() => zzz.daily.rewards()),
      ]);

      const result = await this.withRetry(() => zzz.daily.claim());

      if (
        result.code === CONFIG.ERROR_CODES.ALREADY_SIGNED ||
        result.info.is_sign
      ) {
        return {
          status: "already_signed",
          info,
          reward,
          rewards,
        };
      }

      return {
        status: "success",
        info,
        reward,
        rewards,
      };
    } catch (error) {
      return {
        status: "failed",
        error: error.message,
      };
    }
  }

  formatSignInResult(result, userId, tr) {
    if (result.status === "failed") {
      return null;
    }

    const { info, reward, rewards } = result;
    const todaySign = rewards.awards[info.total_sign_day] || rewards.awards[0];
    const tmrSign =
      rewards.awards[info.total_sign_day + 1] || rewards.awards[1];

    const embed = new EmbedBuilder()
      .setColor(getRandomColor())
      .setTitle(`${result.uid} ${tr("Auto")}${tr("daily_SignSuccess")}`)
      .setThumbnail(todaySign?.icon)
      .setDescription(
        `${tr("daily_Description", {
          a: `\`${todaySign?.name}x${todaySign?.cnt}\``,
        })}${
          info.month_last_day
            ? ""
            : `\n\n<@${userId}> ${tr("daily_DescriptionTmr", {
                b: `\`${tmrSign?.name}x${tmrSign?.cnt}\``,
              })}`
        }`
      )
      .addFields(
        {
          name: `${reward.month} ${tr("daily_Month")}`,
          value: "\u200b",
          inline: true,
        },
        {
          name: tr("daily_SignedDay", { z: `\`${info.total_sign_day}\`` }),
          value: "\u200b",
          inline: true,
        },
        {
          name: tr("daily_MissedDay", { z: `\`${info.sign_cnt_missed}\`` }),
          value: "\u200b",
          inline: true,
        }
      );

    return embed;
  }

  async processAccount(account, context) {
    const { userId, userLang, tr } = context;
    const zzz = new ZenlessZoneZero({
      cookie: account.cookie,
      lang: this.getLanguage(userLang),
    });

    try {
      const result = await this.processSignIn(zzz, context);
      result.uid = account.uid;

      switch (result.status) {
        case "success":
          this.stats.success++;
          break;
        case "already_signed":
          this.stats.alreadySigned++;
          break;
        case "failed":
          this.stats.failed++;
          break;
      }

      if (result.status === "success") {
        const embed = this.formatSignInResult(result, userId, tr);
        if (embed) {
          await this.sendMessage(context.channelId, {
            content: context.tag,
            embed,
          });
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`處理帳號 ${account.uid} 時發生錯誤: ${error.message}`);
      this.stats.failed++;
      return { status: "failed", error: error.message };
    }
  }

  async processUser(userId, dailyData) {
    const userLang = (await getUserLang(userId)) || CONFIG.DEFAULT_LANGUAGE;
    const accounts = await this.db.get(`${userId}.account`);

    if (!accounts?.length) return;

    const channelId = dailyData[userId].channelId;
    const tag = dailyData[userId].tag === "true" ? `<@${userId}>` : "";
    const tr = createTranslator(userLang);

    for (const account of accounts) {
      this.stats.total++;
      const cookie = await getUserCookie(userId, accounts.indexOf(account));
      if (!cookie) continue;

      await this.processAccount(account, {
        userId,
        channelId,
        tag,
        tr,
        userLang,
      });
    }
  }

  async sendMessage(channelId, data) {
    try {
      await this.client.cluster.broadcastEval(
        async (c, { channelId, content, embed }) => {
          const channel = c.channels.cache.get(channelId);
          if (channel) await channel.send({ content, embeds: [embed] });
        },
        {
          context: { channelId, content: data.content, embed: data.embed },
          timeout: CONFIG.API_TIMEOUT,
        }
      );
    } catch (error) {
      this.logger.error(
        `發送訊息至頻道 ${channelId} 時發生錯誤: ${error.message}`
      );
    }
  }

  async updateStatistics(startTime, currentHour) {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const averageTime = this.stats.total > 0 ? duration / this.stats.total : 0;

    const statsEmbed = new EmbedBuilder()
      .setColor("#F2BE22")
      .setTitle(`${currentHour}:00 自動簽到統計`)
      .setTimestamp()
      .addFields([
        {
          name: `總數: \`${this.stats.total}\``,
          value: "\u200b",
          inline: false,
        },
        {
          name: `成功: \`${this.stats.success}\``,
          value: "\u200b",
          inline: true,
        },
        {
          name: `已簽到: \`${this.stats.alreadySigned}\``,
          value: "\u200b",
          inline: true,
        },
        {
          name: `失敗: \`${this.stats.failed}\``,
          value: "\u200b",
          inline: true,
        },
        {
          name: `總時間: \`${duration.toFixed(3)}\` 秒`,
          value: "\u200b",
          inline: true,
        },
        {
          name: `平均時間: \`${averageTime.toFixed(3)}\` 秒`,
          value: "\u200b",
          inline: true,
        },
      ]);

    if (this.webhook) {
      await this.webhook.send({ embeds: [statsEmbed] });
    }
    this.logger.success(
      `已完成 ${currentHour}:00 自動簽到: ${this.stats.total} 總數, ` +
        `${this.stats.success} 成功, ${this.stats.alreadySigned} 已簽到, ` +
        `${this.stats.failed} 失敗`
    );
  }
}

export default async function autoDailySign() {
  const system = new AutoDailySignSystem(client, process.env.LOGWEBHOOK);

  const dailyData = await system.db.get("autoDaily");
  if (!dailyData) return;

  const currentHour = new Date().toLocaleString("en-US", {
    timeZone: CONFIG.TAIPEI_TIMEZONE,
    hour: "numeric",
    hour12: false,
  });

  const startTime = Date.now();
  system.logger.info(`正在進行 ${currentHour}:00 自動簽到`);

  try {
    for (const userId of Object.keys(dailyData)) {
      const scheduledTime = dailyData[userId]?.time || "13";
      if (parseInt(scheduledTime) === parseInt(currentHour)) {
        await system.processUser(userId, dailyData);
      }
    }

    await system.updateStatistics(startTime, currentHour);
  } catch (error) {
    system.logger.error(`自動簽到失敗: ${error.message}`);
  }
}
