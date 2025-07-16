"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const queue_1 = __importDefault(require("queue"));
const discord_js_1 = require("discord.js");
const index_js_1 = require("@/index.js");
const utilities_1 = require("@/utilities");
const profile_1 = require("@/renderers/profile");
const i18n_1 = require("@/utilities/core/i18n");
const emoji_1 = __importDefault(require("@/assets/emoji"));
const drawQueue = new queue_1.default({ autostart: true });
const elementId = {
    200: 'physic',
    201: 'fire',
    202: 'ice',
    203: 'thunder',
    205: 'ether',
};
index_js_1.client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton())
        return;
    await interaction.update({ fetchReply: true }).catch(() => { });
    const { customId } = interaction;
    if (customId == 'profile_CharacterMindScape')
        handleMindScapeChange(interaction);
});
index_js_1.client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isStringSelectMenu())
        return;
    const { locale, customId, values } = interaction;
    if (!(await (0, utilities_1.getUserLang)(interaction.user.id)))
        await (0, utilities_1.setupDefaultLang)(interaction.user.id, interaction.locale);
    const userLocale = (await (0, utilities_1.getUserLang)(interaction.user.id)) || (0, i18n_1.toI18nLang)(locale) || 'en';
    if (!customId.startsWith('account'))
        await interaction.update({ fetchReply: true }).catch(() => { });
    if (customId.startsWith('news'))
        handleNews(interaction, userLocale, values[0]);
    if (customId.startsWith('account'))
        handleAccountAction(interaction, userLocale, customId, values[0]);
    if (customId.startsWith('profile_SelectCharacter'))
        handleSelectCharacter(interaction, userLocale, values[0]);
});
async function handleMindScapeChange(interaction) {
    const [row1, row2] = interaction.message.components;
    const mindScapeKey = `${interaction.user.id}.mindscape`;
    const mindScape = (await index_js_1.database.get(mindScapeKey)) ?? true;
    await index_js_1.database.set(mindScapeKey, !mindScape);
    await interaction.message.edit({
        components: [row1, row2],
    });
}
async function handleSelectCharacter(interaction, userLocale, value) {
    const tr = (0, i18n_1.createTranslator)(userLocale);
    const drawTask = async () => {
        try {
            await interaction.editReply({
                embeds: [new discord_js_1.EmbedBuilder().setTitle(tr('Searching')).setImage('https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif')],
                components: [],
            });
            const requestStartTime = Date.now();
            const [userId, accountIndex, characterId] = value.split('-');
            const zzz = await (0, utilities_1.getUserZZZData)(interaction, userLocale, userId, parseInt(accountIndex));
            if (!zzz)
                return;
            const characters = await zzz.record.characters();
            const requestEndTime = Date.now();
            const drawStartTime = Date.now();
            const selectedCharacter = characterId !== 'main' ? (await zzz.record.character(parseInt(characterId)))[0] : null;
            let imageBuffer;
            if (characterId == 'main') {
                const record = await zzz.record.records();
                const userData = await (0, utilities_1.getUserHoyolabData)(interaction, userLocale, userId);
                imageBuffer = (await (0, profile_1.drawMainImage)());
            }
            else {
                imageBuffer = (await (0, profile_1.drawCharacterImage)());
            }
            if (!imageBuffer)
                throw new Error(tr('profile_NoImageData'));
            const drawEndTime = Date.now();
            const image = new discord_js_1.AttachmentBuilder(imageBuffer, {
                name: `CharacterPage_${zzz.uid}.png`,
            });
            const userMindScape = (await index_js_1.database.get(`${interaction.user.id}.mindscape`)) ?? true;
            function chunkArray(array, size) {
                return Array.from({ length: Math.ceil(array.length / size) }, (_, index) => array.slice(index * size, (index + 1) * size));
            }
            const characterOptions = characterId === 'main'
                ? characters.map((character) => ({
                    emoji: emoji_1.default[elementId[Number(character.element)]],
                    label: `${character.name}`,
                    value: `${userId}-${character.id}`,
                }))
                : [
                    {
                        emoji: emoji_1.default.avatarIcon,
                        label: tr('MainPage'),
                        value: `${userId}-${accountIndex}-main`,
                    },
                    ...characters.map((character) => ({
                        emoji: emoji_1.default[elementId[Number(character.element)]],
                        label: `${character.name}`,
                        description: `${tr('profile_CharactersFormat', {
                            level: character.level.toString(),
                            rank: character.rank.toString(),
                        })}`,
                        value: `${userId}-${accountIndex}-${character.id}`,
                    })),
                ];
            const optionChunks = chunkArray(characterOptions, 25);
            const rowSelects = optionChunks.map((optionsChunk, index) => new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
                .setPlaceholder(`${tr('profile_SelectCharacter')} (${index + 1})`)
                .setCustomId(`profile_SelectCharacter-${index}`)
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(...optionsChunk)));
            const rowMindScape = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId('profile_CharacterMindScape')
                .setLabel(tr('MindScape'))
                .setStyle(userMindScape ? discord_js_1.ButtonStyle.Success : discord_js_1.ButtonStyle.Secondary));
            const embed = new discord_js_1.EmbedBuilder().setImage(`attachment://${image.name}`).setFooter({
                text: tr('TimeSpent', {
                    requestTime: ((requestEndTime - requestStartTime) / 1000).toFixed(2),
                    drawTime: ((drawEndTime - drawStartTime) / 1000).toFixed(2),
                }),
            });
            if (characterId != 'main') {
                embed.setColor(selectedCharacter.vertical_painting_color);
            }
            interaction.editReply({
                embeds: [embed],
                components: [...rowSelects, rowMindScape],
                files: [image],
            });
        }
        catch (error) {
            console.log(error);
            interaction.editReply({
                embeds: [
                    new discord_js_1.EmbedBuilder()
                        .setColor('#E76161')
                        .setTitle(tr('DrawError'))
                        .setDescription(`\`${error}\``)
                        .setThumbnail('https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png'),
                ],
            });
        }
    };
    drawQueue.push(drawTask);
    if (drawQueue.length !== 1) {
        (0, utilities_1.drawInQueueReply)(interaction, tr('DrawInQueue', { position: (drawQueue.length - 1).toString() }));
    }
}
async function handleAccountAction(interaction, userLocale, customId, value) {
    const tr = (0, i18n_1.createTranslator)(userLocale);
    const account = await index_js_1.database.get(`${interaction.user.id}.account`);
    if (!account)
        return interaction.reply({
            embeds: [new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(`${tr('account_nonAcc')}`)],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
    if (customId == 'account_EditAccountSelect') {
        await interaction.update({ fetchReply: true }).catch(() => { });
        const accountIndex = value;
        interaction.editReply({
            components: [
                new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
                    .setPlaceholder(tr('account_SelectAccountEdit'))
                    .setCustomId('account_EditAccountSelectType')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions({ label: 'UID', value: `uid-${accountIndex}` }, { label: 'Cookie', value: `cookie-${accountIndex}` })),
            ],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    else if (customId == 'account_EditAccountSelectType') {
        const [type, accountIndex] = value.split('-');
        const accountData = account[accountIndex];
        if (type == 'uid') {
            await interaction.showModal(new discord_js_1.ModalBuilder()
                .setCustomId(`accountEdit-${accountIndex}`)
                .setTitle(tr('account_SetUserID'))
                .addComponents(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
                .setCustomId('uid')
                .setLabel(tr('account_SetUserIDDesc'))
                .setValue(accountData.uid || '')
                .setPlaceholder('e.g. 809279679')
                .setStyle(discord_js_1.TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(9)
                .setMaxLength(10))));
        }
        else if (type == 'cookie') {
            const userAccountCookie = accountData.cookie;
            const parsedCookie = (0, utilities_1.parseCookie)(userAccountCookie);
            await interaction.showModal(new discord_js_1.ModalBuilder()
                .setCustomId(`cookie_set-${accountIndex}`)
                .setTitle(tr('account_SetUserCookie'))
                .addComponents(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
                .setCustomId('ltoken')
                .setLabel('ltoken_2')
                .setPlaceholder('v2_...')
                .setValue(parsedCookie.ltoken || '')
                .setStyle(discord_js_1.TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0)
                .setMaxLength(1000)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
                .setCustomId('ltuid')
                .setLabel('ltuid_v2')
                .setPlaceholder('30...')
                .setValue(parsedCookie.ltuid || '')
                .setStyle(discord_js_1.TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0)
                .setMaxLength(30)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
                .setCustomId('cookieToken')
                .setLabel('cookie_token_v2')
                .setPlaceholder('v2_...')
                .setValue(parsedCookie.cookieToken || '')
                .setStyle(discord_js_1.TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0)
                .setMaxLength(1000)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
                .setCustomId('accountMid')
                .setLabel('account_mid_v2')
                .setPlaceholder('1lyq...')
                .setValue(parsedCookie.accountMid || '')
                .setStyle(discord_js_1.TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0)
                .setMaxLength(30))));
        }
    }
    else if (interaction.customId == 'account_DeleteAccountSelect') {
        await interaction.update({ fetchReply: true }).catch(() => { });
        const accountIndex = value;
        const accounts = (await index_js_1.database.get(`${interaction.user.id}.account`)) ?? '';
        const uid = accounts[accountIndex].uid;
        if (accounts.length <= 1)
            await index_js_1.database.delete(`${interaction.user.id}.account`);
        else {
            accounts.splice(accountIndex, 1);
            await index_js_1.database.set(`${interaction.user.id}.account`, accounts);
        }
        interaction.editReply({
            embeds: [new discord_js_1.EmbedBuilder().setColor('#F6F1F1').setTitle(`${tr('account_DeletedSuccess')} \`${uid}\``)],
            components: [],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    else if (interaction.customId == 'account_SetUserCookieSelect') {
        const accountIndex = value;
        const userAccountCookie = account[accountIndex].cookie;
        const parsedCookie = (0, utilities_1.parseCookie)(userAccountCookie);
        await interaction.showModal(new discord_js_1.ModalBuilder()
            .setCustomId(`cookie_set-${accountIndex}`)
            .setTitle(tr('account_SetUserCookie'))
            .addComponents(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
            .setCustomId('ltoken')
            .setLabel('ltoken_2')
            .setPlaceholder('v2_...')
            .setValue(parsedCookie.ltoken || '')
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(0)
            .setMaxLength(1000)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
            .setCustomId('ltuid')
            .setLabel('ltuid_v2')
            .setPlaceholder('30...')
            .setValue(parsedCookie.ltuid || '')
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(0)
            .setMaxLength(30)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
            .setCustomId('cookieToken')
            .setLabel('cookie_token_v2')
            .setPlaceholder('v2_...')
            .setValue(parsedCookie.cookieToken || '')
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(0)
            .setMaxLength(1000)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
            .setCustomId('accountMid')
            .setLabel('account_mid_v2')
            .setPlaceholder('1lyq...')
            .setValue(parsedCookie.accountMid || '')
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(0)
            .setMaxLength(30))));
    }
}
async function handleNews(interaction, userLocale, value) {
    const tr = (0, i18n_1.createTranslator)(userLocale);
    if (interaction.customId == 'news_type') {
        const type = value;
        const newsData = await (0, utilities_1.getNewsList)(userLocale, type);
        return interaction.editReply({
            components: [
                new discord_js_1.ActionRowBuilder()
                    .addComponents(new discord_js_1.StringSelectMenuBuilder()
                    .setPlaceholder(tr('news_SelectPost'))
                    .setCustomId('news_post')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(
                // TODO: 修改類型
                newsData.data.list.map((data) => {
                    const date = new Date(data.post.created_at * 1000);
                    return {
                        label: `${data.post.subject.length < 100 ? data.post.subject : data.post.subject.slice(0, 97).concat('...')}`,
                        description: date.getUTCFullYear() + tr('Year') + (date.getUTCMonth() + 1) + tr('Month') + date.getUTCDate() + tr('Day'),
                        value: `${data.post.post_id}`,
                    };
                })))
                    .toJSON(),
                new discord_js_1.ActionRowBuilder()
                    .addComponents(new discord_js_1.StringSelectMenuBuilder()
                    .setPlaceholder(tr('news_SelectType'))
                    .setCustomId('news_type')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions({ label: tr('news_Notice'), emoji: '🔔', value: '1' }, { label: tr('news_Events'), emoji: '🔥', value: '2' }, { label: tr('news_Info'), emoji: '🗞️', value: '3' }))
                    .toJSON(),
            ],
        });
    }
    else if (interaction.customId == 'news_post') {
        const postId = value;
        const postData = await (0, utilities_1.getPostFull)(userLocale, postId);
        const { post, user, image_list, cover_list } = postData.post;
        const content = await (0, utilities_1.parsePostContent)(post.content);
        const date = new Date(post.created_at * 1000);
        return interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor((0, utilities_1.getRandomColor)())
                    .setAuthor({
                    iconURL: user.avatar_url ?? '',
                    name: user.nickname ?? '',
                    url: `https://www.hoyolab.com/accountCenter?id=${user.uid}`,
                })
                    .setTitle(post.subject ?? tr('None'))
                    .setURL(`https://www.hoyolab.com/article/${post.post_id}`)
                    .setDescription(content.length < 4096 ? content : (content.slice(0, 4096 - 3).concat('...') ?? tr('None')))
                    .setFooter({
                    text: date.getUTCFullYear() + tr('Year') + (date.getUTCMonth() + 1) + tr('Month') + date.getUTCDate() + tr('Day'),
                })
                    .setImage(image_list[0]?.url ?? cover_list[0]?.url),
            ],
        });
    }
}
