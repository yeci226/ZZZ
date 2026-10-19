import { commandTipContent } from "../../../utilities/core/commandTips.js";
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, Client, EmbedBuilder, LocalizationMap,
  SlashCommandBuilder,
} from "discord.js";
import { QuickDB } from "quick.db";
import { getUserLang } from "../../../utilities/utilities.js";
import { getLegacyAccounts, getLegacyAccountAtIndex, type LegacyAccount } from "../../../utilities/accountStore.js";
import { createZzzClient, getZzzClientLanguage } from "../../../utilities/zzz/clientFactory.js";
import { requestZzzRecordApi } from "../../../utilities/zzz/officialRecordApi.js";
import { renderOfficialBanner } from "../../../utilities/zzz/bannerRenderer.js";
import { canViewPrivateGacha } from "../../../utilities/zzz/gachaPrivacy.js";
import { calendarBannerMetadata } from "../../../utilities/zzz/gachaSync.js";
import { cacheSimulationCalendar } from "../../../utilities/zzz/gachaSimulationCatalog.js";
import { bannerRegionLabel, cachePublicBannerCalendar, getPublicBannerCalendar } from "../../../utilities/zzz/bannerCalendarCache.js";

export default {
  ephemeral: false,
  data: new SlashCommandBuilder().setName("banner")
    .setDescription("View current and upcoming ZZZ channels")
    .setNameLocalizations({ "zh-TW": "卡池" } as LocalizationMap)
    .setDescriptionLocalizations({ "zh-TW": "查看目前及即將開放的代理人與音擎卡池" } as LocalizationMap)
    .addStringOption((option) => option.setName("account").setDescription("Account")
      .setNameLocalizations({ "zh-TW": "帳號" } as LocalizationMap).setAutocomplete(true))
    .addUserOption((option) => option.setName("user").setDescription("User")
      .setNameLocalizations({ "zh-TW": "使用者" } as LocalizationMap)),

  async execute(_client: Client, interaction: ChatInputCommandInteraction, _args: any[], _tr: any, db: QuickDB) {
    const target = interaction.options.getUser("user") || interaction.user;
    const accountIndex = Number.parseInt(interaction.options.getString("account") || "0", 10);
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
    try {
      const locale = (await getUserLang(interaction.user.id)) || "tw";
      const lang = getZzzClientLanguage(locale);
      const viewerAccounts = await getLegacyAccounts(db, interaction.user.id);
      const linked = (account: LegacyAccount | null | undefined): account is LegacyAccount =>
        !!account?.uid && !!account.cookie && account.invalid !== true;
      // Anonymous viewers only use the public snapshot, even when a user option is supplied.
      let account: LegacyAccount | null | undefined;
      if (viewerAccounts.some(linked)) {
        account = target.id === interaction.user.id
          ? viewerAccounts[accountIndex]
          : await getLegacyAccountAtIndex(db, target.id, accountIndex);
      }
      let zzz;
      let calendar: any;
      if (linked(account)) {
        try {
          zzz = createZzzClient({ cookie: account.cookie, uid: Number(account.uid), lang });
          calendar = await requestZzzRecordApi(zzz, "gacha_calendar");
        } catch {
          // Expired logins and temporary API failures can still use public calendar data.
        }
      }

      let showPrivate = false;
      let details: any;
      let content: string | undefined;
      let uid: string | undefined;
      if (calendar && zzz) {
        uid = String(zzz.uid);
        try {
          await cachePublicBannerCalendar(db, calendar, { region: String(zzz.region), lang });
        } catch (error) { console.error("[banner] Public calendar cache refresh failed", error); }
        try { cacheSimulationCalendar(calendarBannerMetadata(calendar)); } catch (error) { console.error("[gacha-simulate] Calendar cache refresh failed", error); }
        showPrivate = await canViewPrivateGacha(db, interaction.user.id, target.id);
        if (showPrivate) {
          try { details = await requestZzzRecordApi(zzz, "cur_gacha_detail"); } catch { details = undefined; }
        }
      } else {
        const cached = await getPublicBannerCalendar(db, { lang, region: zzz ? String(zzz.region) : undefined });
        if (!cached) {
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor("#FFE9D0")
            .setTitle("卡池資訊尚未更新")
            .setDescription("目前沒有可用的公開卡池資訊。已登入的使用者成功查詢一次 /卡池 後，未登入的使用者也能查看。")], components: [] });
          return;
        }
        calendar = cached.calendar;
        content = `卡池資訊（${bannerRegionLabel(cached.region)}伺服器）・更新於 <t:${Math.floor(cached.updatedAt / 1000)}:R>`;
      }

      const image = await renderOfficialBanner({ uid, locale, calendar, details, showPrivate });
      const rows = uid ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`signal-open:${interaction.user.id}:${target.id}:${accountIndex}:official`)
          .setLabel("查看調頻紀錄").setStyle(ButtonStyle.Secondary),
      )] : [];
      await interaction.editReply({
        content: commandTipContent(interaction, "banner", locale, content),
        files: [new AttachmentBuilder(image, { name: uid ? `zzz-banner-${uid}.png` : "zzz-banner.png" })],
        components: rows,
      });
    } catch (error: any) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor("#E76161")
        .setTitle("無法取得卡池資料").setDescription(`\`${String(error?.message || error)}\``)] });
    }
  },
};
