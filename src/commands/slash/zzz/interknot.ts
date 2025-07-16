import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';

import { getUserLang } from '@/utilities';
import { createTranslator, toI18nLang } from '@/utilities/core/i18n';
import { handleInterknotDraw } from '@/renderers/interknot';

export default {
  data: new SlashCommandBuilder()
    .setName('interknot')
    .setDescription('The INTER-KNOT, also known as the Proxy Network, where everyone can read and write posts.')
    .setNameLocalizations({
      'zh-TW': '繩網',
    })
    .setDescriptionLocalizations({
      'zh-TW': '繩網，也稱為代理網絡，每個人都可以閱讀和發表帖子',
    }),

  /**
   * @description 繩網
   * @param interaction - 交互實例
   * @param locale - 語言
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, locale: LanguageEnum, ..._args: string[]) {
    const tr = createTranslator(locale);

    await interaction.reply({
      content: tr('interknot_Connecting'),
    });

    const userLocale = (await getUserLang(interaction.user.id)) || toI18nLang(interaction.locale) || 'en';

    handleInterknotDraw();
  },
};
