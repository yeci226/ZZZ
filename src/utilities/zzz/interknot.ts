import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserLang, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

export async function handleInterknotDrawCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const imageUrl = `http://localhost:3000/interknot?locale=${userLocale}&userId=${interactionUser.id}&accountIndex=0`;

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('interknot_Success')).setDescription(tr('interknot_SuccessDesc')).setImage(imageUrl)],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('interknot_Failed'), tr('interknot_FailedDesc'), error.message);
  }
}
