import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ChatInputCommandInteraction, ColorResolvable } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';

import { database } from '@/index';

import { createTranslator, toI18nLang } from '@/utilities/core/i18n';
import { getRandomColor, getUserLang } from '@/utilities';

export default {
  data: new SlashCommandBuilder()
    .setName('locale')
    .setDescription('Set the language displayed by the bot')
    .setNameLocalizations({
      'zh-TW': '語言',
      'vi': 'ngônngữ',
      'fr': 'langue',
    })
    .setDescriptionLocalizations({
      'zh-TW': '設定機器人所顯示的語言',
      'vi': 'Thiết lập ngôn ngữ của bot',
      'fr': 'Définissez la langue affichée par le bot',
    })
    .addStringOption((option) =>
      option
        .setName('locale')
        .setDescription('...')
        .setNameLocalizations({
          'zh-TW': '語言',
          'vi': 'ngônngữ',
          'fr': 'langue',
        })
        .setDescriptionLocalizations({
          'zh-TW': '...',
          'vi': '...',
        })
        .setRequired(true)
        .addChoices(
          {
            name: 'English',
            value: 'en',
          },
          {
            name: 'Français',
            value: 'fr',
          },
          {
            name: '繁體中文',
            value: 'zh-TW',
          },
          {
            name: '简体中文',
            value: 'zh-CN',
          },
          {
            name: '日本語',
            value: 'jp',
          },
          {
            name: '한국어',
            value: 'kr',
          },
          {
            name: 'Tiếng Việt',
            value: 'vi',
          },
        ),
    ),
  /**
   * @description 執行指令
   * @param interaction - 互動實例
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, ..._args: string[]) {
    const locale: LanguageEnum = interaction.options.getString('locale') as LanguageEnum;

    await database.set(`${interaction.user.id}.locale`, locale);

    const userLocale = await getUserLang(interaction.user.id);
    const newTr = createTranslator(userLocale || toI18nLang(locale));
    const selectedLanguage = locale;

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(newTr('NewLocale', { locale: selectedLanguage }))],
      flags: MessageFlags.Ephemeral,
    });
  },
};
