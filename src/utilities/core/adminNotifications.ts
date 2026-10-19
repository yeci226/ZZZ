import type { NotificationDestinationConfig } from "./notificationDestination.js";
import { enableNotificationDestination } from "./notificationDestination.js";
import type { MimoStore } from "../mimo/store.js";
import type { NewsSubscription } from "../news/types.js";
import { NewsConflictError, type NewsStore } from "../news/store.js";

export const ADMIN_NOTIFICATION_FEATURES = [
  { value: "autoDaily", name: "Auto daily", tw: "自動簽到" },
  { value: "autoRedeem", name: "Auto redeem", tw: "自動兌換" },
  { value: "noteReminder", name: "Note reminders", tw: "即時便箋提醒" },
  { value: "autoMimo", name: "Auto Mimo", tw: "Auto Mimo" },
  { value: "news", name: "News subscriptions", tw: "新聞頻道訂閱" },
] as const;
export type AdminNotificationFeature =
  (typeof ADMIN_NOTIFICATION_FEATURES)[number]["value"];
export type AdminNotificationOutcome =
  "success" | "skipped" | "conflict" | "failed";
export interface AdminNotificationResult {
  feature: AdminNotificationFeature;
  outcome: AdminNotificationOutcome;
  reason?:
    | "source_required"
    | "same_channel"
    | "permissions"
    | "changed"
    | "target_exists"
    | "no_match"
    | "unavailable";
}
export interface AdminNotificationRequest {
  action: "move" | "remove";
  feature: AdminNotificationFeature | "all";
  guildId: string;
  sourceChannelId?: string;
  targetChannelId?: string;
  userId?: string;
}
export interface AdminNotificationDependencies {
  db: {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<any>;
  };
  mimo(): MimoStore;
  news(): NewsStore;
  channelGuild(channelId: string): Promise<string | null>;
  canMove(userId?: string, news?: NewsSubscription): Promise<boolean>;
}

