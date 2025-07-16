import { EmbedBuilder } from 'discord.js';
import { ZenlessZoneZero, LanguageEnum } from '@yeci226/hoyoapi';
import { cluster, database } from '@/index.js';

import { getUserCookie, getUserLang, getUserUid, getRandomColor, getRedeemCodes, updateCookie } from '@/utilities';
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

  formatResults(locale: LanguageEnum, results: { code: string; status: 'success' | 'alreadyClaimed' | 'invalid' | 'tokenInvalid' | 'failed'; message: string }[]) {
    const tr = createTranslator(locale);

    const description = [];
    const stats = {
      success: 0,
      alreadyClaimed: 0,
      invalid: 0,
      failed: 0,
    };

    results.forEach((result) => {
      const { code, status } = result;
      if (status === 'success') {
        description.push(`✅ **${code}** - (${tr('redeem_Success')})`);
        stats.success++;
      } else if (status === 'alreadyClaimed') {
        description.push(`ℹ️ **${code}** - (${tr('redeem_Already')})`);
        stats.alreadyClaimed++;
      } else if (status === 'invalid') {
        description.push(`⚠️ **${code}** - (${tr('redeem_Invalid')})`);
        stats.invalid++;
      } else {
        description.push(`❌ **${code}** - (${tr('redeem_Failed')})`);
        stats.failed++;
      }
    });

    if (description.length > 0) {
      description.push(`\n### ${tr('redeem_RedeemStats')}`);
      description.push(`✅ ${tr('redeem_Success')}: ${stats.success}`);
      description.push(`ℹ️ ${tr('redeem_Already')}: ${stats.alreadyClaimed}`);
      description.push(`⚠️ ${tr('redeem_Invalid')}: ${stats.invalid}`);
      description.push(`❌ ${tr('redeem_Failed')}: ${stats.failed}`);
    }

    return {
      description: description.join('\n'),
      stats,
    };
  }

  async processCode(
    zzz: ZenlessZoneZero,
    code: string,
    userRedeemedCodes: string[],
    uid: number,
  ): Promise<{ code: string; status: 'success' | 'alreadyClaimed' | 'invalid' | 'tokenInvalid' | 'failed'; message: string }> {
    try {
      const result = await this.withRetry(() => zzz.redeem.claim(code));

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

      if (status === 'success' || status === 'alreadyClaimed' || status === 'invalid') {
        userRedeemedCodes.push(code);
      }

      if (status === 'tokenInvalid') {
        await database.set(`${uid}.cookieExpired`, true);
      }

      return { code, status, message: result.message };
    } catch (error: any) {
      return { code, status: 'failed', message: error.message };
    }
  }

  async processAccount(locale: LanguageEnum, userId: string, account: Account, accountIndex: number, accountNickname: string, codes: string[]) {
    const userLang = await getUserLang(userId);

    const isCookieExpired = await database.get(`${account.uid}.cookieExpired`);
    if (isCookieExpired) {
      new Logger('自動兌換').warn(`[用戶 ${userId}] [帳號 #${accountIndex}] 的Cookie已過期，跳過兌換流程`);
      return;
    }

    const zzz = new ZenlessZoneZero({ uid: account.uid, cookie: account.cookie, lang: userLang });

    const userRedeemedCodes = (await database.get(`${account.uid}.redeemedCodes`)) || [];
    const unRedeemedCodes = codes.filter((code) => !userRedeemedCodes.includes(code));

    new Logger('自動兌換').info(`[用戶 ${userId}] [帳號 #${accountIndex}] 正在處理禮包碼，總數: ${unRedeemedCodes.length}`);

    if (!unRedeemedCodes || unRedeemedCodes.length === 0) {
      try {
        const lastCookieRefresh = (await database.get(`${account.uid}.lastCookieRefresh`)) || 0;
        const currentTime = Date.now();
        const oneDayInMs = 24 * 60 * 60 * 1000; // 24 Hours

        if (currentTime - lastCookieRefresh >= oneDayInMs) {
          await updateCookie(userId, accountIndex, account.cookie);
          await database.set(`${account.uid}.lastCookieRefresh`, currentTime);
          new Logger('自動兌換').success(`[用戶 ${userId}] [帳號 #${accountIndex}] 沒有未兌換的禮包碼，已刷新Cookie以防止過期`);
        } else {
          new Logger('自動兌換').info(`[用戶 ${userId}] [帳號 #${accountIndex}] 沒有未兌換的禮包碼，且Cookie最近已刷新，跳過`);
        }
      } catch (error: any) {
        new Logger('自動兌換').error(`[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 刷新失敗: ${error.message}`);
      }
      return;
    }
    new Logger('自動兌換').info(`[用戶 ${userId}] [帳號 #${accountIndex}] 發現 ${unRedeemedCodes.length} 個未兌換的禮包碼`);

    const results = [];
    let hasSuccessfulRedeem = false;

    for (const code of unRedeemedCodes) {
      try {
        new Logger('自動兌換').info(`[用戶 ${userId}] [帳號 #${accountIndex}] 正在兌換: ${code}`);
        const result = await this.processCode(zzz, code, userRedeemedCodes, account.uid);

        if (result.status === 'tokenInvalid') {
          new Logger('自動兌換').warn(`[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 已過期，跳過兌換流程`);
        } else if (result.status === 'success') {
          hasSuccessfulRedeem = true;
          new Logger('自動兌換').success(`[用戶 ${userId}] [帳號 #${accountIndex}] 兌換成功: ${code}`);
        } else if (result.status === 'alreadyClaimed') {
          new Logger('自動兌換').info(`[用戶 ${userId}] [帳號 #${accountIndex}] 已經兌換過: ${code}`);
        } else if (result.status === 'invalid') {
          new Logger('自動兌換').warn(`[用戶 ${userId}] [帳號 #${accountIndex}] 無效的禮包碼: ${code}`);
        } else {
          await database.set(`${account.uid}.cookieExpired`, true);
          new Logger('自動兌換').error(`[用戶 ${userId}] [帳號 #${accountIndex}] 兌換失敗: ${code} - ${result.message}`);
        }

        results.push(result);
        this.stats.total++;

        await new Promise((resolve) => setTimeout(resolve, CONFIG.REDEEM_DELAY));
      } catch (error: any) {
        new Logger('自動兌換').error(`[用戶 ${userId}] [帳號 #${accountIndex}] 兌換出錯: ${code} - ${error.message}`);
        this.stats.failed++;
      }
    }

    if (hasSuccessfulRedeem) {
      try {
        await updateCookie(userId, accountIndex, account.cookie);
        new Logger('自動兌換').success(`[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 更新成功`);
      } catch (error: any) {
        new Logger('自動兌換').error(`[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 更新失敗: ${error.message}`);
      }
    }

    await database.set(`${account.uid}.redeemedCodes`, [...new Set(userRedeemedCodes)]);

    const { description, stats } = this.formatResults(locale, results);

    Object.entries(stats).forEach(([key, value]) => {
      this.stats[key as keyof typeof this.stats] += value;
    });

    return {
      uid: account.uid,
      nickname: accountNickname,
      description,
      hasSuccess: stats.success > 0,
    };
  }

  async processUser(userId: string, codes: string[]) {
    const { userLang, accounts } = await this.getUserPreferences(userId);
    if (!accounts?.length) return;

    const accountPromises = accounts.map(async (account: Account, index: number) => {
      if (!account || !account.uid || !account.cookie) return;

      try {
        await this.processAccount(userLang, userId, account, index, account.nickname, codes);
      } catch (error: any) {
        new Logger('自動兌換').error(`使用者 ${userId} 的帳號 #${index} 處理失敗: ${error.message}`);
        this.stats.failed++;
      }
    });

    await Promise.allSettled(accountPromises);
  }

  // async sendRedeemMessage(channelId: string, data: Record<string, any>) {
  //   const embed = new EmbedBuilder()
  //     .setColor(getRandomColor())
  //     .setTitle(data.tr('Auto') + data.tr('redeem_SuccessDesc'))
  //     .setDescription(data.description)
  //     .setThumbnail('https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4c/Item_Polychrome.png')
  //     .setTimestamp();

  //   try {
  //     await cluster.broadcastEval(
  //       async (c, { channelId, content, embed }) => {
  //         const channel = c.channels.cache.get(channelId);
  //         if (channel) await channel.send({ content, embeds: [embed] });
  //       },
  //       {
  //         context: { channelId, content: data.tag || '', embed },
  //         timeout: CONFIG.API_TIMEOUT,
  //       },
  //     );
  //   } catch (error: any) {
  //     new Logger('自動兌換').error(`發送訊息至頻道 ${channelId} 時發生錯誤: ${error.message}`);
  //   }
  // }

  updateStatistics(nowTime: string, duration: number, averageTime: number) {
    new Logger('自動兌換').info('========== 自動兌換統計 ==========');
    new Logger('自動兌換').info(`時間: ${nowTime}:00`);
    new Logger('自動兌換').info(`總計處理: ${this.stats.total} 個禮包碼`);
    new Logger('自動兌換').success(`成功兌換: ${this.stats.success} 個`);
    new Logger('自動兌換').info(`已兌換過: ${this.stats.alreadyClaimed} 個`);
    new Logger('自動兌換').warn(`無效代碼: ${this.stats.invalid} 個`);
    new Logger('自動兌換').error(`兌換失敗: ${this.stats.failed} 個`);
    new Logger('自動兌換').info(`總時間: ${duration.toFixed(3)} 秒`);
    new Logger('自動兌換').info(`平均時間: ${averageTime.toFixed(3)} 秒`);
    new Logger('自動兌換').info('================================');
  }
}

