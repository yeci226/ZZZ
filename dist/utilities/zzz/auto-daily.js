"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = autoDailySign;
const discord_js_1 = require("discord.js");
const hoyoapi_1 = require("@yeci226/hoyoapi");
const index_js_1 = require("@/index.js");
const index_js_2 = require("@/index.js");
const utilities_1 = require("@/utilities");
const i18n_1 = require("@/utilities/core/i18n");
const logger_1 = __importDefault(require("@/utilities/core/logger"));
const CONFIG = {
    TAIPEI_TIMEZONE: 'Asia/Taipei',
    API_TIMEOUT: 10000,
    MAX_RETRIES: 3,
    DEFAULT_LANGUAGE: 'en',
    ERROR_CODES: {
        ALREADY_SIGNED: -5003,
    },
};
class AutoDailySignSystem {
    stats;
    constructor() {
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
            }
            catch (error) {
                if (attempt === maxRetries)
                    throw error;
                await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            }
        }
    }
    formatSignInResult(locale, result, userId) {
        const tr = (0, i18n_1.createTranslator)(locale);
        if (result.status === 'failed') {
            return null;
        }
        const { info, reward, rewards } = result;
        const todaySign = rewards.awards[info.total_sign_day] || rewards.awards[0];
        const tmrSign = rewards.awards[info.total_sign_day + 1] || rewards.awards[1];
        const embed = new discord_js_1.EmbedBuilder()
            .setColor((0, utilities_1.getRandomColor)())
            .setTitle(`${result.uid} ${tr('Auto')}${tr('daily_SignSuccess')}`)
            .setThumbnail(todaySign?.icon)
            .setDescription(`${tr('daily_Description', {
            a: `\`${todaySign?.name}x${todaySign?.cnt}\``,
        })}${info.month_last_day
            ? ''
            : `\n\n<@${userId}> ${tr('daily_DescriptionTmr', {
                b: `\`${tmrSign?.name}x${tmrSign?.cnt}\``,
            })}`}`)
            .addFields({ name: `${reward.month} ${tr('daily_Month')}`, value: '\u200b', inline: true }, { name: tr('daily_SignedDay', { z: `\`${info.total_sign_day}\`` }), value: '\u200b', inline: true }, { name: tr('daily_MissedDay', { z: `\`${info.sign_cnt_missed}\`` }), value: '\u200b', inline: true });
        return embed;
    }
    async processSignIn(zzz) {
        try {
            const [info, reward, rewards] = await Promise.all([this.withRetry(() => zzz.daily.info()), this.withRetry(() => zzz.daily.reward()), this.withRetry(() => zzz.daily.rewards())]);
            const result = await this.withRetry(() => zzz.daily.claim());
            if (result.code === CONFIG.ERROR_CODES.ALREADY_SIGNED || result.info.is_sign) {
                return { status: 'already_signed', info, reward, rewards, uid: zzz.uid };
            }
            return { status: 'success', info, reward, rewards, uid: zzz.uid };
        }
        catch (error) {
            return { status: 'failed', error: error.message };
        }
    }
    async processAccount(locale, account, userId, channelId, tag) {
        const zzz = new hoyoapi_1.ZenlessZoneZero({ cookie: account.cookie, lang: locale });
        try {
            const result = await this.processSignIn(zzz);
            switch (result.status) {
                case 'success':
                    this.stats.success++;
                    break;
                case 'already_signed':
                    this.stats.alreadySigned++;
                    break;
                case 'failed':
                    this.stats.failed++;
                    break;
            }
            if (result.status === 'success') {
                const embed = this.formatSignInResult(locale, result, userId);
                if (embed)
                    await this.sendMessage(channelId, { content: tag, embed });
            }
            return result;
        }
        catch (error) {
            this.stats.failed++;
            new logger_1.default('自動簽到').error(`處理帳號 ${account.uid} 時發生錯誤: ${error.message}`);
            return { status: 'failed', error: error.message };
        }
    }
    async processUser(userId, dailyData) {
        const userLang = (await (0, utilities_1.getUserLang)(userId)) || CONFIG.DEFAULT_LANGUAGE;
        const accounts = await index_js_2.database.get(`${userId}.account`);
        if (!accounts?.length)
            return;
        const channelId = dailyData[userId].channelId;
        const tag = dailyData[userId].tag === 'true' ? `<@${userId}>` : '';
        for (const account of accounts) {
            this.stats.total++;
            const cookie = await (0, utilities_1.getUserCookie)(userId, accounts.indexOf(account));
            if (!cookie)
                continue;
            await this.processAccount(userLang, account, userId, channelId, tag);
        }
    }
    async sendMessage(channelId, data) {
        try {
            await index_js_1.cluster.broadcastEval(async (c, { channelId, content, embed }) => {
                const channel = c.channels.cache.get(channelId);
                if (channel && channel.isTextBased())
                    await channel.send({ content, embeds: [embed] });
            }, {
                context: { channelId, content: data.content, embed: data.embed },
                timeout: CONFIG.API_TIMEOUT,
            });
        }
        catch (error) {
            new logger_1.default('自動簽到').error(`發送訊息至頻道 ${channelId} 時發生錯誤: ${error.message}`);
        }
    }
    updateStatistics(nowTime, duration, averageTime) {
        new logger_1.default('自動簽到').info('========== 自動簽到統計 ==========');
        new logger_1.default('自動簽到').info(`時間: ${nowTime}:00`);
        new logger_1.default('自動簽到').info(`總計處理: ${this.stats.total} 個帳號`);
        new logger_1.default('自動簽到').success(`成功簽到: ${this.stats.success} 個`);
        new logger_1.default('自動簽到').info(`已簽到過: ${this.stats.alreadySigned} 個`);
        new logger_1.default('自動簽到').error(`簽到失敗: ${this.stats.failed} 個`);
        new logger_1.default('自動簽到').info(`總時間: ${duration.toFixed(3)} 秒`);
        new logger_1.default('自動簽到').info(`平均時間: ${averageTime.toFixed(3)} 秒`);
        new logger_1.default('自動簽到').info('================================');
    }
}
async function autoDailySign() {
    const system = new AutoDailySignSystem();
    const dailyData = await index_js_2.database.get('autoDaily');
    if (!dailyData) {
        new logger_1.default('自動簽到').warn('沒有找到需要自動簽到的用戶數據');
    }
    const currentHour = new Date().toLocaleString('en-US', {
        timeZone: CONFIG.TAIPEI_TIMEZONE,
        hour: 'numeric',
        hour12: false,
    });
    new logger_1.default('自動簽到').info('========== 開始自動簽到 ==========');
    new logger_1.default('自動簽到').info(`執行時間: ${currentHour}:00`);
    const startTime = Date.now();
    try {
        for (const userId of Object.keys(dailyData)) {
            const scheduledTime = dailyData[userId]?.time || '13';
            if (parseInt(scheduledTime) !== parseInt(currentHour))
                continue;
            try {
                await system.processUser(userId, dailyData);
            }
            catch (error) {
                new logger_1.default('自動簽到').error(`處理用戶 ${userId} 時發生錯誤: ${error.message}`);
            }
        }
    }
    catch (error) {
        new logger_1.default('自動簽到').error(`自動簽到過程中發生錯誤: ${error.message}`);
    }
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const averageTime = system.stats.total > 0 ? duration / system.stats.total : 0;
    system.updateStatistics(currentHour, duration, averageTime);
    new logger_1.default('自動簽到').info('========== 自動簽到結束 ==========');
}
