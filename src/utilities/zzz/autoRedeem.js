import { client } from "../../index.js";
import { EmbedBuilder } from "discord.js";
import { ZenlessZoneZero, LanguageEnum } from "hoyoapi";
import { Logger } from "../core/logger.js";
import { createTranslator } from "../core/i18n.js";
import {
  getUserCookie,
  getUserLang,
  getUserUid,
  getRandomColor,
  getRedeemCodes,
} from "../utilities.js";

// Constants
const CONFIG = {
  TAIPEI_TIMEZONE: "Asia/Taipei",
  API_TIMEOUT: 10000,
  REDEEM_DELAY: 3000,
  MAX_RETRIES: 3,
  DEFAULT_LANGUAGE: "en",
  ERROR_CODES: {
    ALREADY_CLAIMED: -2017,
    CODE_CLAIMED: -2018,
    CODE_INVALID: -2001,
    CODE_EXPIRED: -2006,
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

class AutoRedeemSystem {
  constructor(client) {
    this.client = client;
    this.db = client.db;
    this.logger = new Logger("AutoRedeem");
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      alreadyClaimed: 0,
      invalid: 0,
    };
  }

  getLanguage(locale) {
    return LANGUAGE_MAPPING[locale] || LANGUAGE_MAPPING.default;
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getUserPreferences(userId) {
    try {
      const userLang = (await getUserLang(userId)) || CONFIG.DEFAULT_LANGUAGE;
      const accounts = await this.db.get(`${userId}.account`);
      return { userLang, accounts };
    } catch (error) {
      this.logger.error(
        `Failed to get user preferences for ${userId}: ${error.message}`
      );
      return {
        userLang: CONFIG.DEFAULT_LANGUAGE,
        accounts: [],
      };
    }
  }

  async withRetry(operation, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  async processCode(zzz, code, userRedeemedCodes) {
    try {
      const result = await this.withRetry(() => zzz.redeem.claim(code.code));

      const status = {
        success: result.retcode === 0 || result.message === "OK",
        alreadyClaimed: [
          CONFIG.ERROR_CODES.ALREADY_CLAIMED,
          CONFIG.ERROR_CODES.CODE_CLAIMED,
        ].includes(result.retcode),
        invalid: [
          CONFIG.ERROR_CODES.CODE_INVALID,
          CONFIG.ERROR_CODES.CODE_EXPIRED,
        ].includes(result.retcode),
        tokenInvalid: result.retcode === -1071,
      };

      if (status.success || status.alreadyClaimed || status.invalid) {
        userRedeemedCodes.push(code.code);
      }

      return {
        code,
        status,
        message: result.message,
      };
    } catch (error) {
      return {
        code,
        status: { failed: true },
        message: error.message,
      };
    }
  }

  formatResults(results, tr) {
    const description = [];
    const stats = {
      success: 0,
      alreadyClaimed: 0,
      invalid: 0,
      failed: 0,
    };

    results.forEach((result) => {
      const { code, status } = result;
      if (status.success) {
        description.push(`✅ **${code.code}** - (${tr("redeem_Success")})`);
        stats.success++;
      } else if (status.alreadyClaimed) {
        description.push(`ℹ️ **${code.code}** - (${tr("redeem_Already")})`);
        stats.alreadyClaimed++;
      } else if (status.invalid) {
        description.push(`⚠️ **${code.code}** - (${tr("redeem_Invalid")})`);
        stats.invalid++;
      } else {
        description.push(`❌ **${code.code}** - (${tr("redeem_Failed")})`);
        stats.failed++;
      }
    });

    if (description.length > 0) {
      description.push(`\n### ${tr("redeem_RedeemStats")}`);
      description.push(`✅ ${tr("redeem_Success")}: ${stats.success}`);
      description.push(`ℹ️ ${tr("redeem_Already")}: ${stats.alreadyClaimed}`);
      description.push(`⚠️ ${tr("redeem_Invalid")}: ${stats.invalid}`);
      description.push(`❌ ${tr("redeem_Failed")}: ${stats.failed}`);
    }

    return {
      description: description.join("\n"),
      stats,
    };
  }

  async processAccount(account, codes, context) {
    const { userId, userLang, tr } = context;
    const zzz = new ZenlessZoneZero({
      uid: account.uid,
      cookie: account.cookie,
      lang: this.getLanguage(userLang),
    });

    let userRedeemedCodes =
      (await this.db.get(`${account.uid}.redeemedCodes`)) || [];
    const unredeemedCodes = codes.filter(
      (code) => !userRedeemedCodes.includes(code.code)
    );

    if (!unredeemedCodes.length) return null;

    const results = [];
    for (const code of unredeemedCodes) {
      const result = await this.processCode(zzz, code, userRedeemedCodes);
      if (result.status.tokenInvalid) return null;
      results.push(result);
      await new Promise((resolve) => setTimeout(resolve, CONFIG.REDEEM_DELAY));
    }

    await this.db.set(`${account.uid}.redeemedCodes`, [
      ...new Set(userRedeemedCodes),
    ]);

    const { description, stats } = this.formatResults(results, tr);

    Object.entries(stats).forEach(([key, value]) => {
      this.stats[key] += value;
    });

    return {
      uid: account.uid,
      nickname: account.nickname,
      description,
      hasSuccess: stats.success > 0,
    };
  }

  async processRedemption(userId, redeemData, codesList) {
    const { userLang, accounts } = await this.getUserPreferences(userId);
    if (!accounts?.length) return;

    const channelId = redeemData[userId].channelId;
    const tag = redeemData[userId].tag === "true" ? `<@${userId}>` : "";
    const tr = createTranslator(userLang);

    const accountPromises = accounts.map(async (account, index) => {
      const cookie = await getUserCookie(userId, index);
      const uid = await getUserUid(userId, index);
      const redeemedCodes = (await this.db.get(`${uid}.redeemedCodes`)) || [];

      if (!cookie || !uid) return;

      try {
        await this.processAccount(account, codesList, {
          userId,
          channelId,
          tag,
          tr,
          userLang,
        });
      } catch (error) {
        console.log(error);
        this.logger.error(`Failed to process account ${uid}: ${error.message}`);
        this.stats.failed++;
      }
    });

    await Promise.allSettled(accountPromises);
  }

  async sendRedeemMessage(channelId, data) {
    const embed = new EmbedBuilder()
      .setColor(getRandomColor())
      .setTitle(data.tr("Auto") + data.tr("redeem_SuccessDesc"))
      .setDescription(data.description)
      .setThumbnail(
        "https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4c/Item_Polychrome.png"
      )
      .setTimestamp();

    try {
      await this.client.cluster.broadcastEval(
        async (c, { channelId, content, embed }) => {
          const channel = c.channels.cache.get(channelId);
          if (channel) await channel.send({ content, embeds: [embed] });
        },
        {
          context: { channelId, content: data.tag || "", embed },
          timeout: CONFIG.API_TIMEOUT,
        }
      );
    } catch (error) {
      this.logger.error(
        `Failed to send message to channel ${channelId}: ${error.message}`
      );
    }
  }

  async updateStatistics(nowTime) {
    this.logger.success(
      `Completed ${nowTime}:00 auto redemption: ${this.stats.total} total, ` +
        `${this.stats.success} successful, ${this.stats.failed} failed`
    );
  }
}

export default async function autoRedeem() {
  const system = new AutoRedeemSystem(client);

  const redeemData = await system.db.get("autoRedeem");
  if (!redeemData) return;

  const currentHour = new Date().toLocaleString("en-US", {
    timeZone: CONFIG.TAIPEI_TIMEZONE,
    hour: "numeric",
    hour12: false,
  });

  system.logger.info(`Starting ${currentHour}:00 auto redemption`);

  try {
    const codesList = await getRedeemCodes();

    for (const userId of Object.keys(redeemData)) {
      try {
        await system.processRedemption(userId, redeemData, codesList);
      } catch (error) {
        system.logger.error(
          `Error processing user ${userId}: ${error.message}`
        );
      }
    }

    await system.updateStatistics(currentHour);
  } catch (error) {
    system.logger.error(`Auto redemption failed: ${error.message}`);
  }
}
