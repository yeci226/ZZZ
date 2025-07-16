"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCookie = parseCookie;
exports.getAllFiles = getAllFiles;
exports.getAvatarUrl = getAvatarUrl;
exports.getNewsList = getNewsList;
exports.getPostFull = getPostFull;
exports.parsePostContent = parsePostContent;
exports.getRedeemCodes = getRedeemCodes;
exports.secondsToHms = secondsToHms;
exports.getUserUid = getUserUid;
exports.getUserCookie = getUserCookie;
exports.getUserLang = getUserLang;
exports.getRandomColor = getRandomColor;
exports.getStaminaColor = getStaminaColor;
exports.drawInQueueReply = drawInQueueReply;
exports.failedReply = failedReply;
exports.setupDefaultLang = setupDefaultLang;
exports.getUserHoyolabData = getUserHoyolabData;
exports.getBangbooData = getBangbooData;
exports.getWeaponData = getWeaponData;
exports.getCharacterData = getCharacterData;
exports.getUserZZZData = getUserZZZData;
exports.checkAccount = checkAccount;
exports.updateCookie = updateCookie;
exports.getUserGameUid = getUserGameUid;
exports.updateAccountInfo = updateAccountInfo;
const path_1 = require("path");
const promises_1 = require("fs/promises");
const axios_1 = __importDefault(require("axios"));
const canvas_1 = require("@napi-rs/canvas");
const discord_js_1 = require("discord.js");
const hoyoapi_1 = require("@yeci226/hoyoapi");
const index_1 = require("@/index");
const logger_1 = __importDefault(require("@/utilities/core/logger"));
const i18n_1 = require("@/utilities/core/i18n");
const emoji_1 = __importDefault(require("@/assets/emoji"));
const BASE_URL = 'https://bbs-api-os.hoyolab.com/community/post/wapi/';
const zzzStaticUrl = 'https://act-webstatic.hoyoverse.com/game_record/zzz';
const zzzStaticUrl2 = 'https://act-webstatic.hoyoverse.com/game_record/nap';
const zzzStaticUrl3 = 'https://act-webstatic.hoyoverse.com/game_record/zzzv2';
const squareUrl = `${zzzStaticUrl}/role_square_avatar/role_square_avatar_`;
const squareUrl2 = `${zzzStaticUrl2}/role_square_avatar/role_square_avatar_`;
const squareUrl3 = `${zzzStaticUrl3}/role_square_avatar/role_square_avatar_`;
/**
 * @description 解析 Cookie 字符串
 * @param cookieString - 要解析的 Cookie 字符串
 * @returns 解析後的 Cookie
 */
function parseCookie(cookieString) {
    const cookies = cookieString.split(';');
    const parsedCookies = {};
    cookies.forEach((cookie) => {
        const [key, value] = cookie.trim().split('=');
        parsedCookies[key] = value;
    });
    return parsedCookies;
}
/**
 * @description 獲取指定目錄下的所有 .js 文件
 * @param dir - 目錄路徑
 * @param exts - 可接受的文件擴展名
 * @returns 所有 .js 文件的路徑
 */
async function getAllFiles(dir, exts) {
    let files = [];
    const entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = (0, path_1.join)(dir, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(await getAllFiles(fullPath, exts));
        }
        else if (exts.includes((0, path_1.extname)(entry.name))) {
            files.push(fullPath);
        }
    }
    return files;
}
/**
 * @description 獲取代理人的頭像 URL
 * @param agentId - 代理人 ID
 * @returns 代理人的頭像 URL
 */
async function getAvatarUrl(agentId) {
    let url = squareUrl3 + `${agentId}.png`;
    try {
        await (0, canvas_1.loadImage)(url);
        return url;
    }
    catch {
        try {
            url = squareUrl2 + `${agentId}.png`;
            await (0, canvas_1.loadImage)(url);
            return url;
        }
        catch {
            return squareUrl + `${agentId}.png`;
        }
    }
}
/**
 * @description 獲取遊戲的新聞列表
 * @param lang - 新聞語言
 * @param type - 新聞類型
 * @returns 遊戲的新聞列表
 */
async function getNewsList(lang, type) {
    return await (0, axios_1.default)({
        headers: {
            'x-rpc-app_version': '2.43.0',
            'x-rpc-client_type': 4,
            'X-Rpc-Language': lang,
        },
        method: 'get',
        url: BASE_URL + 'getNewsList',
        params: { gids: 8, page_size: 25, type: type },
    }).then((response) => response.data);
}
/**
 * @description 獲取遊戲的帖子詳細信息
 * @param lang - 帖子語言
 * @param postId - 帖子 ID
 * @returns 遊戲的帖子詳細信息
 */