export default async function autoRedeem() {
  const system = new AutoRedeemSystem();

  const redeemData = await database.get('autoRedeem');
  if (!redeemData) {
    new Logger('自動兌換').warn('沒有找到需要自動兌換的用戶數據');
    return;
  }

  const currentHour = new Date().toLocaleString('en-US', {
    timeZone: CONFIG.TAIPEI_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  });

  new Logger('自動兌換').info('========== 開始自動兌換 ==========');
  new Logger('自動兌換').info(`執行時間: ${currentHour}:00`);

  const startTime = Date.now();

  try {
    const codesList = await getRedeemCodes();
    new Logger('自動兌換').info(`已獲取 ${codesList.length} 個禮包碼`);

    for (const userId of Object.keys(redeemData)) {
      try {
        await system.processUser(userId, codesList);
      } catch (error: any) {
        new Logger('自動兌換').error(`處理用戶 ${userId} 時發生錯誤: ${error.message}`);
      }
    }
  } catch (error: any) {
    new Logger('自動兌換').error(`自動兌換過程中發生錯誤: ${error.message}`);
  }

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  const averageTime = system.stats.total > 0 ? duration / system.stats.total : 0;

  await system.updateStatistics(currentHour, duration, averageTime);

  new Logger('自動兌換').info('========== 自動兌換結束 ==========');
}
