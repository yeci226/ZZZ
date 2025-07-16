import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

import { handleInterknotDrawCommand } from '@/utilities/zzz/interknot';

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
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, ..._args: string[]) {
    return handleInterknotDrawCommand(interaction);
  },
};
