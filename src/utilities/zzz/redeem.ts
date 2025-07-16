import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { database } from '@/index';

import { getRedeemCodes, getRandomColor, getUserUid, getUserZZZData, getUserLang, setupDefaultLang, discordToHoyolabLang, failedReply } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

export async function handleRedeemListCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const selectedAccountIndex = parseInt(interactionOptions.getString('account') || '0');
    const zzz = await getUserZZZData(userLocale, interactionUser.id, selectedAccountIndex);
    const codes = await getRedeemCodes();
    const userUid = await getUserUid(interactionUser.id, selectedAccountIndex);
    const userRedeemedCodes = (await database.get(`${userUid}.redeemedCodes`)) || [];

    if (!zzz) {
      return failedReply(interaction, tr('redeem_AccountNotFound'), tr('redeem_AccountNotFoundDesc'));
    }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTimestamp()
          .setColor(getRandomColor())
          .setTitle(tr('redeem_Codelist'))
          .setFooter({ text: tr('redeem_CodeTip') })
          .setDescription(
            `${codes
              .map((code: { code: string }, index: number) => {
                const redeemed = userRedeemedCodes.includes(code.code);
                return `${index}. ${code.code} ${redeemed ? tr('redeem_Redeemed') : tr('redeem_NoRedeem')}`;
              })
              .join('\n')}`,
          ),
      ],
      flags: MessageFlags.Ephemeral as any,
    });
  } catch (error: any) {
    return failedReply(interaction, tr('redeem_Failed'), tr('redeem_FailedDesc'), error.message);
  }
}

export async function handleRedeemAllCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const selectedAccountIndex = parseInt(interactionOptions.getString('account') || '0');
    const selectedUser = interactionOptions.getUser('user') || interactionUser;
    const zzz = await getUserZZZData(userLocale, selectedUser.id, selectedAccountIndex);
    const codes = await getRedeemCodes();
    const userUid = await getUserUid(selectedUser.id, selectedAccountIndex);
    const userRedeemedCodes = (await database.get(`${userUid}.redeemedCodes`)) || [];
    const unRedeemedCodes = codes.filter((code: { code: string }) => !userRedeemedCodes.includes(code.code));

    if (!zzz) {
      return failedReply(interaction, tr('redeem_AccountNotFound'), tr('redeem_AccountNotFoundDesc'));
    }

    for (const unRedeemedCode of unRedeemedCodes) {
      try {
        const processedResults = unRedeemedCodes
          .slice(0, unRedeemedCodes.indexOf(unRedeemedCode))
          .map((code: { code: string; status: string; message: string }) => {
            const statusMap: Record<string, string> = {
              success: '✅',
              already: 'ℹ️',
              invalid: '⚠️',
              failed: '❌',
              processing: '⏳',
            };
            const icon = statusMap[code.status] || '⏳';
            return `${icon} ${code.code} (${code.message || tr('redeem_Processing')})`;
          })
          .join('\n');

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(getRandomColor())
              .setTitle(`${tr('redeem_Redeeming')} ${unRedeemedCode.code}`)
              .setDescription(
                tr('redeem_ProcessingDesc', {
                  noRedeemedCodes: (unRedeemedCodes.length - unRedeemedCodes.indexOf(unRedeemedCode)).toString(),
                  seconds: ((unRedeemedCodes.length - unRedeemedCodes.indexOf(unRedeemedCode)) * 3).toString(),
                }) +
                  '\n\n' +
                  (processedResults ? `${tr('redeem_Processed')}:\n${processedResults}` : ''),
              )
              .setThumbnail(
                'https://cdn.discordapp.com/attachments/1231256542419095623/1361321499549499432/bqqinrjkvtsd1.gif?ex=67fe54f1&is=67fd0371&hm=286f61395cfec0fa862d54c58dbc7b5b6aa20f89f76fd28756ca2cca0c7058aa&',
              ),
          ],
          flags: MessageFlags.Ephemeral as any,
        });

        const res = await zzz.redeem.claim(unRedeemedCode.code);

        switch (res.retcode) {
          case 0:
            unRedeemedCode.status = 'success';
            unRedeemedCode.message = tr('redeem_Success');
            break;
          case -2017:
          case -2018:
            unRedeemedCode.status = 'already';
            unRedeemedCode.message = tr('redeem_Already');
            break;
          case -2001:
          case -2006:
            unRedeemedCode.status = 'invalid';
            unRedeemedCode.message = tr('redeem_Invalid');
            break;
          case -1071:
            throw new Error(tr('redeem_CookieTokenInvalid'));
          case -1048:
            throw new Error(tr('redeem_SystemBusy'));
          default:
            unRedeemedCode.status = 'failed';
            unRedeemedCode.message = tr('redeem_Failed');
        }

        if (unRedeemedCode.status !== 'failed' && !userRedeemedCodes.includes(unRedeemedCode.code)) {
          userRedeemedCodes.push(unRedeemedCode.code);
          await database.set(`${userUid}.redeemedCodes`, userRedeemedCodes);
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      } catch (error: any) {
        unRedeemedCode.status = 'failed';
        unRedeemedCode.message = error.message;
      }
    }

    const results = {
      success: unRedeemedCodes.filter((c: { status: string }) => c.status === 'success'),
      already: unRedeemedCodes.filter((c: { status: string }) => c.status === 'already'),
      invalid: unRedeemedCodes.filter((c: { status: string }) => c.status === 'invalid'),
      failed: unRedeemedCodes.filter((c: { status: string }) => c.status === 'failed'),
    };

    if (results.success.length + results.already.length + results.invalid.length + results.failed.length === 0) {
      return failedReply(interaction, tr('redeem_NoCode'), tr('redeem_NoCodeDesc'));
    }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(getRandomColor())
          .setTitle(tr('redeem_SuccessDesc'))
          .setDescription(
            results.success.map((code: { code: string; message: string }) => `✅ **${code.code}** (${code.message})`).join('\n') +
              (results.already.length ? '\n' + results.already.map((code: { code: string; message: string }) => `ℹ️ **${code.code}** (${code.message})`).join('\n') : '') +
              (results.invalid.length ? '\n' + results.invalid.map((code: { code: string; message: string }) => `⚠️ **${code.code}** (${code.message})`).join('\n') : '') +
              (results.failed.length ? '\n' + results.failed.map((code: { code: string; message: string }) => `❌ **${code.code}** (${code.message})`).join('\n') : '') +
              `\n### ${tr('redeem_RedeemStats')}\n` +
              `✅ ${tr('redeem_Success')}: ${results.success.length}\n` +
              `ℹ️ ${tr('redeem_Already')}: ${results.already.length}\n` +
              `⚠️ ${tr('redeem_Invalid')}: ${results.invalid.length}\n` +
              `❌ ${tr('redeem_Failed')}: ${results.failed.length}`,
          )
          .setThumbnail('https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4c/Item_Polychrome.png/revision/latest?cb=20240807185318'),
      ],
      flags: MessageFlags.Ephemeral as any,
    });
  } catch (error: any) {
    return failedReply(interaction, tr('redeem_Failed'), tr('redeem_FailedDesc'), error.message);
  }
}

