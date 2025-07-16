"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const utilities_1 = require("@/utilities");
const i18n_1 = require("@/utilities/core/i18n");
const deadly_1 = require("@/renderers/deadly");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('deadlyassault')
        .setNameLocalizations({
        'zh-TW': '危局強襲戰',
        'vi': 'tấncôngsiêuphẩm',
        'fr': 'assautmortel',
    })
        .setDescription("Show user's Deadly Assault data")
        .setDescriptionLocalizations({
        'zh-TW': '顯示使用者的危局強襲戰資料',
        'vi': 'Hiển thị dữ liệu tấn công siêu phẩm của người dùng',
        'fr': "Afficher les données de l'assaut mortel de l'utilisateur",
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
     * @description 危局強襲戰
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
        if (zzz == null) {
            return interaction.editReply({
                embeds: [new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(tr('AccountNotFound')).setDescription(tr('AccountNotFoundDesc'))],
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
        }
        return (0, deadly_1.handleDeadlyDraw)();
    },
};
