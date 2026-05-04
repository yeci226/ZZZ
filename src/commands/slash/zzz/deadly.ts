import { ActionRowBuilder, ChatInputCommandInteraction, Client, LocalizationMap, SlashCommandBuilder } from "discord.js";
import { handleDeadlyDraw } from "../../../utilities/zzz/deadly.js";
import { getUserZZZData, getUserLang } from "../../../utilities/utilities.js";
import { QuickDB } from "quick.db";

export default {
    data: new SlashCommandBuilder()
        .setName("deadlyassault")
        .setNameLocalizations({
            "zh-TW": "危局強襲戰",
            vi: "tấncôngsiêuphẩm",
            fr: "assautmortel",
        } as LocalizationMap)
        .setDescription("Show user's Deadly Assault data")
        .setDescriptionLocalizations({
            "zh-TW": "顯示使用者的危局強襲戰資料",
            vi: "Hiển thị dữ liệu tấn công siêu phẩm của người dùng",
            fr: "Afficher les données de l'assaut mortel de l'utilisateur",
        } as LocalizationMap)
        .addStringOption((option) =>
            option
                .setName("account")
                .setDescription("...")
                .setNameLocalizations({
                    "zh-TW": "帳號",
                    vi: "tàikhoản",
                    fr: "compte",
                } as LocalizationMap)
                .setRequired(false)
                .setAutocomplete(true)
        )
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("...")
                .setNameLocalizations({
                    "zh-TW": "使用者",
                    vi: "ngườidùng",
                } as LocalizationMap)
                .setDescriptionLocalizations({
                    "zh-TW": "...",
                    vi: "...",
                } as LocalizationMap)
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("schedule")
                .setNameLocalizations({
                    "zh-TW": "時間",
                    vi: "thờigian",
                    fr: "temps",
                } as LocalizationMap)
                .setDescription("...")
                .setRequired(false)
                .addChoices(
                    {
                        name: "Live",
                        name_localizations: {
                            "zh-TW": "本期",
                            vi: "kỳhiện tại",
                            fr: "période actuelle",
                        } as LocalizationMap,
                        value: "1",
                    },
                    {
                        name: "End",
                        name_localizations: {
                            "zh-TW": "上期",
                            vi: "kỳtrước",
                            fr: "période précédente",
                        } as LocalizationMap,
                        value: "2",
                    }
                )
        ),
    async execute(_client: Client, interaction: ChatInputCommandInteraction, _args: any[], tr: any, db: QuickDB, emoji: any) {
        const accountIndex = parseInt(interaction.options.getString("account") || "0");
        const targetUser = interaction.options.getUser("user") || interaction.user;
        const schedule = parseInt(interaction.options.getString("schedule") || "1");

        const zzz = await getUserZZZData(
            interaction,
            tr,
            targetUser.id,
            await getUserLang(interaction.user.id),
            accountIndex
        );
        if (zzz == null) return;

        await interaction.deferReply();
        handleDeadlyDraw(interaction, tr, targetUser, zzz, schedule);
    },
};
