"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const index_1 = require("@/index");
const i18n_1 = require("@/utilities/core/i18n");
const utilities_1 = require("@/utilities");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('locale')
        .setDescription('Set the language displayed by the bot')
        .setNameLocalizations({
        'zh-TW': '語言',
        'vi': 'ngônngữ',
        'fr': 'langue',
    })
        .setDescriptionLocalizations({
        'zh-TW': '設定機器人所顯示的語言',
        'vi': 'Thiết lập ngôn ngữ của bot',
        'fr': 'Définissez la langue affichée par le bot',
    })
        .addStringOption((option) => option
        .setName('locale')
        .setDescription('...')
        .setNameLocalizations({
        'zh-TW': '語言',
        'vi': 'ngônngữ',
        'fr': 'langue',
    })
        .setDescriptionLocalizations({
        'zh-TW': '...',
        'vi': '...',
    })
        .setRequired(true)
        .addChoices({
        name: 'English',
        value: 'en',
    }, {
        name: 'Français',
        value: 'fr',
    }, {
        name: '繁體中文',
        value: 'zh-TW',
    }, {
        name: '简体中文',
        value: 'zh-CN',
    }, {
        name: '日本語',
        value: 'jp',
    }, {
        name: '한국어',
        value: 'kr',
    }, {
        name: 'Tiếng Việt',
        value: 'vi',
    })),
    /**
     * @description 執行指令
     * @param interaction - 互動實例
     * @param _args - 參數
     */
    async execute(interaction, ..._args) {
        const locale = interaction.options.getString('locale');
        await index_1.database.set(`${interaction.user.id}.locale`, locale);
        const userLocale = await (0, utilities_1.getUserLang)(interaction.user.id);
        const newTr = (0, i18n_1.createTranslator)(userLocale || (0, i18n_1.toI18nLang)(locale));
        const selectedLanguage = locale;
        return interaction.reply({
            embeds: [new discord_js_1.EmbedBuilder().setColor((0, utilities_1.getRandomColor)()).setTitle(newTr('NewLocale', { locale: selectedLanguage }))],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
    },
};
