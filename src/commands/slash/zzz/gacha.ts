import {
    CommandInteraction,
    SlashCommandBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ModalBuilder,
    EmbedBuilder,
    TextInputBuilder,
    MessageFlags,
    LocalizationMap,
    Client,
    ChatInputCommandInteraction,
} from "discord.js";
import { getRandomColor } from "../../../utilities/utilities.js";
import { QuickDB } from "quick.db";

export default {
    data: new SlashCommandBuilder()
        .setName("signal")
        .setDescription("...")
        .setNameLocalizations({
            "zh-TW": "調頻",
        } as LocalizationMap)
        .setDescriptionLocalizations({
            "zh-TW": "...",
        } as LocalizationMap)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("log")
                .setDescription(
                    "Currently only supports the PC side, if you find other ways you can use it"
                )
                .setNameLocalizations({
                    "zh-TW": "紀錄",
                } as LocalizationMap)
                .setDescriptionLocalizations({
                    "zh-TW": "目前僅支持電腦端，若您有發現可以的其他方式也可以使用",
                } as LocalizationMap)
                .addStringOption((option) =>
                    option
                        .setName("options")
                        .setDescription("...")
                        .setNameLocalizations({
                            "zh-TW": "選項",
                        } as LocalizationMap)
                        .setDescriptionLocalizations({
                            "zh-TW": "...",
                        } as LocalizationMap)
                        .setRequired(true)
                        .addChoices(
                            {
                                name: "How to get url",
                                name_localizations: {
                                    "zh-TW": "如何取得調頻紀錄連結",
                                },
                                value: "how",
                            },
                            {
                                name: "Signal records",
                                name_localizations: {
                                    "zh-TW": "查詢調頻紀錄",
                                },
                                value: "query",
                            }
                        )
                )
        ),
    async execute(_client: Client, interaction: ChatInputCommandInteraction, _args: any[], tr: any, db: QuickDB, emoji: any) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand == "log") {
            const type = interaction.options.getString("options");
            if (type == "how") {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getRandomColor() as any)
                            .setTitle(tr("gacha_HowToGet"))
                            .setDescription(
                                tr("gacha_HowToGetDesc", {
                                    z: `\`\`\`powershell\nStart-Process powershell -Verb runAs -ArgumentList '-NoExit -Command "Invoke-Expression  (New-Object Net.WebClient).DownloadString(\\"https://raw.githubusercontent.com/yeci226/ZZZ-ToS-PP/main/getSignal.ps1\\")"'\n\`\`\``,
                                })
                            ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }
            if (type == "query") {
                await interaction.showModal(
                    new ModalBuilder()
                        .setCustomId("signal_log")
                        .setTitle(tr("gacha_LogTitle"))
                        .addComponents(
                            new ActionRowBuilder<TextInputBuilder>().addComponents(
                                new TextInputBuilder()
                                    .setCustomId("signalUrl")
                                    .setLabel(tr("gacha_LogDesc"))
                                    .setPlaceholder("URL")
                                    .setStyle(TextInputStyle.Paragraph)
                                    .setRequired(true)
                                    .setMinLength(50)
                                    .setMaxLength(4000)
                            )
                        )
                );
            }
        }
    },
};
