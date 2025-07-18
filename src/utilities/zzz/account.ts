import {
  EmbedBuilder,
  MessageFlags,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChatInputCommandInteraction,
  BitFieldResolvable,
} from 'discord.js';
import { ZenlessZoneZero } from '@yeci226/hoyoapi';
import { database } from '@/index';

import { loginToHoyolab } from '@/services/api.service';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserGameUid, getUserHoyolabData, getUserLang, parseCookie, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

import { Account } from '@/types';

import emoji from '@/emoji';

export async function handleAccountHowToSetUpCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(tr('account_HowToSetUpAccount'))
        .setDescription(tr('account_HowToSetUpAccountDesc'))
        .setColor(getRandomColor())
        .setImage('https://media.discordapp.net/attachments/1149960935654559835/1185194443322687528/cookieT.png'),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleLoginAccountCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  return interaction.showModal(
    new ModalBuilder()
      .setCustomId('account_LoginAccountModal')
      .setTitle(tr('account_LoginAccount'))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('account_LoginAccountModalField')
            .setLabel(tr('account_LoginAccountDesc'))
            .setPlaceholder('example@gmail.com')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('account_LoginAccountModalField2').setLabel(tr('account_LoginAccountDesc2')).setPlaceholder('mypassword').setStyle(TextInputStyle.Short).setRequired(true),
        ),
      ),
  );
}

export async function handleSetUIDCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  return interaction.showModal(
    new ModalBuilder()
      .setCustomId('account_SetUserIDModal')
      .setTitle(tr('account_SetUserID'))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('account_SetUserIDModalField')
            .setLabel(tr('account_SetUserIDDesc'))
            .setPlaceholder('e.g. 1300007596')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(9)
            .setMaxLength(10),
        ),
      ),
  );
}

export async function handleSetCookieCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  const accounts = (await database.get(`${interactionUser.id}.account`)) || [];

  if (accounts.length === 0) {
    return failedReply(interaction, tr('account_NoAccount'), tr('account_NoAccountDesc'));
  }

  return interaction.reply({
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setPlaceholder(tr('account_SelectAccountSetCookie'))
          .setCustomId('account_SetUserCookieSelect')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            accounts.map((account: any, index: number) => ({
              emoji: emoji.avatarIcon,
              label: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ''}`,
              value: `${index}`,
            })),
          ),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleViewAccountsCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  const accounts = (await database.get(`${interactionUser.id}.account`)) || [];

  if (accounts.length === 0) {
    return failedReply(interaction, tr('account_NoAccount'), tr('account_NoAccountDesc'));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(getRandomColor())
        .setAuthor({
          name: tr('account_ListOfAccount', { Username: interactionUser.username }),
          iconURL: interactionUser.displayAvatarURL({ size: 4096 }),
        })
        .addFields(
          accounts.map((account: any) => ({
            name: `${emoji.avatarIcon} ${account.uid} ${account.nickname ? `- ${account.nickname}` : ''}`,
            value: `${account.cookie ? `🔗 \`${tr('account_Linked')}\`` : `❌ \`${tr('account_NotLinked')}\``}`,
            inline: true,
          })),
        ),
    ],
  });
}

export async function handleEditAccountsCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  const accounts = (await database.get(`${interactionUser.id}.account`)) || [];

  if (accounts.length === 0) {
    return failedReply(interaction, tr('account_NoAccount'), tr('account_NoAccountDesc'));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return interaction.editReply({
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setPlaceholder(tr('account_SelectAccountEdit'))
          .setCustomId('account_EditAccountSelect')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            accounts.map((account: any, index: number) => {
              return {
                emoji: emoji.avatarIcon,
                label: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ''}`,
                value: `${index}`,
              };
            }),
          ),
      ),
    ],
    flags: MessageFlags.Ephemeral as BitFieldResolvable<'SuppressEmbeds' | 'IsComponentsV2', MessageFlags.SuppressEmbeds | MessageFlags.IsComponentsV2>,
  });
}

