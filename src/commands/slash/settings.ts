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
import { createTranslator } from "../../utilities/core/i18n.js";
import {
  normalizeZzzProfileStyle,
  type ZzzProfileStyle,
} from "../../utilities/zzz/profileStyle.js";
import { getGachaArchiveStore } from "../../utilities/zzz/gachaArchive.js";
import type { GachaArchiveAccount } from "../../utilities/zzz/gachaArchive.js";

const ARCHIVE_UIDS_PER_PAGE = 8;

export function paginateArchiveAccounts(
  rows: GachaArchiveAccount[],
  requestedPage = 0,
) {
  const uids = [...new Set(rows.map((row) => row.uid))];
  const pageCount = Math.max(1, Math.ceil(uids.length / ARCHIVE_UIDS_PER_PAGE));
  const page = Math.max(0, Math.min(Math.trunc(requestedPage), pageCount - 1));
  const pageUids = new Set(
    uids.slice(page * ARCHIVE_UIDS_PER_PAGE, (page + 1) * ARCHIVE_UIDS_PER_PAGE),
  );
  return {
    page,
    pageCount,
    totalUids: uids.length,
    rows: rows.filter((row) => pageUids.has(row.uid)),
  };
}

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
  dbOverride?: Pick<QuickDB, "get">,
  archivePage = 0,
  archiveRowsOverride?: GachaArchiveAccount[],
) {
  const db = dbOverride ?? (await import("../../index.js")).client.db;

  const painting: boolean = (await db.get(`${userId}.paintingMode`)) ?? false;
  const rankPainting: boolean =
    (await db.get(`${userId}.rankPainting`)) ?? false;
  const profileStyle: ZzzProfileStyle = normalizeZzzProfileStyle(
    await db.get(`${userId}.profileStyle`),
  );
  const currentLocale: string = String(
    (await db.get(`${userId}.locale`)) ?? "en",
  );
  const gachaPublic = (await db.get(`${userId}.gachaPublic`)) !== false;
  const gachaWeeklyArchive = (await db.get(`${userId}.gachaWeeklyArchive`)) === true;
  const allArchiveRows = archiveRowsOverride ?? (process.env.NODE_ENV === "test"
    ? []
    : getGachaArchiveStore().listAccounts(userId));
  const archive = paginateArchiveAccounts(allArchiveRows, archivePage);
  const archiveRows = archive.rows;

  const profileStyleOptions = [
    {
      label: tr("settings_ProfileStyleFormal"),
      description: tr("settings_ProfileStyleFormalDesc"),
      value: "formal",
      default: profileStyle === "formal",
    },
    {
      label: tr("settings_ProfileStyleCurrent"),
      description: tr("settings_ProfileStyleCurrentDesc"),
      value: "current",
      default: profileStyle === "current",
    },
  ];

  const profileStyleRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("settings_selectProfileStyle")
        .setPlaceholder(
          profileStyle === "formal"
            ? tr("settings_ProfileStyleFormal")
            : tr("settings_ProfileStyleCurrent"),
        )
        .addOptions(profileStyleOptions),
    );

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

  const archiveStatus = allArchiveRows.length === 0
    ? "尚未建立調頻封存。第一次成功查看官方紀錄後會自動啟用每週封存。"
    : [`共 ${archive.totalUids} 個 UID、${allArchiveRows.length} 個來源｜第 ${archive.page + 1}/${archive.pageCount} 頁`, ...archiveRows.map((row) => {
      const source = row.source === "official" ? "官方封存" : "手動匯入";
      const sync = row.lastSyncedAt
        ? `<t:${Math.floor(new Date(row.lastSyncedAt).getTime() / 1000)}:R>`
        : "尚未同步";
      const purge = row.purgeAfter
        ? `；待刪除 <t:${Math.floor(new Date(row.purgeAfter).getTime() / 1000)}:R>`
        : "";
      return `• UID \`${row.uid}\`｜${source}｜${row.syncStatus === "failed" ? "同步失敗" : sync}${purge}`;
    })].join("\n");

  const clearOptions = archiveRows.flatMap((row) => [
    { label: `${row.uid}－${row.source === "official" ? "官方封存" : "手動匯入"}`, value: `${row.uid}:${row.source}` },
  ]);
  const allUidOptions = [...new Set(archiveRows.map((row) => row.uid))]
    .slice(0, Math.max(0, 25 - clearOptions.length))
    .map((uid) => ({ label: `${uid}－全部紀錄`, value: `${uid}:all` }));

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

    // ── Gacha privacy and archive ───────────────────────────────
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `🔐 **允許其他使用者查看抽卡資訊**\n關閉後，卡池會隱藏資源與保底，調頻封存則拒絕他人查看。`,
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId("settings_toggleGachaPublic")
            .setLabel(gachaPublic ? tr("settings_On") : tr("settings_Off"))
            .setStyle(gachaPublic ? ButtonStyle.Success : ButtonStyle.Secondary),
        ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `🗃️ **官方每週封存**\n套用目前及之後綁定的全部 ZZZ 帳號；關閉不會刪除既有紀錄。`,
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId("settings_toggleGachaWeekly")
            .setLabel(gachaWeeklyArchive ? tr("settings_On") : tr("settings_Off"))
            .setStyle(gachaWeeklyArchive ? ButtonStyle.Success : ButtonStyle.Secondary),
        ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**封存狀態**\n${archiveStatus}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    )

    // ── Profile style select ─────────────────────────────────────
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${tr("settings_ProfileStyleLabel")}**\n${tr("settings_ProfileStyleDesc")}`,
      ),
    )
    .addActionRowComponents(profileStyleRow)
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(false),
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

  if (clearOptions.length || allUidOptions.length) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("🗑️ **清除調頻紀錄**\n選擇後仍須再次確認；刪除完成後無法復原。"),
    ).addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("settings_selectGachaClear")
          .setPlaceholder("選擇要清除的 UID 與來源")
          .addOptions([...clearOptions, ...allUidOptions]),
      ),
    );
  }

  if (archive.pageCount > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`settings_gachaArchivePage:${archive.page - 1}`)
          .setLabel("上一頁")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(archive.page === 0),
        new ButtonBuilder()
          .setCustomId(`settings_gachaArchivePage:${archive.page + 1}`)
          .setLabel("下一頁")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(archive.page >= archive.pageCount - 1),
      ),
    );
  }

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
