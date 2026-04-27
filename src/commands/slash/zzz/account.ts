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
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import path from "path";
import { failedReply, getRandomColor } from "../../../utilities/utilities.js";
import { getConfig } from "../../../utilities/core/config.js";
import { drainPendingLogins } from "../../../utilities/webhookLogin.js";
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
            name: "🌐 Bind via Web Login",
            name_localizations: {
              "zh-TW": "🌐 透過網頁登入綁定",
            },
            value: "BindAccountByWebLogin",
          },
          {
            name: "② Set Account (Cookie)",
            name_localizations: {
              "zh-TW": "② 設定帳號 (Cookie)",
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

    // Pull any pending web-logins from Supabase before we read the local DB.
    // Fast no-op if Supabase is unconfigured or nothing is queued.
    try {
      const bound = await drainPendingLogins(userId);
      if (bound.length > 0) {
        console.log(`[/account] drain bound ${bound.length} account(s) for ${userId}`);
      }
    } catch (e: any) {
      console.error(`[/account] drainPendingLogins threw: ${e?.message ?? e}`);
      /* swallow — never block /account on a queue read */
    }

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
      case "BindAccountByWebLogin": {
        const cfg = getConfig();
        const baseUrl = cfg.WEB_LOGIN_URL;
        if (!baseUrl) {
          return failedReply(
            interaction,
            "Web login is not configured on this bot. Please contact the administrator.",
          );
        }
        // Map Discord interaction locale → web app locale (en | zh-TW)
        const rawLocale = String(interaction.locale ?? "").toLowerCase();
        const webLang =
          rawLocale === "zh-tw" || rawLocale === "zh-cn" || rawLocale === "zh"
            ? "zh-TW"
            : "en";
        const langQs = webLang === "en" ? "" : `&lang=${webLang}`;
        const url = `${baseUrl.replace(/\/$/, "")}/login?botId=zzz${langQs}`;
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(getRandomColor() as any)
              .setTitle(tr("account_WebLoginTitle"))
              .setDescription(tr("account_WebLoginDesc")),
          ],
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel(tr("account_WebLoginButton"))
                .setURL(url),
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      case "HowToSetUpAccount":
        const imagePath = path.resolve(
          process.cwd(),
          "src/assets/images/image.png",
        );
        const attachment = new AttachmentBuilder(imagePath, {
          name: "teaching.png",
        });

        interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(tr("account_HowToSetUpAccount"))
              .setColor(getRandomColor() as any)
              .setDescription(tr("account_HowToSetUpAccountDesc"))
              .setImage("attachment://teaching.png"),
          ],
          files: [attachment],
          flags: MessageFlags.Ephemeral,
        });
        return;
      case "SetUserCookie":
        await interaction.showModal(
          new ModalBuilder()
            .setCustomId("account_SetUserCookieModal")
            .setTitle(tr("account_SetUserCookie"))
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("ltoken_v2")
                  .setLabel("ltoken_v2")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("ltuid_v2")
                  .setLabel("ltuid_v2")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("cookie_token_v2")
                  .setLabel("cookie_token_v2")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("account_mid_v2")
                  .setLabel("account_mid_v2")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
            ),
        );
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
