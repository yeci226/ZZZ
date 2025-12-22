import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    Client,
    LocalizationMap
} from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("news")
        .setDescription("Get the latest news from the offical")
        .setNameLocalizations({
            "zh-TW": "新聞",
            vi: "tintức",
            fr: "journaux",
        } as LocalizationMap)
        .setDescriptionLocalizations({
            "zh-TW": "從官方獲取最新消息",
            vi: "nhận tin tức chính thức mới nhất",
            fr: "Obtenez les dernières nouvelles",
        } as LocalizationMap),
    async execute(client: Client, interaction: ChatInputCommandInteraction, args: any[], tr: any) {
        interaction.reply({
            components: [
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setPlaceholder(tr("news_SelectType"))
                        .setCustomId("news_type")
                        .setMinValues(1)
                        .setMaxValues(1)
                        .addOptions(
                            {
                                label: tr("news_Notice"),
                                emoji: "🔔",
                                value: "1",
                            },
                            {
                                label: tr("news_Events"),
                                emoji: "🔥",
                                value: "2",
                            },
                            {
                                label: tr("news_Info"),
                                emoji: "🗞️",
                                value: "3",
                            }
                        )
                ),
            ],
        });
    },
};
