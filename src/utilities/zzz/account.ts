import { EmbedBuilder, MessageFlags, ModalSubmitFields, ModalSubmitInteraction } from 'discord.js';
import { LanguageEnum, ZenlessZoneZero } from '@yeci226/hoyoapi';
import { database } from '@/index';

import { loginToHoyolab } from '@/services/api.service';

import { failedReply, getUserGameUid, getUserHoyolabData } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

import { Account } from '@/types';

export async function handleAccountLogin(interaction: ModalSubmitInteraction, locale: LanguageEnum, fields: ModalSubmitFields) {
  const tr = createTranslator(locale);
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    const interactionUser = interaction.user;
    const email = fields.getTextInputValue('account_LoginAccountModalField');
    const password = fields.getTextInputValue('account_LoginAccountModalField2');
    const userAccounts = (await database.get(`${interactionUser.id}.account`)) || [];

    const cookie = await loginToHoyolab(email, password);

    // Check if email is correct
    if (!emailRegex.test(email)) {
      return failedReply(interaction, tr('account_LoginFailed'), tr('account_LoginFailedDesc'));
    }
    if (userAccounts.length >= 5) {
      return failedReply(interaction, tr('account_LimitExceeded'));
    }
    if (!cookie) {
      return failedReply(interaction, tr('account_LoginFailed'), tr('account_LoginFailedDesc'));
    }

    const { uid, nickname } = await getUserGameUid(cookie);

    const account: Account = { uid, cookie, nickname };

    await database.delete(`${uid}.cookieExpired`);
    await database.set(`${uid}.account`, account);

    if (userAccounts.some((userAccount: Account) => userAccount.uid == uid)) {
      userAccounts.map(async (userAccount: Account) => {
        if (userAccount.uid == uid) {
          userAccount.cookie = cookie;
          userAccount.nickname = nickname;

          await database.set(`${interactionUser.id}.account`, userAccounts);
        }
      });
    } else {
      await database.push(`${interactionUser.id}.account`, account);
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor('#F6F1F1').setTitle(tr('account_LoginSuccess', { z: `${uid}` }))],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('account_LoginFailed'), tr('account_LoginFailedDesc'), error.message);
  }
}

export async function handleAccountEdit(interaction: ModalSubmitInteraction, locale: LanguageEnum, customId: string, fields: ModalSubmitFields) {
  const tr = createTranslator(locale);
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const interactionUser = interaction.user;
    const accountIndex = parseInt(customId.split('-')[1]);
    const uid = parseInt(fields.getTextInputValue('uid'));
    const userAccounts = (await database.get(`${interactionUser.id}.account`)) ?? '';

    if (userAccounts.some((account: Account) => account.uid === uid)) {
      return failedReply(interaction, tr('account_AlreadySet', { z: `${uid}` }));
    }

    userAccounts[accountIndex].uid = uid;

    await database.set(`${interactionUser.id}.account`, userAccounts);

    interaction.editReply({
      embeds: [new EmbedBuilder().setColor('#F6F1F1').setTitle(tr('account_UidSetSuccess', { z: `${uid}` }))],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('account_UidSetFailed'), tr('account_UidSetFailedDesc'), error.message);
  }
}

export async function handleUidSet(interaction: ModalSubmitInteraction, locale: LanguageEnum, fields: ModalSubmitFields) {
  const tr = createTranslator(locale);
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const interactionUser = interaction.user;
    const uid = parseInt(fields.getTextInputValue('account_SetUserIDModalField'));

    const userAccounts = (await database.get(`${interactionUser.id}.account`)) || [];

    if (userAccounts.length >= 5) {
      return failedReply(interaction, tr('account_LimitExceeded'));
    }
    if (userAccounts.some((account: Account) => account.uid == uid)) {
      return failedReply(interaction, tr('account_AlreadySet', { z: `${uid}` }));
    }

    const account: Account = { uid, cookie: '', nickname: '' };

    await database.push(`${interactionUser.id}.account`, account);

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor('#F6F1F1').setTitle(`${tr('account_UidSetSuccess', { z: `${uid}` })}`)],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('account_UidSetFailed'), tr('account_UidSetFailedDesc'), error.message);
  }
}

export async function handleCookieSet(interaction: ModalSubmitInteraction, locale: LanguageEnum, customId: string, fields: ModalSubmitFields) {
  const tr = createTranslator(locale);

  try {
    const interactionUser = interaction.user;
    const accountIndex = parseInt(customId.split('-')[1]);
    const ltoken = fields.getTextInputValue('ltoken') ?? '';
    const ltuid = fields.getTextInputValue('ltuid') ?? '';
    const cookieToken = fields.getTextInputValue('cookieToken') ?? '';
    const accountMid = fields.getTextInputValue('accountMid') ?? '';
    const userAccounts = (await database.get(`${interactionUser.id}.account`)) ?? '';
    const cookie = `ltoken_v2=${ltoken}; ltuid_v2=${ltuid}; cookie_token_v2=${cookieToken}; account_mid_v2=${accountMid};`;

    const zzz = new ZenlessZoneZero({ cookie: cookie });
    await zzz.daily.info();

    userAccounts[accountIndex].cookie = cookie;
    await database.set(`${interactionUser.id}.account`, userAccounts);

    const hoyolabData = await getUserHoyolabData(interaction, locale, interactionUser.id, accountIndex);
    await database.delete(`${userAccounts[accountIndex].uid}.cookieExpired`);

    userAccounts[accountIndex].nickname = hoyolabData.nickname;
    await database.set(`${interactionUser.id}.account`, userAccounts);

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#F6F1F1').setTitle(tr('account_CookieSetSuccess', { z: `${userAccounts[accountIndex].uid}` }))],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error: any) {
    return failedReply(interaction, tr('account_CookieSetFailed'), tr('account_CookieSetFailedDesc'), error.message);
  }
}
