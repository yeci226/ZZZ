import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserLang, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

import { handleInterknotDraw } from '@/renderers/interknot';

export async function handleInterknotDrawCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const requestStartTime = Date.now();

    const image = await handleInterknotDraw();

    const requestEndTime = Date.now();
    const requestTime = ((requestEndTime - requestStartTime) / 1000).toFixed(2);

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('interknot_Success')).setDescription(tr('interknot_SuccessDesc')).setImage(image)],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('interknot_Failed'), tr('interknot_FailedDesc'), error.message);
  }
}
