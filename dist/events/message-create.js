"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const index_js_1 = require("@/index.js");
const userIds = ['283946584461410305', '878830839822176287'];
index_js_1.client.on(discord_js_1.Events.MessageCreate, async (message) => {
    const prefix = `<@${index_js_1.client.user?.id}>`;
    if (message.author.bot || !message.guild || !message.content.toLowerCase().startsWith(prefix) || !userIds.includes(message.author.id))
        return;
    const [cmd, ...args] = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = index_js_1.commands.message.get(cmd.toLowerCase()) || index_js_1.commands.message.find((c) => c.aliases?.includes(cmd.toLowerCase()));
    if (command)
        await command.execute(message, ...args);
});
