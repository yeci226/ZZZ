import { client } from "../../index.js";
import { EmbedBuilder, WebhookClient, AttachmentBuilder } from "discord.js";

import { ZenlessZoneZero, LanguageEnum } from "@yeci226/hoyoapi";
import moment from "moment-timezone";
import Logger from "../core/logger.js";
import { createTranslator } from "../core/i18n.js";
import {
  getAllGameRoles,
  getUserCookie,
  getUserLang,
} from "../utilities.js";
import { getConfig, getVerifyBaseUrl } from "../core/config.js";
import { buildZZZDailyCard } from "../canvas/dailyCard.js";
import {
  getLegacyAccounts,
  markGeneralInvalid,
  restoreGeneralValidity,
  updateLegacyAccountAtIndex,
} from "../accountStore.js";
import { buildDailySignInPresentation, normalizeSuccessfulDailyClaimInfo } from "./dailyPresentation.js";
import {
  isExplicitAuthenticationError,
  shouldRestoreGeneralValidity,
  shouldSkipAutoDailyAccount,
} from "./autoDailyAuth.js";
import {
  getDailyAuthAccountKey,
  hasLegacyInvalidProbeCompleted,
  markLegacyInvalidProbeCompleted,
} from "../core/dailyAuthState.js";
import {
  deliverAutoDailyPayload,
  normalizeAutoDailyNotifyType,
  resolveAndPersistAutoDailyGuildId,
} from "../core/autoDailyNotification.js";
import {
  shouldMarkAutoDailyProcessed,
} from "./autoDailyPolicy.js";
import {
  classifyPermanentNotificationError,
  disableNotificationDestination,
  isNotificationEnabled,
  type NotificationDestinationConfig,
} from "../core/notificationDestination.js";

const CONFIG = {
  TAIPEI_TIMEZONE: "Asia/Taipei",
  API_TIMEOUT: 15000,
  USER_TIMEOUT: 60000,
  MAX_RETRIES: 3,
  DEFAULT_LANGUAGE: "tw",
  ERROR_CODES: {
    ALREADY_SIGNED: -5003,
    GEETEST: 10035,
  },
};

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Request timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const LANGUAGE_MAPPING = {
  tw: LanguageEnum.TRADIIONAL_CHINESE,
  cn: LanguageEnum.SIMPLIFIED_CHINESE,
  vi: LanguageEnum.VIETNAMESE,
  jp: LanguageEnum.JAPANESE,
  kr: LanguageEnum.KOREAN,
  fr: LanguageEnum.FRENCH,
  default: LanguageEnum.ENGLISH,
};

interface AutoDailyConfig extends NotificationDestinationConfig {
  time: string | number;
  tag?: string | boolean;
}

interface SignInResult {
  uid: string;
  nickname: string;
  status: "success" | "already_signed" | "failed";
  rewardName?: string;
  rewardCount?: number;
  rewardIcon?: string;
  totalDays?: number;
  shortSignDay?: number;
  signCntMissed?: number;
  tomorrowRewardName?: string;
  tomorrowRewardIcon?: string;
  tomorrowRewardCount?: number;
  error?: string;
  errorType?: "account_expired" | "geetest" | "generic";
}

interface ProcessUserStats {
  total: number;
  success: number;
  alreadySigned: number;
  failed: number;
  skipped: number;
  legacyProbeCompleted: boolean;
  shouldMarkProcessed: boolean;
}

export class AutoDailyService {
  private client: any;
  private db: any;
  private webhook: WebhookClient | null;
  private errorWebhook: WebhookClient | null;
  private logger: Logger;
  private isRunning: boolean = false;

  constructor() {
    const config = getConfig();
    this.client = client;
    this.db = client.db;
    this.webhook = config.LOGWEBHOOK
      ? new WebhookClient({ url: config.LOGWEBHOOK })
      : null;
    this.errorWebhook = config.ERRWEBHOOK
      ? new WebhookClient({ url: config.ERRWEBHOOK })
      : null;
    this.logger = new Logger("自動簽到");
  }

  private getLanguage(locale: string) {
    return (
      LANGUAGE_MAPPING[locale as keyof typeof LANGUAGE_MAPPING] ||
      LANGUAGE_MAPPING.default
    );
  }

