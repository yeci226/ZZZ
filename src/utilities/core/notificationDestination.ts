import type { DbAdapter } from "../accountStore.js";

export type NotificationFeature = "autoDaily" | "autoRedeem" | "noteReminder";

export type NotificationInvalidReason =
  | "missing_target"
  | "unknown_channel"
  | "unknown_guild"
  | "unknown_member"
  | "missing_access"
  | "missing_permissions"
  | "cannot_dm"
  | "no_mutual_guild"
  | "guild_unavailable";

export interface NotificationDestinationConfig {
  notificationEnabled?: boolean;
  notifyType?: "channel" | "dm";
  channelId?: string;
  guildId?: string;
  notificationInvalidatedAt?: string;
  notificationInvalidReason?: NotificationInvalidReason;
  [key: string]: unknown;
}

const PERMANENT_CODES = new Map<number, NotificationInvalidReason>([
  [10003, "unknown_channel"],
  [10004, "unknown_guild"],
  [10007, "unknown_member"],
  [50001, "missing_access"],
  [50007, "cannot_dm"],
  [50013, "missing_permissions"],
  [50278, "no_mutual_guild"],
]);

function readErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as Record<string, unknown>;
  const direct = Number(candidate.code);
  if (Number.isFinite(direct)) return direct;
  const rawError = candidate.rawError;
  if (rawError && typeof rawError === "object") {
    const nested = Number((rawError as Record<string, unknown>).code);
    if (Number.isFinite(nested)) return nested;
  }
  return undefined;
}

export function classifyPermanentNotificationError(
  error: unknown,
): NotificationInvalidReason | null {
  const code = readErrorCode(error);
  if (code !== undefined && PERMANENT_CODES.has(code)) {
    return PERMANENT_CODES.get(code)!;
  }

  const message = String(
    error && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : error ?? "",
  ).toLowerCase();

  if (message.includes("unknown channel")) return "unknown_channel";
  if (message.includes("unknown guild")) return "unknown_guild";
  if (message.includes("unknown member")) return "unknown_member";
  if (message.includes("missing access")) return "missing_access";
  if (message.includes("missing permissions")) return "missing_permissions";
  if (message.includes("cannot send messages to this user")) return "cannot_dm";
  if (message.includes("no mutual guild")) return "no_mutual_guild";
  if (message.includes("no cluster owns guild")) return "guild_unavailable";
  if (message.includes("missing channel notification target")) {
    return "missing_target";
  }
  return null;
}

export function isNotificationEnabled(
  config: NotificationDestinationConfig | null | undefined,
): boolean {
  // Legacy rows did not have this field and are considered enabled until they
  // are migrated or their destination is proven invalid.
  return config?.notificationEnabled !== false;
}

export function enableNotificationDestination<T extends NotificationDestinationConfig>(
  config: T,
  destination: Pick<
    NotificationDestinationConfig,
    "notifyType" | "channelId" | "guildId"
  >,
): T {
  const next = {
    ...config,
    ...destination,
    notificationEnabled: true,
  } as T;
  delete next.notificationInvalidatedAt;
  delete next.notificationInvalidReason;
  return next;
}

export async function disableNotificationDestination(
  db: Pick<DbAdapter, "set">,
  feature: NotificationFeature,
  userId: string,
  config: NotificationDestinationConfig,
  reason: NotificationInvalidReason,
): Promise<NotificationDestinationConfig> {
  const next: NotificationDestinationConfig = {
    ...config,
    notificationEnabled: false,
    notificationInvalidatedAt: new Date().toISOString(),
    notificationInvalidReason: reason,
  };
  // Invalid Discord snowflakes must not remain as future send targets.
  delete next.channelId;
  delete next.guildId;
  await db.set(`${feature}.${userId}`, next);
  Object.assign(config, next);
  delete config.channelId;
  delete config.guildId;
  return next;
}

export async function disableDestinationsMatching(
  db: Pick<DbAdapter, "get" | "set">,
  match: { guildId?: string; channelId?: string },
  reason: NotificationInvalidReason,
): Promise<number> {
  let disabled = 0;
  const features: NotificationFeature[] = [
    "autoDaily",
    "autoRedeem",
    "noteReminder",
  ];
  for (const feature of features) {
    const rows = await db.get<Record<string, NotificationDestinationConfig>>(feature);
    if (!rows || typeof rows !== "object") continue;
    for (const [userId, config] of Object.entries(rows)) {
      if (!isNotificationEnabled(config)) continue;
      const matchesGuild = match.guildId && config.guildId === match.guildId;
      const matchesChannel = match.channelId && config.channelId === match.channelId;
      if (!matchesGuild && !matchesChannel) continue;
      await disableNotificationDestination(db, feature, userId, config, reason);
      disabled++;
    }
  }
  return disabled;
}
