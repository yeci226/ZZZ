import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

import { discordToHoyolabLang, failedReply, getUserLang, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';
import { handleNoteCheckCommand } from '@/utilities/zzz/note';

export default {
  data: new SlashCommandBuilder()
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
    .addSubcommand((subcommand) =>
      subcommand
        .setName('check')
        .setDescription('...')
        .setNameLocalizations({
          'zh-TW': '查看',
          'vi': 'kiểmtra',
          'fr': 'vérifier',
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

    const subCommand = interaction.options.getSubcommand();
    switch (subCommand) {
      case 'check':
        return handleNoteCheckCommand(interaction);
      default:
        return failedReply(interaction, tr('note_InvalidSubcommand'), tr('note_InvalidSubcommandDesc'));
    }
  },
};