async function getPostFull(lang, postId) {
    return await (0, axios_1.default)({
        headers: {
            'x-rpc-app_version': '2.43.0',
            'x-rpc-client_type': 4,
            'X-Rpc-Language': lang,
        },
        method: 'get',
        url: BASE_URL + 'getPostFull',
        params: { gids: 8, post_id: postId },
    }).then((response) => response.data.data);
}
/**
 * @description 解析帖子的內容
 * @param content - 帖子的內容
 * @returns 解析後的帖子內容
 */
async function parsePostContent(content) {
    content = content.replace(/<br\s*\/?>/g, '\n');
    content = content.replace(/<\p[^>]*>/g, '\n');
    content = content.replace(/<\/p>/g, '');
    content = content.replace(/<\/?strong[^>]*>/g, '**');
    content = content.replace(/<\/?em[^>]*>/g, '*');
    content = content.replace(/<\/?span[^>]*>/g, '');
    content = content.replace(/<\/?div[^>]*>/g, '');
    content = content.replace(/<\/?img[^>]*>/g, '');
    content = content.replace(/<h4[^>]*>/g, '\n### ');
    content = content.replace(/<\/h4>/g, '');
    content = content.replace(/<h3[^>]*>/g, '\n## ');
    content = content.replace(/<\/h3>/g, '');
    content = content.replace(/&gt;/g, '>');
    content = content.replace(/&lt;/g, '<');
    content = content.replace(/&nbsp;/g, ' ');
    content = content.replace(/<([a-z]+)\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/\1>/gi, (match, tag, href, text) => (href == text ? `${emoji_1.default.link}${href}` : `${emoji_1.default.link}[${text}](${href})`));
    content = content.replace(/<iframe[^>]*src="([^"]*)"[^>]*><\/iframe>/gi, (match, p1) => `### ${emoji_1.default.link}[影片](${p1})`);
    content = content.replace(/\s*class="[^"]*"/g, '');
    // content = content.replace(/\n\s*\n/g, "\n");
    return content;
}
/**
 * @description 獲取遊戲的兌換碼
 * @returns 遊戲的兌換碼
 */
async function getRedeemCodes() {
    const res = await axios_1.default.get('https://hoyo-codes.seria.moe/codes?game=nap').then((response) => response.data);
    return res.codes;
}
/**
 * @description 將秒數轉換為小時、分鐘和秒數
 * @param d - 要轉換的秒數
 * @param locale - 語言
 * @returns 轉換後的時間
 */
function secondsToHms(d, locale) {
    const tr = (0, i18n_1.createTranslator)(locale);
    d = Number(d);
    var h = Math.floor(d / 3600);
    var m = Math.floor((d % 3600) / 60);
    var s = Math.floor((d % 3600) % 60);
    var hDisplay = h > 0 ? h.toString().padStart(2, '0') + tr('Hour') : '';
    var mDisplay = m > 0 ? m.toString().padStart(2, '0') + tr('Minute') : '';
    var sDisplay = s > 0 ? s.toString().padStart(2, '0') + tr('Second') : '';
    if (!hDisplay && !mDisplay && !sDisplay) {
        sDisplay = '已完成';
    }
    return hDisplay + mDisplay + sDisplay;
}
/**
 * @description 獲取用戶的 UID
 * @param userId - 用戶 ID
 * @param accountIndex - 帳號索引
 * @returns 用戶的 UID
 */
async function getUserUid(userId, accountIndex) {
    const accountKey = `${userId}.account`;
    const account = await index_1.database.get(accountKey);
    return account?.[accountIndex]?.uid || null;
}
/**
 * @description 獲取用戶的 Cookie
 * @param userId - 用戶 ID
 * @param accountIndex - 帳號索引
 * @returns 用戶的 Cookie
 */
async function getUserCookie(userId, accountIndex) {
    const accountKey = `${userId}.account`;
    const account = await index_1.database.get(accountKey);
    return account?.[accountIndex]?.cookie || null;
}
/**
 * @description 獲取用戶的語言
 * @param userId - 用戶 ID
 * @returns 用戶的語言
 */
async function getUserLang(userId) {
    const langKey = `${userId}.locale`;
    const lang = await index_1.database.get(langKey);
    return lang || null;
}
/**
 * @description 獲取一個隨機顏色
 * @returns 隨機顏色
 */
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        const index = Math.floor(Math.random() * letters.length) % letters.length;
        color += letters[index];
    }
    const isValidHex = /^#[0-9A-F]{6}$/i.test(color);
    if (!isValidHex)
        return '#000000';
    return color;
}
/**
 * @description 獲取體力的顏色
 * @param stamina - 體力
 * @returns 體力的顏色
 */
