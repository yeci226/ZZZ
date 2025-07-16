import moment from 'moment';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

import { discordToHoyolabLang, failedReply, getStaminaColor, getUserLang, getUserZZZData, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

export async function handleNoteCheckCommand(interaction: ChatInputCommandInteraction) {
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

    if (zzz == null) {
      return failedReply(interaction, tr('AccountNotFound'), tr('AccountNotFoundDesc'));
    }

    const res = await zzz.record.note();

    const embed = new EmbedBuilder()
      .setColor(getStaminaColor(res.energy.current))
      .setThumbnail(selectedUser.displayAvatarURL({ size: 4096 }))
      .setAuthor({
        name: tr('note_Title') + ' - ' + zzz.uid,
      })
      .addFields(
        {
          name: tr('note_Energy'),
          value: res.energy.current != res.energy.max ? res.energy.current + '/' + res.energy.max + ` - <t:${moment(new Date()).unix() + res.energy.restore}:R>` : tr('note_Energy_Full'),
          inline: false,
        },
        { name: '◉ ' + tr('note_Vitality'), value: res.vitality.current + '/' + res.vitality.max, inline: false },
        {
          name: '◉ ' + tr('note_Card'),
          // @ts-ignore
          value: res.card_sign == 'CardSignDone' ? tr('note_Card_Done') : tr('note_Card_NotDone'),
          inline: false,
        },
        {
          name: '◉ ' + tr('note_VHS'),
          // @ts-ignore
          value: res.vhs_sale.sale_state == 'SaleStateDoing' ? tr('note_VHS_Doing') : tr('note_VHS_NotDoing'),
          inline: false,
        },
      );

    if (res.energy.current + 20 >= res.energy.max && res.energy.current != res.energy.max) {
      embed.setTitle(tr('note_EnergyFull'));
    }

    return interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    return failedReply(interaction, tr('note_Error'), tr('note_Error_Description'), error.message);
  }
}
