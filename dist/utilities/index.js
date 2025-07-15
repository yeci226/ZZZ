"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const axios_1 = __importDefault(require("axios"));
const discord_js_1 = require("discord.js");
const emoji_1 = __importDefault(require("@/assets/emoji"));
const index_1 = require("@/index");
const hoyoapi_1 = require("@yeci226/hoyoapi");
const canvas_1 = require("@napi-rs/canvas");
const logger_1 = __importDefault(require("@/utilities/core/logger"));
const BASE_URL = 'https://bbs-api-os.hoyolab.com/community/post/wapi/';
const zzzStaticUrl = 'https://act-webstatic.hoyoverse.com/game_record/zzz';
const zzzStaticUrl2 = 'https://act-webstatic.hoyoverse.com/game_record/nap';
const zzzStaticUrl3 = 'https://act-webstatic.hoyoverse.com/game_record/zzzv2';
const squareUrl = `${zzzStaticUrl}/role_square_avatar/role_square_avatar_`;
const squareUrl2 = `${zzzStaticUrl2}/role_square_avatar/role_square_avatar_`;
const squareUrl3 = `${zzzStaticUrl3}/role_square_avatar/role_square_avatar_`;
/**
 * Get the avatar url of the agent
 * @param agentId - The id of the agent
 * @returns The avatar url of the agent
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
 * Get the news list of the game
 * @param lang - The language of the news
 * @param type - The type of the news
 * @returns The news list of the game
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
 * Get the post full of the game
 * @param lang - The language of the post
 * @param postId - The id of the post
 * @returns The post full of the game
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
 * Parse the content of the post
 * @param content - The content of the post
 * @returns The parsed content of the post
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
    content = content.replace(/<([a-z]+)\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/\1>/gi, (match, tag, href, text) => href == text ? `${emoji_1.default.link}${href}` : `${emoji_1.default.link}[${text}](${href})`);
    content = content.replace(/<iframe[^>]*src="([^"]*)"[^>]*><\/iframe>/gi, (match, p1) => `### ${emoji_1.default.link}[影片](${p1})`);
    content = content.replace(/\s*class="[^"]*"/g, '');
    // content = content.replace(/\n\s*\n/g, "\n");
    return content;
}
/**
 * Get the redeem codes of the game
 * @returns The redeem codes of the game
 */
async function getRedeemCodes() {
    const res = await axios_1.default
        .get('https://hoyo-codes.seria.moe/codes?game=nap')
        .then((response) => response.data);
    return res.codes;
}
/**
 * Convert seconds to hours, minutes, and seconds
 * @param d - The seconds to convert
 * @param tr - The translation function
 * @returns The converted time
 */
