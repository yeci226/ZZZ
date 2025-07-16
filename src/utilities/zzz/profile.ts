import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserLang, getUserZZZData, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

import { handleProfileDraw } from '@/renderers/profile';

export async function handleProfileDrawCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const selectedUser = interactionOptions.getUser('user') || interactionUser;
    const selectedAccountIndex = parseInt(interactionOptions.getString('account') ?? '0');
    const zzz = await getUserZZZData(userLocale, selectedUser.id, selectedAccountIndex);
    const requestStartTime = Date.now();

    if (!zzz) {
      return failedReply(interaction, tr('AccountNotFound'), tr('AccountNotFoundDesc'));
    }

    const image = await handleProfileDraw();

    const requestEndTime = Date.now();
    const requestTime = ((requestEndTime - requestStartTime) / 1000).toFixed(2);

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('profile_Success')).setDescription(tr('profile_SuccessDesc')).setImage(image)],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('profile_Failed'), tr('profile_FailedDesc'), error.message);
  }
}
