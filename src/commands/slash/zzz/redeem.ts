import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ChatInputCommandInteraction, ColorResolvable } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';
import { database } from '@/index';

import { failedReply, getRedeemCodes, getRandomColor, getUserZZZData, getUserUid, updateCookie } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

export default {
  data: new SlashCommandBuilder()
    .setName('codes')
    .setDescription('Redeem codes for rewards')
    .setNameLocalizations({
      'zh-TW': '兌換碼',
      'vi': 'mãcode',
      'fr': 'codes',
    })
    .setDescriptionLocalizations({
      'zh-TW': '兌換代碼獲取獎勵',
      'vi': 'Đổi mã nhận thưởng',
      'fr': 'Échanger les codes pour les récompenses',
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Check available codes')
        .setNameLocalizations({
          'zh-TW': '列表',
          'vi': 'danhsách',
          'fr': 'liste',
        })
        .setDescriptionLocalizations({
          'zh-TW': '查看當前可用兌換碼',
          'vi': 'Kiểm tra các mã đổi thưởng hiện có',
          'fr': 'Voir les codes de racheté disponibles',
        })
        .addStringOption((option) =>
          option
            .setName('account')
            .setDescription('...')
            .setNameLocalizations({
              'zh-TW': '帳號',
              'vi': 'tàikhoản',
              'fr': 'compte',
            })
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('redeem')
        .setDescription('...')
        .setNameLocalizations({
          'zh-TW': '兌換',
          'vi': 'đổithưởng',
          'fr': 'racheté',
        })
        .addStringOption((option) =>
          option
            .setName('code')
            .setDescription('Enter the code to redeem')
            .setNameLocalizations({
              'zh-TW': '禮包碼',
              'vi': 'mãđổithưởng',
              'fr': 'code',
            })
            .setDescriptionLocalizations({
              'zh-TW': '在這裡輸入要兌換的禮包碼',
              'vi': 'Nhập mã code bạn muốn đổi thưởng tại đây',
              'fr': 'Entrer le code',
            })
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('account')
            .setDescription('...')
            .setNameLocalizations({
              'zh-TW': '帳號',
              'vi': 'tàikhoản',
              'fr': 'compte',
            })
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Help other user redeem code')
            .setNameLocalizations({
              'zh-TW': '使用者',
              'vi': 'ngườidùng',
              'fr': 'utilisateur',
            })
            .setDescriptionLocalizations({
              'zh-TW': '幫其他使用者兌換代碼',
              'vi': 'Đổi mã đổi thưởng cho người dùng khác',
              'fr': "Échange contre d'autres utilisateurs",
            })
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('redeemall')
        .setDescription('...')
        .setNameLocalizations({
          'zh-TW': '兌換全部',
        })
        .setDescriptionLocalizations({
          'zh-TW': '...',
        })
        .addStringOption((option) =>
          option
            .setName('account')
            .setDescription('...')
            .setNameLocalizations({
              'zh-TW': '帳號',
              'vi': 'tàikhoản',
              'fr': 'compte',
            })
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Help other user redeem code')
            .setNameLocalizations({
              'zh-TW': '使用者',
              'vi': 'ngườidùng',
              'fr': 'utilisateur',
            })
            .setDescriptionLocalizations({
              'zh-TW': '幫其他使用者兌換代碼',
              'vi': 'Đổi mã đổi thưởng cho người dùng khác',
              'fr': "Échange contre d'autres utilisateurs",
            })
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('autoredeem')
        .setDescription('Automatic when theres available codes, messages will be sent wherever command used!')
        .setNameLocalizations({
          'zh-TW': '自動兌換',
          'vi': 'tựđộngđổithưởng',
          'fr': 'rachetéautomatique',
        })
        .setDescriptionLocalizations({
          'zh-TW': '自動兌換代碼，訊息會在使用指令的地方自動發送！',
          'vi': 'Bot sẽ trả lời tự động ngay dưới câu hỏi!',
          'fr': 'Racheté automatique activée, des notifications seront envoyées là où cette commande a été utilisée',
        })
        .addStringOption((option) =>
          option
            .setName('enable')
            .setDescription('...')
            .setNameLocalizations({
              'zh-TW': '開啟',
              'vi': 'bật',
              'fr': 'activée',
            })
            .setRequired(true)
            .addChoices(
              {
                name: 'On',
                name_localizations: {
                  'zh-TW': '開啟',
                  'vi': 'Bật',
                  'fr': 'Activée',
                },
                value: 'on',
              },
              {
                name: 'Off',
                name_localizations: {
                  'zh-TW': '關閉',
                  'vi': 'Tắt',
                  'fr': 'Désactivé',
                },
                value: 'off',
              },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('tag')
            .setDescription('Whether mark in the automatic redeem, turn on this also turn on the automatic redeem')
            .setNameLocalizations({
              'zh-TW': '標註',
              'vi': 'thôngbáo',
              'fr': 'mentionner',
            })
            .setDescriptionLocalizations({
              'zh-TW': '是否在自動兌換中標註，開啟這個也相當於開啟了自動兌換',
              'vi': 'Chọn Bật sẽ tự động kích hoạt chế độ nhận code tự động nếu bạn chưa kích hoạt.',
              'fr': 'Mentionner dans le racheté automatique, activer cela activera également le racheté automatique',
            })
            .setRequired(false)
            .addChoices(
              {
                name: 'On',
                name_localizations: {
                  'zh-TW': '開啟',
                  'vi': 'Bật',
                  'fr': 'Activée',
                },
                value: 'true',
              },
              {
                name: 'Off',
                name_localizations: {
                  'zh-TW': '關閉',
                  'vi': 'Tắt',
                  'fr': 'Désactivé',
                },
                value: 'false',
              },
            ),
        ),
    ),

  /**
   * @description 執行指令
   * @param interaction - 交互實例
   * @param locale - 語言
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, locale: LanguageEnum, ..._args: string[]) {
    const tr = createTranslator(locale);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'list':
        return handleList(interaction, locale);
      case 'redeem':
        return handleRedeem(interaction, locale);
      case 'redeemall':
        return handleRedeemAll(interaction, locale);
      case 'autoredeem':
        return handleAutoRedeem(interaction, locale);
      default:
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('redeem_InvalidSubcommand'))],
        });
    }
  },
};

const handleList = async (interaction: ChatInputCommandInteraction, locale: LanguageEnum) => {
  const tr = createTranslator(locale);

  const interactionUser = interaction.user;
  const selectedAccountIndex = parseInt(interaction.options.getString('account') || '0');

  const codes = await getRedeemCodes();
  const userUid = await getUserUid(interactionUser.id, selectedAccountIndex);
  const userRedeemedCodes = (await database.get(`${userUid}.redeemedCodes`)) || [];

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
};

const handleRedeemAll = async (interaction: ChatInputCommandInteraction, locale: LanguageEnum) => {
  const tr = createTranslator(locale);

  const interactionUser = interaction.user;
  const selectedAccountIndex = parseInt(interaction.options.getString('account') || '0');
  const selectedUser = interaction.options.getUser('user') || interactionUser;

  const zzz = await getUserZZZData(interaction, locale, selectedUser.id, selectedAccountIndex);
  if (!zzz)
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('redeem_AccountNotFound'))],
      flags: MessageFlags.Ephemeral as any,
    });

  const codes = await getRedeemCodes();
  const userUid = await getUserUid(selectedUser.id, selectedAccountIndex);
  const userRedeemedCodes = (await database.get(`${userUid}.redeemedCodes`)) || [];
  const noRedeemedCodes = codes.filter((code: { code: string }) => !userRedeemedCodes.includes(code.code));

  if (!noRedeemedCodes || noRedeemedCodes.length === 0) {
    const lastCookieRefresh = (await database.get(`${userUid}.lastCookieRefresh`)) || 0;
    const currentTime = Date.now();
    const oneDayInMs = 24 * 60 * 60 * 1000; // 24 hours

    if (currentTime - lastCookieRefresh >= oneDayInMs) {
      await updateCookie(selectedUser.id, selectedAccountIndex, zzz.cookie.toString());
      await database.set(`${userUid}.lastCookieRefresh`, currentTime.toString());
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor('#A2CDB0').setTitle(tr('redeem_NoCode'))],
      flags: MessageFlags.Ephemeral as any,
    });
  }

  for (let i = 0; i < noRedeemedCodes.length; i++) {
    const code = noRedeemedCodes[i];
    try {
      await interaction.editReply({
        embeds: [createProgressEmbed(noRedeemedCodes, i, locale)],
        flags: MessageFlags.Ephemeral as any,
      });

      const res = await zzz.redeem.claim(code.code);
      const result = await handleRedeemResult(code.code, res, userRedeemedCodes, userUid, locale);
      code.status = result.status;
      code.message = result.message;

      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (e: any) {
      code.status = 'failed';
      code.message = e.message;
    }
  }

  // 最終結果顯示
  const results = {
    success: noRedeemedCodes.filter((c: { status: string }) => c.status === 'success'),
    already: noRedeemedCodes.filter((c: { status: string }) => c.status === 'already'),
    invalid: noRedeemedCodes.filter((c: { status: string }) => c.status === 'invalid'),
    failed: noRedeemedCodes.filter((c: { status: string }) => c.status === 'failed'),
  };

  if (results.success.length + results.already.length + results.invalid.length + results.failed.length === 0) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('redeem_NoCode'))],
      flags: MessageFlags.Ephemeral as any,
    });
  }

  if (results.success.length > 0) {
    await updateCookie(selectedUser.id, selectedAccountIndex, zzz.cookie.toString());
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
};

const handleRedeem = async (interaction: ChatInputCommandInteraction, locale: LanguageEnum) => {
  const tr = createTranslator(locale);

  const interactionUser = interaction.user;
  const selectedUser = interaction.options.getUser('user') || interactionUser;
  const selectedCode = interaction.options.getString('code') || '';
  const selectedAccountIndex = parseInt(interaction.options.getString('account') || '0');

  const zzz = await getUserZZZData(interaction, locale, selectedUser.id, selectedAccountIndex);
  if (!zzz)
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('redeem_AccountNotFound'))],
      flags: MessageFlags.Ephemeral as any,
    });

  const userUid = await getUserUid(selectedUser.id, selectedAccountIndex);
  let userRedeemedCodes = (await database.get(`${userUid}.redeemedCodes`)) || [];

  try {
    const res = await zzz.redeem.claim(selectedCode);
    if (res.retcode == 0 || res.message == 'OK') {
      if (!userRedeemedCodes.includes(selectedCode)) userRedeemedCodes.push(selectedCode);
      userRedeemedCodes = Array.from(new Set(userRedeemedCodes));
      await database.set(`${userUid}.redeemedCodes`, userRedeemedCodes);

      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('redeem_Success')).setThumbnail('https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4c/Item_Polychrome.png')],
        flags: MessageFlags.Ephemeral as any,
      });
    } else if (res.retcode == -2017 || res.retcode == -2018) {
      if (!userRedeemedCodes.includes(selectedCode)) userRedeemedCodes.push(selectedCode);
      userRedeemedCodes = Array.from(new Set(userRedeemedCodes));
      await database.set(`${userUid}.redeemedCodes`, userRedeemedCodes);
      return failedReply(interaction, tr('redeem_Already'), res.message);
    } else {
      const userAccount = await database.get(`${selectedUser.id}.account`);
      const userCookie = userAccount[selectedAccountIndex];
      if (userCookie.cookie.includes('cookie_token_v2') || userCookie.cookie.includes('account_mid_v2')) {
        return failedReply(interaction, tr('redeem_CookieTokenInvalid'), tr('redeem_CookieTokenInvalidDesc'));
      } else {
        return failedReply(interaction, tr('redeem_NoCookie'), tr('redeem_NoCookieDesc'));
      }
    }
  } catch (e: any) {
    return failedReply(interaction, tr('redeem_Failed'), e.message);
  }
};

const handleAutoRedeem = async (interaction: ChatInputCommandInteraction, locale: LanguageEnum) => {
  const tr = createTranslator(locale);

  const selectedEnable = interaction.options.getString('enable') || 'off';
  const selectedTag = interaction.options.getString('tag') || 'false';
  const interactionUser = interaction.user;
  const channelId = interaction.channel?.id || '';

  const zzz = await getUserZZZData(interaction, locale, interaction.user.id);
  if (!zzz)
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor('#E76161').setTitle(tr('redeem_AccountNotFound'))],
      flags: MessageFlags.Ephemeral as any,
    });

  const userAccount = await database.get(`${interactionUser.id}.account`);
  if (!userAccount[0].cookie.includes('cookie_token_v2') && !userAccount[0].cookie.includes('account_mid_v2')) {
    return failedReply(interaction, tr('redeem_NoCookie'), tr('redeem_NoCookieDesc'));
  }

  if (selectedEnable === 'on') {
    await database.set(`autoRedeem.${interactionUser.id}`, {
      channelId,
      tag: selectedTag === 'true',
    });

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#A2CDB0')
          .setTitle(tr('autoRedeem_On'))
          .setDescription(
            tr('autoRedeem_Tag', {
              z: selectedTag === 'true' ? '`' + tr('True') + '`' : '`' + tr('False') + '`',
            }),
          ),
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
};

const handleRedeemResult = async (code: string, res: { retcode: number; message: string }, redeemedCodes: string[], userUid: string, locale: LanguageEnum) => {
  const tr = createTranslator(locale);

  let status = 'failed';
  let message = '';

  switch (res.retcode) {
    case 0:
      status = 'success';
      message = tr('redeem_Success');
      break;
    case -2017:
    case -2018:
      status = 'already';
      message = tr('redeem_Already');
      break;
    case -2001:
    case -2006:
      status = 'invalid';
      message = tr('redeem_Invalid');
      break;
    case -1071:
      throw new Error(tr('redeem_CookieTokenInvalid'));
    case -1048:
      throw new Error(tr('redeem_SystemBusy'));
    default:
      status = 'failed';
      message = tr('redeem_Failed');
  }

  if (status !== 'failed' && !redeemedCodes.includes(code)) {
    redeemedCodes.push(code);
    await database.set(`${userUid}.redeemedCodes`, Array.from(new Set(redeemedCodes)));
  }

  return { status, message };
};

function createProgressEmbed(codes: { code: string; status: string; message: string }[], currentIndex: number, locale: LanguageEnum) {
  const tr = createTranslator(locale);

  const processedResults = codes
    .slice(0, currentIndex)
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

  return new EmbedBuilder()
    .setColor(getRandomColor())
    .setTitle(`${tr('redeem_Redeeming')} ${codes[currentIndex]?.code}`)
    .setDescription(
      tr('redeem_ProcessingDesc', { noRedeemedCodes: (codes.length - currentIndex).toString(), seconds: ((codes.length - currentIndex) * 3).toString() }) +
        '\n\n' +
        (processedResults ? `${tr('redeem_Processed')}:\n${processedResults}` : ''),
    )
    .setThumbnail(
      'https://cdn.discordapp.com/attachments/1231256542419095623/1361321499549499432/bqqinrjkvtsd1.gif?ex=67fe54f1&is=67fd0371&hm=286f61395cfec0fa862d54c58dbc7b5b6aa20f89f76fd28756ca2cca0c7058aa&',
    );
}
