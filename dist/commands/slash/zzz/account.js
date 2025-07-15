"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const utilities_1 = require("@/utilities");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('account')
        .setDescription('Setting, view, delete account')
        .setNameLocalizations({
        'zh-TW': '帳號',
        'vi': 'tàikhoản',
        'fr': 'compte',
    })
        .setDescriptionLocalizations({
        'zh-TW': '設置, 檢視, 刪除帳號',
        'vi': 'Cài đặt, xem, xoá tài khoản',
        'fr': 'Paramètres, voir, supprimer le compte',
    })
        .addStringOption((option) => option
        .setName('options')
        .setDescription('...')
        .setNameLocalizations({
        'zh-TW': '選項',
        'vi': 'tuỳchọn',
        'fr': 'options',
    })
        .setRequired(true)
        .addChoices({
        name: '🔥Login with account and password🔥',
        name_localizations: {
            'zh-TW': '🔥帳號密碼登入🔥',
            'vi': '🔥Đăng nhập tài khoản mật khẩu🔥',
            'fr': '🔥Connexion par mot de passe🔥',
        },
        value: 'LoginAccount',
    }, {
        name: '❓ How to set up account',
        name_localizations: {
            'zh-TW': '❓ 如何設定帳號',
            'vi': '❓ Cách thiết lập tài khoản',
            'fr': '❓ Comment définir le compte',
        },
        value: 'HowToSetUpAccount',
    }, {
        name: '① Set UID',
        name_localizations: {
            'zh-TW': '① 設定 UID',
            'vi': '① Thiết lập UID',
            'fr': '① Définir UID',
        },
        value: 'SetUserID',
    }, {
        name: '② Set Cookie',
        name_localizations: {
            'zh-TW': '② 設定 Cookie',
            'vi': '② Thiết lập Cookie',
            'fr': '② Définir Cookie',
        },
        value: 'SetUserCookie',
    }, {
        name: '🔸 View configured account',
        name_localizations: {
            'zh-TW': '🔸 檢視已設定帳號',
            'vi': '🔸 Xem các tài khoản đã được cài đặt',
            'fr': '🔸 Liste de comptes',
        },
        value: 'ViewAccount',
    }, {
        name: '⚙️ Edit configured account',
        name_localizations: {
            'zh-TW': '⚙️ 編輯已設定帳號',
            'vi': '⚙️ Sửa thiết lập tài khoản',
            'fr': '⚙️ Modifier le compte',
        },
        value: 'EditAccount',
    }, {
        name: '❌ Delete configured account',
        name_localizations: {
            'zh-TW': '❌ 刪除已設定帳號',
            'vi': '❌ Xoá tài khoản đã thiết lập',
            'fr': '❌ Supprimer le compte',
        },
        value: 'DeleteAccount',
    })),
    /**
     *
     * @param {Client} client
     * @param {CommandInteraction} interaction
     * @param {String[]} args
     */
    async execute(_client, interaction, _args, tr, db, emoji) {
        const command = interaction.options.get('options')?.value;
        const userId = interaction.user.id;
        const accountKey = `${userId}.account`;
        const hasAccount = await db.has(accountKey);
        if (command == 'ViewAccount' ||
            command == 'EditAccount' ||
            command == 'DeleteAccount') {
            if (!hasAccount)
                return (0, utilities_1.failedReply)(interaction, tr('account_NoAccount'));
            await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        }
        const accounts = await db.get(accountKey);
        switch (command) {
            case 'HowToSetUpAccount':
                interaction.reply({
                    embeds: [
                        new discord_js_1.EmbedBuilder()
                            .setTitle(tr('account_HowToSetUpAccount'))
                            .setColor((0, utilities_1.getRandomColor)())
                            .setDescription(tr('account_HowToSetUpAccountDesc'))
                            .setImage('https://media.discordapp.net/attachments/1149960935654559835/1185194443322687528/cookieT.png'),
                    ],
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                return;
            case 'LoginAccount':
                await interaction.showModal(new discord_js_1.ModalBuilder()
                    .setCustomId('account_LoginAccountModal')
                    .setTitle(tr('account_LoginAccount'))
                    .addComponents(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
                    .setCustomId('account_LoginAccountModalField')
                    .setLabel(tr('account_LoginAccountDesc'))
                    .setPlaceholder('example@gmail.com')
                    .setStyle(discord_js_1.TextInputStyle.Short)
                    .setRequired(true)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
                    .setCustomId('account_LoginAccountModalField2')
                    .setLabel(tr('account_LoginAccountDesc2'))
                    .setPlaceholder('mypassword')
                    .setStyle(discord_js_1.TextInputStyle.Short)
                    .setRequired(true))));
                return;
            case 'SetUserID':
                await interaction.showModal(new discord_js_1.ModalBuilder()
                    .setCustomId('account_SetUserIDModal')
                    .setTitle(tr('account_SetUserID'))
                    .addComponents(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
                    .setCustomId('account_SetUserIDModalField')
                    .setLabel(tr('account_SetUserIDDesc'))
                    .setPlaceholder('e.g. 1300007596')
                    .setStyle(discord_js_1.TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(9)
                    .setMaxLength(10))));
                return;
            case 'SetUserCookie':
                if (!hasAccount)
                    return (0, utilities_1.failedReply)(interaction, tr('account_NoAccount'));
                interaction.reply({
                    components: [
                        new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
                            .setPlaceholder(tr('account_SelectAccountSetCookie'))
                            .setCustomId('account_SetUserCookieSelect')
                            .setMinValues(1)
                            .setMaxValues(1)
                            .addOptions(accounts.map((account, index) => ({
                            emoji: emoji.avatarIcon,
                            label: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ''}`,
                            value: `${index}`,
                        })))),
                    ],
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                return;
            case 'ViewAccount':
                interaction.editReply({
                    embeds: [
                        new discord_js_1.EmbedBuilder()
                            .setColor((0, utilities_1.getRandomColor)())
                            .setAuthor({
                            name: tr('account_ListOfAccount', {
                                Username: interaction.user.username,
                            }),
                            iconURL: `${interaction.user.displayAvatarURL({
                                size: 4096,
                            })}`,
                        })
                            .addFields(...accounts.map((account) => ({
                            name: `${emoji.avatarIcon} ${account.uid} ${account.nickname ? `- ${account.nickname}` : ''}`,
                            value: `${account.cookie
                                ? `🔗 \`${tr('account_Linked')}\``
                                : `❌ \`${tr('account_NotLinked')}\``}`,
                            inline: true,
                        }))),
                    ],
                });
                return;
            case 'EditAccount':
                interaction.editReply({
                    components: [
                        new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
                            .setPlaceholder(tr('account_SelectAccountEdit'))
                            .setCustomId('account_EditAccountSelect')
                            .setMinValues(1)
                            .setMaxValues(1)
                            .addOptions(accounts.map((account, index) => {
                            return {
                                emoji: emoji.avatarIcon,
                                label: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ''}`,
                                value: `${index}`,
                            };
                        }))),
                    ],
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                return;
            case 'DeleteAccount':
                interaction.editReply({
                    components: [
                        new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
                            .setPlaceholder(tr('account_SelectAccountDelete'))
                            .setCustomId('account_DeleteAccountSelect')
                            .setMinValues(1)
                            .setMaxValues(1)
                            .addOptions(accounts.map((account, index) => ({
                            emoji: emoji.avatarIcon,
                            label: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ''}`,
                            value: `${index}`,
                        })))),
                    ],
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                return;
        }
    },
};
