import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionsBitField,
  MessageFlags,
  Client,
  ChannelType,
} from "discord.js";
import { QuickDB } from "quick.db";
import {
  ADMIN_NOTIFICATION_FEATURES,
  manageAdminNotifications,
  type AdminNotificationFeature,
} from "../../../utilities/core/adminNotifications.js";
import {
  validateNotificationChannel,
  validateNotificationChannelForUser,
} from "../../../utilities/core/notificationValidation.js";

import { createTranslator } from "../../../utilities/core/i18n.js";

const choiceLocales = [
  ["zh-TW", "tw"],
  ["zh-CN", "cn"],
  ["ja", "jp"],
  ["ko", "kr"],
  ["fr", "fr"],
  ["vi", "vi"],
] as const;
const choices = ADMIN_NOTIFICATION_FEATURES.map((f) => ({
  name: f.name,
  value: f.value,
  name_localizations: Object.fromEntries(
    choiceLocales.map(([locale, lang]) => [
      locale,
      createTranslator(lang)(`admin_Feature_${f.value}`),
    ]),
  ),
}));
const channelTypes = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
] as const;

export default {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Manage this server's notification destinations")
    .setNameLocalizations({
      "zh-TW": "管理員",
      vi: "quảntrịviên",
      fr: "administrateur",
    })
    .setDescriptionLocalizations({ "zh-TW": "管理本伺服器的通知目的地" })
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setNameLocalizations({
          "zh-TW": "刪除",
          vi: "tuỳchọn",
          fr: "supprimer",
        })
        .setDescription(
          "Disable channel notifications; automatic tasks keep running",
        )
        .setDescriptionLocalizations({
          "zh-TW": "停用頻道通知，自動功能繼續執行",
        })
        .addStringOption((o) =>
          o
            .setName("feature")
            .setDescription("Notification type")
            .setNameLocalizations({ "zh-TW": "功能" })
            .setRequired(true)
            .addChoices(...choices),
        )
        .addUserOption((o) =>
          o
            .setName("user")
            .setDescription("User for personal notifications")
            .setNameLocalizations({ "zh-TW": "使用者" }),
        )
        .addStringOption((o) =>
          o
            .setName("userid")
            .setDescription("User ID for personal notifications")
            .setNameLocalizations({ "zh-TW": "使用者id" }),
        )
        .addChannelOption((o) =>
          o
            .setName("source")
            .setDescription("Source channel (required for news)")
            .setNameLocalizations({ "zh-TW": "來源頻道" })
            .addChannelTypes(...channelTypes),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("move")
        .setNameLocalizations({
          "zh-TW": "移動",
          vi: "dichuyển",
          fr: "transfert",
        })
        .setDescription("Move channel notifications within this server")
        .setDescriptionLocalizations({ "zh-TW": "移動本伺服器的頻道通知" })
        .addStringOption((o) =>
          o
            .setName("feature")
            .setDescription("Notification type")
            .setNameLocalizations({ "zh-TW": "功能" })
            .setRequired(true)
            .addChoices(
              {
                name: "All",
                value: "all",
                name_localizations: { "zh-TW": "全部" },
              },
              ...choices,
            ),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Destination channel")
            .setNameLocalizations({ "zh-TW": "頻道" })
            .setRequired(true)
            .addChannelTypes(...channelTypes),
        )
        .addChannelOption((o) =>
          o
            .setName("source")
            .setDescription("Source channel (required to include news)")
            .setNameLocalizations({ "zh-TW": "來源頻道" })
            .addChannelTypes(...channelTypes),
        ),
    ),

  async execute(
    client: Client,
    interaction: ChatInputCommandInteraction,
    _args: any[],
    tr: any,
    db: QuickDB,
    _emoji: any,
  ) {
    const reply = (key: string) =>
      interaction.reply({ content: tr(key), flags: MessageFlags.Ephemeral });
    if (
      !interaction.guild ||
      !interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)
    )
      return reply("admin_NoPermission");
    const action = interaction.options.getSubcommand() as "remove" | "move";
    const feature = interaction.options.getString("feature", true) as
      AdminNotificationFeature | "all";
    if (
      !["remove", "move"].includes(action) ||
      (feature !== "all" &&
        !ADMIN_NOTIFICATION_FEATURES.some((f) => f.value === feature)) ||
      (action === "remove" && feature === "all")
    )
      return reply("admin_ManageInvalid");
    const user = interaction.options.getUser("user");
    const userId =
      user?.id || interaction.options.getString("userid") || undefined;
    const source = interaction.options.getChannel("source");
    const target = interaction.options.getChannel("channel");
    if (feature === "news" && (!source || userId))
      return reply("admin_ManageNewsSource");
    if (
      action === "remove" &&
      feature !== "news" &&
      (!userId || !/^\d{17,20}$/.test(userId) || user?.bot)
    )
      return reply("admin_ManageUser");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild;
    try {
      if (source) {
        const sourceChannel = await guild.channels.fetch(source.id, {
          force: true,
        });
        if (!sourceChannel || sourceChannel.guildId !== guild.id)
          return interaction.editReply({ content: tr("admin_ManageInvalid") });
      }
      const channel =
        action === "move" && target
          ? await guild.channels.fetch(target.id, { force: true })
          : null;
      await guild.members.fetchMe({ force: true });
      if (
        action === "move" &&
        (!channel || !validateNotificationChannel(interaction, channel).ok)
      )
        return interaction.editReply({
          content: tr("admin_ManagePermissions"),
        });
      // Initialize only stores selected by this operation.
      let mimo:
        | typeof import("../../../utilities/mimo/runtime.js").getMimoStore
        | undefined;
      let news:
        | typeof import("../../../utilities/news/runtime.js").getNewsRuntime
        | undefined;
      if (feature === "autoMimo" || feature === "all")
        mimo = (await import("../../../utilities/mimo/runtime.js"))
          .getMimoStore;
      if ((feature === "news" || feature === "all") && source)
        news = (await import("../../../utilities/news/runtime.js"))
          .getNewsRuntime;
      const results = await manageAdminNotifications(
        {
          action,
          feature,
          guildId: guild.id,
          sourceChannelId: source?.id,
          targetChannelId: target?.id,
          userId: feature === "news" ? undefined : userId,
        },
        {
          db,
          mimo: () => mimo!(db),
          news: () => news!(client, "zzz").store,
          channelGuild: async (id) =>
            (await guild.channels.fetch(id, { force: true }))?.guildId ?? null,
          canMove: async (owner, subscription) => {
            if (!channel) return false;
            if (subscription) {
              const { validateNewsDestination } =
                await import("../../../utilities/news/wizard.js");
              try {
                await validateNewsDestination(client, interaction, {
                  ...subscription,
                  id: `channel:${channel.id}`,
                  channelId: channel.id,
                });
                return true;
              } catch (error) {
                if (
                  error instanceof Error &&
                  ["invalid", "forbidden"].includes(error.message)
                )
                  return false;
                throw error;
              }
            }
            if (!owner) return false;
            const member = await guild.members.fetch({
              user: owner,
              force: true,
            });
            return (
              !member.user.bot &&
              validateNotificationChannelForUser(
                channel,
                member,
                guild.members.me!,
              ).ok
            );
          },
        },
      );
      const lines = ADMIN_NOTIFICATION_FEATURES.flatMap((f) => {
        const rows = results.filter((r) => r.feature === f.value);
        if (!rows.length) return [];
        const counts = ["success", "skipped", "conflict", "failed"]
          .map(
            (outcome) =>
              `${tr(`admin_Manage_${outcome}`)} ${rows.filter((r) => r.outcome === outcome).length}`,
          )
          .join(" · ");
        const reasons = [
          ...new Set(
            rows.flatMap((r) =>
              r.reason ? [tr(`admin_Manage_${r.reason}`)] : [],
            ),
          ),
        ];
        return [
          `**${tr(`admin_Feature_${f.value}`)}**：${counts}${reasons.length ? `\n${reasons.join(" / ")}` : ""}`,
        ];
      });
      return interaction.editReply({
        embeds: [
          { title: tr("admin_ManageDone"), description: lines.join("\n\n") },
        ],
        allowedMentions: { parse: [] },
      });
    } catch {
      return interaction.editReply({ content: tr("admin_Manage_unavailable") });
    }
  },
};
