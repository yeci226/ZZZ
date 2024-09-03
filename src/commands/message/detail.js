import { Client, Message, EmbedBuilder } from "discord.js";

export default {
  name: "detail",
  /**
   *
   * @param {Client} client
   * @param {Message} message
   * @param {String[]} args
   */
  execute: async (client, message, args, emoji) => {
    const db = client.db;
    const id = args[0];
    const data = await db.get(`${id}`);

    if (!data)
      return message.reply({
        content: `沒有 ${id} 的資料！`,
      });

    const user = await client.users.fetch(id);
    const daily = await db.get(`autoDaily.${id}`);
    const redeem = await db.get(`autoRedeem.${id}`);

    message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(user.username)
          .setThumbnail(user.displayAvatarURL())
          .addField("自動簽到", `${daily ? daily?.time : "未開啟"}`, false)
          .addField("自動通知", `${redeem ? "已開啟" : "未開啟"}`, false)
          .addFields(
            ...(data?.account?.map((account) => ({
              name: `${emoji.avatarIcon} ${account.uid} ${account.nickname ? `- ${account.nickname}` : ""}`,
              value: `${account.cookie ? `🔗 \`已綁定\` \n\`\`\`${account.cookie}\n\`\`\`` : "❌ `未綁定`"}`,
              inline: true,
            })) ?? [
              {
                name: "❌ `沒有帳號`",
                value: "\u200b",
                inline: true,
              },
            ])
          ),
      ],
    });
  },
};
