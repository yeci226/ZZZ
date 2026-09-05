import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
  LocalizationMap,
  Client,
} from "discord.js";
import { QuickDB } from "quick.db";
import {
  disableNotificationDestination,
  enableNotificationDestination,
} from "../../../utilities/core/notificationDestination.js";
import {
  validateNotificationChannel,
  validateNotificationChannelForUser,
} from "../../../utilities/core/notificationValidation.js";

const createEmbed = (
  title: string,
  thumbnail: string,
  color: string,
  description: string = "",
) => {
  const embed = new EmbedBuilder().setConfig(color, thumbnail).setTitle(title);
  if (description) embed.setDescription(description);

  return embed;
};

const handleRemove = async (
  interaction: ChatInputCommandInteraction,
  tr: any,
  db: QuickDB,
) => {
  const user = interaction.options.getUser("user");
  const userid = user ? user.id : interaction.options.getString("userid");
  const feature = interaction.options.getString("feature")!;
  const datas: Record<string, any> = (await db.get(feature)) || {};
  const data = Object.keys(datas);

  if (!userid) {
    return interaction.reply({
      embeds: [createEmbed(tr("admin_RemoveFail"), "sob", "#E76161")],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (user?.bot) {
    return interaction.reply({
      embeds: [
        createEmbed(
          tr("admin_RemoveFail"),
          "sob",
          "#E76161",
          "不能選擇機器人帳號。",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!data.includes(userid)) {
    return interaction.reply({
      embeds: [
        createEmbed(
          tr("admin_RemoveFail"),
          "sob",
          "#E76161",
          tr("admin_UserNotSet", { user: `<@${userid}>` }),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const userData = datas[userid];
  if (
    !interaction.guild!.channels.cache.some(
      (channel) => channel.id === userData.channelId,
    )
  ) {
    return interaction.reply({
      embeds: [
        createEmbed(
          tr("admin_RemoveFail"),
          "sob",
          "#E76161",
          tr("admin_RemoveFailUserOtherServer", {
            user: `<@${userid}>`,
          }),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  interaction.reply({
    embeds: [
      createEmbed(
        tr("admin_RemoveSuccess"),
        "wiggle",
        "#F6F1F1",
        tr("admin_RemoveSuccessMessage", {
          user: `<@${userid}>`,
          channel: `<#${userData.channelId}>`,
        }),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
  await disableNotificationDestination(
    db as any,
    feature as "autoDaily" | "autoRedeem" | "noteReminder",
    userid,
    userData,
    "missing_target",
  );
};

const fetchData = async (db: QuickDB, keywords: string[]) => {
  const [autoDailyData, autoRedeemData, noteReminderData] = await Promise.all([
    db.get("autoDaily"),
    db.get("autoRedeem"),
    db.get("noteReminder"),
  ]);

  return {
    autoDaily: autoDailyData || {},
    autoRedeem: autoRedeemData || {},
    noteReminder: noteReminderData || {},
  };
};

const findMatchedUsers = (datas: any, channelsCache: any) => {
  const serverChannelIds = channelsCache.map((channel: any) => channel.id);
  const dataKeys = Object.keys(datas);

  return [...new Set(dataKeys.reduce((acc: string[], keyword: string) => {
    const matchedUsers = Object.keys(datas[keyword] || {}).filter((userId) =>
      serverChannelIds.includes(datas[keyword][userId].channelId),
    );
    return acc.concat(matchedUsers);
  }, []))];
};

const updateUsersChannel = async (
  datas: any,
  matchUsers: string[],
  keywords: string[],
  channelId: string,
  guildId: string,
  db: QuickDB,
) => {
  for (const userId of matchUsers) {
    for (const keyword of keywords) {
      const userData = datas[keyword as keyof typeof datas]?.[userId];
      if (userData) {
        const next = enableNotificationDestination(userData, {
          notifyType: "channel",
          channelId,
          guildId,
        });
        await db.set(`${keyword}.${userId}`, next);
      }
    }
  }
};

const handleMove = async (
  interaction: ChatInputCommandInteraction,
  tr: any,
  db: QuickDB,
) => {
  const channel = interaction.options.getChannel("channel")!;
  const feature = interaction.options.getString("feature");
  const validation = validateNotificationChannel(interaction, channel as any);
  if (!validation.ok) {
    return interaction.reply({
      embeds: [
        createEmbed(
          tr("admin_MoveFail"),
          "sob",
          "#E76161",
          tr("admin_MoveNoPermission", {
            channel: `<#${channel.id}>`,
          }),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const keywords =
      feature === "all"
        ? ["autoDaily", "autoRedeem", "noteReminder"]
        : [feature!];
    const datas = await fetchData(db, keywords);

    const matchUsers = findMatchedUsers(
      datas,
      interaction.guild!.channels.cache,
    );

    if (matchUsers.length === 0) {
      return interaction.editReply({
        embeds: [
          createEmbed(
            tr("admin_MoveFail"),
            "sob",
            "#E76161",
            tr("admin_MoveNoUser"),
          ),
        ],
      });
    }

    const eligible: string[] = [];
    const inaccessible: string[] = [];
    let removedMembers = 0;
    for (const userId of matchUsers) {
      const member = await interaction.guild!.members.fetch(userId).catch(() => null);
      if (!member || member.user.bot) {
        for (const keyword of keywords) {
          const config = datas[keyword as keyof typeof datas]?.[userId];
          if (config) {
            await disableNotificationDestination(
              db as any,
              keyword as "autoDaily" | "autoRedeem" | "noteReminder",
              userId,
              config,
              member?.user.bot ? "missing_target" : "unknown_member",
            );
          }
        }
        removedMembers++;
        continue;
      }
      const targetValidation = validateNotificationChannelForUser(
        channel as any,
        member,
        interaction.guild!.members.me!,
      );
      if (targetValidation.ok) eligible.push(userId);
      else inaccessible.push(userId);
    }

    if (!eligible.length) {
      const detail = inaccessible.length
        ? `目標使用者無法查看或發送訊息至 <#${channel.id}>。`
        : "沒有可移動的有效通知設定。";
      return interaction.editReply({
        embeds: [createEmbed(tr("admin_MoveFail"), "sob", "#E76161", detail)],
      });
    }

    await updateUsersChannel(
      datas,
      eligible,
      keywords,
      channel.id,
      interaction.guildId!,
      db,
    );

    interaction.editReply({
      embeds: [
        createEmbed(
          tr("admin_MoveSuccess"),
          "wiggle",
          "#F6F1F1",
        tr("admin_MoveSuccessMessage", {
            count: eligible.length,
            channel: `<#${channel.id}>`,
          }) + (inaccessible.length || removedMembers
            ? `\n未移動 ${inaccessible.length} 位無權限使用者；停用 ${removedMembers} 位已離開或無效的使用者。`
            : ""),
        ),
      ],
    });
  }
};

export default {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Server administrator settings")
    .setNameLocalizations({
      "zh-TW": "管理員",
      vi: "quảntrịviên",
      fr: "administrateur",
    } as LocalizationMap)
    .setDescriptionLocalizations({
      "zh-TW": "伺服器管理員的設定",
      vi: "Cài đặt admin máy chủ",
      fr: "Paramètre de l'administrateur",
    } as LocalizationMap)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription(
          "Remove notifications from a user's messages in a channel",
        )
        .setNameLocalizations({
          "zh-TW": "刪除",
          vi: "tuỳchọn",
          fr: "supprimer",
        } as LocalizationMap)
        .setDescriptionLocalizations({
          "zh-TW": "刪除使用者在頻道中的訊息通知",
          vi: "Xoá thông báo tin nhắn của người dùng (Ping) khỏi kênh",
          fr: "Désactiver la notification des utilisateurs dans ce canal",
        } as LocalizationMap)
        .addStringOption((option) =>
          option
            .setName("feature")
            .setDescription("Select the features you want to remove user from")
            .setNameLocalizations({
              "zh-TW": "功能",
              vi: "chứcnăng",
              fr: "fonctionnalité",
            } as LocalizationMap)
            .setDescriptionLocalizations({
              "zh-TW": "選擇要刪除使用者的功能",
              vi: "Tuỳ chọn xoá chức năng người dùng",
              fr: "Sélectionnez la fonction à supprimer",
            } as LocalizationMap)
            .setRequired(true)
            .addChoices(
              {
                name: "autodaily",
                name_localizations: {
                  "zh-TW": "自動簽到",
                  vi: "Điểm danh tự động",
                  fr: "Signé automatique",
                },
                value: "autoDaily",
              },
              {
                name: "autoredeem",
                name_localizations: {
                  "zh-TW": "自動兌換",
                  vi: "Đổi code tự động",
                  fr: "Racheté automatique",
                },
                value: "autoRedeem",
              },
              {
                name: "note reminder",
                name_localizations: { "zh-TW": "即時便箋提醒" },
                value: "noteReminder",
              },
            ),
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Select user to remove")
            .setNameLocalizations({
              "zh-TW": "使用者",
              vi: "ngườidùng",
              fr: "utilisateur",
            } as LocalizationMap)
            .setDescriptionLocalizations({
              "zh-TW": "選擇要刪除的使用者",
              vi: "Tuỳ chọn xoá người dùng",
              fr: "Sélectionnez l'utilisateur à supprimer",
            } as LocalizationMap)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("userid")
            .setDescription("Enter the user ID you want to delete")
            .setNameLocalizations({
              "zh-TW": "使用者id",
              vi: "idngườidùng",
              fr: "iddelutilisateur",
            } as LocalizationMap)
            .setDescriptionLocalizations({
              "zh-TW": "輸入要刪除的使用者ID",
              vi: "Nhập ID người dùng bạn muốn xoá",
              fr: "Entrez l'ID de l'utilisateur à supprimer",
            } as LocalizationMap)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("move")
        .setDescription("Change the channel for message notifications")
        .setNameLocalizations({
          "zh-TW": "移動",
          vi: "dichuyển",
          fr: "transfert",
        } as LocalizationMap)
        .setDescriptionLocalizations({
          "zh-TW": "更改訊息通知的頻道",
          vi: "Đổi kênh nhận thông báo tin nhắn",
          fr: "Modifier le canal pour les notifications de message",
        } as LocalizationMap)
        .addStringOption((option) =>
          option
            .setName("feature")
            .setDescription("Select features to move")
            .setNameLocalizations({
              "zh-TW": "功能",
              vi: "chứcnăng",
              fr: "fonction",
            } as LocalizationMap)
            .setDescriptionLocalizations({
              "zh-TW": "選擇移動的功能",
              vi: "Tuỳ chọn chức năng di chuyển",
              fr: "Sélectionnez la fonction de transfert",
            } as LocalizationMap)
            .setRequired(true)
            .addChoices(
              {
                name: "all",
                name_localizations: {
                  "zh-TW": "全部",
                  vi: "Tất cả",
                  fr: "Tout",
                },
                value: "all",
              },
              {
                name: "autodaily",
                name_localizations: {
                  "zh-TW": "自動簽到",
                  vi: "Điểm danh tự động",
                  fr: "Signé automatique",
                },
                value: "autoDaily",
              },
              {
                name: "autoredeem",
                name_localizations: {
                  "zh-TW": "自動兌換",
                  vi: "Đổi code tự động",
                  fr: "Racheté automatique",
                },
                value: "autoRedeem",
              },
              {
                name: "note reminder",
                name_localizations: { "zh-TW": "即時便箋提醒" },
                value: "noteReminder",
              },
            ),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Select channel to remove")
            .setNameLocalizations({
              "zh-TW": "頻道",
              vi: "kênh",
              fr: "canal",
            } as LocalizationMap)
            .setDescriptionLocalizations({
              "zh-TW": "選擇要移動至哪個頻道",
              vi: "Chọn kênh sẽ chuyển đến",
              fr: "Choisissez le canal à déplacer",
            } as LocalizationMap)
            .setRequired(true),
        ),
    ),

  async execute(
    client: Client,
    interaction: ChatInputCommandInteraction,
    args: any[],
    tr: any,
    db: QuickDB,
    emoji: any,
  ) {
    if (
      !interaction.member ||
      !(interaction.member.permissions as Readonly<PermissionsBitField>).has(
        PermissionsBitField.Flags.ManageGuild,
      )
    ) {
      return interaction.reply({
        embeds: [createEmbed(tr("admin_NoPermission"), "sob", "#E76161")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const cmd = interaction.options.getSubcommand();
    switch (cmd) {
      case "remove":
        await handleRemove(interaction, tr, db);
        break;
      case "move":
        await handleMove(interaction, tr, db);
        break;
    }
  },
};
