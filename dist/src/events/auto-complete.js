"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const index_1 = require("@/index");
index_1.client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isAutocomplete())
        return;
    const focusedOption = interaction.options.getFocused(true);
    const { name: optionName } = focusedOption;
    if (optionName == 'account') {
        const userAccounts = await index_1.database.get(`${interaction.user.id}.account`);
        if (!userAccounts)
            return;
        const choices = [];
        for (const account of userAccounts) {
            choices.push({
                name: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ''}`,
                value: `${userAccounts.indexOf(account)}`,
            });
        }
        await interaction.respond(choices);
    }
});
