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
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
} from "discord.js";
import path from "path";
import { failedReply, getRandomColor } from "../../../utilities/utilities.js";
import { getConfig } from "../../../utilities/core/config.js";
import { QuickDB } from "quick.db";
import {
  getAllCharacters,
  getHoyolabs,
  type Character,
  type Hoyolab,
} from "../../../utilities/accountStore.js";

/**
 * Reply to an interaction whether or not it has already been deferred.
 * If deferred → editReply (Ephemeral flag inherited from defer).
 * If fresh → reply with Ephemeral flag.
 */
async function replyOrEdit(
  interaction: ChatInputCommandInteraction,
  payload: any,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

function formatRelativeFromIso(iso: string | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function buildAccountComponents(
  characters: Array<Character & { ltuid_v2: string; cookie: string }>,
  hoyolabs: Hoyolab[],
  discordUsername: string,
  discordAvatarUrl: string,
  tr: any,
): ContainerBuilder {
  const container = new ContainerBuilder();

  const firstHoyolab = hoyolabs[0] ?? null;
  const hoyolabName = firstHoyolab?.hoyolabName ?? null;
  const hoyolabIcon = firstHoyolab?.hoyolabIcon ?? null;
  const ltuid = firstHoyolab?.ltuid_v2 ?? "—";

  const headerText = [
    `**${discordUsername}**`,
    hoyolabName
      ? `${hoyolabName} · ltuid \`${ltuid}\``
      : `ltuid \`${ltuid}\``,
  ].join("\n");

  const headerSection = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(headerText),
  );
  headerSection.setThumbnailAccessory(
    new ThumbnailBuilder().setURL(hoyolabIcon ?? discordAvatarUrl),
  );
  container.addSectionComponents(headerSection);
  container.addSeparatorComponents(new SeparatorBuilder());

  for (let i = 0; i < characters.length; i++) {
    const c = characters[i]!;
    const gameName = c.game_name ?? "Zenless Zone Zero";
    const lvLabel = tr("account_View_LvShort");
    const levelStr = c.level !== undefined ? ` · ${lvLabel} ${c.level}` : "";
    const regionStr = c.region_name ?? c.region ?? "—";
    const nicknameStr = c.nickname ? `**${c.nickname}** · ` : "";
    const syncStr = c.enrichedAt
      ? ` · ${tr("account_View_LastSync", { time: formatRelativeFromIso(c.enrichedAt) })}`
      : "";

    const charText = [
      `${nicknameStr}UID \`${c.uid}\``,
      `${gameName}${levelStr}`,
      `${tr("account_View_Region")}: ${regionStr}${syncStr}`,
    ].join("\n");

    const charSection = new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(charText),
    );
    charSection.setThumbnailAccessory(
      new ThumbnailBuilder().setURL(c.logo ?? discordAvatarUrl),
    );
    container.addSectionComponents(charSection);

    if (i < characters.length - 1) {
      container.addSeparatorComponents(new SeparatorBuilder());
    }
  }

  return container;
}

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
            name: "🌐 Bind Account via Web Login",
            name_localizations: {
              "zh-TW": "🌐 綁定帳號 (網頁登入)",
            },
            value: "BindAccountByWebLogin",
          },
          {
            name: "🔗 Bind Account via Cookie",
            name_localizations: {
              "zh-TW": "🔗 綁定帳號 (Cookie)",
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

    // ACK early for non-modal paths so drain (≤3s budget) can't expire interaction.
    // QuickLink + SetUserCookie open modals — never defer those.
    const isModalCommand =
      command === "SetUserCookie";
    if (!isModalCommand && !interaction.deferred && !interaction.replied) {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch (e: any) {
        console.warn(`[/account] deferReply failed: ${e?.message ?? e}`);
      }
    }

    const accountKey = `${userId}.account`;
    const hasAccount = await db.has(accountKey);

    if (
      command == "ViewAccount" ||
      command == "EditAccount" ||
      command == "DeleteAccount"
    ) {
      if (!hasAccount) return failedReply(interaction, tr("account_NoAccount"));
      // Already deferred above for non-modal commands.
    }

    const accounts: any[] = (await db.get(accountKey)) || [];

    switch (command) {
      case "BindAccountByWebLogin": {
        try {
          const cfg = getConfig();
          const baseUrl = cfg.WEB_LOGIN_URL;
          console.log(`[/account WebLogin] WEB_LOGIN_URL=${baseUrl ?? "<unset>"}`);
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
          console.log(`[/account WebLogin] url=${url}`);
          console.log(
            `[/account WebLogin] tr keys: title=${tr("account_WebLoginTitle")} desc=${tr("account_WebLoginDesc")?.slice(0, 30)} btn=${tr("account_WebLoginButton")}`,
          );
          await replyOrEdit(interaction, {
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
          });
        } catch (err: any) {
          console.error(
            `[/account WebLogin] reply failed:`,
            err?.message ?? err,
            "\nstack:",
            err?.stack,
            "\nerrors[]:",
            err?.errors,
          );
          throw err;
        }
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

        await replyOrEdit(interaction, {
          embeds: [
            new EmbedBuilder()
              .setTitle(tr("account_HowToSetUpAccount"))
              .setColor(getRandomColor() as any)
              .setDescription(tr("account_HowToSetUpAccountDesc"))
              .setImage("attachment://teaching.png"),
          ],
          files: [attachment],
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
      case "ViewAccount": {
        const characters = await getAllCharacters(db as any, userId);
        if (characters.length === 0) {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(getRandomColor() as any)
                .setDescription(`❌ \`${tr("account_NoAccount")}\``),
            ],
          });
          return;
        }

        const hoyolabs = await getHoyolabs(db as any, userId);
        const container = buildAccountComponents(
          characters.slice(0, 10),
          hoyolabs,
          interaction.user.username,
          interaction.user.displayAvatarURL({ size: 256, forceStatic: false }),
          tr,
        );
        await interaction.editReply({
          flags: MessageFlags.IsComponentsV2,
          components: [container],
        } as any);
        return;
      }
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
