import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { handleShiyuDrawCommand } from '@/utilities/zzz/shiyu';

export default {
  data: new SlashCommandBuilder()
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
        .setDescription('...')
        .setNameLocalizations({
          'zh-TW': '使用者',
          'vi': 'ngườidùng',
        })
        .setDescriptionLocalizations({
          'zh-TW': '...',
          'vi': '...',
        })
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('schedule')
        .setNameLocalizations({
          'zh-TW': '時間',
          'vi': 'thờigian',
          'fr': 'temps',
        })
        .setDescription('...')
        .setRequired(false)
        .addChoices(
          {
            name: 'Live',
            name_localizations: {
              'zh-TW': '本期',
              'vi': 'kỳhiện tại',
              'fr': 'période actuelle',
            },
            value: '1',
          },
          {
            name: 'End',
            name_localizations: {
              'zh-TW': '上期',
              'vi': 'kỳtrước',
              'fr': 'période précédente',
            },
            value: '2',
          },
        ),
    ),

  /**
   * @description 執行指令
   * @param interaction - 交互實例
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, ..._args: string[]) {
    return handleShiyuDrawCommand(interaction);
  },
};
