import { ActionRowBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags, ModalBuilder, ModalSubmitInteraction, TextInputBuilder, TextInputStyle } from 'discord.js';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserLang, getUserZZZData, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

import { getSingalLog, handleSignalLogDraw } from '@/renderers/gacha';

export async function handleHowToGetGachaLogCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(tr('gacha_HowToGet'))
        .setDescription(
          tr('gacha_HowToGetDesc', {
            z: `\`\`\`powershell\nStart-Process powershell -Verb runAs -ArgumentList '-NoExit -Command "Invoke-Expression  (New-Object Net.WebClient).DownloadString(\\"https://raw.githubusercontent.com/yeci226/ZZZ-ToS-PP/main/getSignal.ps1\\")"'\n\`\`\``,
          }),
        ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleGachaDrawCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  return interaction.showModal(
    new ModalBuilder()
      .setCustomId('signal_log')
      .setTitle(tr('gacha_LogTitle'))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('signalUrl').setLabel(tr('gacha_LogDesc')).setPlaceholder('URL').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(50).setMaxLength(4000),
        ),
      ),
  );
}

export async function handleGachaLogSubmit(interaction: ModalSubmitInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionFields = interaction.fields;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const url = interactionFields.getTextInputValue('signalUrl');
    const signalResults = (await getSingalLog()) as any;
    const requestStartTime = Date.now();

    // interaction.editReply({
    //   embeds: [new EmbedBuilder().setTitle(tr('Searching')).setColor(getRandomColor()).setImage('https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif')],
    // });

    if (url === '') {
      return failedReply(interaction, tr('gacha_NoSignal'), tr('gacha_NoSignalDesc'));
    }
    if (!signalResults) {
      return failedReply(interaction, tr('gacha_NoSignal'), tr('gacha_NoSignalDesc'));
    }

    const image = await handleSignalLogDraw();

    const requestEndTime = Date.now();
    const requestTime = ((requestEndTime - requestStartTime) / 1000).toFixed(2);

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('gacha_Success')).setDescription(tr('gacha_SuccessDesc')).setImage(image)],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('gacha_Failed'), tr('gacha_FailedDesc'), error.message);
  }
}
