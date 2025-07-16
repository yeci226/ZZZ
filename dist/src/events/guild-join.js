"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const moment_1 = __importDefault(require("moment"));
const index_1 = require("@/index");
const webhook = process.env.JL_WEBHOOK ? new discord_js_1.WebhookClient({ url: process.env.JL_WEBHOOK }) : null;
index_1.client.on(discord_js_1.Events.GuildCreate, async (guild) => {
    const results = await index_1.cluster.broadcastEval((client) => client.guilds.cache.size);
    const totalGuilds = results.reduce((prev, val) => prev + val, 0);
    if (webhook) {
        webhook.send({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(guild.memberCount > 100 ? '#FFFF80' : '#57F287')
                    .setThumbnail(guild.iconURL())
                    .setTitle('新的伺服器出現了')
                    .addFields({
                    name: '名稱',
                    value: `\`${guild.name}\``,
                    inline: false,
                })
                    .addFields({
                    name: 'ID',
                    value: `\`${guild.id}\``,
                    inline: false,
                })
                    .addFields({
                    name: '擁有者',
                    value: `<@${guild.ownerId}>`,
                    inline: false,
                })
                    .addFields({
                    name: '人數',
                    value: `\`${guild.memberCount}\` 個成員`,
                    inline: false,
                })
                    .addFields({
                    name: '建立時間',
                    value: `<t:${(0, moment_1.default)(guild.createdAt).unix()}:F>`,
                    inline: false,
                })
                    .addFields({
                    name: `${index_1.client.user?.username ?? 'Unknown'} 的伺服器數量`,
                    value: `\`${totalGuilds}\` 個伺服器`,
                    inline: false,
                })
                    .setTimestamp(),
            ],
        });
    }
});
