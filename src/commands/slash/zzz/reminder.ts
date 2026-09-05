import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  LocalizationMap,
  MessageFlags,
  SlashCommandBuilder,
  type GuildBasedChannel,
} from "discord.js";
import { QuickDB } from "quick.db";
import { validateNotificationChannel } from "../../../utilities/core/notificationValidation.js";
import { enableNotificationDestination } from "../../../utilities/core/notificationDestination.js";
import {
  normalizeNoteReminderConfig,
  type EnergyReminderMode,
} from "../../../utilities/zzz/reminderConfig.js";

const booleanOption = (name: string, zhName: string, description: string) =>
  (option: any) => option.setName(name).setNameLocalizations({ "zh-TW": zhName })
    .setDescription(description).setRequired(false);

function summary(config: ReturnType<typeof normalizeNoteReminderConfig>) {
  const destination = config.notificationEnabled === false
    ? `已停用（${config.notificationInvalidReason || "尚未設定"}）`
    : config.notifyType === "dm" ? "私訊" : config.channelId ? `<#${config.channelId}>` : "目前頻道";
  const energy = config.energyMode === "off" ? "關閉"
    : config.energyMode === "amount" ? `電量達 ${config.energyValue}`
      : `充滿前 ${config.energyValue} 分鐘`;
  return [
    `**狀態：** ${config.enabled ? "啟用" : "停用"}`,
    `**通知位置：** ${destination}`,
    `**電量：** ${energy}`,
    `**每日：** 重置前 ${config.dailyHours} 小時（活躍度 ${config.vitalityEnabled ? "✓" : "✗"}／刮刮樂 ${config.cardSignEnabled ? "✓" : "✗"}／錄影帶店 ${config.vhsEnabled ? "✓" : "✗"}）`,
    `**每週：** 重置前 ${config.weeklyHours} 小時（懸賞 ${config.bountyEnabled ? "✓" : "✗"}／積分目標 ${config.weeklyEnabled ? config.weeklyTarget : "關閉"}）`,
    `**活動：** ${config.eventEnabled ? `結束前 ${config.eventHours} 小時` : "關閉"}`,
    `**提及：** ${config.tag ? "是" : "否"}`,
  ].join("\n");
}

