import { Events, EmbedBuilder, MessageFlags, ModalSubmitInteraction, ModalSubmitFields, ColorResolvable } from 'discord.js';
import { LanguageEnum, ZenlessZoneZero } from '@yeci226/hoyoapi';
import { client, database } from '@/index.js';

import { getUserHoyolabData, getUserLang, getRandomColor, setupDefaultLang, discordToHoyolabLang } from '@/utilities';
import { createTranslator, toI18nLang } from '@/utilities/core/i18n';
import loginAccount from '@/utilities/zzz/login';

import { handleSignalLogDraw, getSingalLog } from '@/renderers/gacha';

import { Account } from '@/types';

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionCustomId = interaction.customId;
  const interactionFields = interaction.fields;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));

  if (interactionCustomId.startsWith('accountEdit')) handleAccountEdit(interaction, userLocale, interactionCustomId, interactionFields);
  if (interactionCustomId == 'account_LoginAccountModal') handleAccountLogin(interaction, userLocale, interactionFields);
  if (interactionCustomId == 'account_SetUserIDModal') handleUidSet(interaction, userLocale, interactionFields);
  if (interactionCustomId.startsWith('cookie_set')) handleCookieSet(interaction, userLocale, interactionCustomId, interactionFields);
  if (interactionCustomId == 'signal_log') handleWarplog(interaction, userLocale, interactionFields);
});

async function handleAccountLogin(interaction: ModalSubmitInteraction, locale: LanguageEnum, fields: ModalSubmitFields) {
  const tr = createTranslator(locale);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const interactionUser = interaction.user;
  const email = fields.getTextInputValue('account_LoginAccountModalField');
  const password = fields.getTextInputValue('account_LoginAccountModalField2');

  try {
    // Make sure Email is correct
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailRegex.test(email)) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setTitle(tr('account_LoginFailed')).setDescription(tr('account_LoginFailedDesc')).setColor('#E76161')],
      });
    }

    const existedAccounts = (await database.get(`${interactionUser.id}.account`)) || [];
    if (existedAccounts.length >= 5) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setTitle(tr('account_LimitExceeded')).setColor('#E76161')],
      });
    }

    const loginData = await loginAccount(email, password);
    if (!loginData) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setTitle(tr('account_LoginFailed')).setDescription(tr('account_LoginFailedDesc')).setColor('#E76161')],
      });
    }

    const { uid, nickname, cookie } = loginData;

    await database.delete(`${uid}.cookieExpired`);

    if (existedAccounts.some((account: Account) => account.uid == uid)) {
      existedAccounts.map(async (account: Account) => {
        if (account.uid == uid) {
          account.cookie = cookie;
          account.nickname = nickname;

          await database.set(`${interactionUser.id}.account`, existedAccounts);
        }
      });
    } else {
      await database.push(`${interactionUser.id}.account`, {
        uid: uid,
        cookie: cookie,
        nickname: nickname,
      });
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor('#F6F1F1').setTitle(tr('account_LoginSuccess'))],
    });
  } catch (error: any) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(tr('account_LoginFailed'))
          .setDescription(`${tr('account_LoginFailedDesc')}\n${error.message}`)
          .setColor('#E76161'),
      ],
    });
  }
}

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

async function handleAccountEdit(interaction: ModalSubmitInteraction, locale: LanguageEnum, customId: string, fields: ModalSubmitFields) {
  const tr = createTranslator(locale);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const interactionUser = interaction.user;
  const accountIndex = parseInt(customId.split('-')[1]);
  const uid = parseInt(fields.getTextInputValue('uid'));
  const accounts = (await database.get(`${interactionUser.id}.account`)) ?? '';

  // const data = await requestPlayerData(uid, interaction);
  // if (!data.playerData?.player.uid)
  // 	return interaction.editReply({
  // 		embeds: [
  // 			new EmbedBuilder()
  //        .setConfig("#E76161", "sob")
  // 				.setTitle(tr("profile_UidNotFound") + " - " + uid)
  // 		]
  // 	});

  if (accounts.some((account: Account) => account.uid === uid))
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('account_AlreadySet', { z: `${uid}` }))],
    });

  accounts[accountIndex].uid = uid;

  await database.set(`${interactionUser.id}.account`, accounts);

  interaction.editReply({
    embeds: [new EmbedBuilder().setColor('#F6F1F1').setTitle(tr('account_UidSetSuccess', { z: `${uid}` }))],
  });
}

