import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

import { discordToHoyolabLang, failedReply, getUserLang, setupDefaultLang } from '@/utilities';
import { handleHowToGetGachaLogCommand, handleGachaDrawCommand } from '@/utilities/zzz/gacha';
import { createTranslator } from '@/utilities/core/i18n';

export default {
  data: new SlashCommandBuilder()
    .setName('signal')
    .setDescription('...')
    .setNameLocalizations({
      'zh-TW': '調頻',
    })
    .setDescriptionLocalizations({
      'zh-TW': '...',
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName('log')
        .setDescription('Currently only supports the PC side, if you find other ways you can use it')
        .setNameLocalizations({
          'zh-TW': '紀錄',
        })
        .setDescriptionLocalizations({
          'zh-TW': '目前僅支持電腦端，若您有發現可以的其他方式也可以使用',
        })
        .addStringOption((option) =>
          option
            .setName('options')
            .setDescription('...')
            .setNameLocalizations({
              'zh-TW': '選項',
            })
            .setDescriptionLocalizations({
              'zh-TW': '...',
            })
            .setRequired(true)
            .addChoices(
              {
                name: 'How to get url',
                name_localizations: {
                  'zh-TW': '如何取得調頻紀錄連結',
                },
                value: 'how',
              },
              {
                name: 'Signal records',
                name_localizations: {
                  'zh-TW': '查詢調頻紀錄',
                },
                value: 'query',
              },
            ),
        ),
    ),

  /**
   * @description 調頻
   * @param interaction - 交互實例
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, ..._args: string[]) {
    const interactionUser = interaction.user;
    const interactionLocale = interaction.locale;

    const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
    const tr = createTranslator(userLocale);

    const subcommand = interaction.options.getSubcommand();
    const selectedOption = interaction.options.getString('options');

    switch (subcommand) {
      case 'log':
        switch (selectedOption) {
          case 'how':
            return handleHowToGetGachaLogCommand(interaction);
          case 'query':
            return handleGachaDrawCommand(interaction);
          default:
            return failedReply(interaction, tr('gacha_InvalidSubcommand'), tr('gacha_InvalidSubcommandDesc'));
        }
      default:
        return failedReply(interaction, tr('gacha_InvalidSubcommand'), tr('gacha_InvalidSubcommandDesc'));
    }
  },
};
