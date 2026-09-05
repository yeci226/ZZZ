import Logger from "../core/logger.js";
import { getLegacyAccounts } from "../accountStore.js";
import { getUserLang } from "../utilities.js";
import { createZzzClient, getZzzClientLanguage } from "./clientFactory.js";
import { loadOfficialNoteData } from "./officialRecordApi.js";
import { renderOfficialNote } from "./noteRenderer.js";
import { normalizeNoteReminderConfig, type NoteReminderConfig } from "./reminderConfig.js";
import { evaluateNoteReminder, type ReminderTrigger } from "./reminderEvaluator.js";
import {
  classifyPermanentNotificationError,
  disableNotificationDestination,
  isNotificationEnabled,
  type NotificationInvalidReason,
} from "../core/notificationDestination.js";

interface ReminderState {
  sent?: Record<string, string>;
  energyArmed?: boolean;
  failureCooldownUntil?: number;
}

type DeliveryResult =
  | { delivered: true }
  | { delivered: false; permanent: true; reason: NotificationInvalidReason }
  | { delivered: false; permanent: false; error: string };

async function deliverReminder(
  client: any,
  userId: string,
  config: NoteReminderConfig,
  files: Buffer[],
): Promise<DeliveryResult> {
  const content = config.tag ? `<@${userId}>` : undefined;
  try {
    if (config.notifyType === "dm") {
      const user = await client.users.fetch(userId);
      await user.send({
        content,
        files: files.map((buffer, index) => ({
          attachment: buffer,
          name: `zzz-reminder-${index + 1}.png`,
        })),
      });
      return { delivered: true };
    }
    if (!config.channelId || !config.guildId) {
      return { delivered: false, permanent: true, reason: "missing_target" };
    }

    const payload = {
      userId,
      guildId: config.guildId,
      channelId: config.channelId,
      content,
      files: files.map((buffer, index) => ({
        data: buffer.toString("base64"),
        name: `zzz-reminder-${index + 1}.png`,
      })),
    };
    const results = await client.cluster.broadcastEval(
      async (c: any, ctx: typeof payload) => {
        const guild = c.guilds.cache.get(ctx.guildId);
        if (!guild) return { owner: false };
        try {
          const channel = c.channels.cache.get(ctx.channelId)
            ?? await c.channels.fetch(ctx.channelId).catch(() => null);
          if (!channel || typeof channel.send !== "function") {
            return { owner: true, delivered: false, permanent: true, reason: "unknown_channel" };
          }
          const member = await guild.members.fetch(ctx.userId).catch(() => null);
          if (!member) return { owner: true, delivered: false, permanent: true, reason: "unknown_member" };
          const { AttachmentBuilder, PermissionsBitField } = await import("discord.js");
          const botMember = guild.members.me;
          const userPermissions = channel.permissionsFor(member);
          const botPermissions = botMember ? channel.permissionsFor(botMember) : null;
          const sendFlag = channel.isThread?.()
            ? PermissionsBitField.Flags.SendMessagesInThreads
            : PermissionsBitField.Flags.SendMessages;
          if (!userPermissions?.has(PermissionsBitField.Flags.ViewChannel) || !userPermissions.has(sendFlag)) {
            return { owner: true, delivered: false, permanent: true, reason: "missing_access" };
          }
          if (!botPermissions?.has(PermissionsBitField.Flags.ViewChannel)
            || !botPermissions.has(sendFlag)
            || !botPermissions.has(PermissionsBitField.Flags.AttachFiles)) {
            return { owner: true, delivered: false, permanent: true, reason: "missing_permissions" };
          }
          await channel.send({
            content: ctx.content,
            files: ctx.files.map((file) => new AttachmentBuilder(Buffer.from(file.data, "base64"), { name: file.name })),
          });
          return { owner: true, delivered: true };
        } catch (error: any) {
          return { owner: true, delivered: false, code: error?.code, message: error?.message };
        }
      },
      { context: payload },
    );
    const ownerResult = results.find((result: any) => result?.owner);
    if (!ownerResult) return { delivered: false, permanent: true, reason: "guild_unavailable" };
    if (ownerResult.delivered) return { delivered: true };
    if (ownerResult.permanent) {
      return { delivered: false, permanent: true, reason: ownerResult.reason };
    }
    const reason = classifyPermanentNotificationError({
      code: ownerResult.code,
      message: ownerResult.message,
    });
    return reason
      ? { delivered: false, permanent: true, reason }
      : { delivered: false, permanent: false, error: String(ownerResult.message || "Discord delivery failed") };
  } catch (error: any) {
    const reason = classifyPermanentNotificationError(error);
    return reason
      ? { delivered: false, permanent: true, reason }
      : { delivered: false, permanent: false, error: String(error?.message || error) };
  }
}