export async function handleRedeemCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const selectedAccountIndex = parseInt(interactionOptions.getString('account') || '0');
    const selectedUser = interactionOptions.getUser('user') || interactionUser;
    const selectedCode = interactionOptions.getString('code') || '';
    const zzz = await getUserZZZData(userLocale, selectedUser.id, selectedAccountIndex);
    const userUid = await getUserUid(selectedUser.id, selectedAccountIndex);
    const userRedeemedCodes = (await database.get(`${userUid}.redeemedCodes`)) || [];

    if (!zzz) {
      return failedReply(interaction, tr('redeem_AccountNotFound'), tr('redeem_AccountNotFoundDesc'));
    }

    const res = await zzz.redeem.claim(selectedCode);

    if (res.retcode == 0 || res.message == 'OK') {
      if (!userRedeemedCodes.includes(selectedCode)) userRedeemedCodes.push(selectedCode);
      await database.set(`${userUid}.redeemedCodes`, userRedeemedCodes);

      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('redeem_Success')).setThumbnail('https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4c/Item_Polychrome.png')],
        flags: MessageFlags.Ephemeral as any,
      });
    } else if (res.retcode == -2017 || res.retcode == -2018) {
      if (!userRedeemedCodes.includes(selectedCode)) userRedeemedCodes.push(selectedCode);
      await database.set(`${userUid}.redeemedCodes`, userRedeemedCodes);

      return failedReply(interaction, tr('redeem_Already'), res.message);
    } else {
      const userAccounts = await database.get(`${selectedUser.id}.account`);
      const userAccount = userAccounts[selectedAccountIndex];

      if (userAccount.cookie.includes('cookie_token_v2') || userAccount.cookie.includes('account_mid_v2')) {
        return failedReply(interaction, tr('redeem_CookieTokenInvalid'), tr('redeem_CookieTokenInvalidDesc'));
      } else {
        return failedReply(interaction, tr('redeem_NoCookie'), tr('redeem_NoCookieDesc'));
      }
    }
  } catch (error: any) {
    return failedReply(interaction, tr('redeem_Failed'), error.message);
  }
}

export async function handleAutoRedeemCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;
  const interactionChannel = interaction.channel;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const selectedEnable = interactionOptions.getString('enable') || 'off';
    const selectedTag = interactionOptions.getString('tag') || 'false';
    const channelId = interactionChannel?.id || '';
    const zzz = await getUserZZZData(userLocale, interactionUser.id);
    const userAccounts = await database.get(`${interactionUser.id}.account`);

    if (!zzz) {
      return failedReply(interaction, tr('redeem_AccountNotFound'), tr('redeem_AccountNotFoundDesc'));
    }
    if (!userAccounts[0].cookie.includes('cookie_token_v2') && !userAccounts[0].cookie.includes('account_mid_v2')) {
      return failedReply(interaction, tr('redeem_NoCookie'), tr('redeem_NoCookieDesc'));
    }

    if (selectedEnable === 'on') {
      await database.set(`autoRedeem.${interactionUser.id}`, { channelId, tag: selectedTag === 'true' });

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#A2CDB0')
            .setTitle(tr('autoRedeem_On'))
            .setDescription(tr('autoRedeem_Tag', { z: selectedTag === 'true' ? '`' + tr('True') + '`' : '`' + tr('False') + '`' })),
        ],
        flags: MessageFlags.Ephemeral as any,
      });
    } else {
      await database.delete(`autoRedeem.${interactionUser.id}`);

      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor('#E76161').setColor('#E76161').setTitle(tr('autoDaily_Off'))],
        flags: MessageFlags.Ephemeral as any,
      });
    }
  } catch (error: any) {
    return failedReply(interaction, tr('redeem_Failed'), error.message);
  }
}
