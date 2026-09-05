import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, Client, EmbedBuilder, LocalizationMap,
  SlashCommandBuilder,
} from "discord.js";
import { QuickDB } from "quick.db";
import { getUserLang, getUserZZZData } from "../../../utilities/utilities.js";
import { requestZzzRecordApi } from "../../../utilities/zzz/officialRecordApi.js";
import { renderOfficialBanner } from "../../../utilities/zzz/bannerRenderer.js";
import { canViewPrivateGacha } from "../../../utilities/zzz/gachaPrivacy.js";

export default {
  data: new SlashCommandBuilder().setName("banner")
    .setDescription("View current and upcoming ZZZ channels")
    .setNameLocalizations({ "zh-TW": "卡池" } as LocalizationMap)
    .setDescriptionLocalizations({ "zh-TW": "查看目前及即將開放的代理人與音擎卡池" } as LocalizationMap)
    .addStringOption((option) => option.setName("account").setDescription("Account")
      .setNameLocalizations({ "zh-TW": "帳號" } as LocalizationMap).setAutocomplete(true))
    .addUserOption((option) => option.setName("user").setDescription("User")
      .setNameLocalizations({ "zh-TW": "使用者" } as LocalizationMap)),

  async execute(_client: Client, interaction: ChatInputCommandInteraction, _args: any[], tr: any, db: QuickDB) {
    const target = interaction.options.getUser("user") || interaction.user;
    const accountIndex = Number.parseInt(interaction.options.getString("account") || "0", 10);
    const locale = (await getUserLang(interaction.user.id)) || "tw";
    const zzz = await getUserZZZData(interaction, tr, target.id, locale, accountIndex);
    if (!zzz) return;
    await interaction.deferReply();
    try {
      const showPrivate = await canViewPrivateGacha(db, interaction.user.id, target.id);
      const calendar = await requestZzzRecordApi(zzz, "gacha_calendar");
      let details: any;
      if (showPrivate) {
        try { details = await requestZzzRecordApi(zzz, "cur_gacha_detail"); } catch { details = undefined; }
      }
      const image = await renderOfficialBanner({ uid: String(zzz.uid), locale, calendar, details, showPrivate });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`signal-open:${interaction.user.id}:${target.id}:${accountIndex}:official`)
          .setLabel("查看調頻紀錄").setStyle(ButtonStyle.Secondary),
      );
      await interaction.editReply({
        files: [new AttachmentBuilder(image, { name: `zzz-banner-${zzz.uid}.png` })],
        components: [row],
      });
    } catch (error: any) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor("#E76161")
        .setTitle("無法取得卡池資料").setDescription(`\`${String(error?.message || error)}\``)] });
    }
  },
};
