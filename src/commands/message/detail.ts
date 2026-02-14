import { EmbedBuilder, Message, Client } from "discord.js";

function parseCookie(cookieString: string): Record<string, string> {
  const cookies = cookieString.split(";");
  const parsedCookies: Record<string, string> = {};

  cookies.forEach((cookie) => {
    const [key, value] = cookie.trim().split("=");
    parsedCookies[key] = value;
  });

  return parsedCookies;
}

export default {
  name: "detail",
  execute: async (
    client: Client,
    message: Message,
    args: string[],
    emoji: any,
  ) => {
    const db = client.db;
    const id = args[0];
    const data = await db.get(`${id}`);

    if (!data) {
      return message.reply({
        content: `沒有 ${id} 的資料！`,
      });
    }

    const user = await client.users.fetch(id);
    const daily = await db.get(`autoDaily.${id}`);
    const redeem = await db.get(`autoRedeem.${id}`);

    const accountFields = data?.account?.map((account: any) => {
      let cookieDisplay = "❌ `未綁定`";

      if (account.cookie) {
        const parsedCookie = parseCookie(account.cookie);
        cookieDisplay = `🔗 已綁定 - ltoken \`\`\`\n${parsedCookie.ltoken_v2 || "..."}\n\`\`\` ltuid \`\`\`\n${parsedCookie.ltuid_v2 || "..."}\n\`\`\` cookieToken \`\`\`\n${parsedCookie.cookie_token_v2 || "..."}\n\`\`\` accountMid \`\`\`\n${parsedCookie.account_mid_v2 || "..."}\n\`\`\``;
      }

      return {
        name: `${emoji.avatarIcon} ${account.uid} ${account.nickname ? `- ${account.nickname}` : ""}`,
        value: cookieDisplay,
        inline: true,
      };
    }) ?? [
      {
        name: "❌ `沒有帳號`",
        value: "\u200b",
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
              name: "自動簽到",
              value: `${daily ? daily?.time : "未開啟"}`,
              inline: false,
            },
            {
              name: "自動通知",
              value: `${redeem ? "已開啟" : "未開啟"}`,
              inline: false,
            },
            ...accountFields,
          ),
      ],
    });
  },
};
