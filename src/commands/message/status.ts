import ms from 'ms';
import { EmbedBuilder, Message, Guild } from 'discord.js';
import { cluster } from '@/index';

export default {
  name: 'status',
  description: '查看分片狀態',
  args: false,
  guildOnly: true,
  aliases: ['status'],

  /**
   * @description 執行指令
   * @param message - 訊息
   * @param _args - 參數
   */
  execute: async (message: Message, ..._args: string[]) => {
    const res = await cluster.broadcastEval((client) => {
      return {
        clusterId: cluster.id,
        shardIds: [...cluster.ids.keys()],
        totalGuilds: client.guilds.cache.size,
        totalMembers: client.guilds.cache.map((g) => g.memberCount).reduce((a, b) => a + b, 0),
        ping: client.ws.ping,
        uptime: client.uptime,
        memoryUsage: Object.fromEntries(
          Object.entries(process.memoryUsage()).map((d) => {
            d[1] = Math.floor((d[1] / 1024 / 1024) * 100) / 100;
            return d;
          }),
        ),
        allGuildsData: client.guilds.cache.map((guild) => {
          return {
            id: guild.id,
            name: guild.name,
            ownerId: guild.ownerId,
            memberCount: guild.memberCount,
            channels: guild.channels.cache.map((c) => {
              return { id: c.id, name: c.name };
            }),
          };
        }),
        perShardData: [...cluster.ids.keys()].map((shardId) => {
          return {
            shardId: shardId,
            ping: client.ws.shards.get(shardId)?.ping,
            uptime: 1145141919,
            guilds: client.guilds.cache.filter((g: Guild) => g.shardId === shardId).size,
            members: client.guilds.cache
              .filter((g: Guild) => g.shardId === shardId)
              .map((g: Guild) => g.memberCount)
              .reduce((a: number, b: number) => a + b, 0),
          };
        }),
      };
    });

    const shardDataArr = [...res.flatMap((x) => x.perShardData)].sort((a, b) => a.shardId - b.shardId);

    const embed = new EmbedBuilder().setTitle('分片狀態');
    for (const shardData of shardDataArr) {
      embed.addFields({
        name: `#${shardData.shardId}`,
        value: `延遲: ${shardData.ping} 毫秒\n上線時間: ${ms(shardData.uptime)}\n伺服器: ${shardData.guilds} 個伺服器\n使用者: ${shardData.members} 個使用者`,
        inline: true,
      });
    }

    message.reply({
      embeds: [embed],
    });
  },
};
