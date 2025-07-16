import { Events } from 'discord.js';
import { client } from '@/index.js';

import { handleLoginAccountSubmit, handleEditAccountSubmit, handleSetUIDSubmit, handleSetCookieSubmit } from '@/utilities/zzz/account';
import { handleGachaLogSubmit } from '@/utilities/zzz/gacha';

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  const interactionCustomId = interaction.customId;
  if (interactionCustomId.startsWith('accountEdit')) handleEditAccountSubmit(interaction);
  if (interactionCustomId.startsWith('account_LoginAccountModal')) handleLoginAccountSubmit(interaction);
  if (interactionCustomId.startsWith('account_SetUserIDModal')) handleSetUIDSubmit(interaction);
  if (interactionCustomId.startsWith('cookie_set')) handleSetCookieSubmit(interaction);
  if (interactionCustomId.startsWith('signal_log')) handleGachaLogSubmit(interaction);
});
