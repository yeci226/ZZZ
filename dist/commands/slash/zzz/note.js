"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const discord_js_1 = require("discord.js");
const utilities_1 = require("@/utilities");
const i18n_1 = require("@/utilities/core/i18n");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('note')
        .setDescription('View current energy')
        .setNameLocalizations({
        'zh-TW': '即時便箋',
        'vi': 'ghichúnhanh',
        'fr': 'note',
    })
        .setDescriptionLocalizations({
        'zh-TW': '查看當前電量',
        'vi': 'Kiểm tra điện lượng hiện tại',
        'fr': 'Afficher les charges de batterie actuelles',
    })
        .addSubcommand((subcommand) => subcommand
        .setName('check')
        .setDescription('...')
        .setNameLocalizations({
        'zh-TW': '查看',
        'vi': 'kiểmtra',
        'fr': 'vérifier',
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
        'fr': 'utilisateur',
    })
        .setRequired(false))),
    /**
     * @description 執行指令
     * @param interaction - 交互實例
     * @param locale - 語言
     * @param _args - 參數
     */
    async execute(interaction, locale, ..._args) {
        const tr = (0, i18n_1.createTranslator)(locale);
        const subCommand = interaction.options.getSubcommand();
        switch (subCommand) {
            case 'check':
                return handleCheck(interaction, locale);
            default:
                return interaction.reply({
                    embeds: [new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(tr('note_InvalidSubcommand'))],
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
        }
    },
};
const handleCheck = async (interaction, locale) => {
    const tr = (0, i18n_1.createTranslator)(locale);
    const interactionUser = interaction.user;
    const selectedUser = interaction.options.getUser('user') || interactionUser;
    const selectedAccountIndex = parseInt(interaction.options.getString('account') ?? '0');
    const zzz = await (0, utilities_1.getUserZZZData)(interaction, locale, selectedUser.id, selectedAccountIndex);
    if (zzz == null)
        return interaction.reply({
            embeds: [new discord_js_1.EmbedBuilder().setColor('#E76161').setTitle(tr('AccountNotFound')).setDescription(tr('AccountNotFoundDesc'))],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
    try {
        const res = await zzz.record.note();
        const embed = new discord_js_1.EmbedBuilder()
            .setColor((0, utilities_1.getStaminaColor)(res.energy.current))
            .setThumbnail(selectedUser.displayAvatarURL({ size: 4096 }))
            .setAuthor({
            name: tr('note_Title') + ' - ' + zzz.uid,
        })
            .addFields({
            name: tr('note_Energy'),
            value: res.energy.current != res.energy.max ? res.energy.current + '/' + res.energy.max + ` - <t:${(0, moment_timezone_1.default)(new Date()).unix() + res.energy.restore}:R>` : tr('note_Energy_Full'),
            inline: false,
        }, {
            name: '◉ ' + tr('note_Vitality'),
            value: res.vitality.current + '/' + res.vitality.max,
            inline: false,
        }, {
            name: '◉ ' + tr('note_Card'),
            // @ts-ignore
            value: res.card_sign == 'CardSignDone' ? tr('note_Card_Done') : tr('note_Card_NotDone'),
            inline: false,
        }, {
            name: '◉ ' + tr('note_VHS'),
            // @ts-ignore
            value: res.vhs_sale.sale_state == 'SaleStateDoing' ? tr('note_VHS_Doing') : tr('note_VHS_NotDoing'),
            inline: false,
        });
        if (res.energy.current + 20 >= res.energy.max && res.energy.current != res.energy.max)
            embed.setTitle(tr('note_EnergyFull'));
        return interaction.reply({
            embeds: [embed],
        });
    }
    catch (e) {
        interaction.reply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setTitle(tr('note_Error'))
                    .setColor('#E76161')
                    .setImage('https://media.discordapp.net/attachments/1149960935654559835/1258313139078955039/image.png')
                    .setDescription(tr('note_Error_Description') + '\n\n' + `\`${e.message}\``),
            ],
        });
    }
};
