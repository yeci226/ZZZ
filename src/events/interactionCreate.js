const client = require("../index");
const {
  EmbedBuilder,
  ChannelType,
  Events,
  WebhookClient,
} = require("discord.js");
const moment = require("moment-timezone");
const webhook = new WebhookClient({ url: process.env.CMDWEBHOOK });
const { i18nMixin, toI18nLang } = require("../util/i18n");
const { QuickDB } = require("quick.db");
const db = new QuickDB();

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.channel.type == ChannelType.DM) return;

  const i18n = i18nMixin(toI18nLang(interaction.locale) || "en");

  if (interaction.isButton()) {
    await interaction.deferUpdate().catch(() => {});
  }

  if (interaction.isContextMenuCommand()) {
    const cmd = client.slashCommands.get(interaction.commandName);
    if (!cmd) return interaction.followUp({ content: "An error has occurred" });
    const args = [];

    cmd.run(client, interaction, args, i18n, db);
  }

  if (interaction.isChatInputCommand()) {
    // Slash Command Handling
    const cmd = client.slashCommands.get(interaction.commandName);
    if (!cmd) return interaction.followUp({ content: "An error has occurred" });

    const args = [];

    for (let option of interaction.options.data) {
      if (option.type === "SUB_COMMAND") {
        if (option.name) args.push(option.name);
        option.options?.forEach((x) => {
          if (x.value) args.push(x.value);
        });
      } else if (option.value) args.push(option.value);
    }

    webhook.send({
      embeds: [
        new EmbedBuilder()
          .setFooter({ text: moment().tz("Asia/Taipei").format("h:mm:ss a") })
          .setAuthor({
            iconURL: interaction.user.displayAvatarURL({
              size: 4096,
              dynamic: true,
            }),
            name: `${interaction.user.username} - ${interaction.user.id}`,
          })
          .setThumbnail(
            interaction.guild.iconURL({ size: 4096, dynamic: true })
          )
          .setDescription(
            `\`\`\`${interaction.guild.name} - ${interaction.guild.id}\`\`\``
          )
          .addField(
            cmd.name,
            `${
              interaction.options._subcommand
                ? `> ${interaction.options._subcommand}`
                : "\u200b"
            }`,
            true
          ),
      ],
    });

    if (interaction.user.id) cmd.run(client, interaction, args, i18n, db);
  }
});
