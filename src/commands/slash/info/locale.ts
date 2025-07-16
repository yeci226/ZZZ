import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ChatInputCommandInteraction } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';
import { database } from '@/index';

import { getRandomColor, getUserLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

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
          { name: 'English', value: LanguageEnum.ENGLISH },
          { name: 'Français', value: LanguageEnum.FRENCH },
          { name: '繁體中文', value: LanguageEnum.TRADIIONAL_CHINESE },
          { name: '简体中文', value: LanguageEnum.SIMPLIFIED_CHINESE },
          { name: '日本語', value: LanguageEnum.JAPANESE },
          { name: '한국어', value: LanguageEnum.KOREAN },
          { name: 'Tiếng Việt', value: LanguageEnum.VIETNAMESE },
        ),
    ),
  /**
   * @description 執行指令
   * @param interaction - 互動實例
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, ..._args: string[]) {
    const interactionUser = interaction.user;
    const interactionOptions = interaction.options;

    const selectedLocale: LanguageEnum = interactionOptions.getString('locale') as LanguageEnum;
    const userLocale = await getUserLang(interactionUser.id);
    const newTr = createTranslator(selectedLocale || userLocale);

    await database.set(`${interactionUser.id}.locale`, selectedLocale);

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(newTr('NewLocale', { locale: selectedLocale }))],
      flags: MessageFlags.Ephemeral,
    });
  },
};
