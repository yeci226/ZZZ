import {
    ChatInputCommandInteraction,
    Client,
    LocalizationMap,
    SlashCommandBuilder,
} from "discord.js";
import { handleDeadlyDraw } from "../../../utilities/zzz/deadly.js";
import { getUserZZZData, getUserLang } from "../../../utilities/utilities.js";
import { QuickDB } from "quick.db";
import { getZzzHistoryEntry, parseHistorySchedule } from "../../../utilities/zzz/recordCache.js";

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
                .setDescription("Select a period")
                .setDescriptionLocalizations({
                    "zh-TW": "選擇危局期數",
                    "zh-CN": "选择危局期数",
                    vi: "Chọn kỳ",
                    fr: "Choisir une période",
                } as LocalizationMap)
                .setRequired(false)
                .setAutocomplete(true)
        ),
    async execute(_client: Client, interaction: ChatInputCommandInteraction, _args: any[], tr: any, db: QuickDB, emoji: any) {
        const accountIndex = parseInt(interaction.options.getString("account") || "0");
        const targetUser = interaction.options.getUser("user") || interaction.user;
        const scheduleValue = interaction.options.getString("schedule") || "1";
        const userLocale = (await getUserLang(interaction.user.id)) || "en";

        if (parseHistorySchedule(scheduleValue)) {
            const cached = await getZzzHistoryEntry(
                db,
                "deadly",
                targetUser.id,
                accountIndex,
                scheduleValue,
            );
            if (!cached) {
                await interaction.reply({
                    content: tr("NonData") || "找不到已儲存的危局紀錄。",
                    ephemeral: true,
                });
                return;
            }
            await interaction.deferReply();
            await handleDeadlyDraw(
                interaction,
                tr,
                { uid: `cached-${targetUser.id}`, lang: userLocale },
                cached.schedule,
                {
                    ownerId: interaction.user.id,
                    targetUserId: targetUser.id,
                    accountIndex,
                    schedule: cached.schedule,
                    dataOverride: cached.data,
                    db,
                    locale: userLocale,
                } as any,
                "normal",
            );
            return;
        }

        const schedule = Number(scheduleValue) === 2 ? 2 : 1;
        const zzz = await getUserZZZData(
            interaction,
            tr,
            targetUser.id,
            userLocale,
            accountIndex,
        );
        if (zzz == null) return;

        await interaction.deferReply();
        await handleDeadlyDraw(
            interaction,
            tr,
            zzz,
            schedule,
            {
                ownerId: interaction.user.id,
                targetUserId: targetUser.id,
                accountIndex,
                schedule,
                db,
                locale: userLocale,
            } as any,
            "normal",
        );
    },
};
