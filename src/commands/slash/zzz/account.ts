import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

import { failedReply, setupDefaultLang, getUserLang, discordToHoyolabLang } from '@/utilities';
import {
  handleViewAccountsCommand,
  handleLoginAccountCommand,
  handleSetUIDCommand,
  handleSetCookieCommand,
  handleEditAccountsCommand,
  handleDeleteAccountsCommand,
  handleAccountHowToSetUpCommand,
} from '@/utilities/zzz/account';
import { createTranslator } from '@/utilities/core/i18n';

export default {
  data: new SlashCommandBuilder()
    .setName('account')
    .setDescription('Setting, view, delete account')
    .setNameLocalizations({
      'zh-TW': '帳號',
      'vi': 'tàikhoản',
      'fr': 'compte',
    })
    .setDescriptionLocalizations({
      'zh-TW': '設置, 檢視, 刪除帳號',
      'vi': 'Cài đặt, xem, xoá tài khoản',
      'fr': 'Paramètres, voir, supprimer le compte',
    })
    .addStringOption((option) =>
      option
        .setName('options')
        .setDescription('...')
        .setNameLocalizations({
          'zh-TW': '選項',
          'vi': 'tuỳchọn',
          'fr': 'options',
        })
        .setRequired(true)
        .addChoices(
          {
            name: '🔥Login with account and password🔥',
            name_localizations: {
              'zh-TW': '🔥帳號密碼登入🔥',
              'vi': '🔥Đăng nhập tài khoản mật khẩu🔥',
              'fr': '🔥Connexion par mot de passe🔥',
            },
            value: 'LoginAccount',
          },
          {
            name: '❓ How to set up account',
            name_localizations: {
              'zh-TW': '❓ 如何設定帳號',
              'vi': '❓ Cách thiết lập tài khoản',
              'fr': '❓ Comment définir le compte',
            },
            value: 'HowToSetUpAccount',
          },
          {
            name: '① Set UID',
            name_localizations: {
              'zh-TW': '① 設定 UID',
              'vi': '① Thiết lập UID',
              'fr': '① Définir UID',
            },
            value: 'SetUID',
          },
          {
            name: '② Set Cookie',
            name_localizations: {
              'zh-TW': '② 設定 Cookie',
              'vi': '② Thiết lập Cookie',
              'fr': '② Définir Cookie',
            },
            value: 'SetCookie',
          },
          {
            name: '🔸 View configured accounts',
            name_localizations: {
              'zh-TW': '🔸 檢視已設定帳號',
              'vi': '🔸 Xem các tài khoản đã được cài đặt',
              'fr': '🔸 Liste de comptes',
            },
            value: 'ViewAccounts',
          },
          {
            name: '⚙️ Edit configured accounts',
            name_localizations: {
              'zh-TW': '⚙️ 編輯已設定帳號',
              'vi': '⚙️ Sửa thiết lập tài khoản',
              'fr': '⚙️ Modifier le compte',
            },
            value: 'EditAccounts',
          },
          {
            name: '❌ Delete configured accounts',
            name_localizations: {
              'zh-TW': '❌ 刪除已設定帳號',
              'vi': '❌ Xoá tài khoản đã thiết lập',
              'fr': '❌ Supprimer le compte',
            },
            value: 'DeleteAccounts',
          },
        ),
    ),

  /**
   * @description 執行指令
   * @param interaction - 互動實例
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, ..._args: string[]) {
    const interactionUser = interaction.user;
    const interactionLocale = interaction.locale;

    const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
    const tr = createTranslator(userLocale);

    const selectedOption = interaction.options.get('options')?.value;
    switch (selectedOption) {
      case 'HowToSetUpAccount':
        return handleAccountHowToSetUpCommand(interaction);
      case 'LoginAccount':
        return handleLoginAccountCommand(interaction);
      case 'SetUID':
        return handleSetUIDCommand(interaction);
      case 'SetCookie':
        return handleSetCookieCommand(interaction);
      case 'ViewAccounts':
        return handleViewAccountsCommand(interaction);
      case 'EditAccounts':
        return handleEditAccountsCommand(interaction);
      case 'DeleteAccounts':
        return handleDeleteAccountsCommand(interaction);
      default:
        return failedReply(interaction, tr('account_InvalidSubcommand'), tr('account_InvalidSubcommandDesc'));
    }
  },
};
