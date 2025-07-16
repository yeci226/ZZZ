import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChatInputCommandInteraction } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';

import { createTranslator } from '@/utilities/core/i18n';

export default {
  data: new SlashCommandBuilder()
    .setName('news')
    .setDescription('Get the latest news from the offical')
    .setNameLocalizations({
      'zh-TW': '新聞',
      'vi': 'tintức',
      'fr': 'journaux',
    })
    .setDescriptionLocalizations({
      'zh-TW': '從官方獲取最新消息',
      'vi': 'nhận tin tức chính thức mới nhất',
      'fr': 'Obtenez les dernières nouvelles',
    }),

  /**
   * @description 執行指令
   * @param interaction - 互動實例
   * @param locale - 語言
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, locale: LanguageEnum, ..._args: string[]) {
    const tr = createTranslator(locale);

    return interaction.reply({
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(tr('news_SelectType'))
            .setCustomId('news_type')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions({ label: tr('news_Notice'), emoji: '🔔', value: '1' }, { label: tr('news_Events'), emoji: '🔥', value: '2' }, { label: tr('news_Info'), emoji: '🗞️', value: '3' }),
        ),
      ],
    });
  },
};
