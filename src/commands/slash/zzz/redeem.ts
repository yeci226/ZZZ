import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';

import { failedReply, discordToHoyolabLang, setupDefaultLang, getUserLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';
import { handleAutoRedeemCommand, handleRedeemAllCommand, handleRedeemCommand, handleRedeemListCommand } from '@/utilities/zzz/redeem';

export default {
  data: new SlashCommandBuilder()
    .setName('codes')
    .setDescription('Redeem codes for rewards')
    .setNameLocalizations({
      'zh-TW': '兌換碼',
      'vi': 'mãcode',
      'fr': 'codes',
    })
    .setDescriptionLocalizations({
      'zh-TW': '兌換代碼獲取獎勵',
      'vi': 'Đổi mã nhận thưởng',
      'fr': 'Échanger les codes pour les récompenses',
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Check available codes')
        .setNameLocalizations({
          'zh-TW': '列表',
          'vi': 'danhsách',
          'fr': 'liste',
        })
        .setDescriptionLocalizations({
          'zh-TW': '查看當前可用兌換碼',
          'vi': 'Kiểm tra các mã đổi thưởng hiện có',
          'fr': 'Voir les codes de racheté disponibles',
        })
        .addStringOption((option) =>
          option
            .setName('account')
            .setDescription('...')
            .setNameLocalizations({
              'zh-TW': '帳號',
              'vi': 'tàikhoản',
              'fr': 'compte',
            })
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('redeem')
        .setDescription('...')
        .setNameLocalizations({
          'zh-TW': '兌換',
          'vi': 'đổithưởng',
          'fr': 'racheté',
        })
        .addStringOption((option) =>
          option
            .setName('code')
            .setDescription('Enter the code to redeem')
            .setNameLocalizations({
              'zh-TW': '禮包碼',
              'vi': 'mãđổithưởng',
              'fr': 'code',
            })
            .setDescriptionLocalizations({
              'zh-TW': '在這裡輸入要兌換的禮包碼',
              'vi': 'Nhập mã code bạn muốn đổi thưởng tại đây',
              'fr': 'Entrer le code',
            })
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('account')
            .setDescription('...')
            .setNameLocalizations({
              'zh-TW': '帳號',
              'vi': 'tàikhoản',
              'fr': 'compte',
            })
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Help other user redeem code')
            .setNameLocalizations({
              'zh-TW': '使用者',
              'vi': 'ngườidùng',
              'fr': 'utilisateur',
            })
            .setDescriptionLocalizations({
              'zh-TW': '幫其他使用者兌換代碼',
              'vi': 'Đổi mã đổi thưởng cho người dùng khác',
              'fr': "Échange contre d'autres utilisateurs",
            })
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('redeemall')
        .setDescription('...')
        .setNameLocalizations({
          'zh-TW': '兌換全部',
        })
        .setDescriptionLocalizations({
          'zh-TW': '...',
        })
        .addStringOption((option) =>
          option
            .setName('account')
            .setDescription('...')
            .setNameLocalizations({
              'zh-TW': '帳號',
              'vi': 'tàikhoản',
              'fr': 'compte',
            })
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Help other user redeem code')
            .setNameLocalizations({
              'zh-TW': '使用者',
              'vi': 'ngườidùng',
              'fr': 'utilisateur',
            })
            .setDescriptionLocalizations({
              'zh-TW': '幫其他使用者兌換代碼',
              'vi': 'Đổi mã đổi thưởng cho người dùng khác',
              'fr': "Échange contre d'autres utilisateurs",
            })
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('autoredeem')
        .setDescription('Automatic when theres available codes, messages will be sent wherever command used!')
        .setNameLocalizations({
          'zh-TW': '自動兌換',
          'vi': 'tựđộngđổithưởng',
          'fr': 'rachetéautomatique',
        })
        .setDescriptionLocalizations({
          'zh-TW': '自動兌換代碼，訊息會在使用指令的地方自動發送！',
          'vi': 'Bot sẽ trả lời tự động ngay dưới câu hỏi!',
          'fr': 'Racheté automatique activée, des notifications seront envoyées là où cette commande a été utilisée',
        })
        .addStringOption((option) =>
          option
            .setName('enable')
            .setDescription('...')
            .setNameLocalizations({
              'zh-TW': '開啟',
              'vi': 'bật',
              'fr': 'activée',
            })
            .setRequired(true)
            .addChoices(
              {
                name: 'On',
                name_localizations: {
                  'zh-TW': '開啟',
                  'vi': 'Bật',
                  'fr': 'Activée',
                },
                value: 'on',
              },
              {
                name: 'Off',
                name_localizations: {
                  'zh-TW': '關閉',
                  'vi': 'Tắt',
                  'fr': 'Désactivé',
                },
                value: 'off',
              },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('tag')
            .setDescription('Whether mark in the automatic redeem, turn on this also turn on the automatic redeem')
            .setNameLocalizations({
              'zh-TW': '標註',
              'vi': 'thôngbáo',
              'fr': 'mentionner',
            })
            .setDescriptionLocalizations({
              'zh-TW': '是否在自動兌換中標註，開啟這個也相當於開啟了自動兌換',
              'vi': 'Chọn Bật sẽ tự động kích hoạt chế độ nhận code tự động nếu bạn chưa kích hoạt.',
              'fr': 'Mentionner dans le racheté automatique, activer cela activera également le racheté automatique',
            })
            .setRequired(false)
            .addChoices(
              {
                name: 'On',
                name_localizations: {
                  'zh-TW': '開啟',
                  'vi': 'Bật',
                  'fr': 'Activée',
                },
                value: 'true',
              },
              {
                name: 'Off',
                name_localizations: {
                  'zh-TW': '關閉',
                  'vi': 'Tắt',
                  'fr': 'Désactivé',
                },
                value: 'false',
              },
            ),
        ),
    ),

  /**
   * @description 執行指令
   * @param interaction - 交互實例
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, ..._args: string[]) {
    const interactionUser = interaction.user;
    const interactionLocale = interaction.locale;

    const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
    const tr = createTranslator(userLocale);

    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'list':
        return handleRedeemListCommand(interaction);
      case 'redeem':
        return handleRedeemCommand(interaction);
      case 'redeemall':
        return handleRedeemAllCommand(interaction);
      case 'autoredeem':
        return handleAutoRedeemCommand(interaction);
      default:
        return failedReply(interaction, tr('redeem_InvalidSubcommand'), tr('redeem_InvalidSubcommandDesc'));
    }
  },
};
