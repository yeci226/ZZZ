import { Routes } from "discord.js";

export type AutoDailyNotifyType = "dm" | "channel";

export interface AutoDailyNotificationConfig {
  channelId?: string;
  guildId?: string;
  notifyType?: unknown;
}

interface AutoDailyNotificationDb {
  set(key: string, value: unknown): Promise<unknown> | unknown;
}

export function normalizeAutoDailyNotifyType(
  value: unknown,
): AutoDailyNotifyType {
  return value === "dm" ? "dm" : "channel";
}

export async function deliverAutoDailyPayload(
  notifyType: unknown,
  sendChannel: () => Promise<unknown>,
  sendDm: () => Promise<unknown>,
): Promise<AutoDailyNotifyType> {
  const method = normalizeAutoDailyNotifyType(notifyType);
  if (method === "dm") {
    await sendDm();
    return "dm";
  }

  await sendChannel();
  return "channel";
}

export async function resolveAndPersistAutoDailyGuildId(
  client: any,
  db: AutoDailyNotificationDb,
  userId: string,
  config: AutoDailyNotificationConfig,
): Promise<string | undefined> {
  if (typeof config.guildId === "string" && config.guildId.length > 0) {
    return config.guildId;
  }

  const channelId =
    typeof config.channelId === "string" ? config.channelId : "";
  if (!channelId) return undefined;

  let guildId: string | undefined;
  try {
    const cachedGuildIds = await client.cluster.broadcastEval(
      (c: any, context: any) => {
        const channel = c.channels.cache.get(context.channelId);
        return typeof channel?.guildId === "string" ? channel.guildId : null;
      },
      { context: { channelId } },
    );
    guildId = cachedGuildIds.find(
      (value: unknown): value is string =>
        typeof value === "string" && value.length > 0,
    );
  } catch {
    // Cache lookup is best-effort; REST metadata is authoritative below.
  }

  if (!guildId) {
    try {
      const channel = (await client.rest.get(Routes.channel(channelId))) as {
        guild_id?: unknown;
      };
      if (typeof channel?.guild_id === "string" && channel.guild_id.length > 0) {
        guildId = channel.guild_id;
      }
    } catch {
      return undefined;
    }
  }

  if (!guildId) return undefined;

  const nextConfig: AutoDailyNotificationConfig = {
    ...config,
    guildId,
    notifyType: normalizeAutoDailyNotifyType(config.notifyType),
  };
  Object.assign(config, nextConfig);
  await db.set(`autoDaily.${userId}`, nextConfig);
  return guildId;
}
