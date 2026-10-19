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
import { getDiscLeaderboardStore } from "../../utilities/zzz/discLeaderboardStore.js";
import { discText } from "../../utilities/zzz/discLeaderboardCopy.js";

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
  const discRankingEnabled = process.env.NODE_ENV === "test" || getDiscLeaderboardStore().enabled(userId);
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
    ? "還沒有儲存的抽卡紀錄。查看官方紀錄或匯入紀錄後，就會顯示在這裡。"
    : [`已儲存 ${archive.totalUids} 個遊戲帳號的紀錄｜第 ${archive.page + 1}/${archive.pageCount} 頁`, ...archiveRows.map((row) => {
      const sync = row.lastSyncedAt
        ? `<t:${Math.floor(new Date(row.lastSyncedAt).getTime() / 1000)}:R>`
        : "尚無更新時間";
      const purge = row.purgeAfter
        ? `；預計刪除時間 <t:${Math.floor(new Date(row.purgeAfter).getTime() / 1000)}:R>`
        : "";
      const sources = (row.sources ?? [row.source]).map((source) =>
        source === "official" ? "官方紀錄" : source === "manual" ? "遊戲連結匯入" : "rng.moe 匯入").join("＋");
      return `• UID \`${row.uid}\`｜${sources}｜${row.syncStatus === "failed" ? "更新失敗" : `最後更新：${sync}`}${purge}`;
    })].join("\n");

  const clearOptions = archiveRows.map((row) => ({ label: `UID ${row.uid} 的全部抽卡紀錄`, value: `${row.uid}:all` }));

  const container = new ContainerBuilder()
    // ── Header ──────────────────────────────────────────────────
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${tr("settings_Title")}\n${tr("settings_Desc")}`),
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
            `🔐 **允許其他使用者查看抽卡資訊**\n關閉後，其他人無法查看你的抽卡紀錄，卡池圖片也會隱藏你的抽卡資源與保底進度。`,
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId("settings_toggleGachaPublic")
            .setLabel(gachaPublic ? tr("settings_On") : tr("settings_Off"))
            .setStyle(gachaPublic ? ButtonStyle.Success : ButtonStyle.Secondary),
        ),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `🗃️ **自動同步抽卡紀錄**\n每 7 天自動更新所有已綁定帳號的官方抽卡紀錄。關閉只會停止更新，已儲存的紀錄仍會保留。\n\n**已儲存的抽卡紀錄**\n${archiveStatus}`,
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId("settings_toggleGachaWeekly")
            .setLabel(gachaWeeklyArchive ? tr("settings_On") : tr("settings_Off"))
            .setStyle(gachaWeeklyArchive ? ButtonStyle.Success : ButtonStyle.Secondary),
        ),
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
    .addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `🏆 **${discText(currentLocale, "title")}**\n${discText(currentLocale, "settings")}`,
      )).setButtonAccessory(new ButtonBuilder()
        .setCustomId(`zdisc:settings:${userId}:${discRankingEnabled ? "off" : "on"}`)
        .setLabel(discText(currentLocale, discRankingEnabled ? "joined" : "left"))
        .setStyle(discRankingEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)),
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

  if (clearOptions.length) {
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("settings_selectGachaClear")
          .setPlaceholder("刪除已儲存的抽卡紀錄（選擇帳號後需再次確認）")
          .addOptions(clearOptions),
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
    const { openGeneralSettings } = await import("../../utilities/settings/general.js");
    await openGeneralSettings(_client, interaction, _db);
  },
};
