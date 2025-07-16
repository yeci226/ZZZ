import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserLang, getUserZZZData, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

import { handleDeadlyDraw } from '@/renderers/deadly';

export async function handleDeadlyDrawCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const selectedUser = interactionOptions.getUser('user') || interactionUser;
    const selectedAccountIndex = parseInt(interactionOptions.getString('account') ?? '0');
    const selectedSchedule = parseInt(interactionOptions.getString('schedule') ?? '1');
    const zzz = await getUserZZZData(userLocale, selectedUser.id, selectedAccountIndex);

    const requestStartTime = Date.now();

    if (!zzz) {
      return failedReply(interaction, tr('AccountNotFound'), tr('AccountNotFoundDesc'));
    }

    const image = await handleDeadlyDraw();

    const requestEndTime = Date.now();
    const requestTime = ((requestEndTime - requestStartTime) / 1000).toFixed(2);

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('deadly_Success')).setDescription(tr('deadly_SuccessDesc')).setImage(image)],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('deadly_Failed'), tr('deadly_FailedDesc'), error.message);
  }
}
