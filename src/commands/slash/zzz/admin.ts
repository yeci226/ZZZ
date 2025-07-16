import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

import { discordToHoyolabLang, failedReply, getUserLang, setupDefaultLang } from '@/utilities';
import { handleRemoveFeatureNotifyCommand, handleMoveFeatureNotifyCommand } from '@/utilities/zzz/admin';
import { createTranslator } from '@/utilities/core/i18n';

export default {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Server administrator settings')
    .setNameLocalizations({
      'zh-TW': '管理員',
      'vi': 'quảntrịviên',
      'fr': 'administrateur',
    })
    .setDescriptionLocalizations({
      'zh-TW': '伺服器管理員的設定',
      'vi': 'Cài đặt admin máy chủ',
      'fr': "Paramètre de l'administrateur",
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription("Remove notifications from a user's messages in a channel")
        .setNameLocalizations({
          'zh-TW': '刪除',
          'vi': 'tuỳchọn',
          'fr': 'supprimer',
        })
        .setDescriptionLocalizations({
          'zh-TW': '刪除使用者在頻道中的訊息通知',
          'vi': 'Xoá thông báo tin nhắn của người dùng (Ping) khỏi kênh',
          'fr': 'Désactiver la notification des utilisateurs dans ce canal',
        })
        .addStringOption((option) =>
          option
            .setName('feature')
            .setDescription('Select the features you want to remove user from')
            .setNameLocalizations({
              'zh-TW': '功能',
              'vi': 'chứcnăng',
              'fr': 'fonctionnalité',
            })
            .setDescriptionLocalizations({
              'zh-TW': '選擇要刪除使用者的功能',
              'vi': 'Tuỳ chọn xoá chức năng người dùng',
              'fr': 'Sélectionnez la fonction à supprimer',
            })
            .setRequired(true)
            .addChoices(
              {
                name: 'autodaily',
                name_localizations: {
                  'zh-TW': '自動簽到',
                  'vi': 'Điểm danh tự động',
                  'fr': 'Signé automatique',
                },
                value: 'autoDaily',
              },
              {
                name: 'autoredeem',
                name_localizations: {
                  'zh-TW': '自動兌換',
                  'vi': 'Đổi code tự động',
                  'fr': 'Racheté automatique',
                },
                value: 'autoRedeem',
              },
            ),
        )
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Select user to remove')
            .setNameLocalizations({
              'zh-TW': '使用者',
              'vi': 'ngườidùng',
              'fr': 'utilisateur',
            })
            .setDescriptionLocalizations({
              'zh-TW': '選擇要刪除的使用者',
              'vi': 'Tuỳ chọn xoá người dùng',
              'fr': "Sélectionnez l'utilisateur à supprimer",
            })
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('userid')
            .setDescription('Enter the user ID you want to delete')
            .setNameLocalizations({
              'zh-TW': '使用者id',
              'vi': 'idngườidùng',
              'fr': 'iddelutilisateur',
            })
            .setDescriptionLocalizations({
              'zh-TW': '輸入要刪除的使用者ID',
              'vi': 'Nhập ID người dùng bạn muốn xoá',
              'fr': "Entrez l'ID de l'utilisateur à supprimer",
            })
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('move')
        .setDescription('Change the channel for message notifications')
        .setNameLocalizations({
          'zh-TW': '移動',
          'vi': 'dichuyển',
          'fr': 'transfert',
        })
        .setDescriptionLocalizations({
          'zh-TW': '更改訊息通知的頻道',
          'vi': 'Đổi kênh nhận thông báo tin nhắn',
          'fr': 'Modifier le canal pour les notifications de message',
        })
        .addStringOption((option) =>
          option
            .setName('feature')
            .setDescription('Select features to move')
            .setNameLocalizations({
              'zh-TW': '功能',
              'vi': 'chứcnăng',
              'fr': 'fonction',
            })
            .setDescriptionLocalizations({
              'zh-TW': '選擇移動的功能',
              'vi': 'Tuỳ chọn chức năng di chuyển',
              'fr': 'Sélectionnez la fonction de transfert',
            })
            .setRequired(true)
            .addChoices(
              {
                name: 'all',
                name_localizations: {
                  'zh-TW': '全部',
                  'vi': 'Tất cả',
                  'fr': 'Tout',
                },
                value: 'all',
              },
              {
                name: 'autodaily',
                name_localizations: {
                  'zh-TW': '自動簽到',
                  'vi': 'Điểm danh tự động',
                  'fr': 'Signé automatique',
                },
                value: 'autoDaily',
              },
              {
                name: 'autoredeem',
                name_localizations: {
                  'zh-TW': '自動兌換',
                  'vi': 'Đổi code tự động',
                  'fr': 'Racheté automatique',
                },
                value: 'autoRedeem',
              },
            ),
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Select channel to remove')
            .setNameLocalizations({
              'zh-TW': '頻道',
              'vi': 'kênh',
              'fr': 'canal',
            })
            .setDescriptionLocalizations({
              'zh-TW': '選擇要移動至哪個頻道',
              'vi': 'Chọn kênh sẽ chuyển đến',
              'fr': 'Choisissez le canal à déplacer',
            })
            .setRequired(true),
        ),
    ),

  /**
   * @description 執行指令
   * @param interaction - 互動實例
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, ..._args: string[]) {
    const interactionUser = interaction.user;
    const interactionLocale = interaction.locale;

    const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
    const tr = createTranslator(userLocale);

    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'remove':
        return handleRemoveFeatureNotifyCommand(interaction);
      case 'move':
        return handleMoveFeatureNotifyCommand(interaction);
      default:
        return failedReply(interaction, tr('admin_InvalidSubcommand'), tr('admin_InvalidSubcommandDesc'));
    }
  },
};