function getStaminaColor(stamina) {
    const staminaColor = {
        0: '#AAC8A7',
        60: '#C3EDC0',
        100: '#FDFFAE',
        140: '#FFCF96',
        180: '#FF8080',
        220: '#BB2525',
    };
    let selectedColor = null;
    for (const key in staminaColor) {
        if (stamina >= parseInt(key))
            selectedColor = staminaColor[key];
    }
    return selectedColor;
}
/**
 * @description 繪製在隊列中的回復
 * @param interaction - 交互
 * @param title - 標題
 */
async function drawInQueueReply(interaction, title = '') {
    if (interaction instanceof discord_js_1.ChatInputCommandInteraction) {
        interaction.editReply({
            embeds: [new discord_js_1.EmbedBuilder().setTitle(title).setThumbnail('https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif')],
            // fetchReply: true,
        });
    }
}
/**
 * @description 繪製失敗的回復
 * @param interaction - 交互
 * @param title - 標題
 * @param description - 描述
 */
async function failedReply(interaction, title = '', description = '') {
    const embed = new discord_js_1.EmbedBuilder().setTitle(title).setColor('#E76161').setDescription(description);
    return replyOrfollowUp(interaction, {
        embeds: [embed],
        flags: discord_js_1.MessageFlags.Ephemeral,
        fetchReply: true,
    });
}
// const dotggCharacterUrl =
//   "https://api.dotgg.gg/cgfw/getgacha?game=zenless&type=characters";
// export async function getCharacterData(characterId) {
//   const response = await axios.get(dotggCharacterUrl);
//   const character = response.data.find(
//     (character) => character.id == characterId
//   );
//   return {
//     id: character.id,
//     name: character.name,
//     fullName: character.fullName,
//     iconUrl: `https://static.dotgg.gg/zenless/${character.icon}`,
//     faction: character.faction,
//   };
// }
/**
 * @description 設置用戶的默認語言
 * @param userId - 用戶 ID
 * @param userSystemLang - 用戶系統語言
 */
async function setupDefaultLang(userId, userSystemLang) {
    const langCode = userSystemLang;
    await index_1.database.set(`${userId}.locale`, langCode);
}
/**
 * @description 獲取用戶的 Hoyolab 數據
 * @param interaction - 交互
 * @param locale - 語言
 * @param userId - 用戶 ID
 * @param accountIndex - 帳號索引
 */
async function getUserHoyolabData(interaction, locale, userId, accountIndex = 0) {
    const [cookie, uid] = await Promise.all([getUserCookie(userId, accountIndex), getUserUid(userId, accountIndex)]);
    try {
        const hoyolab = new hoyoapi_1.Hoyolab({ cookie, lang: locale });
        // FIXME: wrong type (IGameRecordCard), should be IGameRecordCard[]
        const gameRecord = (await hoyolab.gameRecordCard());
        const filteredData = gameRecord.filter((item) => item.game_id === 8);
        return filteredData[0];
    }
    catch (error) {
        const isHoyoAPIError = error instanceof hoyoapi_1.HoyoAPIError;
        const errorCode = isHoyoAPIError ? error.code : error;
        checkAccount(interaction, locale, userId, isHoyoAPIError && error.code == 10035 ? { errorCode: error.code } : { hasCookie: cookie != null, lang: locale, hasUid: uid != null, errorCode: Number(errorCode) });
        return null;
    }
}
/**
 * @description 獲取 Bangboo 的數據
 * @param bangbooId - Bangboo ID
 * @returns Bangboo 的數據
 */
async function getBangbooData(bangbooId) {
    try {
        const apiUrl = `https://api.hakush.in/zzz/data/zh/bangboo/${bangbooId}.json`;
        const response = await axios_1.default.get(apiUrl).then((response) => response.data);
        const dataFormat = {
            id: bangbooId,
            iconUrl: `https://api.hakush.in/zzz/UI/${response.Icon.split('/').pop().split('.')[0]}.webp`,
        };
        return dataFormat;
    }
    catch (error) {
        console.log(error);
        return null;
    }
}
/**
 * @description 獲取武器的數據
 * @param weaponId - 武器 ID
 * @returns 武器的數據
 */
