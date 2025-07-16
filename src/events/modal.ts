import { Events, EmbedBuilder, ModalSubmitInteraction, ModalSubmitFields } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';
import { client } from '@/index.js';

import { getUserLang, getRandomColor, setupDefaultLang, discordToHoyolabLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';
import { handleLoginAccountSubmit, handleEditAccountSubmit, handleSetUIDSubmit, handleSetCookieSubmit } from '@/utilities/zzz/account';

import { handleSignalLogDraw, getSingalLog } from '@/renderers/gacha';

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionCustomId = interaction.customId;
  const interactionFields = interaction.fields;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));

  if (interactionCustomId.startsWith('accountEdit')) handleEditAccountSubmit(interaction);
  if (interactionCustomId.startsWith('account_LoginAccountModal')) handleLoginAccountSubmit(interaction);
  if (interactionCustomId.startsWith('account_SetUserIDModal')) handleSetUIDSubmit(interaction);
  if (interactionCustomId.startsWith('cookie_set')) handleSetCookieSubmit(interaction);
  if (interactionCustomId.startsWith('signal_log')) handleWarplog(interaction, userLocale, interactionFields);
});

async function handleWarplog(interaction: ModalSubmitInteraction, locale: LanguageEnum, fields: ModalSubmitFields) {}
