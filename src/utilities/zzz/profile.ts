import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserLang, getUserZZZData, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

export async function handleProfileDrawCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const selectedUser = interactionOptions.getUser('user') || interactionUser;
    const selectedAccountIndex = interactionOptions.getString('account') ?? '0';

    const imageUrl = `http://localhost:3000/profile?locale=${userLocale}&userId=${selectedUser.id}&accountIndex=${selectedAccountIndex}`;

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('profile_Success')).setDescription(tr('profile_SuccessDesc')).setImage(imageUrl)],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('profile_Failed'), tr('profile_FailedDesc'), error.message);
  }
}