export class NoteReminderService {
  private running = false;
  private readonly logger = new Logger("即時便箋提醒");

  constructor(private readonly client: any) {}

  async run(now = Date.now()): Promise<void> {
    if (this.running) return;
    this.running = true;
    let delivered = 0;
    let failed = 0;
    try {
      const rows = await this.client.db.get("noteReminder") as Record<string, unknown> | null;
      if (!rows || typeof rows !== "object") return;
      for (const [userId, raw] of Object.entries(rows)) {
        const config = normalizeNoteReminderConfig(raw);
        if (!config.enabled || !isNotificationEnabled(config)) continue;
        const locale = (await getUserLang(userId)) || "tw";
        const accounts = await getLegacyAccounts(this.client.db, userId);
        for (const account of accounts) {
          if (!account?.uid || !account?.cookie || account.invalid === true) continue;
          const stateKey = `noteReminderState.${userId}.${account.uid}`;
          const state = ((await this.client.db.get(stateKey)) || {}) as ReminderState;
          if (Number(state.failureCooldownUntil ?? 0) > now) continue;
          try {
            const zzz = createZzzClient({
              cookie: account.cookie,
              lang: getZzzClientLanguage(locale),
              uid: Number(account.uid),
            } as any) as any;
            const { note, calendar } = await loadOfficialNoteData(zzz);
            const evaluation = evaluateNoteReminder(note, calendar, config, {
              now,
              region: String(account.region ?? zzz.region ?? ""),
            });
            const pending = this.pendingTriggers(evaluation.triggers, state);
            if (!evaluation.energyCondition && state.energyArmed === false) {
              state.energyArmed = true;
              await this.client.db.set(stateKey, state);
            }
            if (pending.length === 0) continue;
            const pages = await renderOfficialNote({
              uid: String(account.uid), playerName: account.nickname, locale, note, calendar,
              highlighted: pending.map((trigger) => trigger.key), now,
            });
            const result = await deliverReminder(this.client, userId, config, pages);
            if (result.delivered) {
              state.sent ??= {};
              for (const trigger of pending) state.sent[trigger.key] = trigger.cycle;
              if (pending.some((trigger) => trigger.key === "energy")) state.energyArmed = false;
              delete state.failureCooldownUntil;
              await this.client.db.set(stateKey, state);
              delivered++;
            } else if (result.permanent) {
              await disableNotificationDestination(
                this.client.db, "noteReminder", userId, config, result.reason,
              );
              this.logger.warn(
                `用戶 ${userId} 的提醒通知目的地永久失效 (${result.reason})；已保留提醒條件並停用通知`,
              );
              break;
            } else {
              state.failureCooldownUntil = now + 3600_000;
              await this.client.db.set(stateKey, state);
              failed++;
            }
          } catch (error: any) {
            failed++;
            this.logger.error(`用戶 ${userId} UID ${account.uid} 提醒檢查失敗: ${String(error?.message || error)}`);
          }
        }
      }
      if (delivered || failed) this.logger.info(`本輪完成：${delivered} 個帳號已提醒，${failed} 個帳號失敗`);
    } finally {
      this.running = false;
    }
  }

  private pendingTriggers(triggers: ReminderTrigger[], state: ReminderState): ReminderTrigger[] {
    return triggers.filter((trigger) => {
      if (trigger.key === "energy") return state.energyArmed !== false;
      return state.sent?.[trigger.key] !== trigger.cycle;
    });
  }
}

let service: NoteReminderService | undefined;
export default async function runNoteReminders(client: any): Promise<void> {
  service ??= new NoteReminderService(client);
  await service.run();
}
