import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { handleProfileDrawCommand } from '@/utilities/zzz/profile';

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Query a player's profile")
    .setNameLocalizations({
      'zh-TW': '個人簡介',
      'vi': 'hồsơngườichơi',
      'fr': 'profils',
    })
    .setDescriptionLocalizations({
      'zh-TW': '查詢玩家的個人簡介',
      'vi': 'Truy vấn hồ sơ người chơi',
      'fr': 'Voir le vos info',
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
          'fr': 'utilisateur',
        })
        .setRequired(false),
    ),

  /**
   * @description 執行指令
   * @param interaction - 交互實例
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, ..._args: string[]) {
    return handleProfileDrawCommand(interaction);
  },
};
