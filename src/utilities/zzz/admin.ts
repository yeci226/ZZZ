import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, PermissionsBitField, ChannelType, GuildChannelResolvable } from 'discord.js';
import { database } from '@/index.js';

import { discordToHoyolabLang, failedReply, getUserLang, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

export async function handleRemoveFeatureNotifyCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    const selectedUser = interactionOptions.getUser('user') ?? interactionUser;
    const selectedFeature = interactionOptions.getString('feature');
    const channels = interaction.guild?.channels.cache.map((c) => c.id).filter(Boolean) ?? [];

    const featureData = await database.get(selectedFeature ?? '');
    const userFeatureData = featureData[selectedUser.id];

    if (!selectedUser.id) {
      return failedReply(interaction, tr('admin_RemoveFail'), tr('admin_RemoveFailDesc'));
    }
    if (!Object.keys(featureData).includes(selectedUser.id)) {
      return failedReply(interaction, tr('admin_RemoveFail'), tr('admin_UserNotSet', { user: `<@${selectedUser.id}>` }));
    }
    if (!channels.includes(userFeatureData?.channelId ?? '')) {
      return failedReply(interaction, tr('admin_RemoveFail'), tr('admin_RemoveFailUserOtherServer', { user: `<@${selectedUser.id}>` }));
    }

    await database.delete(`${selectedFeature}.${selectedUser.id}`);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#F6F1F1')
          .setTitle(tr('admin_RemoveSuccess'))
          .setDescription(tr('admin_RemoveSuccessMessage', { user: `<@${selectedUser.id}>`, channel: `<#${userFeatureData.channelId}>` })),
      ],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error: any) {
    return failedReply(interaction, tr('admin_RemoveFail'), tr('admin_RemoveFailDesc'), error.message);
  }
}

export async function handleMoveFeatureNotifyCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;
  const interactionGuild = interaction.guild;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const selectedChannel = interactionOptions.getChannel('channel');
    const selectedFeature = (interactionOptions.getString('feature') as 'autoDaily' | 'autoRedeem' | 'all') ?? 'all';
    const clientMember = interactionGuild?.members.me;

    const channelIdSet = new Set(interactionGuild?.channels.cache.map((c) => c.id).filter(Boolean) ?? []);

    if (!selectedChannel) {
      return failedReply(interaction, tr('admin_MoveFail'), tr('admin_MoveNoChannel'));
    }
    if (!clientMember) {
      return failedReply(interaction, tr('admin_MoveFail'), tr('admin_MoveNoBot'));
    }
    if (!clientMember.permissionsIn(selectedChannel as GuildChannelResolvable).has(PermissionsBitField.Flags.SendMessages)) {
      return failedReply(interaction, tr('admin_MoveFail'), tr('admin_MoveNoPermission', { channel: `<#${selectedChannel.id}>` }));
    }
    if (![ChannelType.GuildText, ChannelType.PrivateThread, ChannelType.PublicThread, ChannelType.GuildVoice].includes(selectedChannel.type)) {
      return failedReply(interaction, tr('admin_MoveFail'), tr('admin_MoveNoPermission', { channel: `<#${selectedChannel.id}>` }));
    }

    const moveAutoDaily = async (): Promise<number> => {
      let successCount = 0;
      const autoDailyData = (await database.get('autoDaily')) ?? {};

      const matchedUsers = Object.entries(autoDailyData)
        .filter(([, info]) => channelIdSet.has((info as any).channelId))
        .map(([userId]) => userId);

      for (const userId of matchedUsers) {
        const userAutoDailyData = autoDailyData[userId];
        if (userAutoDailyData) {
          userAutoDailyData.channelId = selectedChannel?.id ?? '';
          await database.set(`autoDaily.${userId}`, userAutoDailyData);
        }
      }

      return successCount;
    };

    const moveAutoRedeem = async (): Promise<number> => {
      let successCount = 0;
      const autoRedeemData = (await database.get('autoRedeem')) ?? {};

      const matchedUsers = Object.entries(autoRedeemData)
        .filter(([, info]) => channelIdSet.has((info as any).channelId))
        .map(([userId]) => userId);

      for (const userId of matchedUsers) {
        const userAutoRedeemData = autoRedeemData[userId];
        if (userAutoRedeemData) {
          userAutoRedeemData.channelId = selectedChannel?.id ?? '';
          await database.set(`autoRedeem.${userId}`, userAutoRedeemData);
          successCount++;
        }
      }

      return successCount;
    };

    const successCount = await (async () => {
      switch (selectedFeature) {
        case 'autoDaily':
          return await moveAutoDaily();
        case 'autoRedeem':
          return await moveAutoRedeem();
        case 'all':
          return (await moveAutoDaily()) + (await moveAutoRedeem());
      }
    })();

    if (successCount === 0) {
      return failedReply(interaction, tr('admin_MoveFail'), tr('admin_MoveNoUser'));
    }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#F6F1F1')
          .setTitle(tr('admin_MoveSuccess'))
          .setDescription(tr('admin_MoveSuccessMessage', { count: successCount.toString(), channel: `<#${selectedChannel?.id}>` })),
      ],
      flags: MessageFlags.Ephemeral as any,
    });
  } catch (error: any) {
    return failedReply(interaction, tr('admin_MoveFail'), tr('admin_MoveFailDesc'), error.message);
  }
}
