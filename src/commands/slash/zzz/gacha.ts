import { SlashCommandBuilder, TextInputStyle, ActionRowBuilder, ModalBuilder, EmbedBuilder, TextInputBuilder, MessageFlags, ChatInputCommandInteraction, ColorResolvable } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';

import { getRandomColor } from '@/utilities';
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
   * @param locale - 語言
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, locale: LanguageEnum, ..._args: string[]) {
    await interaction.deferReply();

    const tr = createTranslator(locale);

    const subcommand = interaction.options.getSubcommand();
    const selectedOption = interaction.options.getString('options');

    switch (subcommand) {
      case 'log':
        switch (selectedOption) {
          case 'how':
            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(getRandomColor() as ColorResolvable)
                  .setTitle(tr('gacha_HowToGet'))
                  .setDescription(
                    tr('gacha_HowToGetDesc', {
                      z: `\`\`\`powershell\nStart-Process powershell -Verb runAs -ArgumentList '-NoExit -Command "Invoke-Expression  (New-Object Net.WebClient).DownloadString(\\"https://raw.githubusercontent.com/yeci226/ZZZ-ToS-PP/main/getSignal.ps1\\")"'\n\`\`\``,
                    }),
                  ),
              ],
              flags: MessageFlags.Ephemeral,
            });

          case 'query':
            return interaction.showModal(
              new ModalBuilder()
                .setCustomId('signal_log')
                .setTitle(tr('gacha_LogTitle'))
                .addComponents(
                  new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                      .setCustomId('signalUrl')
                      .setLabel(tr('gacha_LogDesc'))
                      .setPlaceholder('URL')
                      .setStyle(TextInputStyle.Paragraph)
                      .setRequired(true)
                      .setMinLength(50)
                      .setMaxLength(4000),
                  ),
                ),
            );
          default:
            return interaction.reply({
              embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('gacha_InvalidSubcommand')).setDescription(tr('gacha_InvalidSubcommandDesc'))],
            });
        }
      default:
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('gacha_InvalidSubcommand')).setDescription(tr('gacha_InvalidSubcommandDesc'))],
        });
    }
  },
};