// Compare only fields that determine eligibility/destination; unrelated settings
// are read again and preserved immediately before writing.
function destinationKey(c: NotificationDestinationConfig): string {
  return JSON.stringify([
    c.notifyType,
    c.channelId,
    c.guildId,
    c.notificationEnabled,
  ]);
}
export async function manageAdminNotifications(
  request: AdminNotificationRequest,
  deps: AdminNotificationDependencies,
): Promise<AdminNotificationResult[]> {
  if (request.action === "move" && !request.targetChannelId)
    throw new Error("target_required");
  if (
    request.action === "remove" &&
    request.feature !== "news" &&
    !request.userId
  )
    throw new Error("user_required");
  const results: AdminNotificationResult[] = [];
  const features = ADMIN_NOTIFICATION_FEATURES.filter(
    (f) => request.feature === "all" || request.feature === f.value,
  );
  async function matches(
    c: {
      channelId?: string;
      guildId?: string;
      notifyType?: string;
      notificationEnabled?: boolean;
    },
    owner?: string,
  ): Promise<boolean> {
    if (request.userId && request.userId !== owner) return false;
    if (
      !c.channelId ||
      c.notifyType === "dm" ||
      c.notifyType === "off" ||
      c.notificationEnabled === false
    )
      return false;
    if (request.sourceChannelId && c.channelId !== request.sourceChannelId)
      return false;
    if (c.guildId) return c.guildId === request.guildId;
    return (await deps.channelGuild(c.channelId)) === request.guildId;
  }
  for (const { value: feature } of features) {
    const start = results.length;
    const add = (
      outcome: AdminNotificationOutcome,
      reason?: AdminNotificationResult["reason"],
    ) => results.push({ feature, outcome, reason });
    try {
      if (feature === "news") {
        if (!request.sourceChannelId) {
          add("skipped", "source_required");
          continue;
        }
        const store = deps.news();
        const sub = store.getSubscription(`channel:${request.sourceChannelId}`);
        if (
          !sub ||
          sub.scope !== "channel" ||
          !sub.enabled ||
          sub.guildId !== request.guildId
        ) {
          add("skipped", "no_match");
          continue;
        }
        if (request.action === "move") {
          if (sub.channelId === request.targetChannelId) {
            add("skipped", "same_channel");
            continue;
          }
          if (!(await deps.canMove(undefined, sub))) {
            add("skipped", "permissions");
            continue;
          }
          if (store.getSubscription(`channel:${request.targetChannelId}`)) {
            add("conflict", "target_exists");
            continue;
          }
          store.moveChannelSubscription(
            sub.id,
            sub.revision,
            request.guildId,
            request.targetChannelId!,
          );
        } else {
          store.saveSubscription(
            { ...sub, enabled: false, invalidReason: null },
            sub.revision,
          );
        }
        add("success");
      } else if (feature === "autoMimo") {
        const store = deps.mimo();
        for (const config of store.configs()) {
          try {
            if (
              config.notifyType !== "channel" ||
              !(await matches(config, config.owner))
            )
              continue;
            if (
              request.action === "move" &&
              config.channelId === request.targetChannelId
            ) {
              add("skipped", "same_channel");
              continue;
            }
            if (
              request.action === "move" &&
              !(await deps.canMove(config.owner))
            ) {
              add("skipped", "permissions");
              continue;
            }
            const current = store.get(config.ltuid);
            if (
              !current ||
              current.owner !== config.owner ||
              current.revision !== config.revision ||
              !(await matches(current, current.owner))
            ) {
              add("conflict", "changed");
              continue;
            }
            const next =
              request.action === "move"
                ? {
                    ...current,
                    notifyType: "channel" as const,
                    channelId: request.targetChannelId,
                    guildId: request.guildId,
                  }
                : {
                    ...current,
                    notifyType: "off" as const,
                    channelId: undefined,
                    guildId: undefined,
                  };
            store.save(next, ["notifyType", "channelId", "guildId"], config);
            add("success");
          } catch (error) {
            add(
              error instanceof Error && error.message === "settings_conflict"
                ? "conflict"
                : "failed",
              "unavailable",
            );
          }
        }
      } else {
        const rows = (await deps.db.get(feature)) || {};
        for (const [owner, snapshot] of Object.entries(rows) as [
          string,
          NotificationDestinationConfig,
        ][]) {
          try {
            if (
              !snapshot ||
              typeof snapshot !== "object" ||
              !(await matches(snapshot, owner))
            )
              continue;
            if (
              request.action === "move" &&
              snapshot.channelId === request.targetChannelId
            ) {
              add("skipped", "same_channel");
              continue;
            }
            if (request.action === "move" && !(await deps.canMove(owner))) {
              add("skipped", "permissions");
              continue;
            }
            const current = (await deps.db.get(
              `${feature}.${owner}`,
            )) as NotificationDestinationConfig | null;
            if (
              !current ||
              destinationKey(current) !== destinationKey(snapshot)
            ) {
              add("conflict", "changed");
              continue;
            }
            // No network awaits between this fresh read and the write.
            const next =
              request.action === "move"
                ? enableNotificationDestination(current, {
                    notifyType: "channel",
                    channelId: request.targetChannelId,
                    guildId: request.guildId,
                  })
                : {
                    ...current,
                    notificationEnabled: false,
                    notificationInvalidatedAt: new Date().toISOString(),
                    notificationInvalidReason: "admin_disabled" as const,
                  };
            if (request.action === "remove") {
              delete next.channelId;
              delete next.guildId;
            }
            await deps.db.set(`${feature}.${owner}`, next);
            add("success");
          } catch {
            add("failed", "unavailable");
          }
        }
      }
    } catch (error) {
      add(
        error instanceof NewsConflictError ? "conflict" : "failed",
        error instanceof NewsConflictError
          ? error.message === "target_exists"
            ? "target_exists"
            : "changed"
          : "unavailable",
      );
    }
    if (results.length === start) add("skipped", "no_match");
  }
  return results;
}