export async function handleDeleteAccountsCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  const accounts = (await database.get(`${interactionUser.id}.account`)) || [];

  if (accounts.length === 0) {
    return failedReply(interaction, tr('account_NoAccount'), tr('account_NoAccountDesc'));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return interaction.editReply({
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setPlaceholder(tr('account_SelectAccountDelete'))
          .setCustomId('account_DeleteAccountSelect')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            accounts.map((account: any, index: number) => ({
              emoji: emoji.avatarIcon,
              label: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ''}`,
              value: `${index}`,
            })),
          ),
      ),
    ],
    flags: MessageFlags.Ephemeral as BitFieldResolvable<'SuppressEmbeds' | 'IsComponentsV2', MessageFlags.SuppressEmbeds | MessageFlags.IsComponentsV2>,
  });
}

export async function handleLoginAccountSubmit(interaction: ModalSubmitInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionFields = interaction.fields;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    const email = interactionFields.getTextInputValue('account_LoginAccountModalField');
    const password = interactionFields.getTextInputValue('account_LoginAccountModalField2');
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

export async function handleEditAccountSubmit(interaction: ModalSubmitInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionCustomId = interaction.customId;
  const interactionFields = interaction.fields;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const accountIndex = parseInt(interactionCustomId.split('-')[1]);
    const uid = parseInt(interactionFields.getTextInputValue('uid'));
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

export async function handleSetUIDSubmit(interaction: ModalSubmitInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionFields = interaction.fields;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const uid = parseInt(interactionFields.getTextInputValue('account_SetUserIDModalField'));

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

export async function handleSetCookieSubmit(interaction: ModalSubmitInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionCustomId = interaction.customId;
  const interactionFields = interaction.fields;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    const accountIndex = parseInt(interactionCustomId.split('-')[1]);
    const ltoken = interactionFields.getTextInputValue('ltoken') ?? '';
    const ltuid = interactionFields.getTextInputValue('ltuid') ?? '';
    const cookieToken = interactionFields.getTextInputValue('cookieToken') ?? '';
    const accountMid = interactionFields.getTextInputValue('accountMid') ?? '';
    const userAccounts = (await database.get(`${interactionUser.id}.account`)) ?? '';
    const cookie = `ltoken_v2=${ltoken}; ltuid_v2=${ltuid}; cookie_token_v2=${cookieToken}; account_mid_v2=${accountMid};`;

    const zzz = new ZenlessZoneZero({ cookie: cookie });
    await zzz.daily.info();

    userAccounts[accountIndex].cookie = cookie;
    await database.set(`${interactionUser.id}.account`, userAccounts);

    const hoyolabData = await getUserHoyolabData(interaction, userLocale, interactionUser.id, accountIndex);
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

export async function handleEditAccountSelect(interaction: StringSelectMenuInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionValue = interaction.values[0];

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.update({ withResponse: true }).catch(() => {});
    return interaction.editReply({
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(tr('account_SelectAccountEdit'))
            .setCustomId('account_EditAccountSelectType')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions({ label: 'UID', value: `uid-${interactionValue}` }, { label: 'Cookie', value: `cookie-${interactionValue}` }),
        ),
      ],
      flags: MessageFlags.Ephemeral as any,
    });
  } catch (error: any) {
    return failedReply(interaction, tr('account_EditFailed'), tr('account_EditFailedDesc'), error.message);
  }
}

export async function handleEditAccountTypeSelect(interaction: StringSelectMenuInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionValue = interaction.values[0];

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    const [type, accountIndex] = interactionValue.split('-');
    const userAccounts = (await database.get(`${interaction.user.id}.account`)) || [];
    const account = userAccounts[accountIndex];

    switch (type) {
      case 'uid':
        return interaction.showModal(
          new ModalBuilder()
            .setCustomId(`accountEdit-${accountIndex}`)
            .setTitle(tr('account_SetUserID'))
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('uid')
                  .setLabel(tr('account_SetUserIDDesc'))
                  .setValue(account.uid || '')
                  .setPlaceholder('e.g. 809279679')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMinLength(9)
                  .setMaxLength(10),
              ),
            ),
        );

      case 'cookie':
        const parsedCookie = parseCookie(account.cookie);

        return interaction.showModal(
          new ModalBuilder()
            .setCustomId(`cookie_set-${accountIndex}`)
            .setTitle(tr('account_SetUserCookie'))
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('ltoken')
                  .setLabel('ltoken_2')
                  .setPlaceholder('v2_...')
                  .setValue(parsedCookie.ltoken || '')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMinLength(0)
                  .setMaxLength(1000),
              ),
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('ltuid')
                  .setLabel('ltuid_v2')
                  .setPlaceholder('30...')
                  .setValue(parsedCookie.ltuid || '')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMinLength(0)
                  .setMaxLength(30),
              ),
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('cookieToken')
                  .setLabel('cookie_token_v2')
                  .setPlaceholder('v2_...')
                  .setValue(parsedCookie.cookieToken || '')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMinLength(0)
                  .setMaxLength(1000),
              ),
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('accountMid')
                  .setLabel('account_mid_v2')
                  .setPlaceholder('1lyq...')
                  .setValue(parsedCookie.accountMid || '')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMinLength(0)
                  .setMaxLength(30),
              ),
            ),
        );
    }
  } catch (error: any) {
    return failedReply(interaction, tr('account_EditFailed'), tr('account_EditFailedDesc'), error.message);
  }
}

export async function handleEditAccountCookieSelect(interaction: StringSelectMenuInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionValue = interaction.values[0];

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    const accountIndex = interactionValue;
    const userAccounts = (await database.get(`${interaction.user.id}.account`)) || [];
    const account = userAccounts[accountIndex];
    const parsedCookie = parseCookie(account.cookie);

    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`cookie_set-${accountIndex}`)
        .setTitle(tr('account_SetUserCookie'))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('ltoken')
              .setLabel('ltoken_2')
              .setPlaceholder('v2_...')
              .setValue(parsedCookie.ltoken || '')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(0)
              .setMaxLength(1000),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('ltuid')
              .setLabel('ltuid_v2')
              .setPlaceholder('30...')
              .setValue(parsedCookie.ltuid || '')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(0)
              .setMaxLength(30),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('cookieToken')
              .setLabel('cookie_token_v2')
              .setPlaceholder('v2_...')
              .setValue(parsedCookie.cookieToken || '')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(0)
              .setMaxLength(1000),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('accountMid')
              .setLabel('account_mid_v2')
              .setPlaceholder('1lyq...')
              .setValue(parsedCookie.accountMid || '')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(0)
              .setMaxLength(30),
          ),
        ),
    );
  } catch (error: any) {
    return failedReply(interaction, tr('account_EditFailed'), tr('account_EditFailedDesc'), error.message);
  }
}

export async function handleDeleteAccountSelect(interaction: StringSelectMenuInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionValue = interaction.values[0];

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.update({ withResponse: true }).catch(() => {});

    const accountIndex = interactionValue;
    const accounts = (await database.get(`${interaction.user.id}.account`)) || [];

    const deletedAccount = accounts[accountIndex];
    if (!deletedAccount) throw new Error(tr('account_DeleteFailedDesc'));

    accounts.splice(accountIndex, 1);
    await database.set(`${interaction.user.id}.account`, accounts);

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor('#F6F1F1').setTitle(`${tr('account_DeletedSuccess')} \`${deletedAccount.uid}\``)],
      components: [],
      flags: MessageFlags.Ephemeral as any,
    });
  } catch (error: any) {
    return failedReply(interaction, tr('account_DeleteFailed'), tr('account_DeleteFailedDesc'), error.message);
  }
}
