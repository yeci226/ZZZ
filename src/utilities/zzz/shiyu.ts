import { AttachmentBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserLang, setupDefaultLang } from '@/utilities';
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
    const selectedAccountIndex = interactionOptions.getString('account') ?? '0';
    const selectedSchedule = interactionOptions.getString('schedule') ?? '1';

    const buffer = await handleShiyuDraw(userLocale, {
      userId: selectedUser.id,
      accountIndex: parseInt(selectedAccountIndex),
    });

    const image = new AttachmentBuilder(Buffer.from(buffer), {
      name: `shiyu_${selectedUser.id}.png`,
    });

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('shiyu_Success')).setDescription(tr('shiyu_SuccessDesc')).setImage(`attachment://${image.name}`)],
      files: [image],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('shiyu_Failed'), tr('shiyu_FailedDesc'), error.message);
  }
}
