import { client } from "../index.js";
import { ApplicationCommandOptionType } from "discord.js";
import { createTranslator, toI18nLang } from "../utilities/core/i18n.js";
import {
  Events,
  EmbedBuilder,
  WebhookClient,
  ChannelType,
  MessageFlags,
  BaseInteraction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ContextMenuCommandInteraction,
} from "discord.js";
import emoji from "../assets/emoji.js";
import Logger from "../utilities/core/logger.js";
import { getUserLang, setupDefaultLang } from "../utilities/utilities.js";
import {
  getCommandAckPlan,
  ensureDeferredReply,
  replyOrFollowUp,
  TtlCache,
  fireAndForget,
} from "../utilities/shared/index.js";
import { getInteractionPreflight } from "../utilities/shared/interactionPreflight.js";
import { resolveInteractionLocale } from "../utilities/core/interactionLocale.js";

// Use client.db directly
import { getConfig } from "../utilities/core/config.js";
import { drainPendingLogins } from "../utilities/webhookLogin.js";
const config = getConfig();
const webhook = config.CMDWEBHOOK
  ? new WebhookClient({ url: config.CMDWEBHOOK })
  : null;
const localeCache = new TtlCache<string, string>(120000, 10000);

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
  if (!interaction.channel || interaction.channel.type == ChannelType.DM)
    return;

  // Account's non-modal paths must be acknowledged before locale/database
  // lookups as well as before the pending-login network query.
  const chatInputInteraction = interaction.isChatInputCommand()
    ? interaction
    : undefined;
  const earlyPreflight = chatInputInteraction
    ? getInteractionPreflight(chatInputInteraction)
    : undefined;
  if (
    earlyPreflight?.deferBeforeDrain &&
    chatInputInteraction &&
    !chatInputInteraction.deferred &&
    !chatInputInteraction.replied
  ) {
    try {
      await ensureDeferredReply(interaction, true);
    } catch (error: any) {
      new Logger("指令").error(`初始 ACK 失敗：${error?.message ?? error}`);
      return;
    }
  }

  const fallbackLocale = toI18nLang(interaction.locale) || "en";
  const finalLocale = earlyPreflight?.skipLocaleLookup
    ? fallbackLocale
    : await resolveInteractionLocale({
        loadCached: async () =>
          (await localeCache.getOrSetAsync(
            interaction.user.id,
            async () => (await getUserLang(interaction.user.id)) || "",
          )) || undefined,
        setupDefault: () =>
          setupDefaultLang(interaction.user.id, interaction.locale),
        reload: async () => (await getUserLang(interaction.user.id)) || undefined,
        fallbackLocale,
        onError: (error) =>
          new Logger("指令").error(
            `locale 初始化失敗：${error instanceof Error ? error.message : String(error)}`,
          ),
      });
  localeCache.set(interaction.user.id, finalLocale);
  const i18n = createTranslator(finalLocale);

  if (interaction.isButton()) {
    const buttonInteraction = interaction as ButtonInteraction;
    await buttonInteraction.deferUpdate().catch(() => {});
  }

  if (interaction.isCommand()) {
    const command = client.commands.slash.get(interaction.commandName);
    if (!command)
      return replyOrFollowUp(interaction, {
        content: "An error has occured",
        flags: MessageFlags.Ephemeral,
      });

    const args = [];

    for (let option of (interaction as ChatInputCommandInteraction).options
      .data) {
      if (option.type === ApplicationCommandOptionType.Subcommand) {
        if (option.name) args.push(option.name);
        option.options?.forEach((x: any) => {
          if (x.value) args.push(x.value);
        });
      } else if (option.value) args.push(option.value);
    }

    try {
      const chatInteraction = interaction as ChatInputCommandInteraction;
      const ackPlan = getCommandAckPlan(command, { defaultEphemeral: true });
      const preflight = getInteractionPreflight(chatInteraction);

      // /account must acknowledge before the pending-login Supabase query.
      // Modal commands cannot be deferred and must not spend their 3-second
      // response window on an unrelated queue drain.
      if (
        preflight.deferBeforeDrain &&
        !chatInteraction.deferred &&
        !chatInteraction.replied
      ) {
        await ensureDeferredReply(chatInteraction, ackPlan.ephemeral);
      }

      if (!preflight.skipPendingLoginDrain) {
        try {
          // Drain any pending web-logins from Supabase before the command.
          // This runs only after the affected command has been acknowledged.
          await drainPendingLogins(interaction.user.id);
        } catch {
          // Never block a command on a queue read failure.
        }
      }

      if (ackPlan.shouldDefer) {
        await ensureDeferredReply(chatInteraction, ackPlan.ephemeral);
      }

      await (command as any).execute(
        client,
        chatInteraction,
        args,
        i18n,
        client.db,
        emoji,
      );
      const time = `花費 ${(
        (Date.now() - interaction.createdTimestamp) /
        1000
      ).toFixed(2)} 秒`;

      new Logger("指令").command(
        `${interaction.user.displayName}(${interaction.user.id}) 執行 ${command.data.name} - ${time}`,
      );
      if (webhook) {
        fireAndForget(
          webhook.send({
            embeds: [
              new EmbedBuilder()
                .setTimestamp()
                .setAuthor({
                  iconURL: interaction.user.displayAvatarURL({
                    size: 4096,
                  }),
                  name: `${interaction.user.username} - ${interaction.user.id}`,
                })
                .setThumbnail(
                  interaction.guild?.iconURL({
                    size: 4096,
                  }) || null,
                )
                .setDescription(
                  `\`\`\`${interaction.guild?.name} - ${interaction.guild?.id}\`\`\``,
                )
                .addField(
                  command.data.name,
                  `${
                    (
                      interaction as ChatInputCommandInteraction
                    ).options.getSubcommand(false)
                      ? `> ${(interaction as ChatInputCommandInteraction).options.getSubcommand(false)}`
                      : "\u200b"
                  }`,
                  true,
                ),
            ],
          }),
          new Logger("Webhook"),
        );
      }
    } catch (e: any) {
      new Logger("指令").error(`錯誤訊息：${e.message}`);
      await replyOrFollowUp(interaction, {
        content: "哦喲，好像出了一點小問題，請重試",
        flags: MessageFlags.Ephemeral,
      });
    }
  } else if (interaction.isContextMenuCommand()) {
    const command = client.commands.slash.get(interaction.commandName);
    if (!command) return;
    try {
      await (command as any).execute(
        client,
        interaction as ContextMenuCommandInteraction,
      );
    } catch (e: any) {
      new Logger("指令").error(`錯誤訊息：${e.message}`);
      await replyOrFollowUp(interaction, {
        content: "哦喲，好像出了一點小問題，請重試",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});
