import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserLang, getUserZZZData, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

import { handleShiyuDraw } from '@/renderers/shiyu';

export async function handleShiyuDrawCommand(interaction: ChatInputCommandInteraction) {
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

    const image = await handleShiyuDraw();

    const requestEndTime = Date.now();
    const requestTime = ((requestEndTime - requestStartTime) / 1000).toFixed(2);

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('shiyu_Success')).setDescription(tr('shiyu_SuccessDesc')).setImage(image)],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('shiyu_Failed'), tr('shiyu_FailedDesc'), error.message);
  }
}
