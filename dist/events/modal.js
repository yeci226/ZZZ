"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const hoyoapi_1 = require("@yeci226/hoyoapi");
const index_js_1 = require("@/index.js");
const utilities_1 = require("@/utilities");
const i18n_1 = require("@/utilities/core/i18n");
const login_1 = __importDefault(require("@/utilities/zzz/login"));
const gacha_1 = require("@/renderers/gacha");
index_js_1.client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isModalSubmit())
        return;
    const { locale, customId, fields } = interaction;
    if (!(await (0, utilities_1.getUserLang)(interaction.user.id)))
        await (0, utilities_1.setupDefaultLang)(interaction.user.id, interaction.locale);
    const userLocale = (await (0, utilities_1.getUserLang)(interaction.user.id)) || (0, i18n_1.toI18nLang)(locale) || 'en';
    if (customId.startsWith('accountEdit'))
        handleAccountEdit(interaction, userLocale, customId, fields);
    if (customId == 'account_LoginAccountModal')
        handleAccountLogin(interaction, userLocale, fields);
    if (customId == 'account_SetUserIDModal')
        handleUidSet(interaction, userLocale, fields);
    if (customId.startsWith('cookie_set'))
        handleCookieSet(interaction, userLocale, customId, fields);
    if (customId == 'signal_log')
        handleWarplog(interaction, userLocale, fields);
});
async function handleAccountLogin(interaction, locale, fields) {
    const tr = (0, i18n_1.createTranslator)(locale);
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const interactionUser = interaction.user;
    const email = fields.getTextInputValue('account_LoginAccountModalField');
    const password = fields.getTextInputValue('account_LoginAccountModalField2');
    try {
        // Make sure Email is correct
        const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        if (!emailRegex.test(email)) {
            return interaction.editReply({
                embeds: [new discord_js_1.EmbedBuilder().setTitle(tr('account_LoginFailed')).setDescription(tr('account_LoginFailedDesc')).setColor('#E76161')],
            });
        }
        const existedAccounts = (await index_js_1.database.get(`${interactionUser.id}.account`)) || [];
        if (existedAccounts.length >= 5) {
            return interaction.editReply({
                embeds: [new discord_js_1.EmbedBuilder().setTitle(tr('account_LimitExceeded')).setColor('#E76161')],
            });
        }
        const loginData = await (0, login_1.default)(email, password);
        if (!loginData) {
            return interaction.editReply({
                embeds: [new discord_js_1.EmbedBuilder().setTitle(tr('account_LoginFailed')).setDescription(tr('account_LoginFailedDesc')).setColor('#E76161')],
            });
        }
        const { uid, nickname, cookie } = loginData;
        await index_js_1.database.delete(`${uid}.cookieExpired`);
        if (existedAccounts.some((account) => account.uid == uid)) {
            existedAccounts.map(async (account) => {
                if (account.uid == uid) {
                    account.cookie = cookie;
                    account.nickname = nickname;
                    await index_js_1.database.set(`${interactionUser.id}.account`, existedAccounts);
                }
            });
        }
        else {
            await index_js_1.database.push(`${interactionUser.id}.account`, {
                uid: uid,
                cookie: cookie,
                nickname: nickname,
            });
        }
        return interaction.editReply({
            embeds: [new discord_js_1.EmbedBuilder().setColor('#F6F1F1').setTitle(tr('account_LoginSuccess'))],
        });
    }
    catch (error) {
        return interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setTitle(tr('account_LoginFailed'))
                    .setDescription(`${tr('account_LoginFailedDesc')}\n${error.message}`)
                    .setColor('#E76161'),
            ],
        });
    }
}
async function handleWarplog(interaction, locale, fields) {
    await interaction.deferReply();
    const tr = (0, i18n_1.createTranslator)(locale);
    const url = fields.getTextInputValue('signalUrl');
    interaction.editReply({
        embeds: [new discord_js_1.EmbedBuilder().setTitle(tr('Searching')).setColor((0, utilities_1.getRandomColor)()).setImage('https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif')],
    });
    const requestStartTime = Date.now();
    let signalResults;
    if (url != '')
        signalResults = (await (0, gacha_1.getSingalLog)());
    if (!signalResults)
        return interaction.editReply({
            embeds: [new discord_js_1.EmbedBuilder().setTitle(tr('gacha_NoSignal')).setColor('#E76161')],
        });
    const requestEndTime = Date.now();
    const requestTime = ((requestEndTime - requestStartTime) / 1000).toFixed(2);
    return (0, gacha_1.handleSignalLogDraw)();
    // handleSignalLogDraw(interaction, tr, userLocale, "character", url);
}
async function handleAccountEdit(interaction, locale, customId, fields) {
    const tr = (0, i18n_1.createTranslator)(locale);
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const interactionUser = interaction.user;
    const accountIndex = parseInt(customId.split('-')[1]);
    const uid = parseInt(fields.getTextInputValue('uid'));
    const accounts = (await index_js_1.database.get(`${interactionUser.id}.account`)) ?? '';
    // const data = await requestPlayerData(uid, interaction);
    // if (!data.playerData?.player.uid)
    // 	return interaction.editReply({
    // 		embeds: [
    // 			new EmbedBuilder()
    //        .setConfig("#E76161", "sob")
    // 				.setTitle(tr("profile_UidNotFound") + " - " + uid)
    // 		]
    // 	});
    if (accounts.some((account) => account.uid === uid))
        return interaction.editReply({
            embeds: [new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(tr('account_AlreadySet', { z: `${uid}` }))],
        });
    accounts[accountIndex].uid = uid;
    await index_js_1.database.set(`${interactionUser.id}.account`, accounts);
    interaction.editReply({
        embeds: [new discord_js_1.EmbedBuilder().setColor('#F6F1F1').setTitle(tr('account_UidSetSuccess', { z: `${uid}` }))],
    });
}
async function handleUidSet(interaction, locale, fields) {
    const tr = (0, i18n_1.createTranslator)(locale);
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const interactionUser = interaction.user;
    const uid = parseInt(fields.getTextInputValue('account_SetUserIDModalField'));
    //   try {
    //     const data = await requestPlayerData(uid, interaction);
    //     if (!data.playerData?.player.uid)
    //       return interaction.editReply({
    //         embeds: [
    //           new EmbedBuilder()
    //             .setConfig("#E76161", "sob")
    //             .setTitle(tr("profile_UidNotFound") + " - " + uid),
    //         ],
    //       });
    //   } catch (e) {
    //     if (e instanceof AxiosError) {
    //       await interaction.followUp({
    //         ephemeral: true,
    //         content: `未知的UID - \`${e}\``,
    //       });
    //     }
    //     throw e;
    //   }
    if (await index_js_1.database.has(`${interactionUser.id}.account`)) {
        const accounts = (await index_js_1.database.get(`${interactionUser.id}.account`)) || [];
        if (accounts.length >= 5)
            return interaction.editReply({
                embeds: [new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(`${tr('account_LimitExceeded')} `)],
            });
        if (accounts.some((account) => account.uid == uid))
            return interaction.editReply({
                embeds: [new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(`${tr('account_AlreadySet', { z: `${uid}` })}`)],
            });
    }
    await index_js_1.database.push(`${interactionUser.id}.account`, { uid: uid, cookie: '' });
    return interaction.editReply({
        embeds: [new discord_js_1.EmbedBuilder().setColor('#F6F1F1').setTitle(`${tr('account_UidSetSuccess', { z: `${uid}` })}`)],
    });
}
async function handleCookieSet(interaction, locale, customId, fields) {
    const tr = (0, i18n_1.createTranslator)(locale);
    const interactionUser = interaction.user;
    const accountIndex = parseInt(customId.split('-')[1]);
    const ltoken = fields.getTextInputValue('ltoken') ? `ltoken_v2=${fields.getTextInputValue('ltoken')}; ` : '';
    const ltuid = fields.getTextInputValue('ltuid') ? `ltuid_v2=${fields.getTextInputValue('ltuid')}; ` : '';
    const cookieToken = fields.getTextInputValue('cookieToken') ? `cookie_token_v2=${fields.getTextInputValue('cookieToken')}; ` : '';
    const accountMid = fields.getTextInputValue('accountMid') ? `account_mid_v2=${fields.getTextInputValue('accountMid')}; ` : '';
    const cookie = ltoken + ltuid + cookieToken + accountMid;
    const account = (await index_js_1.database.get(`${interactionUser.id}.account`)) ?? '';
    try {
        const zzz = new hoyoapi_1.ZenlessZoneZero({
            cookie: cookie,
        });
        await zzz.daily.info();
        account[accountIndex].cookie = cookie;
        await index_js_1.database.set(`${interactionUser.id}.account`, account);
        const userData = await (0, utilities_1.getUserHoyolabData)(interaction, locale, interactionUser.id, accountIndex);
        await index_js_1.database.delete(`${account[accountIndex].uid}.cookieExpired`);
        account[accountIndex].nickname = userData.nickname;
        await index_js_1.database.set(`${interactionUser.id}.account`, account);
        return interaction.reply({
            embeds: [new discord_js_1.EmbedBuilder().setColor('#F6F1F1').setTitle(tr('account_CookieSetSuccess', { z: `${account[accountIndex].uid}` }))],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
    }
    catch (error) {
        return interaction.reply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setTitle(tr('account_CookieSetFailed', { z: `${account[accountIndex].uid}` }))
                    .setDescription(tr('account_CookieSetFailedDesc') + '\n\n' + '`' + error.message + '`')
                    .setColor('#E76161'),
            ],
        });
    }
}
