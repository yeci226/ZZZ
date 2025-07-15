import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionsBitField, MessageFlags, ChatInputCommandInteraction, ColorResolvable, GuildChannelResolvable } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';
import { database } from '@/index';

import { createTranslator } from '@/utilities/core/i18n';

export default {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Server administrator settings')
    .setNameLocalizations({
      'zh-TW': '管理員',
      'vi': 'quảntrịviên',
      'fr': 'administrateur',
    })
    .setDescriptionLocalizations({
      'zh-TW': '伺服器管理員的設定',
      'vi': 'Cài đặt admin máy chủ',
      'fr': "Paramètre de l'administrateur",
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription("Remove notifications from a user's messages in a channel")
        .setNameLocalizations({
          'zh-TW': '刪除',
          'vi': 'tuỳchọn',
          'fr': 'supprimer',
        })
        .setDescriptionLocalizations({
          'zh-TW': '刪除使用者在頻道中的訊息通知',
          'vi': 'Xoá thông báo tin nhắn của người dùng (Ping) khỏi kênh',
          'fr': 'Désactiver la notification des utilisateurs dans ce canal',
        })
        .addStringOption((option) =>
          option
            .setName('feature')
            .setDescription('Select the features you want to remove user from')
            .setNameLocalizations({
              'zh-TW': '功能',
              'vi': 'chứcnăng',
              'fr': 'fonctionnalité',
            })
            .setDescriptionLocalizations({
              'zh-TW': '選擇要刪除使用者的功能',
              'vi': 'Tuỳ chọn xoá chức năng người dùng',
              'fr': 'Sélectionnez la fonction à supprimer',
            })
            .setRequired(true)
            .addChoices(
              {
                name: 'autodaily',
                name_localizations: {
                  'zh-TW': '自動簽到',
                  'vi': 'Điểm danh tự động',
                  'fr': 'Signé automatique',
                },
                value: 'autoDaily',
              },
              {
                name: 'autoredeem',
                name_localizations: {
                  'zh-TW': '自動兌換',
                  'vi': 'Đổi code tự động',
                  'fr': 'Racheté automatique',
                },
                value: 'autoRedeem',
              },
            ),
        )
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Select user to remove')
            .setNameLocalizations({
              'zh-TW': '使用者',
              'vi': 'ngườidùng',
              'fr': 'utilisateur',
            })
            .setDescriptionLocalizations({
              'zh-TW': '選擇要刪除的使用者',
              'vi': 'Tuỳ chọn xoá người dùng',
              'fr': "Sélectionnez l'utilisateur à supprimer",
            })
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('userid')
            .setDescription('Enter the user ID you want to delete')
            .setNameLocalizations({
              'zh-TW': '使用者id',
              'vi': 'idngườidùng',
              'fr': 'iddelutilisateur',
            })
            .setDescriptionLocalizations({
              'zh-TW': '輸入要刪除的使用者ID',
              'vi': 'Nhập ID người dùng bạn muốn xoá',
              'fr': "Entrez l'ID de l'utilisateur à supprimer",
            })
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('move')
        .setDescription('Change the channel for message notifications')
        .setNameLocalizations({
          'zh-TW': '移動',
          'vi': 'dichuyển',
          'fr': 'transfert',
        })
        .setDescriptionLocalizations({
          'zh-TW': '更改訊息通知的頻道',
          'vi': 'Đổi kênh nhận thông báo tin nhắn',
          'fr': 'Modifier le canal pour les notifications de message',
        })
        .addStringOption((option) =>
          option
            .setName('feature')
            .setDescription('Select features to move')
            .setNameLocalizations({
              'zh-TW': '功能',
              'vi': 'chứcnăng',
              'fr': 'fonction',
            })
            .setDescriptionLocalizations({
              'zh-TW': '選擇移動的功能',
              'vi': 'Tuỳ chọn chức năng di chuyển',
              'fr': 'Sélectionnez la fonction de transfert',
            })
            .setRequired(true)
            .addChoices(
              {
                name: 'all',
                name_localizations: {
                  'zh-TW': '全部',
                  'vi': 'Tất cả',
                  'fr': 'Tout',
                },
                value: 'all',
              },
              {
                name: 'autodaily',
                name_localizations: {
                  'zh-TW': '自動簽到',
                  'vi': 'Điểm danh tự động',
                  'fr': 'Signé automatique',
                },
                value: 'autoDaily',
              },
              {
                name: 'autoredeem',
                name_localizations: {
                  'zh-TW': '自動兌換',
                  'vi': 'Đổi code tự động',
                  'fr': 'Racheté automatique',
                },
                value: 'autoRedeem',
              },
            ),
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Select channel to remove')
            .setNameLocalizations({
              'zh-TW': '頻道',
              'vi': 'kênh',
              'fr': 'canal',
            })
            .setDescriptionLocalizations({
              'zh-TW': '選擇要移動至哪個頻道',
              'vi': 'Chọn kênh sẽ chuyển đến',
              'fr': 'Choisissez le canal à déplacer',
            })
            .setRequired(true),
        ),
    ),

  /**
   * @description 執行指令
   * @param interaction - 互動實例
   * @param locale - 語言
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, locale: LanguageEnum, ..._args: string[]) {
    const tr = createTranslator(locale);

    const interactionMember = interaction.member;

    if (interactionMember?.permissions instanceof PermissionsBitField && !interactionMember?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('admin_NoPermission')).setDescription(tr('admin_NoPermissionDesc'))],
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'remove':
        return handleRemove(interaction, locale);
      case 'move':
        return handleMove(interaction, locale);
    }
  },
};

const handleRemove = async (interaction: ChatInputCommandInteraction, locale: LanguageEnum) => {
  const tr = createTranslator(locale);

  const interactionUser = interaction.user;
  const selectedUser = interaction.options.getUser('user') ?? interactionUser;
  const feature = interaction.options.getString('feature');
  const channels = interaction.guild?.channels.cache.map((c) => c.id).filter(Boolean) ?? [];

  const data = await database.get(feature ?? '');
  const userData = data[selectedUser.id];

  if (!selectedUser.id) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('admin_RemoveFail')).setDescription(tr('admin_RemoveFailDesc'))],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!Object.keys(data).includes(selectedUser.id)) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#E76161')
          .setTitle(tr('admin_RemoveFail'))
          .setDescription(tr('admin_UserNotSet', { user: `<@${selectedUser.id}>` })),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!channels.includes(userData?.channelId ?? '')) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#E76161')
          .setTitle(tr('admin_RemoveFail'))
          .setDescription(
            tr('admin_RemoveFailUserOtherServer', {
              user: `<@${selectedUser.id}>`,
            }),
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  await database.delete(`${feature}.${selectedUser.id}`);

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#F6F1F1')
        .setTitle(tr('admin_RemoveSuccess'))
        .setDescription(
          tr('admin_RemoveSuccessMessage', {
            user: `<@${selectedUser.id}>`,
            channel: `<#${userData.channelId}>`,
          }),
        ),
    ],
    flags: MessageFlags.Ephemeral,
  });
};

const handleMove = async (interaction: ChatInputCommandInteraction, locale: LanguageEnum) => {
  const tr = createTranslator(locale);

  const channel = interaction.options.getChannel('channel');
  const selectedFeature = (interaction.options.getString('feature') as 'autoDaily' | 'autoRedeem' | 'all') ?? 'all';
  const clientMember = interaction.guild?.members.me;

  const channelIdSet = new Set(interaction.guild?.channels.cache.map((c) => c.id).filter(Boolean) ?? []);

  if (channel && clientMember && !clientMember.permissionsIn(channel as GuildChannelResolvable).has(PermissionsBitField.Flags.SendMessages)) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#E76161')
          .setTitle(tr('admin_MoveFail'))
          .setDescription(
            tr('admin_MoveNoPermission', {
              channel: `<#${channel.id}>`,
            }),
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if ([ChannelType.GuildText, ChannelType.PrivateThread, ChannelType.PublicThread, ChannelType.GuildVoice].includes(channel?.type ?? 0)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const moveAutoDaily = async (): Promise<number> => {
      let successCount = 0;
      const autoDailyData = (await database.get('autoDaily')) ?? {};

      const matchedUsers = Object.entries(autoDailyData)
        .filter(([, info]) => channelIdSet.has((info as any).channelId))
        .map(([userId]) => userId);

      for (const userId of matchedUsers) {
        const userAutoDailyData = autoDailyData[userId];
        if (userAutoDailyData) {
          userAutoDailyData.channelId = channel?.id ?? '';
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
          userAutoRedeemData.channelId = channel?.id ?? '';
          await database.set(`autoRedeem.${userId}`, userAutoRedeemData);
          successCount++;
        }
      }

      return successCount;
    };

    const process = async () => {
      switch (selectedFeature) {
        case 'autoDaily':
          return await moveAutoDaily();
        case 'autoRedeem':
          return await moveAutoRedeem();
        case 'all':
          return (await moveAutoDaily()) + (await moveAutoRedeem());
      }
    };

    const successCount = await process();

    if (successCount === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('admin_MoveFail')).setDescription(tr('admin_MoveNoUser'))],
        flags: MessageFlags.Ephemeral as any,
      });
    }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#F6F1F1')
          .setTitle(tr('admin_MoveSuccess'))
          .setDescription(
            tr('admin_MoveSuccessMessage', {
              count: successCount.toString(),
              channel: `<#${channel?.id}>`,
            }),
          ),
      ],
      flags: MessageFlags.Ephemeral as any,
    });
  } else {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#E76161')
          .setTitle(tr('admin_MoveFail'))
          .setDescription(tr('admin_MoveFailMessage', { channel: `<#${channel?.id}>` })),
      ],
      flags: MessageFlags.Ephemeral as any,
    });
  }
};
