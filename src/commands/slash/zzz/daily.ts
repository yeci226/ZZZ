import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

import { handleDailyCheckInCommand } from '@/utilities/zzz/daily';

const timeChoices = Array.from({ length: 24 }, (_, i) => ({ name: i + 1 < 10 ? `0${i + 1}` : `${i + 1}`, value: `${i + 1}` }));

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Daily check-in')
    .setNameLocalizations({
      'zh-TW': '每日簽到',
    })
    .setDescriptionLocalizations({
      'zh-TW': '領取每日簽到獎勵',
      'vi': 'Nhận phần thưởng điểm danh hằng ngày',
      'fr': 'Obtenir des récompenses de connexion quotidiennes',
    })
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('...')
        .setNameLocalizations({
          'zh-TW': '使用者',
          'vi': 'ngườidùng',
          'fr': 'utilisateur',
        })
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('autosign')
        .setDescription('Automatic check-in every day, messages will be sent wherever command used!')
        .setNameLocalizations({
          'zh-TW': '自動簽到',
          'vi': 'điểmdanhhàngngày',
          'fr': 'signéautomatique',
        })
        .setDescriptionLocalizations({
          'zh-TW': '每天自動簽到，訊息會在使用指令的地方自動發送！',
          'vi': 'Thông báo điểm danh tự động hằng ngày: không giới hạn kênh thông báo!',
          'fr': 'Signé automatique activée, des notifications seront envoyées là où cette commande a été utilisée',
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
        .setName('time')
        .setDescription('Automatic check-in time')
        .setNameLocalizations({
          'zh-TW': '簽到時間',
          'vi': 'thờigianđiểmdanh',
          'fr': 'letempsdesigné',
        })
        .setDescriptionLocalizations({
          'zh-TW': '自動簽到的時間',
          'vi': 'Thời gian tự động điểm danh',
          'fr': 'Le temps de signé automatiquement',
        })
        .setRequired(false)
        .addChoices(...timeChoices),
    )
    .addStringOption((option) =>
      option
        .setName('tag')
        .setDescription('Whether tag in the automatic check-in, turn on this also turn on the automatic check-in')
        .setNameLocalizations({
          'zh-TW': '標註',
          'vi': 'thôngbáo',
          'fr': 'mentionner',
        })
        .setDescriptionLocalizations({
          'zh-TW': '是否在自動簽到中標註，開啟這個也相當於開啟了自動簽到',
          'vi': 'Chọn Bật sẽ tự động kích hoạt chế độ điểm danh tự động nếu bạn chưa kích hoạt.',
          'fr': 'Mentionner dans le signé automatique, activer cela activera également le signé automatique',
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

  /**
   * @description 執行指令
   * @param interaction - 指令互動
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, ..._args: string[]) {
    return handleDailyCheckInCommand(interaction);
  },
};
