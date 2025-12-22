import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
    Client,
    LocalizationMap
} from "discord.js";
import { createTranslator, toI18nLang } from "../../../utilities/core/i18n.js";
import { getRandomColor, getUserLang } from "../../../utilities/utilities.js";
import { QuickDB } from "quick.db";

const languages: Record<string, string> = {
    vi: "Tiếng Việt",
    cn: "简体中文",
    tw: "繁體中文",
    jp: "日本語",
    kr: "한국어",
    fr: "Français",
    default: "English",
};

export default {
    data: new SlashCommandBuilder()
        .setName("locale")
        .setDescription("Set the language displayed by the bot")
        .setNameLocalizations({
            "zh-TW": "語言",
            vi: "ngônngữ",
            fr: "langue",
        } as LocalizationMap)
        .setDescriptionLocalizations({
            "zh-TW": "設定機器人所顯示的語言",
            vi: "Thiết lập ngôn ngữ của bot",
            fr: "Définissez la langue affichée par le bot",
        } as LocalizationMap)
        .addStringOption((option) =>
            option
                .setName("locale")
                .setDescription("...")
                .setNameLocalizations({
                    "zh-TW": "語言",
                    vi: "ngônngữ",
                    fr: "langue",
                } as LocalizationMap)
                .setDescriptionLocalizations({
                    "zh-TW": "...",
                    vi: "...",
                } as LocalizationMap)
                .setRequired(true)
                .addChoices(
                    {
                        name: "English",
                        value: "en",
                    },
                    {
                        name: "Français",
                        value: "fr",
                    },
                    {
                        name: "繁體中文",
                        value: "tw",
                    },
                    {
                        name: "简体中文",
                        value: "cn",
                    },
                    {
                        name: "日本語",
                        value: "jp",
                    },
                    {
                        name: "한국어",
                        value: "kr",
                    },
                    {
                        name: "Tiếng Việt",
                        value: "vi",
                    }
                )
        ),
    async execute(client: Client, interaction: ChatInputCommandInteraction, args: any[], tr: any, db: QuickDB) {
        const locale = interaction.options.getString("locale")!;

        await db.set(`${interaction.user.id}.locale`, locale);

        const userLocale = await getUserLang(interaction.user.id);
        const newTr = createTranslator(userLocale || toI18nLang(locale) || "en");
        const selectedLanguage = languages[locale] || languages.default;

        interaction.reply({
            embeds: [
                new EmbedBuilder().setColor(getRandomColor() as any).setTitle(
                    newTr("NewLocale", {
                        locale: selectedLanguage,
                    })
                ),
            ],
            flags: MessageFlags.Ephemeral
        });
    },
};
