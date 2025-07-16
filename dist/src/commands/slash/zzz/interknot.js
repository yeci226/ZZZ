"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const utilities_1 = require("@/utilities");
const i18n_1 = require("@/utilities/core/i18n");
const interknot_1 = require("@/renderers/interknot");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('interknot')
        .setDescription('The INTER-KNOT, also known as the Proxy Network, where everyone can read and write posts.')
        .setNameLocalizations({
        'zh-TW': '繩網',
    })
        .setDescriptionLocalizations({
        'zh-TW': '繩網，也稱為代理網絡，每個人都可以閱讀和發表帖子',
    }),
    /**
     * @description 繩網
     * @param interaction - 交互實例
     * @param locale - 語言
     * @param _args - 參數
     */
    async execute(interaction, locale, ..._args) {
        const tr = (0, i18n_1.createTranslator)(locale);
        await interaction.reply({
            content: tr('interknot_Connecting'),
        });
        const userLocale = (await (0, utilities_1.getUserLang)(interaction.user.id)) || (0, i18n_1.toI18nLang)(interaction.locale) || 'en';
        (0, interknot_1.handleInterknotDraw)();
    },
};