  public async run() {
    if (this.isRunning) return;
    this.isRunning = true;

    const startTime = Date.now();
    const currentHour = moment().tz(CONFIG.TAIPEI_TIMEZONE).hour();
    this.logger.success(`開始 ${currentHour}:00 自動簽到`);

    try {
      const dailyData = (await this.db.get("autoDaily")) as Record<
        string,
        AutoDailyConfig
      >;
      if (!dailyData) return;

      const userIds = Object.keys(dailyData);
      const today = moment().tz(CONFIG.TAIPEI_TIMEZONE).format("YYYY-MM-DD");

      const stats = {
        total: 0,
        success: 0,
        alreadySigned: 0,
        failed: 0,
        skipped: 0,
      };

      for (const userId of userIds) {
        try {
          const result = await withTimeout(
            (async () => {
              const config = dailyData[userId];
              let scheduledHour = Number(config.time ?? 13);
              if (!Number.isFinite(scheduledHour)) scheduledHour = 13;
              if (scheduledHour === 24) scheduledHour = 0;
              else if (scheduledHour < 0 || scheduledHour > 23) scheduledHour = 13;

              // Catch-up behavior: if the bot missed the exact hour (restart/offline),
              // run once later the same day as long as it has not been processed today.
              if (currentHour < scheduledHour) return null;

              // Skip if already processed today
              const lastProcessed = await this.db.get(`${userId}.lastAutoDaily`);
              if (lastProcessed === today) return null;

              const processed = await this.processUser(userId, config, {
                allowLegacyInvalidRecovery: currentHour === scheduledHour,
              });
              if (processed?.shouldMarkProcessed) {
                // Mark as processed only when at least one account was actually handled.
                await this.db.set(`${userId}.lastAutoDaily`, today);
              }
              return processed;
            })(),
            CONFIG.USER_TIMEOUT,
          );
          if (!result) continue;

          stats.total += result.total;
          stats.success += result.success;
          stats.alreadySigned += result.alreadySigned;
          stats.failed += result.failed;
          stats.skipped += result.skipped;
        } catch (error: any) {
          this.logger.error(
            `用戶 ${userId} 自動簽到逾時或失敗，已跳過本輪: ${error?.message || error}`,
          );
        }
      }

      await withTimeout(
        this.updateStatistics(stats, startTime, currentHour),
        CONFIG.USER_TIMEOUT,
      );
    } catch (error: any) {
      this.logger.error(`自動簽到全局錯誤: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async processUser(
    userId: string,
    config: AutoDailyConfig,
    options: { allowLegacyInvalidRecovery?: boolean } = {
      allowLegacyInvalidRecovery: false,
    },
  ) {
    const userLang = (await getUserLang(userId)) || "tw";
    const accounts = await getLegacyAccounts(this.db as any, userId);
    const tr = createTranslator(userLang);

    const stats: ProcessUserStats = {
      total: 0,
      success: 0,
      alreadySigned: 0,
      failed: 0,
      skipped: 0,
      legacyProbeCompleted: false,
      shouldMarkProcessed: false,
    };

    if (!Array.isArray(accounts) || accounts.length === 0) {
      // Stale autoDaily setting: user has no account data but still enabled auto sign.
      await this.db.delete(`autoDaily.${userId}`);
      stats.skipped = 1;
      this.logger.error(`用戶 ${userId} 無帳號資料，已自動移除 autoDaily 設定`);
      return stats;
    }

    const results: SignInResult[] = [];

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const accountKey = getDailyAuthAccountKey(
        String(account.cookie),
        String(account.uid),
      );
      const legacyInvalidProbeCompleted =
        account.invalid === true
          ? await hasLegacyInvalidProbeCompleted(this.db, userId, accountKey)
          : false;
      const legacyProbe =
        account.invalid === true &&
        !legacyInvalidProbeCompleted &&
        options.allowLegacyInvalidRecovery === true;

      if (
        shouldSkipAutoDailyAccount(
          { ...account, legacyInvalidProbeCompleted },
          options,
        )
      ) {
        stats.skipped++;
        if (account.invalid === true && legacyInvalidProbeCompleted) {
          this.logger.warn(
            `用戶 ${userId} 帳號 #${i} 已確認為整體失效，跳過自動簽到`,
          );
        } else {
          this.logger.warn(`用戶 ${userId} 帳號 #${i} 缺少 UID 或 Cookie，已跳過`);
        }
        continue;
      }

