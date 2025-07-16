import { ContextMenuCommandBuilder, ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';

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
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, ..._args: string[]) {},
};
