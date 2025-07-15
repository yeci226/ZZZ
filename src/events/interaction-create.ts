import { ApplicationCommandOptionType, ChannelType, EmbedBuilder, Events, MessageFlags, WebhookClient, Interaction } from 'discord.js';
import { client, commands, database } from '@/index';

import { getUserLang, setupDefaultLang } from '@/utilities';
import { createTranslator, toI18nLang } from '@/utilities/core/i18n';
import Logger from '@/utilities/core/logger';

import emoji from '@/assets/emoji';

const webhook = process.env.CMDWEBHOOK ? new WebhookClient({ url: process.env.CMDWEBHOOK }) : null;

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.channel?.type == ChannelType.DM) return;

  if (!(await getUserLang(interaction.user.id))) await setupDefaultLang(interaction.user.id, interaction.locale);

  const userLocale = (await getUserLang(interaction.user.id)) || toI18nLang(interaction.locale) || 'en';
  const i18n = createTranslator(userLocale);

  if (interaction.isButton()) {
    await interaction.deferUpdate().catch(() => {});
  }

  if (interaction.isCommand()) {
    const command = commands.slash.get(interaction.commandName);
    if (!command)
      return interaction.followUp({
        content: 'An error has occured',
        flags: MessageFlags.Ephemeral,
      });

    const args = [];

    for (let option of interaction.options.data) {
      if (option.type === ApplicationCommandOptionType.Subcommand) {
        if (option.name) args.push(option.name);
        option.options?.forEach((x) => {
          if (x.value) args.push(x.value);
        });
      } else if (option.value) args.push(option.value);
    }

    try {
      command.execute(client, interaction, args, i18n, database, emoji);
      const time = `花費 ${((Date.now() - interaction.createdTimestamp) / 1000).toFixed(2)} 秒`;

      new Logger('指令').command(`${interaction.user.displayName}(${interaction.user.id}) 執行 ${command.data.name} - ${time}`);
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
              .setThumbnail(interaction.guild?.iconURL() ?? null)
              .setDescription(`\`\`\`${interaction.guild?.name} - ${interaction.guild?.id}\`\`\``),
            // .addFields(
            //   command.data.name,
            //   `${
            //     interaction.getSubcommandGroup()
            //       ? `> ${interaction.getSubcommandGroup()}`
            //       : '\u200b'
            //   }`,
            //   true,
            // ),
          ],
        });
      }
    } catch (e: any) {
      new Logger('指令').error(`錯誤訊息：${e.message}`);
      await interaction.reply({
        content: '哦喲，好像出了一點小問題，請重試',
        flags: MessageFlags.Ephemeral,
      });
    }
  } else if (interaction.isContextMenuCommand()) {
    const command = commands.slash.get(interaction.commandName);
    if (!command) return;
    try {
      command.execute(client, interaction);
    } catch (e: any) {
      new Logger('指令').error(`錯誤訊息：${e.message}`);
      await interaction.reply({
        content: '哦喲，好像出了一點小問題，請重試',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});
