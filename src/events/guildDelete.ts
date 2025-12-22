import { client } from "../index.js";
import { Events, WebhookClient, EmbedBuilder, ActivityType } from "discord.js";
import moment from "moment";
import { getConfig } from "../utilities/core/config.js";
const config = getConfig();
const webhook = config.JLWEBHOOK ? new WebhookClient({ url: config.JLWEBHOOK }) : null;

client.on(Events.GuildDelete, async (guild) => {
  const results = await client.cluster.broadcastEval(
    (c) => c.guilds.cache.size
  );
  const totalGuilds = results.reduce((prev, val) => prev + val, 0);

  if (webhook) {
    webhook.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#E74C3C")
          .setThumbnail(guild.iconURL() || null)
          .setTitle("已離開伺服器")
          .addFields({
            name: "名稱",
            value: `\`${guild.name}\``,
            inline: false,
          })
          .addFields({
            name: "ID",
            value: `\`${guild.id}\``,
            inline: false,
          })
          .addFields({
            name: "擁有者",
            value: `<@${guild.ownerId}>`,
            inline: false,
          })
          .addFields({
            name: "人數",
            value: `\`${guild.memberCount}\` 個成員`,
            inline: false,
          })
          .addFields({
            name: "建立時間",
            value: `<t:${moment(guild.createdAt).unix()}:F>`,
            inline: false,
          })
          .addFields({
            name: `${client.user!.username} 的伺服器數量`,
            value: `\`${totalGuilds}\` 個伺服器`,
            inline: false,
          })
          .setAuthor({
            name: client.user!.username,
            iconURL: `https://cdn.discordapp.com/avatars/${client.user!.id}/${client.user!.avatar}.png`,
          })
          .setTimestamp(),
      ],
    });
  }
});
