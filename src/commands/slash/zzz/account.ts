import {
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  ColorResolvable,
  BitFieldResolvable,
  ChatInputCommandInteraction,
} from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';

import { database } from '@/index';

import { failedReply, getRandomColor } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

import emoji from '@/assets/emoji';

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
            value: 'SetUserID',
          },
          {
            name: '② Set Cookie',
            name_localizations: {
              'zh-TW': '② 設定 Cookie',
              'vi': '② Thiết lập Cookie',
              'fr': '② Définir Cookie',
            },
            value: 'SetUserCookie',
          },
          {
            name: '🔸 View configured account',
            name_localizations: {
              'zh-TW': '🔸 檢視已設定帳號',
              'vi': '🔸 Xem các tài khoản đã được cài đặt',
              'fr': '🔸 Liste de comptes',
            },
            value: 'ViewAccount',
          },
          {
            name: '⚙️ Edit configured account',
            name_localizations: {
              'zh-TW': '⚙️ 編輯已設定帳號',
              'vi': '⚙️ Sửa thiết lập tài khoản',
              'fr': '⚙️ Modifier le compte',
            },
            value: 'EditAccount',
          },
          {
            name: '❌ Delete configured account',
            name_localizations: {
              'zh-TW': '❌ 刪除已設定帳號',
              'vi': '❌ Xoá tài khoản đã thiết lập',
              'fr': '❌ Supprimer le compte',
            },
            value: 'DeleteAccount',
          },
        ),
    ),

  /**
   * @description 執行指令
   * @param interaction - 互動實例
   * @param locale - 語言
   * @param _args - 參數
   */
  async execute(interaction: ChatInputCommandInteraction, locale: LanguageEnum, ..._args: string[]) {
    const tr = createTranslator(locale);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const interactionUser = interaction.user;
    const selectedOption = interaction.options.get('options')?.value;

    const hasAccount = await database.has(`${interactionUser.id}.account`);
    if (!hasAccount && (selectedOption == 'ViewAccount' || selectedOption == 'SetUserCookie' || selectedOption == 'EditAccount' || selectedOption == 'DeleteAccount')) {
      return failedReply(interaction, tr('account_NoAccount'));
    }

    const accounts = await database.get(`${interactionUser.id}.account`);

    switch (selectedOption) {
      case 'HowToSetUpAccount':
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(tr('account_HowToSetUpAccount'))
              .setColor(getRandomColor())
              .setDescription(tr('account_HowToSetUpAccountDesc'))
              .setImage('https://media.discordapp.net/attachments/1149960935654559835/1185194443322687528/cookieT.png'),
          ],
          flags: MessageFlags.Ephemeral,
        });

      case 'LoginAccount':
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
                new TextInputBuilder()
                  .setCustomId('account_LoginAccountModalField2')
                  .setLabel(tr('account_LoginAccountDesc2'))
                  .setPlaceholder('mypassword')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
            ),
        );

      case 'SetUserID':
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

      case 'SetUserCookie':
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

      case 'ViewAccount':
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(getRandomColor())
              .setAuthor({
                name: tr('account_ListOfAccount', {
                  Username: interactionUser.username,
                }),
                iconURL: `${interactionUser.displayAvatarURL({
                  size: 4096,
                })}`,
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

      case 'EditAccount':
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

      case 'DeleteAccount':
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
  },
};