async function getWeaponData(weaponId) {
    try {
        const apiUrl = `https://api.hakush.in/zzz/data/en/weapon/${weaponId}.json`;
        const response = await axios_1.default.get(apiUrl).then((response) => response.data);
        const dataFormat = {
            id: response.Id,
            iconUrl: `https://api.hakush.in/zzz/UI/${response.Icon.split('/').pop().split('.')[0]}.webp`,
        };
        return dataFormat;
    }
    catch (error) {
        console.log(error);
        return null;
    }
}
/**
 * @description 獲取角色的數據
 * @param characterId - 角色 ID
 * @returns 角色的數據
 */
async function getCharacterData(characterId) {
    try {
        const apiUrl = `https://api.hakush.in/zzz/data/en/character/${characterId}.json`;
        const response = await axios_1.default.get(apiUrl).then((response) => response.data);
        const partnerInfo = response.PartnerInfo;
        if (!partnerInfo || Object.keys(partnerInfo).length == 0)
            return null;
        const dataFormat = {
            id: response.Id,
            name: response.Name,
            fullName: partnerInfo.FullName,
            gender: partnerInfo.Gender,
            birthday: partnerInfo.Birthday,
            camp: partnerInfo.Race,
            icon: partnerInfo.Icon,
            skin: response.Skin,
            iconUrl: `https://api.hakush.in/zzz/UI/${partnerInfo.RoleIcon.split('/').pop()}.webp`,
        };
        return dataFormat;
    }
    catch (error) {
        console.log(error);
        return null;
    }
}
/**
 * @description 獲取 ZZZ 的數據
 * @param interaction - 交互
 * @param locale - 語言
 * @param userId - 用戶 ID
 * @param accountIndex - 帳號索引
 * @returns ZZZ 的數據
 */
