import {
  ChatInputCommandInteraction,
  Client,
  LocalizationMap,
  SlashCommandBuilder,
} from "discord.js";
import { handleShiyuDraw } from "../../../utilities/zzz/shiyu/index.js";
import { getUserZZZData, getUserLang } from "../../../utilities/utilities.js";
import { QuickDB } from "quick.db";
import {
  getZzzHistoryEntry,
  parseHistorySchedule,
} from "../../../utilities/zzz/recordCache.js";

export default {
  data: new SlashCommandBuilder()
    .setName("shiyudefense")
    .setNameLocalizations({
      "zh-TW": "式輿防衛戰",
      vi: "phongthushiyu",
      fr: "defenseshiyu",
    } as LocalizationMap)
    .setDescription("Show user's Shiyu Defense data")
    .setDescriptionLocalizations({
      "zh-TW": "顯示使用者的式輿防衛戰資料",
      vi: "Hiển thị dữ liệu phòng thủ Shiyu của người dùng",
      fr: "Afficher les données de défense de Shiyu de l'utilisateur",
    } as LocalizationMap)
    .addStringOption((option) =>
      option
        .setName("account")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "帳號",
          vi: "tàikhoản",
          fr: "compte",
        } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "使用者",
          vi: "ngườidùng",
        } as LocalizationMap)
        .setDescriptionLocalizations({
          "zh-TW": "...",
          vi: "...",
        } as LocalizationMap)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("schedule")
        .setNameLocalizations({
          "zh-TW": "時間",
          vi: "thờigian",
          fr: "temps",
        } as LocalizationMap)
        .setDescription("Select a period")
        .setDescriptionLocalizations({
          "zh-TW": "選擇式輿期數",
          "zh-CN": "选择式舆期数",
          vi: "Chọn kỳ",
          fr: "Choisir une période",
        } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    ),
  async execute(
    _client: Client,
    interaction: ChatInputCommandInteraction,
    _args: any[],
    tr: any,
    db: QuickDB,
    emoji: any
  ) {
    const accountIndex = parseInt(
      interaction.options.getString("account") || "0"
    );
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const scheduleValue = interaction.options.getString("schedule") || "1";
    const userLocale = (await getUserLang(interaction.user.id)) || "en";

    if (parseHistorySchedule(scheduleValue)) {
      const cached = await getZzzHistoryEntry(
        db,
        "shiyu",
        targetUser.id,
        accountIndex,
        scheduleValue,
      );
      if (!cached) {
        await interaction.reply({
          content: tr("NonData") || "找不到已儲存的式輿紀錄。",
          ephemeral: true,
        });
        return;
      }
      await interaction.deferReply();
      await handleShiyuDraw(
        interaction,
        tr,
        targetUser,
        { uid: `cached-${targetUser.id}`, lang: userLocale } as any,
        cached.schedule,
        {
          db,
          dataOverride: cached.data,
          accountIndex,
          targetUserId: targetUser.id,
          locale: userLocale,
        },
      );
      return;
    }

    const schedule = Number(scheduleValue) === 2 ? 2 : 1;
    const zzz = await getUserZZZData(
      interaction,
      tr,
      targetUser.id,
      userLocale,
      accountIndex,
    );
    if (zzz == null) return;

    await interaction.deferReply();
    await handleShiyuDraw(interaction, tr, targetUser, zzz, schedule, {
      db,
      accountIndex,
      targetUserId: targetUser.id,
      locale: userLocale,
    });
  },
};
