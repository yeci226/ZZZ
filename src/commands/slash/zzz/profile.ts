import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';

import { getUserZZZData } from '@/utilities';
import { handleProfileDraw } from '@/renderers/profile';
import { createTranslator } from '@/utilities/core/i18n';

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
   * @param locale - 語言
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, locale: LanguageEnum, ..._args: string[]) {
    await interaction.deferReply();
    const tr = createTranslator(locale);

    const interactionUser = interaction.user;
    const selectedUser = interaction.options.getUser('user') || interactionUser;
    const selectedAccountIndex = parseInt(interaction.options.getString('account') ?? '0');

    const zzz = await getUserZZZData(interaction, locale, selectedUser.id, selectedAccountIndex);
    if (zzz == null)
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('AccountNotFound')).setDescription(tr('AccountNotFoundDesc'))],
      });

    return handleProfileDraw();
  },
};