      stats.total++;
      try {
        const zzz = new ZenlessZoneZero({
          uid: Number(account.uid),
          cookie: account.cookie,
          lang: this.getLanguage(userLang),
        });

        const info = await withTimeout(zzz.daily.info(), CONFIG.API_TIMEOUT);
        let signResult: {
          status: "success" | "already_signed";
          info: any;
        };

        if (info.is_sign) {
          signResult = { status: "already_signed", info };
        } else {
          const claim = await withTimeout(zzz.daily.claim(), CONFIG.API_TIMEOUT);
          if (
            claim.code === CONFIG.ERROR_CODES.ALREADY_SIGNED
          ) {
            signResult = { status: "already_signed", info: claim.info || info };
          } else {
            signResult = {
              status: "success",
              info: normalizeSuccessfulDailyClaimInfo(info, claim.info || info),
            };
          }
        }

        if (shouldRestoreGeneralValidity(signResult.status)) {
          await restoreGeneralValidity(this.db as any, userId, String(account.uid));
          if (legacyProbe) {
            await markLegacyInvalidProbeCompleted(this.db, userId, accountKey);
            stats.legacyProbeCompleted = true;
          }
        }

        // Older account rows may predate nickname storage.  Daily signing can
        // still succeed with those rows, so opportunistically backfill the
        // ZZZ nickname only after Daily authentication has already succeeded.
        //
        // Nickname lookup failure must never fail the sign-in, invalidate the
        // account, or change authentication state.
        let resolvedNickname =
          typeof account.nickname === "string" ? account.nickname.trim() : "";

        if (!resolvedNickname) {
          try {
            const roles = await withTimeout(
              getAllGameRoles(String(account.cookie)),
              CONFIG.API_TIMEOUT,
            );

            const zzzRole = (roles ?? []).find(
              (role: any) =>
                Number(role.gameId) === 8 &&
                String(role.uid) === String(account.uid),
            );

            const fetchedNickname =
              typeof zzzRole?.nickname === "string"
                ? zzzRole.nickname.trim()
                : "";

            if (fetchedNickname) {
              resolvedNickname = fetchedNickname;

              // Nickname-only patch: do not touch cookie, invalid state,
              // lastUpdate or the AutoDaily legacy probe marker.
              await updateLegacyAccountAtIndex(
                this.db as any,
                userId,
                i,
                { nickname: fetchedNickname },
              );

              this.logger.info(
                `用戶 ${userId} UID ${account.uid} 已自動補回玩家名稱`,
              );
            }
          } catch (nicknameError: any) {
            this.logger.warn(
              `用戶 ${userId} UID ${account.uid} 無法補回玩家名稱，不影響本次自動簽到: ${
                nicknameError?.message ?? nicknameError
              }`,
            );
          }
        }

        const rewards = await withTimeout(zzz.daily.rewards(), CONFIG.API_TIMEOUT);
        const presentation = buildDailySignInPresentation(
          signResult.info,
          rewards.awards,
        );
        const reward = presentation.todayReward || rewards.awards[0];
        const tomorrowReward = presentation.tomorrowReward;
        results.push({
          uid: account.uid,
          nickname: resolvedNickname || "Unknown",
          status: signResult.status as any,
          rewardName: reward.name,
          rewardCount: reward.cnt,
          rewardIcon: reward.icon,
          totalDays: presentation.signedDays,
          shortSignDay: presentation.signedDays,
          signCntMissed: presentation.missedDays,
          tomorrowRewardName: tomorrowReward?.name,
          tomorrowRewardIcon: tomorrowReward?.icon,
          tomorrowRewardCount: tomorrowReward?.cnt,
        });

        if (signResult.status === "success") stats.success++;
        else stats.alreadySigned++;
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        const authenticationError = isExplicitAuthenticationError(error);
        const displayError = authenticationError
          ? tr("daily_AuthExpiredDesc")
          : errorMessage;
        stats.failed++;

        // Legacy invalid accounts are probed once to classify old shared auth
        // state. If Daily itself confirms an explicit auth failure, persist the
        // classification silently so users are not notified again about an old
        // already-known invalid account.
        //
        // Normal accounts still receive their first auth-expired notification.
        // Transient/non-auth legacy probe failures are also still notified and
        // remain retryable.
        if (!(legacyProbe && authenticationError)) {
          results.push({
            uid: account.uid,
            nickname: account.nickname || "Unknown",
            status: "failed",
            error: displayError,
            errorType: authenticationError
              ? "account_expired"
              : errorMessage.includes("10035")
                ? "geetest"
                : "generic",
          });
        }

        // Only a direct authentication failure invalidates the general
        // account. Redeem-scoped failures never reach this path.
        if (authenticationError) {
          await markGeneralInvalid(this.db as any, userId, String(account.uid));
          await markLegacyInvalidProbeCompleted(this.db, userId, accountKey);
          if (legacyProbe) {
            stats.legacyProbeCompleted = true;
          }
        }

        if (this.errorWebhook) {
          const errorEmbed = new EmbedBuilder()
            .setColor("#E76161")
            .setTitle(`[自動簽到失敗] 用戶: ${userId}`)
            .addFields(
              { name: "UID", value: String(account.uid), inline: true },
              { name: "錯誤訊息", value: displayError, inline: true },
            )
            .setTimestamp();
          await this.errorWebhook
            .send({ embeds: [errorEmbed] })
            .catch(() => {});
        }
      }
    }

    let notificationDelivered = results.length === 0;
    try {
      if (results.length > 0) {
        notificationDelivered = await withTimeout(
          this.sendNotification(userId, config, results, tr),
          CONFIG.USER_TIMEOUT,
        );
      }
    } catch (error) {
      this.logger.error(`發送通知失敗 (User: ${userId}): ${error}`);
    }

    stats.shouldMarkProcessed = shouldMarkAutoDailyProcessed({
      success: stats.success,
      alreadySigned: stats.alreadySigned,
      legacyProbeCompleted: stats.legacyProbeCompleted,
      notificationDelivered,
    });

    return stats;
  }

  private async sendNotification(
    userId: string,
    config: AutoDailyConfig,
    results: SignInResult[],
    tr: any,
  ): Promise<boolean> {
    if (!isNotificationEnabled(config)) return true;

    const tag =
      config.tag === "true" || config.tag === true ? `<@${userId}>` : "";

    const notifyType = normalizeAutoDailyNotifyType(config.notifyType);
    const channelId = config.channelId;
    let guildId = config.guildId;
    if (notifyType === "channel") {
      if (!channelId) {
        await disableNotificationDestination(
          this.db,
          "autoDaily",
          userId,
          config,
          "missing_target",
        );
        this.logger.warn(
          `用戶 ${userId} 的自動簽到通知缺少目的地；已停用通知，自動簽到維持啟用`,
        );
        return true;
      }
      guildId = await resolveAndPersistAutoDailyGuildId(
        this.client,
        this.db,
        userId,
        config,
      );
      if (!guildId) {
        await disableNotificationDestination(
          this.db,
          "autoDaily",
          userId,
          config,
          "guild_unavailable",
        );
        this.logger.warn(
          `用戶 ${userId} 的自動簽到通知目的地已失效；已停用通知，自動簽到維持啟用`,
        );
        return true;
      }
    }

    // Separate failed results (embed only) from sign results (canvas card)
    const failedResults = results.filter((r) => r.status === "failed");
    const signedResults = results.filter((r) => r.status !== "failed");

    // Build canvas card files for signed results
    // If canvas fails, fallback to a plain embed so the user still gets notified
    const cardFiles: { buffer: string; name: string }[] = [];
    const canvasFallbackEmbeds: object[] = [];
    for (let i = 0; i < signedResults.length; i++) {
      const res = signedResults[i];
      try {
        const buf = await buildZZZDailyCard({
          nickname: res.nickname || "Unknown",
          uid: res.uid,
          status: res.status as "success" | "already_signed",
          rewardName: res.rewardName || "",
          rewardIcon: res.rewardIcon,
          rewardCount: res.rewardCount ?? 1,
          totalDays: res.totalDays ?? 0,
          shortSignDay: res.shortSignDay,
          signCntMissed: res.signCntMissed,
          tomorrowRewardName: res.tomorrowRewardName,
          tomorrowRewardIcon: res.tomorrowRewardIcon,
          tomorrowRewardCount: res.tomorrowRewardCount,
          labelTodayReward: tr("card_TodayReward"),
          labelTomorrowReward: tr("card_TomorrowReward"),
          labelMonthSignIn: tr("card_MonthSignIn"),
          labelMonthMissed: tr("card_MonthMissed"),
        });
        cardFiles.push({
          buffer: buf.toString("base64"),
          name: `daily-zzz-${i}.png`,
        });
      } catch (e) {
        this.logger.error(`Canvas card 生成失敗 (${res.uid}): ${e}`);
        // Fallback: send a plain embed so user is still notified
        const statusLabel = res.status === "success" ? tr("daily_Success") : tr("daily_AlreadySigned");
        canvasFallbackEmbeds.push(
          new EmbedBuilder()
            .setColor(res.status === "success" ? "#5BB85D" : "#5B9BD5")
            .setTitle(`${res.uid} ${statusLabel}`)
            .setDescription(res.rewardName ? `${tr("card_TodayReward")}: ${res.rewardName} ×${res.rewardCount ?? 1}` : null)
            .toJSON()
        );
      }
    }

    // Build error embeds for failed results
    const errorEmbeds = failedResults.map((res) => {
      const embed = new EmbedBuilder()
        .setColor("#E76161")
        .setTitle(`${res.uid} ${tr("daily_Failed")}`);
      if (res.errorType === "account_expired") {
        embed
          .setTitle(tr("daily_AuthExpiredTitle"))
          .setDescription(`- \`${res.uid}\`: ${tr("daily_AuthExpiredDesc")}`);
      } else if (res.errorType === "geetest" || res.error?.includes("10035")) {
        embed
          .setTitle(tr("autoDaily_GeetestTitle").replace("<uid>", res.uid))
          .setURL(
            `${getVerifyBaseUrl()}/verify?session=${Math.random().toString(36).substring(2, 12)}&userid=${userId}`,
          );
      } else {
        embed.setDescription(`Error: ${res.error}`);
      }
      return embed.toJSON();
    });

    this.logger.info(
      `發送通知 (User: ${userId}) method=${notifyType} cards=${cardFiles.length} canvasFallbacks=${canvasFallbackEmbeds.length} errors=${errorEmbeds.length}${notifyType === "channel" ? ` channelId=${channelId} guildId=${guildId}` : ""}`,
    );

    // Merge canvas fallback embeds with error embeds so they all go through the same path
    const allEmbeds = [...canvasFallbackEmbeds, ...errorEmbeds];
    let delivered = false;

    const sendToChannel = async (
      targetChannelId: string,
      targetGuildId: string,
      msgPayload: any,
    ) => {
      // 先依 channel cache 或 guild cache 找到負責的 cluster；channel 未快取時再 fetch。
      const channelPresence = await this.client.cluster.broadcastEval(
        (c: any, ctx: any) =>
          c.channels.cache.has(ctx.channelId) ||
          Boolean(c.guilds?.cache?.has(ctx.guildId)),
        { context: { channelId: targetChannelId, guildId: targetGuildId } },
      );
      const targetCluster = channelPresence.findIndex(Boolean);
      if (targetCluster < 0) {
        throw new Error(
          `No cluster owns guild ${targetGuildId} for channel ${targetChannelId}`,
        );
      }

      // 序列化 files（AttachmentBuilder 無法直接跨 cluster 傳遞）
      const serializedFiles = msgPayload.files
        ? await Promise.all(
            msgPayload.files.map(async (file: any) => {
              const attachment = file.attachment;
              let buffer = Buffer.alloc(0);
              if (Buffer.isBuffer(attachment)) buffer = Buffer.from(attachment);
              else if (attachment instanceof Uint8Array) buffer = Buffer.from(attachment);
              return {
                buffer: buffer.toString("base64"),
                name: file.name,
                description: file.description,
              };
            }),
          )
        : [];

      const serializedPayload = {
        content: msgPayload.content,
        embeds: msgPayload.embeds,
        files: serializedFiles,
      };

      const sendResults = await this.client.cluster.broadcastEval(
        async (c: any, ctx: any) => {
          let channel = c.channels.cache.get(ctx.channelId);
          if (!channel && typeof c.channels.fetch === "function") {
            channel = await c.channels.fetch(ctx.channelId).catch(() => null);
          }
          if (!channel || typeof (channel as any).send !== "function") return false;
          const { AttachmentBuilder } = await import("discord.js");
          const files = ctx.payload.files.map(
            (f: any) =>
              new AttachmentBuilder(Buffer.from(f.buffer, "base64"), {
                name: f.name,
                description: f.description,
              }),
          );
          await (channel as any).send({
            content: ctx.payload.content,
            embeds: ctx.payload.embeds,
            files,
          });
          return true;
        },
        {
          cluster: targetCluster,
          context: { channelId: targetChannelId, payload: serializedPayload },
        },
      );
      if (!sendResults.some(Boolean)) {
        throw new Error(`No cluster sent message to channel ${targetChannelId}`);
      }
    };

    let dmUser: any;
    const sendPayload = async (msgPayload: any) =>
      deliverAutoDailyPayload(
        notifyType,
        async () => {
          if (!channelId || !guildId) {
            throw new Error("Missing channel notification target");
          }
          await sendToChannel(channelId, guildId, msgPayload);
        },
        async () => {
          dmUser ??= await this.client.users.fetch(userId);
          await dmUser.send(msgPayload);
        },
      );

    let permanentlyDisabled = false;
    const attemptDelivery = async (msgPayload: any): Promise<boolean> => {
      try {
        await sendPayload(msgPayload);
        delivered = true;
        return true;
      } catch (error) {
        const permanentReason = classifyPermanentNotificationError(error);
        if (permanentReason) {
          permanentlyDisabled = true;
          await disableNotificationDestination(
            this.db,
            "autoDaily",
            userId,
            config,
            permanentReason,
          );
          this.logger.warn(
            `用戶 ${userId} 的自動簽到通知目的地永久失效 (${permanentReason})；已停用通知，自動簽到維持啟用`,
          );
          return false;
        }
        this.logger.error(
          `${notifyType} 發送失敗且不切換通知方式 (User: ${userId}): ${error}`,
        );
        return false;
      }
    };

    for (let i = 0; i < cardFiles.length; i++) {
      const cardFile = cardFiles[i];
      const isFirst = i === 0;
      const content = isFirst && tag ? tag : undefined;
      const fileBuffer = Buffer.from(cardFile.buffer, "base64");
      const msgPayload = {
        ...(content && { content }),
        files: [new AttachmentBuilder(fileBuffer, { name: cardFile.name })],
      };
      await attemptDelivery(msgPayload);
      if (permanentlyDisabled) break;
    }
    if (allEmbeds.length > 0 && !permanentlyDisabled) {
      await attemptDelivery({ embeds: allEmbeds });
    }
    // A permanent notification failure must not make a successful game action
    // incomplete. It is now disabled and will not be retried next hour/day.
    return delivered || permanentlyDisabled;
  }

  private async updateStatistics(
    stats: any,
    startTime: number,
    currentHour: number,
  ) {
    const duration = (Date.now() - startTime) / 1000;
    this.logger.success(
      `已完成 ${currentHour}:00 自動簽到: ${stats.total} 總數, ${stats.success} 成功, ${stats.alreadySigned} 已簽到, ${stats.skipped} 跳過, ${stats.failed} 失敗`,
    );

    if (this.webhook) {
      const statsEmbed = new EmbedBuilder()
        .setColor("#F2BE22")
        .setTitle(`${currentHour}:00 自動簽到統計`)
        .addFields(
          { name: "總數", value: `\`${stats.total}\``, inline: true },
          { name: "成功", value: `\`${stats.success}\``, inline: true },
          { name: "已簽到", value: `\`${stats.alreadySigned}\``, inline: true },
          { name: "跳過", value: `\`${stats.skipped}\``, inline: true },
          { name: "失敗", value: `\`${stats.failed}\``, inline: true },
          { name: "耗時", value: `\`${duration.toFixed(2)}s\``, inline: true },
        )
        .setTimestamp();
      await this.webhook.send({ embeds: [statsEmbed] }).catch(() => {});
    }
  }
}

let service: AutoDailyService | null = null;

export default async function autoDaily() {
  if (!service) service = new AutoDailyService();
  await service.run();
}
