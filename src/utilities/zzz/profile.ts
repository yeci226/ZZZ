import { AttachmentBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserLang, setupDefaultLang } from '@/utilities';
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
    const selectedAccountIndex = interactionOptions.getString('account') ?? '0';

    const buffer = await handleProfileDraw(userLocale, {
      userId: selectedUser.id,
      accountIndex: parseInt(selectedAccountIndex),
    });

    const image = new AttachmentBuilder(Buffer.from(buffer), {
      name: `profile_${selectedUser.id}.png`,
    });

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('profile_Success')).setDescription(tr('profile_SuccessDesc')).setImage(`attachment://${image.name}`)],
      files: [image],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('profile_Failed'), tr('profile_FailedDesc'), error.message);
  }
}
