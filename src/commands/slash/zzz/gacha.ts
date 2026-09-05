import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  LocalizationMap,
  SlashCommandBuilder,
} from "discord.js";
import { QuickDB } from "quick.db";
import { getLegacyAccountAtIndex, getLegacyAccounts } from "../../../utilities/accountStore.js";
import { getUserLang, getUserZZZData } from "../../../utilities/utilities.js";
import type { GachaArchiveSource } from "../../../utilities/zzz/gachaArchive.js";
import { canViewPrivateGacha } from "../../../utilities/zzz/gachaPrivacy.js";
import { createZzzClient, getZzzClientLanguage } from "../../../utilities/zzz/clientFactory.js";
import {
  buildSignalLogMessage,
  createSignalLogSession,
} from "../../../utilities/zzz/signalLogView.js";
import { signalActionText } from "../../../utilities/zzz/signalActionText.js";

export default {
  data: new SlashCommandBuilder()
    .setName("signal")
    .setDescription("View archived ZZZ Signal Search records")
    .setNameLocalizations({ "zh-TW": "調頻", "zh-CN": "调频", ja: "変調", ko: "변조", fr: "signal", vi: "tínhiệu" } as LocalizationMap)
    .setDescriptionLocalizations({ "zh-TW": "查看已封存的調頻紀錄", "zh-CN": "查看已封存的调频记录", ja: "保存済み変調記録を表示", ko: "보관된 변조 기록 보기", fr: "Afficher les recherches archivées", vi: "Xem lịch sử tín hiệu đã lưu" } as LocalizationMap)
    .addSubcommand((subcommand) => subcommand
      .setName("log")
      .setDescription("View Signal Search records")
      .setNameLocalizations({ "zh-TW": "紀錄", "zh-CN": "记录", ja: "記録", ko: "기록", fr: "historique", vi: "lịchsử" } as LocalizationMap)
      .setDescriptionLocalizations({ "zh-TW": "查看官方封存或手動匯入紀錄", "zh-CN": "查看官方封存或手动导入记录", ja: "公式保存または手動記録を表示", ko: "공식 또는 수동 기록 보기", fr: "Afficher les archives officielles ou manuelles", vi: "Xem lưu trữ chính thức hoặc thủ công" } as LocalizationMap)
      .addStringOption((option) => option
        .setName("source").setDescription("Archive source")
        .setNameLocalizations({ "zh-TW": "來源", "zh-CN": "来源", ja: "ソース", ko: "출처", fr: "source", vi: "nguồn" } as LocalizationMap)
        .setDescriptionLocalizations({ "zh-TW": "選擇官方封存或手動匯入", "zh-CN": "选择官方封存或手动导入", ja: "記録元を選択", ko: "기록 출처 선택", fr: "Choisir la source", vi: "Chọn nguồn lưu trữ" } as LocalizationMap)
        .addChoices(
          { name: "Official archive", name_localizations: { "zh-TW": "官方封存", "zh-CN": "官方封存", ja: "公式アーカイブ", ko: "공식 보관", fr: "Archive officielle", vi: "Lưu trữ chính thức" }, value: "official" },
          { name: "Manual import", name_localizations: { "zh-TW": "手動匯入", "zh-CN": "手动导入", ja: "手動インポート", ko: "수동 가져오기", fr: "Import manuel", vi: "Nhập thủ công" }, value: "manual" },
        ))
      .addStringOption((option) => option
        .setName("account").setDescription("Account or archived UID")
        .setNameLocalizations({ "zh-TW": "帳號", "zh-CN": "账号", ja: "アカウント", ko: "계정", fr: "compte", vi: "tàikhoản" } as LocalizationMap)
        .setDescriptionLocalizations({ "zh-TW": "選擇已綁定帳號或封存 UID" } as LocalizationMap)
        .setAutocomplete(true))
      .addUserOption((option) => option
        .setName("user").setDescription("User")
        .setNameLocalizations({ "zh-TW": "使用者", "zh-CN": "用户", ja: "ユーザー", ko: "사용자", fr: "utilisateur", vi: "ngườidùng" } as LocalizationMap))),

  async execute(
    _client: Client,
    interaction: ChatInputCommandInteraction,
    _args: any[],
    tr: any,
    db: QuickDB,
  ) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const source = (interaction.options.getString("source") || "official") as GachaArchiveSource;
    const rawAccount = interaction.options.getString("account") || "0";
    const archiveUid = rawAccount.startsWith("archive:") ? rawAccount.slice(8) : "";
    let accountIndex = archiveUid ? 0 : Math.max(0, Number.parseInt(rawAccount, 10) || 0);
    const locale = (await getUserLang(interaction.user.id)) || "tw";
    const actionCopy = signalActionText(locale);
    await interaction.deferReply();
    try {
      if (!(await canViewPrivateGacha(db, interaction.user.id, target.id))) {
        throw new Error(actionCopy.privateDisabled);
      }
      let zzz: any;
      let linkedAccount = archiveUid ? null : await getLegacyAccountAtIndex(db as any, target.id, accountIndex);
      if (archiveUid) {
        const accounts = await getLegacyAccounts(db as any, target.id);
        const linkedIndex = accounts.findIndex((account) => String(account.uid) === archiveUid);
        if (linkedIndex >= 0) {
          accountIndex = linkedIndex;
          linkedAccount = accounts[linkedIndex];
        }
      }
      if (source === "official" && linkedAccount) {
        zzz = await getUserZZZData(interaction, tr, target.id, locale, accountIndex);
        if (!zzz) return;
      } else if (source === "manual" && linkedAccount?.cookie && linkedAccount.uid) {
        zzz = createZzzClient({
          cookie: linkedAccount.cookie,
          lang: getZzzClientLanguage(locale),
          uid: Number(linkedAccount.uid),
        });
      }
      const session = await createSignalLogSession({
        interaction, ownerId: target.id, accountIndex, source, zzz,
        uid: archiveUid || String(linkedAccount?.uid ?? zzz?.uid ?? ""),
        playerName: linkedAccount?.nickname ?? zzz?.nickname,
        linked: !!linkedAccount,
        region: linkedAccount?.region ?? zzz?.region,
      });
      await interaction.editReply(await buildSignalLogMessage(session));
    } catch (error: any) {
      await interaction.editReply({
        files: [], components: [],
        embeds: [new EmbedBuilder().setColor("#E76161").setTitle(actionCopy.displayFailedTitle)
          .setDescription(`\`${String(error?.message || error)}\``)],
      });
    }
  },
};