async function handleUidSet(interaction: ModalSubmitInteraction, locale: LanguageEnum, fields: ModalSubmitFields) {
  const tr = createTranslator(locale);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const interactionUser = interaction.user;
  const uid = parseInt(fields.getTextInputValue('account_SetUserIDModalField'));

  //   try {
  //     const data = await requestPlayerData(uid, interaction);
  //     if (!data.playerData?.player.uid)
  //       return interaction.editReply({
  //         embeds: [
  //           new EmbedBuilder()
  //             .setConfig("#E76161", "sob")
  //             .setTitle(tr("profile_UidNotFound") + " - " + uid),
  //         ],
  //       });
  //   } catch (e) {
  //     if (e instanceof AxiosError) {
  //       await interaction.followUp({
  //         ephemeral: true,
  //         content: `未知的UID - \`${e}\``,
  //       });
  //     }
  //     throw e;
  //   }

  if (await database.has(`${interactionUser.id}.account`)) {
    const accounts = (await database.get(`${interactionUser.id}.account`)) || [];
    if (accounts.length >= 5)
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor('#E76161').setTitle(`${tr('account_LimitExceeded')} `)],
      });

    if (accounts.some((account: Account) => account.uid == uid))
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor('#E76161').setTitle(`${tr('account_AlreadySet', { z: `${uid}` })}`)],
      });
  }

  await database.push(`${interactionUser.id}.account`, { uid: uid, cookie: '' });

  return interaction.editReply({
    embeds: [new EmbedBuilder().setColor('#F6F1F1').setTitle(`${tr('account_UidSetSuccess', { z: `${uid}` })}`)],
  });
}

async function handleCookieSet(interaction: ModalSubmitInteraction, locale: LanguageEnum, customId: string, fields: ModalSubmitFields) {
  const tr = createTranslator(locale);

  const interactionUser = interaction.user;
  const accountIndex = parseInt(customId.split('-')[1]);
  const ltoken = fields.getTextInputValue('ltoken') ? `ltoken_v2=${fields.getTextInputValue('ltoken')}; ` : '';
  const ltuid = fields.getTextInputValue('ltuid') ? `ltuid_v2=${fields.getTextInputValue('ltuid')}; ` : '';
  const cookieToken = fields.getTextInputValue('cookieToken') ? `cookie_token_v2=${fields.getTextInputValue('cookieToken')}; ` : '';
  const accountMid = fields.getTextInputValue('accountMid') ? `account_mid_v2=${fields.getTextInputValue('accountMid')}; ` : '';
  const cookie = ltoken + ltuid + cookieToken + accountMid;
  const account = (await database.get(`${interactionUser.id}.account`)) ?? '';

  try {
    const zzz = new ZenlessZoneZero({
      cookie: cookie,
    });
    await zzz.daily.info();

    account[accountIndex].cookie = cookie;
    await database.set(`${interactionUser.id}.account`, account);

    const userData = await getUserHoyolabData(interaction, locale, interactionUser.id, accountIndex);

    await database.delete(`${account[accountIndex].uid}.cookieExpired`);

    account[accountIndex].nickname = userData.nickname;
    await database.set(`${interactionUser.id}.account`, account);

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#F6F1F1').setTitle(tr('account_CookieSetSuccess', { z: `${account[accountIndex].uid}` }))],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error: any) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(tr('account_CookieSetFailed', { z: `${account[accountIndex].uid}` }))
          .setDescription(tr('account_CookieSetFailedDesc') + '\n\n' + '`' + error.message + '`')
          .setColor('#E76161'),
      ],
    });
  }
}
