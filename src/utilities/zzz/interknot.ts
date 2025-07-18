import { AttachmentBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

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

    const buffer = await handleInterknotDraw(userLocale, {
      userId: interactionUser.id,
      accountIndex: 0,
    });

    const image = new AttachmentBuilder(Buffer.from(buffer), {
      name: `interknot_${interactionUser.id}.png`,
    });

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('interknot_Success')).setDescription(tr('interknot_SuccessDesc')).setImage(`attachment://${image.name}`)],
      files: [image],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('interknot_Failed'), tr('interknot_FailedDesc'), error.message);
  }
}
