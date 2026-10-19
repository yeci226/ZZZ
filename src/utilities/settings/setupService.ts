import type { Client } from "discord.js";
import {
  getHoyolabs,
  getLegacyAccounts,
  type Hoyolab,
} from "../accountStore.js";
import { validateNotificationChannelForUser } from "../core/notificationValidation.js";
import { getMimoStore } from "../mimo/runtime.js";
import { defaultMimoConfig, type MimoConfig } from "../mimo/store.js";
import {
  normalizeNoteReminderConfig,
  type NoteReminderConfig,
} from "../zzz/reminderConfig.js";
import { normalizeAutomation } from "./automation.js";
import { saveSettingGroup } from "./patch.js";

export type MimoSetupProblem = "auth" | "choose" | "forbidden" | "rewards";
export interface MimoSetupAccount {
  ltuid: string;
  name: string;
  uid?: string;
  config?: MimoConfig;
  problem?: MimoSetupProblem;
}
function mimoRow(
  h: Hoyolab,
  owner: string,
  config?: MimoConfig,
): MimoSetupAccount {
  const row: MimoSetupAccount = {
    ltuid: h.ltuid_v2,
    name: h.hoyolabName || h.ltuid_v2,
    config,
  };
  if (config && config.owner !== owner)
    return { ...row, config: undefined, problem: "forbidden" };
  if (h.invalid || !h.cookie) return { ...row, problem: "auth" };
  const roles = h.characters.filter((c) => c.uid && !c.invalid);
  if (!roles.length) return { ...row, problem: "auth" };
  const chosen = config?.uid
    ? roles.find((c) => c.uid === config.uid)
    : roles.length === 1
      ? roles[0]
      : undefined;
  if (!chosen) return { ...row, problem: "choose" };
  return {
    ...row,
    uid: chosen.uid,
    ...(config && !config.order.length ? { problem: "rewards" as const } : {}),
  };
}
export function quickReminderConfig(raw: unknown): NoteReminderConfig {
  return raw
    ? normalizeNoteReminderConfig(raw)
    : {
        ...normalizeNoteReminderConfig(undefined),
        enabled: false,
        notifyType: "dm",
      };
}
export async function readQuickSetup(db: any, owner: string) {
  const [dailyRaw, redeemRaw, reminderRaw, hoyolabs, accounts] =
    await Promise.all([
      db.get(`autoDaily.${owner}`),
      db.get(`autoRedeem.${owner}`),
      db.get(`noteReminder.${owner}`),
      getHoyolabs(db, owner),
      getLegacyAccounts(db, owner),
    ]);
  const store = getMimoStore(db);
  return {
    daily: normalizeAutomation(dailyRaw, "autoDaily"),
    dailyNew: !dailyRaw,
    redeem: normalizeAutomation(redeemRaw, "autoRedeem"),
    reminder: quickReminderConfig(reminderRaw),
    reminderNew: !reminderRaw,
    hasAccount: accounts.some((a) => a.uid && a.cookie && !a.invalid),
    mimo: hoyolabs.map((h) => mimoRow(h, owner, store.get(h.ltuid_v2))),
  };
}
export type QuickSetupSnapshot = Awaited<ReturnType<typeof readQuickSetup>>;

export async function setQuickReminder(
  client: Client,
  db: any,
  owner: string,
  baseline: NoteReminderConfig,
  enabled: boolean,
) {
  if (enabled) {
    if (
      !(await getLegacyAccounts(db, owner)).some(
        (a) => a.uid && a.cookie && !a.invalid,
      )
    )
      throw new Error("auth");
    const triggers =
      baseline.energyMode !== "off" ||
      [
        baseline.vitalityEnabled,
        baseline.cardSignEnabled,
        baseline.vhsEnabled,
        baseline.bountyEnabled,
        baseline.weeklyEnabled,
        baseline.eventEnabled,
      ].some(Boolean);
    if (!baseline.notificationEnabled || !triggers)
      throw new Error("reminderFix");
    if (baseline.notifyType === "channel") {
      const guild = baseline.guildId
        ? await client.guilds.fetch(baseline.guildId).catch(() => null)
        : null;
      const channel = baseline.channelId
        ? await guild?.channels.fetch(baseline.channelId).catch(() => null)
        : null;
      const bot = await guild?.members.fetchMe().catch(() => null),
        member = await guild?.members.fetch(owner).catch(() => null);
      if (
        !channel ||
        !bot ||
        !member ||
        !validateNotificationChannelForUser(channel, member, bot).ok
      )
        throw new Error("reminderFix");
    }
  }
  // On enable, also compare the fields validated above; don't enable newly invalid preferences.
  const fields = enabled
    ? (Object.keys(baseline) as (keyof NoteReminderConfig)[])
    : ["enabled" as const];
  return saveSettingGroup<NoteReminderConfig>(
    db,
    `noteReminder.${owner}`,
    baseline,
    { ...baseline, enabled },
    fields,
    quickReminderConfig,
  );
}

/** Each account commits independently; the caller reports partial success and can retry. */
export async function setQuickMimo(
  db: any,
  owner: string,
  baseline: MimoSetupAccount[],
  enabled: boolean,
) {
  const store = getMimoStore(db);
  const accounts = await getHoyolabs(db, owner);
  const failures: Record<string, string> = {};
  for (const previous of baseline) {
    try {
      const h = accounts.find((h) => h.ltuid_v2 === previous.ltuid);
      const current = store.get(previous.ltuid);
      if (
        !h ||
        (current && current.owner !== owner) ||
        previous.problem === "forbidden"
      )
        throw new Error("forbidden");
      const row = mimoRow(h, owner, current);
      if (!enabled && !current) continue;
      if (enabled && current?.enabled && previous.config?.enabled) continue;
      if (enabled && row.problem) throw new Error(row.problem);
      const expected =
        previous.config ||
        defaultMimoConfig(owner, previous.ltuid, previous.uid || row.uid || "");
      if (enabled && expected.uid !== row.uid)
        throw new Error("settings_conflict");
      const next = { ...expected, enabled };
      const fields: (keyof MimoConfig)[] = ["enabled"];
      if (enabled) {
        next.nextAt = 0;
        next.reason = undefined;
        fields.push("uid", "order", "nextAt", "reason");
      }
      store.save(next, fields, expected);
    } catch (error) {
      failures[previous.ltuid] =
        error instanceof Error ? error.message : "failed";
    }
  }
  return failures;
}
