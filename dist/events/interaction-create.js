"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const index_1 = require("@/index");
const utilities_1 = require("@/utilities");
const i18n_1 = require("@/utilities/core/i18n");
const logger_1 = __importDefault(require("@/utilities/core/logger"));
const webhook = process.env.CMD_WEBHOOK ? new discord_js_1.WebhookClient({ url: process.env.CMD_WEBHOOK }) : null;
index_1.client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (interaction.channel?.type == discord_js_1.ChannelType.DM)
        return;
    if (!(await (0, utilities_1.getUserLang)(interaction.user.id)))
        await (0, utilities_1.setupDefaultLang)(interaction.user.id, interaction.locale);
    const userLocale = (await (0, utilities_1.getUserLang)(interaction.user.id)) || (0, i18n_1.toI18nLang)(interaction.locale) || 'en';
    if (interaction.isButton()) {
        await interaction.deferUpdate().catch(() => { });
    }
    if (interaction.isCommand()) {
        const command = index_1.commands.slash.get(interaction.commandName);
        if (!command)
            return interaction.followUp({
                content: 'An error has occured',
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
        const args = [];
        for (let option of interaction.options.data) {
            if (option.type === discord_js_1.ApplicationCommandOptionType.Subcommand) {
                if (option.name)
                    args.push(option.name);
                option.options?.forEach((x) => {
                    if (x.value)
                        args.push(x.value.toString());
                });
            }
            else if (option.value)
                args.push(option.value.toString());
        }
        try {
            await command.execute(interaction, userLocale, ...args);
            const time = `花費 ${((Date.now() - interaction.createdTimestamp) / 1000).toFixed(2)} 秒`;
            new logger_1.default('指令').command(`${interaction.user.displayName}(${interaction.user.id}) 執行 ${command.data.name} - ${time}`);
            if (webhook) {
                webhook.send({
                    embeds: [
                        new discord_js_1.EmbedBuilder()
                            .setTimestamp()
                            .setAuthor({
                            iconURL: interaction.user.displayAvatarURL({
                                size: 4096,
                            }),
                            name: `${interaction.user.username} - ${interaction.user.id}`,
                        })
                            .setThumbnail(interaction.guild?.iconURL() ?? null)
                            .setDescription(`\`\`\`${interaction.guild?.name} - ${interaction.guild?.id}\`\`\``),
                        // .addFields(command.data.name, `${interaction.getSubcommand() ? `> ${interaction.getSubcommand()}` : '\u200b'}`, true),
                    ],
                });
            }
        }
        catch (e) {
            new logger_1.default('指令').error(`錯誤訊息：${e.message}`);
            await interaction.reply({
                content: '哦喲，好像出了一點小問題，請重試',
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
        }
    }
    // else if (interaction.isContextMenuCommand()) {
    //   const command = commands.slash.get(interaction.commandName);
    //   if (!command) return;
    //   try {
    //     await command.execute(interaction, userLocale);
    //   } catch (e: any) {
    //     new Logger('指令').error(`錯誤訊息：${e.message}`);
    //     await interaction.reply({
    //       content: '哦喲，好像出了一點小問題，請重試',
    //       flags: MessageFlags.Ephemeral,
    //     });
    //   }
    // }
});