function secondsToHms(d, tr) {
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
 * Get the uid of the user
 * @param userId - The id of the user
 * @param accountIndex - The index of the account
 * @returns The uid of the user
 */
async function getUserUid(userId, accountIndex) {
    const accountKey = `${userId}.account`;
    const account = await index_1.db.get(accountKey);
    return account?.[accountIndex]?.uid || null;
}
/**
 * Get the cookie of the user
 * @param userId - The id of the user
 * @param accountIndex - The index of the account
 * @returns The cookie of the user
 */
async function getUserCookie(userId, accountIndex) {
    const accountKey = `${userId}.account`;
    const account = await index_1.db.get(accountKey);
    return account?.[accountIndex]?.cookie || null;
}
/**
 * Get the language of the user
 * @param userId - The id of the user
 * @returns The language of the user
 */
async function getUserLang(userId) {
    const langKey = `${userId}.locale`;
    const lang = await index_1.db.get(langKey);
    return lang || null;
}
/**
 * Get a random color
 * @returns A random color
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
 * Get the color of the stamina
 * @param stamina - The stamina to get the color of
 * @returns The color of the stamina
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
 * Draw the in queue reply
 * @param interaction - The interaction to draw the in queue reply
 * @param title - The title of the in queue reply
 */
async function drawInQueueReply(interaction, title = '') {
    interaction.editReply({
        embeds: [
            new discord_js_1.EmbedBuilder()
                .setTitle(title)
                .setThumbnail('https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif'),
        ],
        // fetchReply: true,
    });
}
/**
 * Draw the failed reply
 * @param interaction - The interaction to draw the failed reply
 * @param title - The title of the failed reply
 * @param description - The description of the failed reply
 */
async function failedReply(interaction, title = '', description = '') {
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(title)
        .setColor('#E76161')
        .setDescription(description);
    replyOrfollowUp(interaction, {
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
const langMap = {
    tw: hoyoapi_1.LanguageEnum.TRADIIONAL_CHINESE,
    cn: hoyoapi_1.LanguageEnum.SIMPLIFIED_CHINESE,
    vi: hoyoapi_1.LanguageEnum.VIETNAMESE,
    jp: hoyoapi_1.LanguageEnum.JAPANESE,
    kr: hoyoapi_1.LanguageEnum.KOREAN,
    fr: hoyoapi_1.LanguageEnum.FRENCH,
    default: hoyoapi_1.LanguageEnum.ENGLISH,
};
/**
 * Setup the default language of the user
 * @param userId - The id of the user
 * @param userSystemLang - The system language of the user
 */
async function setupDefaultLang(userId, userSystemLang) {
    const hoyoLangMap = {
        'zh-TW': 'tw',
        'zh-CN': 'cn',
        'ja': 'jp',
        'ko': 'kr',
    };
    const langCode = hoyoLangMap[userSystemLang] || userSystemLang;
    if (langMap[langCode]) {
        await index_1.db.set(`${userId}.locale`, langCode);
    }
}
/**
 * Get the data of the hoyolab
 * @param interaction - The interaction to get the data of the hoyolab
 * @param tr - The translation function
 * @param userId - The id of the user
 * @param userLang - The language of the user
 * @param accountIndex - The index of the account
 * @returns The data of the hoyolab
 */
async function getUserHoyolabData(interaction, tr, userId, userLang, accountIndex = 0) {
    const [cookie, uid] = await Promise.all([
        getUserCookie(userId, accountIndex),
        getUserUid(userId, accountIndex),
    ]);
    if (!userLang)
        userLang = await getUserLang(userId);
    const lang = langMap[userLang] ||
        langMap[interaction.locale] ||
        langMap.default;
    try {
        const hoyolab = new hoyoapi_1.Hoyolab({ cookie, lang });
        const gameRecord = await hoyolab.gameRecordCard();
        const filteredData = gameRecord.filter((item) => item.game_id === 8);
        return filteredData[0];
    }
    catch (error) {
        const isHoyoAPIError = error instanceof hoyoapi_1.HoyoAPIError;
        const errorCode = isHoyoAPIError ? error.code : error;
        checkAccount(interaction, tr, userId, isHoyoAPIError && error.code == 10035
            ? {
                errorCode: error.code,
            }
            : {
                hasCookie: cookie != null,
                lang: lang,
                hasUid: uid != null,
                errorCode: Number(errorCode),
            });
        return null;
    }
}
/**
 * Get the data of the bangboo
 * @param bangbooId - The id of the bangboo
 * @returns The data of the bangboo
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
 * Get the data of the weapon
 * @param weaponId - The id of the weapon
 * @returns The data of the weapon
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
 * Get the data of the character
 * @param characterId - The id of the character
 * @returns The data of the character
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
 * Get the data of the zzz
 * @param interaction - The interaction to get the data of the zzz
 * @param tr - The translation function
 * @param userId - The id of the user
 * @param userLang - The language of the user
 * @param accountIndex - The index of the account
 * @returns The data of the zzz
 */
async function getUserZZZData(interaction, tr, userId, userLang, accountIndex = 0) {
    const [cookie, uid] = await Promise.all([
        getUserCookie(userId, accountIndex),
        getUserUid(userId, accountIndex),
    ]);
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
    if (!userLang)
        userLang = await getUserLang(userId);
    const lang = langMap[userLang] ||
        langMap[interaction.locale] ||
        langMap.default;
    try {
        const zzz = new hoyoapi_1.ZenlessZoneZero({ cookie, lang, uid });
        await zzz.daily.info();
        return zzz;
    }
    catch (error) {
        const isHoyoAPIError = error instanceof hoyoapi_1.HoyoAPIError;
        const errorCode = isHoyoAPIError ? error.code : error;
        console.log(error);
        checkAccount(interaction, tr, userId, isHoyoAPIError && error.code == 10035
            ? {
                errorCode: error.code,
            }
            : {
                hasCookie: cookie != null,
                lang: lang,
                hasUid: uid != null,
                errorCode: Number(errorCode),
            });
        return null;
    }
}
/**
 * Check the account of the user
 * @param interaction - The interaction to check the account
 * @param tr - The translation function
 * @param userId - The id of the user
 * @param data - The data to check the account
 */
function checkAccount(interaction, tr, userId, data) {
    if (data.errorCode == 10035) {
        replyOrfollowUp(interaction, {
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor('#FFE9D0')
                    .setTitle('請先通過 Geetest 來繼續使用指令！')
                    .setURL(`http://yeci.rocks:3000/geetest/${userId}`),
            ],
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
            embeds: [
                new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(tr('NoSetAccount')),
            ],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
    }
}
/**
 * Update the cookie of the user
 * @param userId - The id of the user
 * @param accountIndex - The index of the account
 * @param cookieObj - The cookie object
 * @returns The updated cookie
 */
async function updateCookie(userId, accountIndex, cookieObj) {
    const webAPI = 'https://webapi-os.account.hoyoverse.com/Api/fetch_cookie_accountinfo';
    const parsedCookie = Object.fromEntries(cookieObj
        .split('; ')
        .filter(Boolean)
        .map((cookie) => cookie.split('=')));
    const cookie = [
        `cookie_token_v2=${parsedCookie.cookie_token_v2}`,
        `account_id_v2=${parsedCookie.ltuid_v2}`,
    ].join('; ');
    const response = await fetch(webAPI, {
        method: 'GET',
        headers: {
            Cookie: cookie,
        },
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const responseData = await response.json();
    if (responseData?.code !== 200)
        return {
            error: true,
            message: `Error: ${responseData.message || 'Unknown error'}`,
        };
    const newCookieToken = responseData.data.cookie_info.cookie_token;
    const accountKey = `${userId}.account`;
    const account = await index_1.db.get(accountKey);
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
    await index_1.db.set(accountKey, account);
}
/**
 * Reply or follow up the interaction
 * @param interaction - The interaction to reply or follow up
 * @param options - The options to reply or follow up
 * @returns The reply or follow up
 */
const replyOrfollowUp = async (interaction, options) => {
    if (interaction.replied) {
        return interaction.editReply({
            embeds: options.embeds,
            components: options.components,
        });
    }
    if (interaction.deferred) {
        return await interaction.followUp(options);
    }
    return await interaction.reply(options);
};
/**
 * Get the uid of the user
 * @param cookie - The cookie of the user
 * @param gameName - The name of the game
 * @returns The uid and nickname of the user
 */
async function getUserGameUid(cookie, gameName = 'Zenless Zone Zero') {
    const hoyolab = new hoyoapi_1.Hoyolab({
        cookie: cookie,
    });
    const gameRecord = await hoyolab.gameRecordCard();
    const filteredData = gameRecord.filter((item) => item.game_name === gameName);
    return {
        uid: filteredData[0].game_role_id,
        nickname: filteredData[0].nickname,
    };
}
/**
 * Update the account info
 * @param userId - The id of the user
 * @param newAccountInfo - The new account info
 * @returns The account info
 */
async function updateAccountInfo(userId, newAccountInfo) {
    const accountKey = `${userId}.account`;
    let accounts = (await index_1.db.get(accountKey)) || [];
    // Check if the account exists
    const existingIndex = accounts.findIndex((acc) => acc.uid === newAccountInfo.uid);
    if (existingIndex !== -1) {
        // Update the existing account
        accounts[existingIndex] = {
            ...accounts[existingIndex],
            cookie: newAccountInfo.cookie,
            nickname: newAccountInfo.nickname,
            lastUpdate: new Date().toISOString(),
        };
        new logger_1.default(`帳號`).info(`[用戶 ${userId}] 更新現有帳號 [UID: ${newAccountInfo.uid}]`);
    }
    else {
        // Add new account
        accounts.push({
            uid: newAccountInfo.uid,
            cookie: newAccountInfo.cookie,
            nickname: newAccountInfo.nickname,
            lastUpdate: new Date().toISOString(),
        });
        new logger_1.default(`帳號`).info(`[用戶 ${userId}] 添加新帳號 [UID: ${newAccountInfo.uid}]`);
    }
    // Save the updated account list
    await index_1.db.set(accountKey, accounts);
    return {
        isNewAccount: existingIndex === -1,
        accountIndex: existingIndex !== -1 ? existingIndex : accounts.length - 1,
    };
}
