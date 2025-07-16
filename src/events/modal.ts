import { Events, EmbedBuilder, ModalSubmitInteraction, ModalSubmitFields } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';
import { client } from '@/index.js';

import { getUserLang, getRandomColor, setupDefaultLang, discordToHoyolabLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';
import { handleAccountLogin, handleAccountEdit, handleUidSet, handleCookieSet } from '@/utilities/zzz/account';

import { handleSignalLogDraw, getSingalLog } from '@/renderers/gacha';

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionCustomId = interaction.customId;
  const interactionFields = interaction.fields;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));

  if (interactionCustomId.startsWith('accountEdit')) handleAccountEdit(interaction, userLocale, interactionCustomId, interactionFields);
  if (interactionCustomId.startsWith('account_LoginAccountModal')) handleAccountLogin(interaction, userLocale, interactionFields);
  if (interactionCustomId.startsWith('account_SetUserIDModal')) handleUidSet(interaction, userLocale, interactionFields);
  if (interactionCustomId.startsWith('cookie_set')) handleCookieSet(interaction, userLocale, interactionCustomId, interactionFields);
  if (interactionCustomId.startsWith('signal_log')) handleWarplog(interaction, userLocale, interactionFields);
});

async function handleWarplog(interaction: ModalSubmitInteraction, locale: LanguageEnum, fields: ModalSubmitFields) {
  await interaction.deferReply();
  const tr = createTranslator(locale);

  const url = fields.getTextInputValue('signalUrl');

  interaction.editReply({
    embeds: [new EmbedBuilder().setTitle(tr('Searching')).setColor(getRandomColor()).setImage('https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif')],
  });

  const requestStartTime = Date.now();
  let signalResults;
  if (url != '') signalResults = (await getSingalLog()) as any;

  if (!signalResults)
    return interaction.editReply({
      embeds: [new EmbedBuilder().setTitle(tr('gacha_NoSignal')).setColor('#E76161')],
    });

  const requestEndTime = Date.now();
  const requestTime = ((requestEndTime - requestStartTime) / 1000).toFixed(2);

  return handleSignalLogDraw();
  // handleSignalLogDraw(interaction, tr, userLocale, "character", url);
}
