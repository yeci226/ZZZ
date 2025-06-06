import {
  CommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
  MessageFlags,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Server administrator settings")
    .setNameLocalizations({
      "zh-TW": "管理員",
      vi: "quảntrịviên",
      fr: "administrateur",
    })
    .setDescriptionLocalizations({
      "zh-TW": "伺服器管理員的設定",
      vi: "Cài đặt admin máy chủ",
      fr: "Paramètre de l'administrateur",
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription(
          "Remove notifications from a user's messages in a channel"
        )
        .setNameLocalizations({
          "zh-TW": "刪除",
          vi: "tuỳchọn",
          fr: "supprimer",
        })
        .setDescriptionLocalizations({
          "zh-TW": "刪除使用者在頻道中的訊息通知",
          vi: "Xoá thông báo tin nhắn của người dùng (Ping) khỏi kênh",
          fr: "Désactiver la notification des utilisateurs dans ce canal",
        })
        .addStringOption((option) =>
          option
            .setName("feature")
            .setDescription("Select the features you want to remove user from")
            .setNameLocalizations({
              "zh-TW": "功能",
              vi: "chứcnăng",
              fr: "fonctionnalité",
            })
            .setDescriptionLocalizations({
              "zh-TW": "選擇要刪除使用者的功能",
              vi: "Tuỳ chọn xoá chức năng người dùng",
              fr: "Sélectionnez la fonction à supprimer",
            })
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
              }
            )
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Select user to remove")
            .setNameLocalizations({
              "zh-TW": "使用者",
              vi: "ngườidùng",
              fr: "utilisateur",
            })
            .setDescriptionLocalizations({
              "zh-TW": "選擇要刪除的使用者",
              vi: "Tuỳ chọn xoá người dùng",
              fr: "Sélectionnez l'utilisateur à supprimer",
            })
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("userid")
            .setDescription("Enter the user ID you want to delete")
            .setNameLocalizations({
              "zh-TW": "使用者id",
              vi: "idngườidùng",
              fr: "iddelutilisateur",
            })
            .setDescriptionLocalizations({
              "zh-TW": "輸入要刪除的使用者ID",
              vi: "Nhập ID người dùng bạn muốn xoá",
              fr: "Entrez l'ID de l'utilisateur à supprimer",
            })
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("move")
        .setDescription("Change the channel for message notifications")
        .setNameLocalizations({
          "zh-TW": "移動",
          vi: "dichuyển",
          fr: "transfert",
        })
        .setDescriptionLocalizations({
          "zh-TW": "更改訊息通知的頻道",
          vi: "Đổi kênh nhận thông báo tin nhắn",
          fr: "Modifier le canal pour les notifications de message",
        })
        .addStringOption((option) =>
          option
            .setName("feature")
            .setDescription("Select features to move")
            .setNameLocalizations({
              "zh-TW": "功能",
              vi: "chứcnăng",
              fr: "fonction",
            })
            .setDescriptionLocalizations({
              "zh-TW": "選擇移動的功能",
              vi: "Tuỳ chọn chức năng di chuyển",
              fr: "Sélectionnez la fonction de transfert",
            })
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
              }
            )
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Select channel to remove")
            .setNameLocalizations({
              "zh-TW": "頻道",
              vi: "kênh",
              fr: "canal",
            })
            .setDescriptionLocalizations({
              "zh-TW": "選擇要移動至哪個頻道",
              vi: "Chọn kênh sẽ chuyển đến",
              fr: "Choisissez le canal à déplacer",
            })
            .setRequired(true)
        )
    ),

  /**
   *
   * @param {Client} client
   * @param {CommandInteraction} interaction
   * @param {String[]} args
   */
  async execute(client, interaction, args, tr, db, emoji) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
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

const createEmbed = (title, thumbnail, color, description = "") => {
  const embed = new EmbedBuilder().setConfig(color, thumbnail).setTitle(title);
  if (description) embed.setDescription(description);

  return embed;
};

const handleRemove = async (interaction, tr, db) => {
  const user = interaction.options.getUser("user");
  const userid = user ? user.id : interaction.options.getString("userid");
  const feature = interaction.options.getString("feature");
  const datas = await db.get(feature);
  const data = Object.keys(datas);

  if (!userid) {
    return interaction.reply({
      embeds: [createEmbed(tr("admin_RemoveFail"), "sob", "#E76161")],
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
          tr("admin_UserNotSet", { user: `<@${userid}>` })
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const userData = datas[userid];
  if (
    !interaction.guild.channels.cache.some(
      (channel) => channel.id === userData.channelId
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
          })
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
        })
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
  await db.delete(`${feature}.${userid}`);
};

const handleMove = async (interaction, tr, db) => {
  const channel = interaction.options.getChannel("channel");
  const feature = interaction.options.getString("feature");

  if (
    !interaction.guild.members.me
      .permissionsIn(channel)
      .has(PermissionsBitField.Flags.SendMessages)
  ) {
    return interaction.reply({
      embeds: [
        createEmbed(
          tr("admin_MoveFail"),
          "sob",
          "#E76161",
          tr("admin_MoveNoPermission", {
            channel: `<#${channel.id}>`,
          })
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (
    [
      ChannelType.GuildText,
      ChannelType.PrivateThread,
      ChannelType.PublicThread,
      ChannelType.GuildVoice,
    ].includes(channel.type)
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const keywords =
      feature === "all" ? ["autoDaily", "autoRedeem"] : [feature];
    const datas = await fetchData(db, keywords);

    const matchUsers = findMatchedUsers(
      datas,
      interaction.guild.channels.cache
    );

    if (matchUsers.length === 0) {
      return interaction.editReply({
        embeds: [
          createEmbed(
            tr("admin_MoveFail"),
            "sob",
            "#E76161",
            tr("admin_MoveNoUser")
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await updateUsersChannel(datas, matchUsers, keywords, channel.id, db);

    interaction.editReply({
      embeds: [
        createEmbed(
          tr("admin_MoveSuccess"),
          "wiggle",
          "#F6F1F1",
          tr("admin_MoveSuccessMessage", {
            count: matchUsers.length,
            channel: `<#${channel.id}>`,
          })
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  } else {
    return interaction.reply({
      embeds: [
        createEmbed(
          tr("admin_MoveFail"),
          "sob",
          "#E76161",
          tr("admin_MoveFailMessage", { channel: `<#${channel.id}>` })
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
};

const fetchData = async (db, keywords) => {
  const [autoDailyData, autoRedeemData] = await Promise.all([
    db.get("autoDaily"),
    db.get("autoRedeem"),
  ]);

  return {
    autoDaily: autoDailyData,
    autoRedeem: autoRedeemData,
  };
};

const findMatchedUsers = (datas, channelsCache) => {
  const serverChannelIds = channelsCache.map((channel) => channel.id);

  return Object.keys(datas).reduce((acc, keyword) => {
    const matchedUsers = Object.keys(datas[keyword]).filter((userId) =>
      serverChannelIds.includes(datas[keyword][userId].channelId)
    );
    return acc.concat(matchedUsers);
  }, []);
};

const updateUsersChannel = async (
  datas,
  matchUsers,
  keywords,
  channelId,
  db
) => {
  for (const userId of matchUsers) {
    for (const keyword of keywords) {
      const userData = datas[keyword][userId];
      if (userData) {
        userData.channelId = channelId;
        await db.set(`${keyword}.${userId}`, userData);
      }
    }
  }
};