async function getUserZZZData(interaction, locale, userId, accountIndex = 0) {
    const tr = (0, i18n_1.createTranslator)(locale);
    const [cookie, uid] = await Promise.all([getUserCookie(userId, accountIndex), getUserUid(userId, accountIndex)]);
    if (!cookie || !uid) {
        replyOrfollowUp(interaction, {
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor('#E76161')
                    .setTitle(tr('AccountNotFound'))
                    .setDescription(tr('AccountNotFoundDesc', {
                    hasCookie: tr(cookie ? 'isSet' : 'isNotSet'),
                    hasUid: tr(uid ? 'isSet' : 'isNotSet'),
                })),
            ],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    try {
        const zzz = new hoyoapi_1.ZenlessZoneZero({ cookie, lang: locale, uid });
        await zzz.daily.info();
        return zzz;
    }
    catch (error) {
        const isHoyoAPIError = error instanceof hoyoapi_1.HoyoAPIError;
        const errorCode = isHoyoAPIError ? error.code : error;
        console.log(error);
        checkAccount(interaction, locale, userId, isHoyoAPIError && error.code == 10035 ? { errorCode: error.code } : { hasCookie: cookie != null, lang: locale, hasUid: uid != null, errorCode: Number(errorCode) });
        return null;
    }
}
/**
 * @description 檢查用戶的帳號
 * @param interaction - 交互
 * @param locale - 語言
 * @param userId - 用戶 ID
 * @param data - 要檢查的帳號數據
 */
function checkAccount(interaction, locale, userId, data) {
    const tr = (0, i18n_1.createTranslator)(locale);
    if (data.errorCode == 10035) {
        replyOrfollowUp(interaction, {
            embeds: [new discord_js_1.EmbedBuilder().setColor('#FFE9D0').setTitle('請先通過 Geetest 來繼續使用指令！').setURL(`http://yeci.rocks:3000/geetest/${userId}`)],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
    }
    else if (interaction.user.id == userId) {
        const accountStats = data;
        replyOrfollowUp(interaction, {
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor('#E76161')
                    .setTitle(tr('AccountNotFound'))
                    .setDescription(tr('AccountNotFoundDesc', {
                    hasCookie: tr(accountStats.hasCookie ? 'isSet' : 'isNotSet'),
                    hasUid: tr(accountStats.hasUid ? 'isSet' : 'isNotSet'),
                }) +
                    '\n\n' +
                    '`' +
                    accountStats.errorCode +
                    '`'),
            ],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
    }
    else {
        replyOrfollowUp(interaction, {
            embeds: [new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(tr('NoSetAccount'))],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
    }
}
/**
 * @description 更新用戶的 Cookie
 * @param userId - 用戶 ID
 * @param accountIndex - 帳號索引
 * @param cookieObj - 要更新的 Cookie
 * @returns 更新後的 Cookie
 */
async function updateCookie(userId, accountIndex, cookieObj) {
    const webAPI = 'https://webapi-os.account.hoyoverse.com/Api/fetch_cookie_accountinfo';
    const parsedCookie = Object.fromEntries(cookieObj
        .split('; ')
        .filter(Boolean)
        .map((cookie) => cookie.split('=')));
    const cookie = [`cookie_token_v2=${parsedCookie.cookie_token_v2}`, `account_id_v2=${parsedCookie.ltuid_v2}`].join('; ');
    const response = await fetch(webAPI, {
        method: 'GET',
        headers: { Cookie: cookie },
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const responseData = (await response.json());
    if (responseData?.code !== 200)
        return {
            error: true,
            message: `Error: ${responseData.message || 'Unknown error'}`,
        };
    const newCookieToken = responseData.data.cookie_info.cookie_token;
    const accountKey = `${userId}.account`;
    const account = await index_1.database.get(accountKey);
    let originalCookie = account[accountIndex].cookie.split('; ').filter(Boolean);
    let cookieTokenExists = false;
    const updatedCookie = originalCookie.map((item) => {
        if (item.startsWith('cookie_token=')) {
            cookieTokenExists = true;
            return `cookie_token=${newCookieToken}`;
        }
        return item;
    });
    if (!cookieTokenExists) {
        const finalCookie = [];
        let inserted = false;
        for (const item of updatedCookie) {
            finalCookie.push(item);
            if (!inserted && item.startsWith('ltuid_v2=')) {
                finalCookie.push(`cookie_token=${newCookieToken}`);
                inserted = true;
            }
        }
        account[accountIndex].cookie = finalCookie.join('; ');
    }
    else {
        account[accountIndex].cookie = updatedCookie.join('; ');
    }
    await index_1.database.set(accountKey, account);
}
/**
 * @description 回復或追隨交互
 * @param interaction - 交互
 * @param options - 選項
 * @returns 回復或追隨
 */
const replyOrfollowUp = async (interaction, options) => {
    if (interaction instanceof discord_js_1.AutocompleteInteraction)
        return;
    if (interaction instanceof discord_js_1.ChatInputCommandInteraction && interaction.replied) {
        return interaction.editReply({
            embeds: options.embeds,
            components: options.components,
        });
    }
    if (interaction instanceof discord_js_1.ChatInputCommandInteraction && interaction.deferred) {
        return interaction.followUp(options);
    }
    return interaction.reply(options);
};
/**
 * @description 獲取用戶的 UID
 * @param cookie - 用戶的 Cookie
 * @param gameName - 遊戲名稱
 * @returns 用戶的 UID 和暱稱
 */
async function getUserGameUid(cookie, gameName = 'Zenless Zone Zero') {
    const hoyolab = new hoyoapi_1.Hoyolab({
        cookie: cookie,
    });
    // FIXME: wrong type (IGameRecordCard), should be IGameRecordCard[]
    const gameRecord = (await hoyolab.gameRecordCard());
    const filteredData = gameRecord.filter((item) => item.game_name === gameName);
    return {
        uid: filteredData[0].game_role_id,
        nickname: filteredData[0].nickname,
    };
}
/**
 * @description 更新帳號信息
 * @param userId - 用戶 ID
 * @param newAccountInfo - 新的帳號信息
 * @returns 帳號信息
 */
async function updateAccountInfo(userId, newAccountInfo) {
    const accountKey = `${userId}.account`;
    let accounts = (await index_1.database.get(accountKey)) || [];
    const existingIndex = accounts.findIndex((acc) => acc.uid === newAccountInfo.uid);
    if (existingIndex !== -1) {
        accounts[existingIndex] = {
            ...accounts[existingIndex],
            cookie: newAccountInfo.cookie,
            nickname: newAccountInfo.nickname,
            lastUpdate: new Date().toISOString(),
        };
        new logger_1.default(`帳號`).info(`[用戶 ${userId}] 更新現有帳號 [UID: ${newAccountInfo.uid}]`);
    }
    else {
        accounts.push({
            uid: newAccountInfo.uid,
            cookie: newAccountInfo.cookie,
            nickname: newAccountInfo.nickname,
            lastUpdate: new Date().toISOString(),
        });
        new logger_1.default(`帳號`).info(`[用戶 ${userId}] 添加新帳號 [UID: ${newAccountInfo.uid}]`);
    }
    await index_1.database.set(accountKey, accounts);
    return {
        isNewAccount: existingIndex === -1,
        accountIndex: existingIndex !== -1 ? existingIndex : accounts.length - 1,
    };
}
