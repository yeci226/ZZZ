import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  LocalizationMap,
  SlashCommandBuilder,
} from "discord.js";
import { QuickDB } from "quick.db";
import { getUserLang, getUserZZZData } from "../../../utilities/utilities.js";
import { loadOfficialNoteData } from "../../../utilities/zzz/officialRecordApi.js";
import { renderOfficialNote } from "../../../utilities/zzz/noteRenderer.js";
import { getLegacyAccountAtIndex } from "../../../utilities/accountStore.js";

export default {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("View official-style real-time notes and events")
    .setNameLocalizations({ "zh-TW": "即時便箋", "zh-CN": "实时便笺", ja: "リアルタイムノート", ko: "실시간메모", fr: "notes", vi: "ghichú" } as LocalizationMap)
    .setDescriptionLocalizations({ "zh-TW": "查看官方樣式的即時便箋與活動日曆", "zh-CN": "查看官方样式的实时便笺与活动日历", ja: "公式スタイルのノートとイベントを表示", ko: "공식 스타일 메모와 이벤트 보기", fr: "Afficher les notes et événements officiels", vi: "Xem ghi chú và sự kiện chính thức" } as LocalizationMap)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("check")
        .setDescription("View real-time notes")
        .setNameLocalizations({ "zh-TW": "查看", "zh-CN": "查看", ja: "表示", ko: "보기", fr: "voir", vi: "xem" } as LocalizationMap)
        .setDescriptionLocalizations({ "zh-TW": "查看即時便箋與全部活動", "zh-CN": "查看实时便笺与全部活动", ja: "ノートと全イベントを表示", ko: "메모와 모든 이벤트 보기", fr: "Afficher les notes et tous les événements", vi: "Xem ghi chú và mọi sự kiện" } as LocalizationMap)
        .addStringOption((option) =>
          option.setName("account").setDescription("Account")
            .setNameLocalizations({ "zh-TW": "帳號", "zh-CN": "账号", ja: "アカウント", ko: "계정", fr: "compte", vi: "tàikhoản" } as LocalizationMap)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option.setName("user").setDescription("User")
            .setNameLocalizations({ "zh-TW": "使用者", "zh-CN": "用户", ja: "ユーザー", ko: "사용자", fr: "utilisateur", vi: "ngườidùng" } as LocalizationMap),
        ),
    ),

  async execute(
    _client: Client,
    interaction: ChatInputCommandInteraction,
    _args: any[],
    tr: any,
    _db: QuickDB,
  ) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const accountIndex = Number.parseInt(interaction.options.getString("account") || "0", 10);
    const locale = (await getUserLang(interaction.user.id)) || "tw";
    const zzz = await getUserZZZData(interaction, tr, targetUser.id, locale, accountIndex);
    if (!zzz) return;

    await interaction.deferReply();
    try {
      const { note, calendar } = await loadOfficialNoteData(zzz);
      const account = await getLegacyAccountAtIndex(_db as any, targetUser.id, accountIndex);
      const pages = await renderOfficialNote({
        uid: String(zzz.uid), playerName: account?.nickname, locale, note, calendar,
      });
      await interaction.editReply({
        embeds: [],
        files: pages.map((buffer, index) => new AttachmentBuilder(buffer, {
          name: `zzz-note-${zzz.uid}-${index + 1}.png`,
        })),
      });
    } catch (error: any) {
      await interaction.editReply({
        files: [],
        embeds: [new EmbedBuilder()
          .setTitle(tr("note_Error") || "無法取得即時便箋")
          .setDescription(`\`${String(error?.message || error)}\``)
          .setColor("#E76161")],
      });
    }
  },
};
