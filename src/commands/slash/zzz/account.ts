import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  Client,
  LocalizationMap,
} from "discord.js";
import { failedReply, getRandomColor } from "../../../utilities/utilities.js";
import { QuickDB } from "quick.db";

export default {
  data: new SlashCommandBuilder()
    .setName("account")
    .setDescription("Setting, view, delete account")
    .setNameLocalizations({
      "zh-TW": "帳號",
      vi: "tàikhoản",
      fr: "compte",
    } as LocalizationMap)
    .setDescriptionLocalizations({
      "zh-TW": "設置, 檢視, 刪除帳號",
      vi: "Cài đặt, xem, xoá tài khoản",
      fr: "Paramètres, voir, supprimer le compte",
    } as LocalizationMap)
    .addStringOption((option) =>
      option
        .setName("options")
        .setDescription("...")
        .setNameLocalizations({
          "zh-TW": "選項",
          vi: "tuỳchọn",
          fr: "options",
        } as LocalizationMap)
        .setRequired(true)
        .addChoices(
          {
            name: "❓ How to set up account",
            name_localizations: {
              "zh-TW": "❓ 如何設定帳號",
            },
            value: "HowToSetUpAccount",
          },
          {
            name: "① Quick Login (Recommended)",
            name_localizations: {
              "zh-TW": "① 快速登入 (推薦)",
            },
            value: "QuickLink",
          },
          {
            name: "② Set UID (Manual)",
            name_localizations: {
              "zh-TW": "② 設定 UID (手動)",
            },
            value: "SetUserID",
          },
          {
            name: "③ Set Cookie (Manual)",
            name_localizations: {
              "zh-TW": "③ 設定 Cookie (手動)",
            },
            value: "SetUserCookie",
          },
          {
            name: "🔸 View configured account",
            name_localizations: {
              "zh-TW": "🔸 檢視已設定帳號",
            },
            value: "ViewAccount",
          },
          {
            name: "⚙️ Edit configured account",
            name_localizations: {
              "zh-TW": "⚙️ 編輯已設定帳號",
            },
            value: "EditAccount",
          },
          {
            name: "❌ Delete configured account",
            name_localizations: {
              "zh-TW": "❌ 刪除已設定帳號",
            },
            value: "DeleteAccount",
          },
        ),
    ),
  async execute(
    _client: Client,
    interaction: ChatInputCommandInteraction,
    _args: any[],
    tr: any,
    db: QuickDB,
    emoji: any,
  ) {
    const command = interaction.options.getString("options");
    const userId = interaction.user.id;
    const accountKey = `${userId}.account`;
    const hasAccount = await db.has(accountKey);

    if (
      command == "ViewAccount" ||
      command == "EditAccount" ||
      command == "DeleteAccount"
    ) {
      if (!hasAccount) return failedReply(interaction, tr("account_NoAccount"));
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const accounts: any[] = (await db.get(accountKey)) || [];

    switch (command) {
      case "QuickLink":
        await interaction.showModal(
          new ModalBuilder()
            .setCustomId("account_QuickLinkModal")
            .setTitle(tr("account_QuickLinkModal"))
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("account_LoginAccountModalField")
                  .setLabel(tr("account_LoginAccountDesc"))
                  .setPlaceholder("example@gmail.com")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("account_LoginAccountModalField2")
                  .setLabel(tr("account_LoginAccountDesc2"))
                  .setPlaceholder("mypassword")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
            ),
        );
        return;
      case "HowToSetUpAccount":
        interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(tr("account_HowToSetUpAccount"))
              .setColor(getRandomColor() as any)
              .setDescription(tr("account_HowToSetUpAccountDesc"))
              .setImage(
                "https://media.discordapp.net/attachments/1149960935654559835/1185194443322687528/cookieT.png",
              ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      case "SetUserID":
        await interaction.showModal(
          new ModalBuilder()
            .setCustomId("account_SetUserIDModal")
            .setTitle(tr("account_SetUserID"))
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("account_SetUserIDModalField")
                  .setLabel(tr("account_SetUserIDDesc"))
                  .setPlaceholder("e.g. 1300007596")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMinLength(9)
                  .setMaxLength(10),
              ),
            ),
        );
        return;
      case "SetUserCookie":
        if (!hasAccount)
          return failedReply(interaction, tr("account_NoAccount"));
        interaction.reply({
          components: [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setPlaceholder(tr("account_SelectAccountSetCookie"))
                .setCustomId("account_SetUserCookieSelect")
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                  accounts.map((account, index) => ({
                    emoji: emoji.avatarIcon,
                    label: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ""}`,
                    value: `${index}`,
                  })),
                ),
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      case "ViewAccount":
        interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(getRandomColor() as any)
              .setAuthor({
                name: tr("account_ListOfAccount", {
                  Username: interaction.user.username,
                }),
                iconURL: `${interaction.user.displayAvatarURL({
                  size: 4096,
                  forceStatic: false,
                })}`,
              })
              .addFields(
                ...accounts.map((account) => ({
                  name: `${emoji.avatarIcon} ${account.uid} ${account.nickname ? `- ${account.nickname}` : ""}`,
                  value: `${
                    account.cookie
                      ? `🔗 \`${tr("account_Linked")}\``
                      : `❌ \`${tr("account_NotLinked")}\``
                  }`,
                  inline: true,
                })),
              ),
          ],
        });
        return;
      case "EditAccount":
        interaction.editReply({
          components: [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setPlaceholder(tr("account_SelectAccountEdit"))
                .setCustomId("account_EditAccountSelect")
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                  accounts.map((account, i) => {
                    return {
                      emoji: emoji.avatarIcon,
                      label: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ""}`,
                      value: `${i}`,
                    };
                  }),
                ),
            ),
          ],
          flags: MessageFlags.Ephemeral as any,
        });
        return;
      case "DeleteAccount":
        interaction.editReply({
          components: [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setPlaceholder(tr("account_SelectAccountDelete"))
                .setCustomId("account_DeleteAccountSelect")
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                  accounts.map((account, i) => ({
                    emoji: emoji.avatarIcon,
                    label: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ""}`,
                    value: `${i}`,
                  })),
                ),
            ),
          ],
          flags: MessageFlags.Ephemeral as any,
        });
        return;
    }
  },
};
