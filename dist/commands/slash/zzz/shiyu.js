"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const utilities_1 = require("@/utilities");
const i18n_1 = require("@/utilities/core/i18n");
const shiyu_1 = require("@/renderers/shiyu");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('shiyudefense')
        .setNameLocalizations({
        'zh-TW': '式輿防衛戰',
        'vi': 'phongthushiyu',
        'fr': 'defenseshiyu',
    })
        .setDescription("Show user's Shiyu Defense data")
        .setDescriptionLocalizations({
        'zh-TW': '顯示使用者的式輿防衛戰資料',
        'vi': 'Hiển thị dữ liệu phòng thủ Shiyu của người dùng',
        'fr': "Afficher les données de défense de Shiyu de l'utilisateur",
    })
        .addStringOption((option) => option
        .setName('account')
        .setDescription('...')
        .setNameLocalizations({
        'zh-TW': '帳號',
        'vi': 'tàikhoản',
        'fr': 'compte',
    })
        .setRequired(false)
        .setAutocomplete(true))
        .addUserOption((option) => option
        .setName('user')
        .setDescription('...')
        .setNameLocalizations({
        'zh-TW': '使用者',
        'vi': 'ngườidùng',
    })
        .setDescriptionLocalizations({
        'zh-TW': '...',
        'vi': '...',
    })
        .setRequired(false))
        .addStringOption((option) => option
        .setName('schedule')
        .setNameLocalizations({
        'zh-TW': '時間',
        'vi': 'thờigian',
        'fr': 'temps',
    })
        .setDescription('...')
        .setRequired(false)
        .addChoices({
        name: 'Live',
        name_localizations: {
            'zh-TW': '本期',
            'vi': 'kỳhiện tại',
            'fr': 'période actuelle',
        },
        value: '1',
    }, {
        name: 'End',
        name_localizations: {
            'zh-TW': '上期',
            'vi': 'kỳtrước',
            'fr': 'période précédente',
        },
        value: '2',
    })),
    /**
     * @description 執行指令
     * @param interaction - 交互實例
     * @param locale - 語言
     * @param _args - 參數
     */
    async execute(interaction, locale, ..._args) {
        await interaction.deferReply();
        const tr = (0, i18n_1.createTranslator)(locale);
        const interactionUser = interaction.user;
        const selectedUser = interaction.options.getUser('user') || interactionUser;
        const selectedAccountIndex = parseInt(interaction.options.getString('account') ?? '0');
        const selectedSchedule = parseInt(interaction.options.getString('schedule') ?? '1');
        const zzz = await (0, utilities_1.getUserZZZData)(interaction, locale, selectedUser.id, selectedAccountIndex);
        if (zzz == null)
            return interaction.reply({
                embeds: [new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(tr('AccountNotFound')).setDescription(tr('AccountNotFoundDesc'))],
            });
        return (0, shiyu_1.handleShiyuDraw)();
    },
};
