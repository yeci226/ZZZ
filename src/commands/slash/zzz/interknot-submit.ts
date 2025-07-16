import { ContextMenuCommandBuilder, ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';

export default {
  data: new ContextMenuCommandBuilder()
    .setName('submit')
    .setNameLocalizations({
      'zh-TW': '提交',
    })
    .setType(ApplicationCommandType.Message),

  /**
   * @description 提交
   * @param interaction - 交互實例
   * @param locale - 語言
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, locale: LanguageEnum, ..._args: string[]) {},
};
