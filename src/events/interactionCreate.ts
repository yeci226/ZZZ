import { client } from "../index.js";
import { ApplicationCommandOptionType } from "discord.js";
import { createTranslator, toI18nLang } from "../utilities/core/i18n.js";
import {
  Events,
  EmbedBuilder,
  WebhookClient,
  ChannelType,
  MessageFlags,
  BaseInteraction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ContextMenuCommandInteraction,
} from "discord.js";
import emoji from "../assets/emoji.js";
import Logger from "../utilities/core/logger.js";
import { getUserLang, setupDefaultLang } from "../utilities/utilities.js";

// Use client.db directly
import { getConfig } from "../utilities/core/config.js";
const config = getConfig();
const webhook = config.CMDWEBHOOK
  ? new WebhookClient({ url: config.CMDWEBHOOK })
  : null;

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
  if (!interaction.channel || interaction.channel.type == ChannelType.DM)
    return;

  if (!(await getUserLang(interaction.user.id)))
    await setupDefaultLang(interaction.user.id, interaction.locale);

  const userLocale =
    (await getUserLang(interaction.user.id)) ||
    toI18nLang(interaction.locale) ||
    "en";
  const i18n = createTranslator(userLocale);

  if (interaction.isButton()) {
    const buttonInteraction = interaction as ButtonInteraction;
    await buttonInteraction.deferUpdate().catch(() => {});
  }

  if (interaction.isCommand()) {
    const command = client.commands.slash.get(interaction.commandName);
    if (!command)
      return interaction.followUp({
        content: "An error has occured",
        flags: MessageFlags.Ephemeral,
      });

    const args = [];

    for (let option of (interaction as ChatInputCommandInteraction).options
      .data) {
      if (option.type === ApplicationCommandOptionType.Subcommand) {
        if (option.name) args.push(option.name);
        option.options?.forEach((x: any) => {
          if (x.value) args.push(x.value);
        });
      } else if (option.value) args.push(option.value);
    }

    try {
      const chatInteraction = interaction as ChatInputCommandInteraction;
      (command as any).execute(
        client,
        chatInteraction,
        args,
        i18n,
        client.db,
        emoji,
      );
      const time = `花費 ${(
        (Date.now() - interaction.createdTimestamp) /
        1000
      ).toFixed(2)} 秒`;

      new Logger("指令").command(
        `${interaction.user.displayName}(${interaction.user.id}) 執行 ${command.data.name} - ${time}`,
      );
      if (webhook) {
        webhook.send({
          embeds: [
            new EmbedBuilder()
              .setTimestamp()
              .setAuthor({
                iconURL: interaction.user.displayAvatarURL({
                  size: 4096,
                }),
                name: `${interaction.user.username} - ${interaction.user.id}`,
              })
              .setThumbnail(
                interaction.guild?.iconURL({
                  size: 4096,
                }) || null,
              )
              .setDescription(
                `\`\`\`${interaction.guild?.name} - ${interaction.guild?.id}\`\`\``,
              )
              .addField(
                command.data.name,
                `${
                  (
                    interaction as ChatInputCommandInteraction
                  ).options.getSubcommand(false)
                    ? `> ${(interaction as ChatInputCommandInteraction).options.getSubcommand(false)}`
                    : "\u200b"
                }`,
                true,
              ),
          ],
        });
      }
    } catch (e: any) {
      new Logger("指令").error(`錯誤訊息：${e.message}`);
      await interaction.reply({
        content: "哦喲，好像出了一點小問題，請重試",
        flags: MessageFlags.Ephemeral,
      });
    }
  } else if (interaction.isContextMenuCommand()) {
    const command = client.commands.slash.get(interaction.commandName);
    if (!command) return;
    try {
      (command as any).execute(
        client,
        interaction as ContextMenuCommandInteraction,
      );
    } catch (e: any) {
      new Logger("指令").error(`錯誤訊息：${e.message}`);
      await interaction.reply({
        content: "哦喲，好像出了一點小問題，請重試",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});
