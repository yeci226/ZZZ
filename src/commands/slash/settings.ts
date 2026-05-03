import {
  ChatInputCommandInteraction,
  Client,
  LocalizationMap,
  MessageFlags,
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  SeparatorSpacingSize,
} from "discord.js";
import { QuickDB } from "quick.db";
import { getUserLang } from "../../utilities/utilities.js";
import { createTranslator, toI18nLang } from "../../utilities/core/i18n.js";

export const LOCALE_OPTIONS = [
  { label: "English", emoji: "🇬🇧", value: "en" },
  { label: "Français", emoji: "🇫🇷", value: "fr" },
  { label: "繁體中文", emoji: "🇹🇼", value: "tw" },
  { label: "简体中文", emoji: "🇨🇳", value: "cn" },
  { label: "日本語", emoji: "🇯🇵", value: "jp" },
  { label: "한국어", emoji: "🇰🇷", value: "kr" },
  { label: "Tiếng Việt", emoji: "🇻🇳", value: "vi" },
];

/** Build the full Component V2 settings message payload. */
export async function buildSettingsComponents(
  userId: string,
  tr: (key: string, args?: any) => string,
) {
  const db = (await import("../../index.js")).client.db;

  const painting: boolean = (await db.get(`${userId}.paintingMode`)) ?? false;
  const rankPainting: boolean =
    (await db.get(`${userId}.rankPainting`)) ?? false;
  const currentLocale: string = (await getUserLang(userId)) ?? "en";

  const localeRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("settings_selectLocale")
        .setPlaceholder(
          LOCALE_OPTIONS.find((o) => o.value === currentLocale)?.label ??
            "English",
        )
        .addOptions(
          LOCALE_OPTIONS.map((o) => ({
            label: o.label,
            emoji: o.emoji,
            value: o.value,
            default: o.value === currentLocale,
          })),
        ),
    );

  const container = new ContainerBuilder()
    // ── Header ──────────────────────────────────────────────────
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${tr("settings_Title")}`),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(tr("settings_Desc")),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true),
    )

    // ── Painting toggle ──────────────────────────────────────────
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `🎨 **${tr("settings_PaintingLabel")}**\n${tr("settings_PaintingDesc")}`,
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId("settings_togglePainting")
            .setLabel(painting ? tr("settings_On") : tr("settings_Off"))
            .setStyle(painting ? ButtonStyle.Success : ButtonStyle.Secondary),
        ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(false),
    )

    // ── Rank painting toggle ─────────────────────────────────────
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `✨ **${tr("settings_RankPaintingLabel")}**\n${tr("settings_RankPaintingDesc")}`,
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId("settings_toggleRankPainting")
            .setLabel(rankPainting ? tr("settings_On") : tr("settings_Off"))
            .setStyle(
              rankPainting ? ButtonStyle.Success : ButtonStyle.Secondary,
            ),
        ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true),
    )

    // ── Locale section ───────────────────────────────────────────
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `🌐 **${tr("settings_LocaleLabel")}**\n${tr("settings_LocaleDesc")}`,
      ),
    )
    .addActionRowComponents(localeRow);

  return { container };
}

export default {
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Manage your personal bot settings")
    .setNameLocalizations({
      "zh-TW": "設定",
      vi: "càiđặt",
      fr: "paramètres",
    } as LocalizationMap)
    .setDescriptionLocalizations({
      "zh-TW": "管理你的個人機器人設定",
      vi: "Quản lý cài đặt cá nhân của bạn",
      fr: "Gérer vos paramètres personnels",
    } as LocalizationMap),

  async execute(
    _client: Client,
    interaction: ChatInputCommandInteraction,
    _args: any[],
    tr: any,
    _db: QuickDB,
  ) {
    const { container } = await buildSettingsComponents(
      interaction.user.id,
      tr,
    );

    await interaction.reply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components: [container],
    });
  },
};