export default {
  data: new SlashCommandBuilder()
    .setName("reminder")
    .setDescription("Configure ZZZ real-time note reminders")
    .setNameLocalizations({ "zh-TW": "提醒" } as LocalizationMap)
    .setDescriptionLocalizations({ "zh-TW": "設定所有絕區零帳號共用的即時便箋提醒" } as LocalizationMap)
    .addBooleanOption(booleanOption("enabled", "啟用", "Enable or disable reminders"))
    .addStringOption((option) => option.setName("energy_mode").setNameLocalizations({ "zh-TW": "電量模式" })
      .setDescription("Energy reminder mode").addChoices(
        { name: "Time until full", name_localizations: { "zh-TW": "距離充滿時間" }, value: "time" },
        { name: "Current amount", name_localizations: { "zh-TW": "目前電量門檻" }, value: "amount" },
        { name: "Off", name_localizations: { "zh-TW": "關閉" }, value: "off" },
      ))
    .addIntegerOption((option) => option.setName("energy_value").setNameLocalizations({ "zh-TW": "電量數值" })
      .setDescription("Minutes until full (15-720), or current amount (1-240)").setMinValue(1).setMaxValue(720))
    .addBooleanOption(booleanOption("vitality", "當日活躍度", "Remind when daily activity is incomplete"))
    .addBooleanOption(booleanOption("scratch_card", "刮刮樂", "Remind when the scratch card is incomplete"))
    .addBooleanOption(booleanOption("video_store", "錄影帶店", "Remind when the video store needs attention"))
    .addBooleanOption(booleanOption("bounty", "懸賞委託", "Remind when weekly bounties are incomplete"))
    .addBooleanOption(booleanOption("weekly_points", "每週點數", "Remind when weekly points are below the target"))
    .addBooleanOption(booleanOption("events", "活動", "Remind when event Polychromes are incomplete"))
    .addIntegerOption((option) => option.setName("daily_hours").setNameLocalizations({ "zh-TW": "每日提前小時" })
      .setDescription("Hours before daily reset").setMinValue(1).setMaxValue(12))
    .addIntegerOption((option) => option.setName("weekly_hours").setNameLocalizations({ "zh-TW": "每週提前小時" })
      .setDescription("Hours before weekly reset").setMinValue(1).setMaxValue(168))
    .addIntegerOption((option) => option.setName("weekly_target").setNameLocalizations({ "zh-TW": "每週點數目標" })
      .setDescription("Weekly reward target (default 1100)").setMinValue(1).setMaxValue(2100))
    .addIntegerOption((option) => option.setName("event_hours").setNameLocalizations({ "zh-TW": "活動提前小時" })
      .setDescription("Hours before an event ends").setMinValue(1).setMaxValue(168))
    .addChannelOption((option) => option.setName("channel").setNameLocalizations({ "zh-TW": "頻道" })
      .setDescription("Notification channel; defaults to the current channel"))
    .addBooleanOption(booleanOption("tag", "提及", "Mention you in reminder messages")),

  async execute(
    _client: Client,
    interaction: ChatInputCommandInteraction,
    _args: any[],
    _tr: any,
    db: QuickDB,
  ) {
    const existingRaw = await db.get(`noteReminder.${interaction.user.id}`);
    const existing = normalizeNoteReminderConfig(existingRaw);
    const supplied = [
      interaction.options.getBoolean("enabled"), interaction.options.getString("energy_mode"),
      interaction.options.getInteger("energy_value"), interaction.options.getBoolean("vitality"),
      interaction.options.getBoolean("scratch_card"), interaction.options.getBoolean("video_store"),
      interaction.options.getBoolean("bounty"), interaction.options.getBoolean("weekly_points"),
      interaction.options.getBoolean("events"), interaction.options.getInteger("daily_hours"),
      interaction.options.getInteger("weekly_hours"), interaction.options.getInteger("weekly_target"),
      interaction.options.getInteger("event_hours"), interaction.options.getChannel("channel"),
      interaction.options.getBoolean("tag"),
    ].some((value) => value !== null);

    if (!supplied) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor("#F4D52D").setTitle("即時便箋提醒設定")
          .setDescription(summary(existing))],
        flags: MessageFlags.Ephemeral,
      });
    }

    const mode = (interaction.options.getString("energy_mode") || existing.energyMode) as EnergyReminderMode;
    const requestedEnergy = interaction.options.getInteger("energy_value");
    let config = normalizeNoteReminderConfig({
      ...existing,
      enabled: interaction.options.getBoolean("enabled") ?? existing.enabled,
      energyMode: mode,
      energyValue: requestedEnergy ?? (mode !== existing.energyMode ? mode === "amount" ? 200 : 60 : existing.energyValue),
      vitalityEnabled: interaction.options.getBoolean("vitality") ?? existing.vitalityEnabled,
      cardSignEnabled: interaction.options.getBoolean("scratch_card") ?? existing.cardSignEnabled,
      vhsEnabled: interaction.options.getBoolean("video_store") ?? existing.vhsEnabled,
      bountyEnabled: interaction.options.getBoolean("bounty") ?? existing.bountyEnabled,
      weeklyEnabled: interaction.options.getBoolean("weekly_points") ?? existing.weeklyEnabled,
      eventEnabled: interaction.options.getBoolean("events") ?? existing.eventEnabled,
      dailyHours: interaction.options.getInteger("daily_hours") ?? existing.dailyHours,
      weeklyHours: interaction.options.getInteger("weekly_hours") ?? existing.weeklyHours,
      weeklyTarget: interaction.options.getInteger("weekly_target") ?? existing.weeklyTarget,
      eventHours: interaction.options.getInteger("event_hours") ?? existing.eventHours,
      tag: interaction.options.getBoolean("tag") ?? existing.tag,
    });

    const selected = interaction.options.getChannel("channel");
    const needsDestination = !existingRaw || selected || config.notificationEnabled === false;
    if (needsDestination) {
      if (!interaction.guild) {
        config = enableNotificationDestination(config, { notifyType: "dm" });
      } else {
        const channel = (selected || interaction.channel) as GuildBasedChannel | null;
        if (!channel) {
          return interaction.reply({ content: "找不到通知頻道。", flags: MessageFlags.Ephemeral });
        }
        const validation = validateNotificationChannel(interaction, channel);
        if (!validation.ok) {
          return interaction.reply({
            content: `無法使用該頻道作為通知位置：${validation.reason}。使用者與 Bot 都必須可查看及發送訊息，Bot 另需附加檔案權限。`,
            flags: MessageFlags.Ephemeral,
          });
        }
        config = enableNotificationDestination(config, {
          notifyType: "channel", channelId: channel.id, guildId: channel.guildId,
        });
      }
    }
    await db.set(`noteReminder.${interaction.user.id}`, config);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor("#F4D52D").setTitle("已更新即時便箋提醒")
        .setDescription(summary(config))],
      flags: MessageFlags.Ephemeral,
    });
  },
};
