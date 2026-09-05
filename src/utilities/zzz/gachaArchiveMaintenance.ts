import Logger from "../core/logger.js";
import { getLegacyAccounts } from "../accountStore.js";
import {
  classifyPermanentNotificationError,
  disableNotificationDestination,
  isNotificationEnabled,
} from "../core/notificationDestination.js";
import { createZzzClient, getZzzClientLanguage } from "./clientFactory.js";
import { getGachaArchiveStore, type GachaArchiveAccount } from "./gachaArchive.js";
import { syncOfficialGachaArchive } from "./gachaSync.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function reconcileWeeklyArchiveAccounts(
  ownerId: string,
  enabled: boolean,
  accounts: Array<{ uid?: string | number; region?: unknown }>,
  archive: Pick<ReturnType<typeof getGachaArchiveStore>, "listAccounts" | "upsertAccount" | "restoreLinked" | "setWeeklyEnabled">,
): void {
  if (!enabled) {
    for (const row of archive.listAccounts(ownerId).filter((row) => row.source === "official")) {
      archive.setWeeklyEnabled(ownerId, row.uid, false);
    }
    return;
  }
  for (const account of accounts) {
    const uid = String(account.uid ?? "");
    if (!uid) continue;
    const region = String(account.region ?? "");
    archive.upsertAccount({ ownerId, uid, region, source: "official", everLinked: true });
    archive.restoreLinked(ownerId, uid, region);
    archive.setWeeklyEnabled(ownerId, uid, true);
  }
}

export async function listGloballyEnabledOwners(db: any): Promise<string[]> {
  if (typeof db?.all !== "function") return [];
  const rows = await db.all();
  return (Array.isArray(rows) ? rows : [])
    .filter((row: any) => row?.value?.gachaWeeklyArchive === true)
    .map((row: any) => String(row.id ?? ""))
    .filter(Boolean);
}

async function sendPurgeWarning(client: any, ownerId: string, rows: GachaArchiveAccount[]): Promise<void> {
  const config = await client.db.get(`${ownerId}.noteReminder`)
    ?? await client.db.get(`noteReminder.${ownerId}`);
  if (!config || !isNotificationEnabled(config)) return;
  const uid = rows[0]?.uid ?? "";
  const sources = rows.map((row) => row.source === "official" ? "官方封存" : "手動匯入").join("、");
  const purgeAfter = rows[0]?.purgeAfter;
  const days = purgeAfter
    ? Math.max(0, Math.ceil((new Date(purgeAfter).getTime() - Date.now()) / 86_400_000))
    : 7;
  const content = `<@${ownerId}> 你的 ZZZ UID \`${uid}\`（${sources}）封存將於約 ${days} 天後永久刪除。重新綁定相同 UID 可取消刪除，或使用 /settings 立即清除。`;

  try {
    if (config.notifyType === "dm") {
      await (await client.users.fetch(ownerId)).send({ content });
      return;
    }
    if (!config.guildId || !config.channelId) return;
    const result = await client.cluster.broadcastEval(
      async (c: any, ctx: { guildId: string; channelId: string; content: string }) => {
        if (!c.guilds.cache.has(ctx.guildId)) return { owner: false };
        try {
          const channel = c.channels.cache.get(ctx.channelId)
            ?? await c.channels.fetch(ctx.channelId).catch(() => null);
          if (!channel || typeof channel.send !== "function") {
            return { owner: true, code: 10003, message: "Unknown Channel" };
          }
          await channel.send({ content: ctx.content });
          return { owner: true, delivered: true };
        } catch (error: any) {
          return { owner: true, code: error?.code, message: error?.message };
        }
      },
      { context: { guildId: config.guildId, channelId: config.channelId, content } },
    );
    const owner = result.find((entry: any) => entry?.owner);
    if (!owner?.delivered) {
      const reason = classifyPermanentNotificationError(owner ?? "No cluster owns guild");
      if (reason) await disableNotificationDestination(client.db, "noteReminder", ownerId, config, reason);
    }
  } catch (error) {
    const reason = classifyPermanentNotificationError(error);
    if (reason) await disableNotificationDestination(client.db, "noteReminder", ownerId, config, reason);
  }
}

export async function runGachaArchiveMaintenance(client: any, now = new Date()): Promise<void> {
  const logger = new Logger("調頻封存排程");
  const archive = getGachaArchiveStore();
  const dueBefore = new Date(now.getTime() - WEEK_MS);
  const due = archive.listWeeklyDue(dueBefore);
  const globalOwners = await listGloballyEnabledOwners(client.db);
  const owners = [...new Set([
    ...due.map((account) => account.ownerId),
    ...globalOwners,
  ])];
  let synced = 0;
  let failed = 0;

  for (const ownerId of owners) {
    const accounts = await getLegacyAccounts(client.db, ownerId);
    const linkedUids = new Set(accounts.map((account) => String(account.uid)));
    for (const archived of archive.listAccounts(ownerId).filter((account) => account.everLinked)) {
      if (!linkedUids.has(archived.uid)) archive.markOrphaned(ownerId, archived.uid, now);
    }
    const globallyEnabled = globalOwners.includes(ownerId);
    const locale = String((await client.db.get(`${ownerId}.locale`)) ?? "tw");
    for (const account of accounts) {
      if (!account.uid || !account.cookie || account.invalid === true) continue;
      const uid = String(account.uid);
      const existing = archive.getAccount(ownerId, uid, "official");
      if (!globallyEnabled && !existing?.weeklyEnabled) continue;
      if (existing?.lastSyncedAt && new Date(existing.lastSyncedAt) > dueBefore) continue;
      try {
        const zzz = createZzzClient({
          cookie: account.cookie,
          uid: Number(account.uid),
          lang: getZzzClientLanguage(locale),
        } as any) as any;
        await syncOfficialGachaArchive({ zzz, ownerId, enableWeekly: true });
        synced++;
      } catch {
        // The sync utility records a sanitized failure and preserves old rows.
        failed++;
      }
    }
  }

  const warnings = archive.listPurgeWarnings(now);
  const warningGroups = new Map<string, GachaArchiveAccount[]>();
  for (const row of warnings) {
    const key = `${row.ownerId}:${row.uid}`;
    warningGroups.set(key, [...(warningGroups.get(key) ?? []), row]);
  }
  for (const rows of warningGroups.values()) {
    await sendPurgeWarning(client, rows[0]!.ownerId, rows);
    // Delivery is best-effort and must never postpone deletion.
    for (const row of rows) archive.markPurgeWarned(row.ownerId, row.uid, row.source, now);
  }

  const purged = archive.purgeExpired(now);
  if (synced || failed || warnings.length || purged) {
    logger.info(`完成：同步 ${synced}、失敗 ${failed}、刪除前提示 ${warningGroups.size}、清除 ${purged}`);
  }
}
