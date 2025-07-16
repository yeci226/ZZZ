"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const i18n_1 = require("@/utilities/core/i18n");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('news')
        .setDescription('Get the latest news from the offical')
        .setNameLocalizations({
        'zh-TW': '新聞',
        'vi': 'tintức',
        'fr': 'journaux',
    })
        .setDescriptionLocalizations({
        'zh-TW': '從官方獲取最新消息',
        'vi': 'nhận tin tức chính thức mới nhất',
        'fr': 'Obtenez les dernières nouvelles',
    }),
    /**
     * @description 執行指令
     * @param interaction - 互動實例
     * @param locale - 語言
     * @param _args - 參數
     */
    async execute(interaction, locale, ..._args) {
        const tr = (0, i18n_1.createTranslator)(locale);
        return interaction.reply({
            components: [
                new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
                    .setPlaceholder(tr('news_SelectType'))
                    .setCustomId('news_type')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions({
                    label: tr('news_Notice'),
                    emoji: '🔔',
                    value: '1',
                }, {
                    label: tr('news_Events'),
                    emoji: '🔥',
                    value: '2',
                }, {
                    label: tr('news_Info'),
                    emoji: '🗞️',
                    value: '3',
                })),
            ],
        });
    },
};
