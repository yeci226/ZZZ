"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const utilities_1 = require("@/utilities");
const i18n_1 = require("@/utilities/core/i18n");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('signal')
        .setDescription('...')
        .setNameLocalizations({
        'zh-TW': '調頻',
    })
        .setDescriptionLocalizations({
        'zh-TW': '...',
    })
        .addSubcommand((subcommand) => subcommand
        .setName('log')
        .setDescription('Currently only supports the PC side, if you find other ways you can use it')
        .setNameLocalizations({
        'zh-TW': '紀錄',
    })
        .setDescriptionLocalizations({
        'zh-TW': '目前僅支持電腦端，若您有發現可以的其他方式也可以使用',
    })
        .addStringOption((option) => option
        .setName('options')
        .setDescription('...')
        .setNameLocalizations({
        'zh-TW': '選項',
    })
        .setDescriptionLocalizations({
        'zh-TW': '...',
    })
        .setRequired(true)
        .addChoices({
        name: 'How to get url',
        name_localizations: {
            'zh-TW': '如何取得調頻紀錄連結',
        },
        value: 'how',
    }, {
        name: 'Signal records',
        name_localizations: {
            'zh-TW': '查詢調頻紀錄',
        },
        value: 'query',
    }))),
    /**
     * @description 調頻
     * @param interaction - 交互實例
     * @param locale - 語言
     * @param _args - 參數
     */
    async execute(interaction, locale, ..._args) {
        await interaction.deferReply();
        const tr = (0, i18n_1.createTranslator)(locale);
        const subcommand = interaction.options.getSubcommand();
        const selectedOption = interaction.options.getString('options');
        switch (subcommand) {
            case 'log':
                switch (selectedOption) {
                    case 'how':
                        return interaction.reply({
                            embeds: [
                                new discord_js_1.EmbedBuilder()
                                    .setColor((0, utilities_1.getRandomColor)())
                                    .setTitle(tr('gacha_HowToGet'))
                                    .setDescription(tr('gacha_HowToGetDesc', {
                                    z: `\`\`\`powershell\nStart-Process powershell -Verb runAs -ArgumentList '-NoExit -Command "Invoke-Expression  (New-Object Net.WebClient).DownloadString(\\"https://raw.githubusercontent.com/yeci226/ZZZ-ToS-PP/main/getSignal.ps1\\")"'\n\`\`\``,
                                })),
                            ],
                            flags: discord_js_1.MessageFlags.Ephemeral,
                        });
                    case 'query':
                        return interaction.showModal(new discord_js_1.ModalBuilder()
                            .setCustomId('signal_log')
                            .setTitle(tr('gacha_LogTitle'))
                            .addComponents(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
                            .setCustomId('signalUrl')
                            .setLabel(tr('gacha_LogDesc'))
                            .setPlaceholder('URL')
                            .setStyle(discord_js_1.TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMinLength(50)
                            .setMaxLength(4000))));
                    default:
                        return interaction.reply({
                            embeds: [new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(tr('gacha_InvalidSubcommand')).setDescription(tr('gacha_InvalidSubcommandDesc'))],
                        });
                }
            default:
                return interaction.reply({
                    embeds: [new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(tr('gacha_InvalidSubcommand')).setDescription(tr('gacha_InvalidSubcommandDesc'))],
                });
        }
    },
};
