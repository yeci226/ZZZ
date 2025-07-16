import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { ZenlessZoneZero, LanguageEnum } from '@yeci226/hoyoapi';
import { cluster, database } from '@/index.js';

import { getUserLang, getRandomColor, getRedeemCodes } from '@/utilities';
import Logger from '@/utilities/core/logger';
import { createTranslator } from '@/utilities/core/i18n';
import { Account } from '@/types';

// Constants
const CONFIG = {
  TAIPEI_TIMEZONE: 'Asia/Taipei',
  API_TIMEOUT: 10000,
  REDEEM_DELAY: 3000,
  MAX_RETRIES: 3,
  DEFAULT_LANGUAGE: 'en',
  ERROR_CODES: {
    ALREADY_CLAIMED: -2017,
    CODE_CLAIMED: -2018,
    CODE_INVALID: -2001,
    CODE_EXPIRED: -2006,
  },
};

class AutoRedeemSystem {
  stats: {
    total: number;
    success: number;
    failed: number;
    alreadyClaimed: number;
    invalid: number;
  };

  constructor() {
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      alreadyClaimed: 0,
      invalid: 0,
    };
  }

  async getUserPreferences(userId: string) {
    try {
      const userLang = (await getUserLang(userId)) || CONFIG.DEFAULT_LANGUAGE;
      const accounts = await database.get(`${userId}.account`);
      return { userLang, accounts };
    } catch (error: any) {
      new Logger('自動兌換').error(`獲取使用者偏好設定失敗: ${error.message}`);
      return { userLang: CONFIG.DEFAULT_LANGUAGE, accounts: [] };
    }
  }

  async withRetry(operation: () => Promise<any>, maxRetries = CONFIG.MAX_RETRIES) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        if (attempt === maxRetries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  formatResult(locale: LanguageEnum, result: { redeemCode: string; status: string; message: string }, userId: string) {
    const tr = createTranslator(locale);

    if (result.status === 'failed') {
      return null;
    }

    const embed = new EmbedBuilder()
      .setColor(getRandomColor())
      .setTitle(`${result.redeemCode} ${tr('Auto')}${tr('redeem_SuccessDesc')}`)
      .setThumbnail('https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4c/Item_Polychrome.png')
      .setDescription(`${tr('redeem_Description', { a: `\`${result.redeemCode}\`` })}`)
      .addFields(
        { name: tr('redeem_Reward', { z: `\`${result.redeemCode}\`` }), value: '\u200b', inline: true },
        { name: tr('redeem_Message', { z: `\`${result.message}\`` }), value: '\u200b', inline: true },
      );

    return embed;
  }

  async processCode(zzz: ZenlessZoneZero, redeemCode: string): Promise<{ redeemCode: string; status: 'success' | 'alreadyClaimed' | 'invalid' | 'tokenInvalid' | 'failed'; message: string }> {
    try {
      const result = await this.withRetry(() => zzz.redeem.claim(redeemCode));

      let status: 'success' | 'alreadyClaimed' | 'invalid' | 'tokenInvalid' | 'failed' = 'failed';

      if (result.retcode === 0 || result.message === 'OK') {
        status = 'success';
      } else if ([CONFIG.ERROR_CODES.ALREADY_CLAIMED, CONFIG.ERROR_CODES.CODE_CLAIMED].includes(result.retcode)) {
        status = 'alreadyClaimed';
      } else if ([CONFIG.ERROR_CODES.CODE_INVALID, CONFIG.ERROR_CODES.CODE_EXPIRED].includes(result.retcode)) {
        status = 'invalid';
      } else if (result.retcode === -1071) {
        status = 'tokenInvalid';
      }

      if (status === 'tokenInvalid') {
        await database.set(`${zzz.uid}.cookieExpired`, true);
      }

      return { redeemCode, status, message: result.message };
    } catch (error: any) {
      return { redeemCode, status: 'failed', message: error.message };
    }
  }

  async processAccount(locale: LanguageEnum, userId: string, account: Account, channelId: string, tag: string, availableRedeemCodes: string[]) {
    const zzz = new ZenlessZoneZero({ uid: account.uid, cookie: account.cookie, lang: locale });

    const userRedeemedCodes = (await database.get(`${account.uid}.redeemedCodes`)) || [];
    const unRedeemedCodes = availableRedeemCodes.filter((code) => !userRedeemedCodes.includes(code));

    if (unRedeemedCodes.length > 0) {
      const results = [];

      for (const redeemCode of unRedeemedCodes) {
        const result = await this.processCode(zzz, redeemCode);

        switch (result.status) {
          case 'tokenInvalid':
            await database.set(`${account.uid}.cookieExpired`, true);
            this.stats.failed++;
            break;
          case 'success':
            userRedeemedCodes.push(redeemCode);
            this.stats.success++;
            break;
          case 'alreadyClaimed':
            userRedeemedCodes.push(redeemCode);
            this.stats.alreadyClaimed++;
            break;
          case 'invalid':
            userRedeemedCodes.push(redeemCode);
            this.stats.invalid++;
            break;
          default:
            this.stats.failed++;
        }

        results.push(result);

        if (result.status === 'success') {
          const embed = this.formatResult(locale, result, userId);
          if (embed) await this.sendMessage(channelId, { content: tag, embed });
        }

        await new Promise((resolve) => setTimeout(resolve, CONFIG.REDEEM_DELAY));
      }

      await database.set(`${account.uid}.redeemedCodes`, [...new Set(userRedeemedCodes)]);
    }
  }

  async processUser(userId: string, redeemData: Record<string, any>, availableRedeemCodes: string[]) {
    const userLang = (await getUserLang(userId)) || CONFIG.DEFAULT_LANGUAGE;

    const accounts = await database.get(`${userId}.account`);
    if (!accounts?.length) return;

    const channelId = redeemData[userId].channelId;
    const tag = redeemData[userId].tag === 'true' ? `<@${userId}>` : '';

    for (const account of accounts) {
      if (!account || !account.uid || !account.cookie) return;

      await this.processAccount(userLang, userId, account, channelId, tag, availableRedeemCodes);

      this.stats.total++;
    }
  }

  async sendMessage(channelId: string, data: Record<string, any>) {
    const embed = new EmbedBuilder()
      .setColor(getRandomColor())
      .setTitle(data.tr('Auto') + data.tr('redeem_SuccessDesc'))
      .setDescription(data.description)
      .setThumbnail('https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4c/Item_Polychrome.png')
      .setTimestamp();

    await cluster.broadcastEval(
      async (c: Client, { channelId, content, embed }: { channelId: string; content: string; embed: EmbedBuilder }) => {
        const channel = c.channels.cache.get(channelId);
        if (channel && channel.isTextBased()) await (channel as TextChannel).send({ content, embeds: [embed] });
      },
      { context: { channelId, content: data.content, embed: data.embed }, timeout: CONFIG.API_TIMEOUT },
    );
  }

  updateStatistics(nowTime: string, duration: number, averageTime: number) {
    new Logger('自動兌換').info('========== 自動兌換統計 ==========');
    new Logger('自動兌換').info(`時間: ${nowTime}:00`);
    new Logger('自動兌換').info(`總計處理: ${this.stats.total} 個禮包碼`);
    new Logger('自動兌換').info(`成功兌換: ${this.stats.success} 個`);
    new Logger('自動兌換').info(`已兌換過: ${this.stats.alreadyClaimed} 個`);
    new Logger('自動兌換').info(`無效代碼: ${this.stats.invalid} 個`);
    new Logger('自動兌換').info(`兌換失敗: ${this.stats.failed} 個`);
    new Logger('自動兌換').info(`總時間: ${duration.toFixed(3)} 秒`);
    new Logger('自動兌換').info(`平均時間: ${averageTime.toFixed(3)} 秒`);
  }
}

