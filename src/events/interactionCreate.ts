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
} from "@bot/shared";

// Use client.db directly
import { getConfig } from "../utilities/core/config.js";
const config = getConfig();
const webhook = config.CMDWEBHOOK
  ? new WebhookClient({ url: config.CMDWEBHOOK })
  : null;
const localeCache = new TtlCache<string, string>(120000, 10000);

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
  if (!interaction.channel || interaction.channel.type == ChannelType.DM)
    return;

  let userLocale = await localeCache.getOrSetAsync(
    interaction.user.id,
    async () => (await getUserLang(interaction.user.id)) || "",
  );
  if (!userLocale) {
    await setupDefaultLang(interaction.user.id, interaction.locale);
    userLocale =
      (await getUserLang(interaction.user.id)) ||
      toI18nLang(interaction.locale) ||
      "en";
  }
  localeCache.set(interaction.user.id, userLocale);
  const i18n = createTranslator(userLocale);

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

    const args: any[] = [];

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
      const commandName = command.data.name;
      const userId = interaction.user.id;
      const startTime = Date.now();

      // ========================================
      // 1. 速率限制檢查
      // ========================================
      const optimizations = (client as any).optimizations;
      if (optimizations?.rateLimiter) {
        const rateLimitCheck = optimizations.rateLimiter.check(userId);
        if (!rateLimitCheck.allowed) {
          const retryAfter = rateLimitCheck.retryAfter || 1;
          return replyOrFollowUp(interaction, {
            content: `⏱️ 你操作太頻繁了！請在 ${retryAfter} 秒後重試。`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      // ========================================
      // 2. 安全確認已 Defer
      // ========================================
      const ackPlan = getCommandAckPlan(command, { defaultEphemeral: true });
      if (ackPlan.shouldDefer) {
        await ensureDeferredReply(chatInteraction, ackPlan.ephemeral);
      }

      // ========================================
      // 3. 帶超時的命令執行（有重試機制）
      // ========================================
      if (optimizations?.commandExecutor) {
        await optimizations.commandExecutor.execute(
          commandName,
          async () => {
            return (command as any).execute(
              client,
              chatInteraction,
              args,
              i18n,
              client.db,
              emoji,
            );
          },
          {
            timeoutMs: 30_000,
            maxRetries: 1, // 只重試 1 次（避免重複執行）
          }
        );
      } else {
        // Fallback：沒有執行器的情況
        await (command as any).execute(
          client,
          chatInteraction,
          args,
          i18n,
          client.db,
          emoji,
        );
      }

      // ========================================
      // 4. 記錄執行和統計
      // ========================================
      const executionMs = Date.now() - startTime;
      const time = `花費 ${(executionMs / 1000).toFixed(2)} 秒`;

      new Logger("指令").command(
        `${interaction.user.displayName}(${interaction.user.id}) 執行 ${commandName} - ${time}`,
      );

      // 追蹤命令使用統計
      if (optimizations?.commandUsageTracker) {
        optimizations.commandUsageTracker.track(commandName, executionMs);
      }

      // ========================================
      // 5. 發送 Webhook 日誌
      // ========================================
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
      // ========================================
      // 強化的錯誤處理
      // ========================================
      const optimizations = (client as any).optimizations;
      const logger = new Logger("指令");

      logger.error(`❌ 命令執行失敗: ${e?.message || String(e)}`);

      // 追蹤錯誤統計
      if (optimizations?.commandUsageTracker) {
        optimizations.commandUsageTracker.trackError(command.data.name);
      }

      // 通過 EnhancedErrorHandler 處理
      if (optimizations?.errorHandler) {
        await optimizations.errorHandler.handle(e, {
          source: "CommandExecution",
          commandName: command.data.name,
          userId: interaction.user.id,
          guildId: interaction.guildId,
        });
      }

      // 回覆用戶
      await replyOrFollowUp(interaction, {
        content: "哦喲，好像出了一點小問題，請重試",
        flags: MessageFlags.Ephemeral,
      });
    }
  } else if (interaction.isContextMenuCommand()) {
    const command = client.commands.slash.get(interaction.commandName);
    if (!command) return;

    try {
      const commandName = command.data.name;
      const userId = interaction.user.id;
      const startTime = Date.now();

      // 速率限制檢查
      const optimizations = (client as any).optimizations;
      if (optimizations?.rateLimiter) {
        const rateLimitCheck = optimizations.rateLimiter.check(userId);
        if (!rateLimitCheck.allowed) {
          const retryAfter = rateLimitCheck.retryAfter || 1;
          return replyOrFollowUp(interaction, {
            content: `⏱️ 你操作太頻繁了！請在 ${retryAfter} 秒後重試。`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      // 執行命令
      if (optimizations?.commandExecutor) {
        await optimizations.commandExecutor.execute(
          commandName,
          async () => {
            return (command as any).execute(
              client,
              interaction as ContextMenuCommandInteraction,
            );
          },
          { timeoutMs: 30_000, maxRetries: 1 }
        );
      } else {
        await (command as any).execute(
          client,
          interaction as ContextMenuCommandInteraction,
        );
      }

      // 記錄統計
      const executionMs = Date.now() - startTime;
      if (optimizations?.commandUsageTracker) {
        optimizations.commandUsageTracker.track(commandName, executionMs);
      }
    } catch (e: any) {
      // 強化的錯誤處理
      const optimizations = (client as any).optimizations;
      const logger = new Logger("指令");

      logger.error(`❌ 上下文菜單執行失敗: ${e?.message || String(e)}`);

      if (optimizations?.commandUsageTracker) {
        optimizations.commandUsageTracker.trackError(command.data.name);
      }

      if (optimizations?.errorHandler) {
        await optimizations.errorHandler.handle(e, {
          source: "ContextMenuExecution",
          commandName: command.data.name,
          userId: interaction.user.id,
          guildId: interaction.guildId,
        });
      }

      await replyOrFollowUp(interaction, {
        content: "哦喲，好像出了一點小問題，請重試",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});
