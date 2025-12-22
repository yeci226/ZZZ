import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
    LocalizationMap,
    Client,
    ChatInputApplicationCommandData
} from "discord.js";
import {
    getRandomColor,
    getUserZZZData,
} from "../../../utilities/utilities.js";
import { QuickDB } from "quick.db";

const timeChoices = Array.from({ length: 24 }, (_, i) => ({
    name: i + 1 < 10 ? `0${i + 1}` : `${i + 1}`,
    value: `${i + 1}`,
}));

export default {
    data: new SlashCommandBuilder()
        .setName("daily")
        .setDescription("Daily check-in")
        .setNameLocalizations({
            "zh-TW": "每日簽到",
        } as LocalizationMap)
        .setDescriptionLocalizations({
            "zh-TW": "領取每日簽到獎勵",
            vi: "Nhận phần thưởng điểm danh hằng ngày",
            fr: "Obtenez des récompenses de connexion quotidiennes",
        } as LocalizationMap)
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("...")
                .setNameLocalizations({
                    "zh-TW": "使用者",
                    vi: "ngườidùng",
                    fr: "utilisateur",
                } as LocalizationMap)
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("autosign")
                .setDescription(
                    "Automatic check-in every day, messages will be sent wherever command used!"
                )
                .setNameLocalizations({
                    "zh-TW": "自動簽到",
                    vi: "điểmdanhhàngngày",
                    fr: "signéautomatique",
                } as LocalizationMap)
                .setDescriptionLocalizations({
                    "zh-TW": "每天自動簽到，訊息會在使用指令的地方自動發送！",
                    vi: "Thông báo điểm danh tự động hằng ngày: không giới hạn kênh thông báo!",
                    fr: "Signé automatique activée, des notifications seront envoyées là où cette commande a été utilisée",
                } as LocalizationMap)
                .setRequired(false)
                .addChoices(
                    {
                        name: "On",
                        name_localizations: {
                            "zh-TW": "開啟",
                            vi: "Bật",
                            fr: "Activée",
                        },
                        value: "on",
                    },
                    {
                        name: "Off",
                        name_localizations: {
                            "zh-TW": "關閉",
                            vi: "Tắt",
                            fr: "Désactivé",
                        },
                        value: "off",
                    }
                )
        )
        .addStringOption((option) =>
            option
                .setName("time")
                .setDescription("Automatic check-in time")
                .setNameLocalizations({
                    "zh-TW": "簽到時間",
                    vi: "thờigianđiểmdanh",
                    fr: "letempsdesigné",
                } as LocalizationMap)
                .setDescriptionLocalizations({
                    "zh-TW": "自動簽到的時間",
                    vi: "Thời gian tự động điểm danh",
                    fr: "Le temps de signé automatiquement",
                } as LocalizationMap)
                .setRequired(false)
                .addChoices(...timeChoices)
        )
        .addStringOption((option) =>
            option
                .setName("tag")
                .setDescription(
                    "Whether tag in the automatic check-in, turn on this also turn on the automatic check-in"
                )
                .setNameLocalizations({
                    "zh-TW": "標註",
                    vi: "thôngbáo",
                    fr: "mentionner",
                } as LocalizationMap)
                .setDescriptionLocalizations({
                    "zh-TW": "是否在自動簽到中標註，開啟這個也相當於開啟了自動簽到",
                    vi: "Chọn Bật sẽ tự động kích hoạt chế độ điểm danh tự động nếu bạn chưa kích hoạt.",
                    fr: "Mentionner dans le signé automatique, activer cela activera également le signé automatique",
                } as LocalizationMap)
                .setRequired(false)
                .addChoices(
                    {
                        name: "On",
                        name_localizations: {
                            "zh-TW": "開啟",
                            vi: "Bật",
                            fr: "Activée",
                        },
                        value: "true",
                    },
                    {
                        name: "Off",
                        name_localizations: {
                            "zh-TW": "關閉",
                            vi: "Tắt",
                            fr: "Désactivé",
                        },
                        value: "false",
                    }
                )
        ),

    async execute(client: Client, interaction: ChatInputCommandInteraction, args: any[], tr: any, db: QuickDB, emoji: any) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const haveAccount = await db.get(`${interaction.user.id}.account`);
        if (!haveAccount) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setConfig("#E76161", "sob")
                        .setTitle(tr("daily_NonAccount"))
                        .setDescription(tr("daily_NonAccountDesc")),
                ],
            });
        }

        const user = interaction.options.getUser("user") ?? interaction.user;
        const auto = interaction.options.getString("autosign");
        const time = interaction.options.getString("time");
        const tag = interaction.options.getString("tag");

        if (auto === "off") {
            await db.delete(`autoDaily.${interaction.user.id}`);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(tr("autoDaily_Off"))
                        .setConfig("#E76161", "smirk"),
                ],
            });
        } else if (time || tag || auto === "on") {
            await db.set(`autoDaily.${interaction.user.id}`, {
                channelId: interaction.channelId,
                time: time || "12",
                tag: tag || false,
            });

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setConfig("#A2CDB0", "smirk")
                        .setTitle(tr("autoDaily_On"))
                        .setDescription(
                            tr("autoDaily_Time", {
                                time: time ? "`" + time + ":00`" : "`12:00`",
                            }) +
                            "\n" +
                            tr("autoDaily_Tag", {
                                z:
                                    tag === "true"
                                        ? "`" + tr("True") + "`"
                                        : "`" + tr("False") + "`",
                            })
                        ),
                ],
            });
        }

        const zzz = await getUserZZZData(interaction, tr, user.id);
        if (!zzz) return;

        const info = await zzz.daily.info();
        const reward = await zzz.daily.reward();
        const rewards = await zzz.daily.rewards();
        const todaySign =
            rewards.awards[info.total_sign_day - 1] || rewards.awards[0];
        const tmrSign = rewards.awards[info.total_sign_day];
        const res = await zzz.daily.claim();

        if (res.code === -5003 || res.info.is_sign)
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setConfig("#E76161", "sob")
                        .setTitle(`${tr("daily_Failed")} ${tr("daily_Signed")}`),
                ],
            });

        interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(getRandomColor() as any)
                    .setTitle(tr("daily_SignSuccess"))
                    .setThumbnail(todaySign?.icon)
                    .setDescription(
                        `${tr("daily_Description", { a: `\`${todaySign?.name}x${todaySign?.cnt}\`` })}${info.month_last_day ? "" : `\n\n${tr("daily_DescriptionTmr", { b: `\`${tmrSign?.name}x${tmrSign?.cnt}\`` })}`}`
                    )
                    .addFields(
                        {
                            name: `${reward.month} ${tr("daily_Month")}`,
                            value: "\u200b",
                            inline: true,
                        },
                        {
                            name: tr("daily_SignedDay", {
                                z: "`" + info.total_sign_day + "`",
                            }),
                            value: "\u200b",
                            inline: true,
                        },
                        {
                            name: tr("daily_MissedDay", {
                                z: "`" + info.sign_cnt_missed + "`",
                            }),
                            value: "\u200b",
                            inline: true,
                        }
                    ),
            ],
        });
    },
};