export default async function autoRedeem() {
  try {
    const system = new AutoRedeemSystem();

    const currentHour = new Date().toLocaleString('en-US', {
      timeZone: CONFIG.TAIPEI_TIMEZONE,
      hour: 'numeric',
      hour12: false,
    });

    new Logger('自動兌換').info('========== 開始自動兌換 ==========');
    new Logger('自動兌換').info(`執行時間: ${currentHour}:00`);

    const startTime = Date.now();

    const redeemData = await database.get('autoRedeem');
    if (!redeemData) {
      new Logger('自動兌換').info('沒有找到需要自動兌換的用戶數據');
    } else {
      const codesList = await getRedeemCodes();
      new Logger('自動兌換').info(`已獲取 ${codesList.length} 個禮包碼`);

      for (const userId of Object.keys(redeemData)) {
        try {
          await system.processUser(userId, redeemData, codesList);
        } catch (error: any) {
          new Logger('自動兌換').error(`處理用戶 ${userId} 時發生錯誤: ${error.message}`);
        }
      }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const averageTime = system.stats.total > 0 ? duration / system.stats.total : 0;

    system.updateStatistics(currentHour, duration, averageTime);

    new Logger('自動兌換').info('========== 自動兌換結束 ==========');
  } catch (error: any) {
    new Logger('自動兌換').error(`自動兌換過程中發生錯誤: ${error.message}`);
  }
}
