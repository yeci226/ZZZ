import {
  ChannelType,
  PermissionsBitField,
  type ChatInputCommandInteraction,
  type GuildBasedChannel,
  type GuildMember,
  type User,
} from "discord.js";

const ALLOWED_CHANNEL_TYPES = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

export interface NotificationChannelValidation {
  ok: boolean;
  reason?: "unsupported" | "user_cannot_view" | "user_cannot_send" | "bot_cannot_view" | "bot_cannot_send" | "bot_cannot_attach";
}

export function validateNotificationChannelForUser(
  channel: GuildBasedChannel,
  user: GuildMember | User,
  botMember: GuildMember,
): NotificationChannelValidation {
  if (!ALLOWED_CHANNEL_TYPES.has(channel.type)) return { ok: false, reason: "unsupported" };
  if (channel.isThread() && (channel.archived || channel.locked)) {
    return { ok: false, reason: "unsupported" };
  }
  const userPermissions = channel.permissionsFor(user);
  const botPermissions = channel.permissionsFor(botMember);
  if (!userPermissions?.has(PermissionsBitField.Flags.ViewChannel)) return { ok: false, reason: "user_cannot_view" };
  const sendFlag = channel.isThread()
    ? PermissionsBitField.Flags.SendMessagesInThreads
    : PermissionsBitField.Flags.SendMessages;
  if (!userPermissions.has(sendFlag)) return { ok: false, reason: "user_cannot_send" };
  if (!botPermissions?.has(PermissionsBitField.Flags.ViewChannel)) return { ok: false, reason: "bot_cannot_view" };
  if (!botPermissions.has(sendFlag)) return { ok: false, reason: "bot_cannot_send" };
  if (!botPermissions.has(PermissionsBitField.Flags.AttachFiles)) return { ok: false, reason: "bot_cannot_attach" };
  return { ok: true };
}

export function validateNotificationChannel(
  interaction: ChatInputCommandInteraction,
  channel: GuildBasedChannel,
): NotificationChannelValidation {
  if (!ALLOWED_CHANNEL_TYPES.has(channel.type)) return { ok: false, reason: "unsupported" };
  const guild = interaction.guild;
  const botMember = guild?.members.me;
  if (!guild || !botMember || channel.guildId !== guild.id) return { ok: false, reason: "unsupported" };
  return validateNotificationChannelForUser(channel, interaction.user, botMember);
}
