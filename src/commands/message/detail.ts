import { EmbedBuilder, Message, EmbedField } from 'discord.js';
import { client, database } from '@/index';

import { parseCookie } from '@/utilities';

import { type Account } from '@/types';

import emoji from '@/assets/emoji';

export default {
  name: 'detail',
  description: '查看使用者資料',
  usage: '<id>',
  aliases: ['d'],
  category: 'info',
  cooldown: 5,
  args: true,
  guildOnly: true,

  /**
   * @description 執行指令
   * @param message - 訊息
   * @param _args - 參數
   */
  execute: async (message: Message, ..._args: string[]) => {
    const id = _args[0];
    const data = await database.get(`${id}`);

    if (!data) {
      return message.reply({ content: `沒有 ${id} 的資料！` });
    }

    const user = await client.users.fetch(id);
    const daily = await database.get(`autoDaily.${id}`);
    const redeem = await database.get(`autoRedeem.${id}`);

    const accountFields = data?.account?.map((account: Account): EmbedField => {
      let cookieDisplay = '❌ `未綁定`';

      if (account.cookie) {
        const parsedCookie = parseCookie(account.cookie);
        cookieDisplay = `🔗 已綁定 - ltoken \`\`\`\n${parsedCookie.ltoken_v2 || '...'}\n\`\`\` ltuid \`\`\`\n${parsedCookie.ltuid_v2 || '...'}\n\`\`\` cookieToken \`\`\`\n${parsedCookie.cookie_token_v2 || '...'}\n\`\`\` accountMid \`\`\`\n${parsedCookie.account_mid_v2 || '...'}\n\`\`\``;
      }

      return {
        name: `${emoji.avatarIcon} ${account.uid} ${account.nickname ? `- ${account.nickname}` : ''}`,
        value: cookieDisplay,
        inline: true,
      };
    }) ?? [
      {
        name: '❌ `沒有帳號`',
        value: '\u200b',
        inline: true,
      },
    ];

    message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(user.username)
          .setThumbnail(user.displayAvatarURL())
          .addFields(
            {
              name: '自動簽到',
              value: `${daily ? daily?.time : '未開啟'}`,
              inline: false,
            },
            {
              name: '自動通知',
              value: `${redeem ? '已開啟' : '未開啟'}`,
              inline: false,
            },
            ...accountFields,
          ),
      ],
    });
  },
};
