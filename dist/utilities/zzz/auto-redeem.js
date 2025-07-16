"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = autoRedeem;
const hoyoapi_1 = require("@yeci226/hoyoapi");
const index_js_1 = require("@/index.js");
const utilities_1 = require("@/utilities");
const logger_1 = __importDefault(require("@/utilities/core/logger"));
const i18n_1 = require("@/utilities/core/i18n");
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
    stats;
    constructor() {
        this.stats = {
            total: 0,
            success: 0,
            failed: 0,
            alreadyClaimed: 0,
            invalid: 0,
        };
    }
    async getUserPreferences(userId) {
        try {
            const userLang = (await (0, utilities_1.getUserLang)(userId)) || CONFIG.DEFAULT_LANGUAGE;
            const accounts = await index_js_1.database.get(`${userId}.account`);
            return { userLang, accounts };
        }
        catch (error) {
            new logger_1.default('自動兌換').error(`獲取使用者偏好設定失敗: ${error.message}`);
            return { userLang: CONFIG.DEFAULT_LANGUAGE, accounts: [] };
        }
    }
    async withRetry(operation, maxRetries = CONFIG.MAX_RETRIES) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                if (attempt === maxRetries)
                    throw error;
                await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            }
        }
    }
    formatResults(locale, results) {
        const tr = (0, i18n_1.createTranslator)(locale);
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
            }
            else if (status === 'alreadyClaimed') {
                description.push(`ℹ️ **${code}** - (${tr('redeem_Already')})`);
                stats.alreadyClaimed++;
            }
            else if (status === 'invalid') {
                description.push(`⚠️ **${code}** - (${tr('redeem_Invalid')})`);
                stats.invalid++;
            }
            else {
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
    async processCode(zzz, code, userRedeemedCodes, uid) {
        try {
            const result = await this.withRetry(() => zzz.redeem.claim(code));
            let status = 'failed';
            if (result.retcode === 0 || result.message === 'OK') {
                status = 'success';
            }
            else if ([CONFIG.ERROR_CODES.ALREADY_CLAIMED, CONFIG.ERROR_CODES.CODE_CLAIMED].includes(result.retcode)) {
                status = 'alreadyClaimed';
            }
            else if ([CONFIG.ERROR_CODES.CODE_INVALID, CONFIG.ERROR_CODES.CODE_EXPIRED].includes(result.retcode)) {
                status = 'invalid';
            }
            else if (result.retcode === -1071) {
                status = 'tokenInvalid';
            }
            if (status === 'success' || status === 'alreadyClaimed' || status === 'invalid') {
                userRedeemedCodes.push(code);
            }
            if (status === 'tokenInvalid') {
                await index_js_1.database.set(`${uid}.cookieExpired`, true);
            }
            return { code, status, message: result.message };
        }
        catch (error) {
            return { code, status: 'failed', message: error.message };
        }
    }
    async processAccount(locale, userId, account, accountIndex, accountNickname, codes) {
        const userLang = await (0, utilities_1.getUserLang)(userId);
        const isCookieExpired = await index_js_1.database.get(`${account.uid}.cookieExpired`);
        if (isCookieExpired) {
            new logger_1.default('自動兌換').warn(`[用戶 ${userId}] [帳號 #${accountIndex}] 的Cookie已過期，跳過兌換流程`);
            return;
        }
        const zzz = new hoyoapi_1.ZenlessZoneZero({ uid: account.uid, cookie: account.cookie, lang: userLang });
        const userRedeemedCodes = (await index_js_1.database.get(`${account.uid}.redeemedCodes`)) || [];
        const unRedeemedCodes = codes.filter((code) => !userRedeemedCodes.includes(code));
        new logger_1.default('自動兌換').info(`[用戶 ${userId}] [帳號 #${accountIndex}] 正在處理禮包碼，總數: ${unRedeemedCodes.length}`);
        if (!unRedeemedCodes || unRedeemedCodes.length === 0) {
            try {
                const lastCookieRefresh = (await index_js_1.database.get(`${account.uid}.lastCookieRefresh`)) || 0;
                const currentTime = Date.now();
                const oneDayInMs = 24 * 60 * 60 * 1000; // 24 Hours
                if (currentTime - lastCookieRefresh >= oneDayInMs) {
                    await (0, utilities_1.updateCookie)(userId, accountIndex, account.cookie);
                    await index_js_1.database.set(`${account.uid}.lastCookieRefresh`, currentTime);
                    new logger_1.default('自動兌換').success(`[用戶 ${userId}] [帳號 #${accountIndex}] 沒有未兌換的禮包碼，已刷新Cookie以防止過期`);
                }
                else {
                    new logger_1.default('自動兌換').info(`[用戶 ${userId}] [帳號 #${accountIndex}] 沒有未兌換的禮包碼，且Cookie最近已刷新，跳過`);
                }
            }
            catch (error) {
                new logger_1.default('自動兌換').error(`[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 刷新失敗: ${error.message}`);
            }
            return;
        }
        new logger_1.default('自動兌換').info(`[用戶 ${userId}] [帳號 #${accountIndex}] 發現 ${unRedeemedCodes.length} 個未兌換的禮包碼`);
        const results = [];
        let hasSuccessfulRedeem = false;
        for (const code of unRedeemedCodes) {
            try {
                new logger_1.default('自動兌換').info(`[用戶 ${userId}] [帳號 #${accountIndex}] 正在兌換: ${code}`);
                const result = await this.processCode(zzz, code, userRedeemedCodes, account.uid);
                if (result.status === 'tokenInvalid') {
                    new logger_1.default('自動兌換').warn(`[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 已過期，跳過兌換流程`);
                }
                else if (result.status === 'success') {
                    hasSuccessfulRedeem = true;
                    new logger_1.default('自動兌換').success(`[用戶 ${userId}] [帳號 #${accountIndex}] 兌換成功: ${code}`);
                }
                else if (result.status === 'alreadyClaimed') {
                    new logger_1.default('自動兌換').info(`[用戶 ${userId}] [帳號 #${accountIndex}] 已經兌換過: ${code}`);
                }
                else if (result.status === 'invalid') {
                    new logger_1.default('自動兌換').warn(`[用戶 ${userId}] [帳號 #${accountIndex}] 無效的禮包碼: ${code}`);
                }
                else {
                    await index_js_1.database.set(`${account.uid}.cookieExpired`, true);
                    new logger_1.default('自動兌換').error(`[用戶 ${userId}] [帳號 #${accountIndex}] 兌換失敗: ${code} - ${result.message}`);
                }
                results.push(result);
                this.stats.total++;
                await new Promise((resolve) => setTimeout(resolve, CONFIG.REDEEM_DELAY));
            }
            catch (error) {
                new logger_1.default('自動兌換').error(`[用戶 ${userId}] [帳號 #${accountIndex}] 兌換出錯: ${code} - ${error.message}`);
                this.stats.failed++;
            }
        }
        if (hasSuccessfulRedeem) {
            try {
                await (0, utilities_1.updateCookie)(userId, accountIndex, account.cookie);
                new logger_1.default('自動兌換').success(`[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 更新成功`);
            }
            catch (error) {
                new logger_1.default('自動兌換').error(`[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 更新失敗: ${error.message}`);
            }
        }
        await index_js_1.database.set(`${account.uid}.redeemedCodes`, [...new Set(userRedeemedCodes)]);
        const { description, stats } = this.formatResults(locale, results);
        Object.entries(stats).forEach(([key, value]) => {
            this.stats[key] += value;
        });
        return {
            uid: account.uid,
            nickname: accountNickname,
            description,
            hasSuccess: stats.success > 0,
        };
    }
    async processUser(userId, codes) {
        const { userLang, accounts } = await this.getUserPreferences(userId);
        if (!accounts?.length)
            return;
        const accountPromises = accounts.map(async (account, index) => {
            if (!account || !account.uid || !account.cookie)
                return;
            try {
                await this.processAccount(userLang, userId, account, index, account.nickname, codes);
            }
            catch (error) {
                new logger_1.default('自動兌換').error(`使用者 ${userId} 的帳號 #${index} 處理失敗: ${error.message}`);
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
    updateStatistics(nowTime, duration, averageTime) {
        new logger_1.default('自動兌換').info('========== 自動兌換統計 ==========');
        new logger_1.default('自動兌換').info(`時間: ${nowTime}:00`);
        new logger_1.default('自動兌換').info(`總計處理: ${this.stats.total} 個禮包碼`);
        new logger_1.default('自動兌換').success(`成功兌換: ${this.stats.success} 個`);
        new logger_1.default('自動兌換').info(`已兌換過: ${this.stats.alreadyClaimed} 個`);
        new logger_1.default('自動兌換').warn(`無效代碼: ${this.stats.invalid} 個`);
        new logger_1.default('自動兌換').error(`兌換失敗: ${this.stats.failed} 個`);
        new logger_1.default('自動兌換').info(`總時間: ${duration.toFixed(3)} 秒`);
        new logger_1.default('自動兌換').info(`平均時間: ${averageTime.toFixed(3)} 秒`);
        new logger_1.default('自動兌換').info('================================');
    }
}
async function autoRedeem() {
    const system = new AutoRedeemSystem();
    const redeemData = await index_js_1.database.get('autoRedeem');
    if (!redeemData) {
        new logger_1.default('自動兌換').warn('沒有找到需要自動兌換的用戶數據');
        return;
    }
    const currentHour = new Date().toLocaleString('en-US', {
        timeZone: CONFIG.TAIPEI_TIMEZONE,
        hour: 'numeric',
        hour12: false,
    });
    new logger_1.default('自動兌換').info('========== 開始自動兌換 ==========');
    new logger_1.default('自動兌換').info(`執行時間: ${currentHour}:00`);
    const startTime = Date.now();
    try {
        const codesList = await (0, utilities_1.getRedeemCodes)();
        new logger_1.default('自動兌換').info(`已獲取 ${codesList.length} 個禮包碼`);
        for (const userId of Object.keys(redeemData)) {
            try {
                await system.processUser(userId, codesList);
            }
            catch (error) {
                new logger_1.default('自動兌換').error(`處理用戶 ${userId} 時發生錯誤: ${error.message}`);
            }
        }
    }
    catch (error) {
        new logger_1.default('自動兌換').error(`自動兌換過程中發生錯誤: ${error.message}`);
    }
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const averageTime = system.stats.total > 0 ? duration / system.stats.total : 0;
    await system.updateStatistics(currentHour, duration, averageTime);
    new logger_1.default('自動兌換').info('========== 自動兌換結束 ==========');
}
