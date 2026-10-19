import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  LocalizationMap,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { QuickDB } from "quick.db";
import { getLegacyAccountAtIndex, getLegacyAccounts } from "../../../utilities/accountStore.js";
import { getUserLang, getUserZZZData } from "../../../utilities/utilities.js";
import { canViewPrivateGacha } from "../../../utilities/zzz/gachaPrivacy.js";
import {
  buildSignalLogMessage,
  createSignalLogSession,
} from "../../../utilities/zzz/signalLogView.js";
import { signalActionText } from "../../../utilities/zzz/signalActionText.js";
import { getGachaArchiveStore } from "../../../utilities/zzz/gachaArchive.js";
import { beginRngMoeImport } from "../../../utilities/zzz/rngMoeImportFlow.js";
import { beginManualGachaImport } from "../../../utilities/zzz/manualGachaImportFlow.js";

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
      .setDescriptionLocalizations({ "zh-TW": "查看合併後的完整調頻紀錄", "zh-CN": "查看合并后的完整调频记录", ja: "統合された変調記録を表示", ko: "통합 변조 기록 보기", fr: "Afficher l'historique unifié", vi: "Xem lịch sử tín hiệu hợp nhất" } as LocalizationMap)
      .addStringOption((option) => option
        .setName("account").setDescription("Account or archived UID")
        .setNameLocalizations({ "zh-TW": "帳號", "zh-CN": "账号", ja: "アカウント", ko: "계정", fr: "compte", vi: "tàikhoản" } as LocalizationMap)
        .setDescriptionLocalizations({ "zh-TW": "選擇已綁定帳號或封存 UID" } as LocalizationMap)
        .setAutocomplete(true))
      .addUserOption((option) => option
        .setName("user").setDescription("User")
        .setNameLocalizations({ "zh-TW": "使用者", "zh-CN": "用户", ja: "ユーザー", ko: "사용자", fr: "utilisateur", vi: "ngườidùng" } as LocalizationMap)))
    .addSubcommand((subcommand) => subcommand
      .setName("import")
      .setDescription("Import Signal Search history")
      .setNameLocalizations({ "zh-TW": "匯入", "zh-CN": "导入", ja: "インポート", ko: "가져오기", fr: "importer", vi: "nhập" } as LocalizationMap)
      .setDescriptionLocalizations({ "zh-TW": "匯入 rng.moe 備份或遊戲 URL", "zh-CN": "导入 rng.moe 备份或游戏 URL" } as LocalizationMap)
      .addStringOption((option) => option
        .setName("method").setDescription("Import method")
        .setNameLocalizations({ "zh-TW": "方式", "zh-CN": "方式" } as LocalizationMap)
        .setDescriptionLocalizations({ "zh-TW": "選擇 rng.moe 或遊戲 URL", "zh-CN": "选择 rng.moe 或游戏 URL" } as LocalizationMap)
        .addChoices(
          { name: "rng.moe", value: "rng_moe" },
          { name: "Game URL", name_localizations: { "zh-TW": "遊戲 URL", "zh-CN": "游戏 URL" }, value: "url" },
        )
        .setRequired(true))
      .addAttachmentOption((option) => option
        .setName("file").setDescription("rng.moe JSON backup")
        .setNameLocalizations({ "zh-TW": "檔案", "zh-CN": "文件" } as LocalizationMap)
        .setRequired(false))
      .addStringOption((option) => option
        .setName("uid").setDescription("Game UID when the profile has none")
        .setDescriptionLocalizations({ "zh-TW": "備份 Profile 沒有 UID 時指定遊戲 UID" } as LocalizationMap))),

  async execute(
    _client: Client,
    interaction: ChatInputCommandInteraction,
    _args: any[],
    tr: any,
    db: QuickDB,
  ) {
    if (interaction.options.getSubcommand() === "import") {
      const method = interaction.options.getString("method", true);
      const file = interaction.options.getAttachment("file");
      const uid = interaction.options.getString("uid") ?? "";
      if (method === "rng_moe") {
        if (!file) {
          await interaction.reply({
            content: "選擇 rng.moe 時必須上傳 JSON 備份檔案。",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await beginRngMoeImport(interaction, file, uid);
      } else {
        if (file) {
          await interaction.reply({
            content: "遊戲 URL 匯入不需要檔案，請移除附件後重試。",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await beginManualGachaImport(interaction, uid);
      }
      return;
    }
    const target = interaction.options.getUser("user") ?? interaction.user;
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
      if (linkedAccount) {
        const hasArchive = getGachaArchiveStore().countRecords({ ownerId: target.id, uid: String(linkedAccount.uid) }) > 0;
        zzz = await getUserZZZData(interaction, tr, target.id, locale, accountIndex, { authMode: hasArchive ? "optional" : "required" });
        if (!zzz && !hasArchive) return;
      }
      const session = await createSignalLogSession({
        interaction, ownerId: target.id, accountIndex, source: "official", zzz,
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
