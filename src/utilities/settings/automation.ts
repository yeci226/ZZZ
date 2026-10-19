import { ChannelType, type Client } from "discord.js";
import { getLegacyAccounts } from "../accountStore.js";
import { validateNotificationChannelForUser } from "../core/notificationValidation.js";
import { automationText } from "./automationCopy.js";
import { uiLocale, uiText } from "./presentation.js";
import { saveSettingGroup } from "./patch.js";
import { leastUsedDailyHour } from "./dailySchedule.js";
import type { SettingNavigation } from "./panel.js";
import { openSettingPanel, panelMessage, settingButton, settingEntry, settingFooter, settingId, settingRow, settingSelect, type SettingInteraction, type SettingSession } from "./panel.js";

export type AutomationFeature = "autoDaily" | "autoRedeem";
export interface AutomationConfig {
  enabled: boolean;
  time: string;
  tag: string;
  notifyType: "dm" | "channel";
  notificationEnabled: boolean;
  channelId?: string;
  guildId?: string;
  notificationInvalidatedAt?: string;
  notificationInvalidReason?: string;
  [key: string]: unknown;
}
export function normalizeAutomation(raw: any, feature: AutomationFeature): AutomationConfig {
  let hour = Number(raw?.time ?? (raw ? 13 : 12));
  if (hour === 24) hour = 0;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) hour = 13;
  return {
    ...raw,
    enabled: !!raw && raw.enabled !== false,
    time: String(hour),
    tag: raw?.tag === true || raw?.tag === "true" ? "true" : "false",
    notifyType: !raw || raw.notifyType === "dm" ? "dm" : "channel",
    notificationEnabled: raw ? raw.notificationEnabled !== false : true,
  };
}
const groups: Record<string, (keyof AutomationConfig)[]> = {
  enabled: ["enabled"], time: ["time"],
  notification: ["notifyType", "notificationEnabled", "channelId", "guildId", "tag", "notificationInvalidatedAt", "notificationInvalidReason"],
};
/** Shared by the detailed editor and quick setup. Only first creation chooses a time. */
export async function setAutomationEnabled(db: any, owner: string, feature: AutomationFeature, baseline: AutomationConfig, enabled: boolean) {
  if (enabled) {
    const accounts = await getLegacyAccounts(db, owner);
    if (!accounts.some(a => a.uid && a.cookie && !a.invalid && (feature === "autoDaily" || /(?:^|;\s*)cookie_token(?:_v2)?=([^;\s]+)/.test(a.cookie)))) throw new Error("auth");
  }
  const raw = await db.get(`${feature}.${owner}`);
  const draft = { ...baseline, enabled };
  const fields: (keyof AutomationConfig)[] = ["enabled"];
  if (!raw && enabled && feature === "autoDaily") {
    draft.time = String(leastUsedDailyHour(await db.get("autoDaily")));
    fields.push("time");
  }
  return saveSettingGroup<AutomationConfig>(db, `${feature}.${owner}`, baseline, draft, fields, value => normalizeAutomation(value, feature));
}
export async function openAutomationSettings(
  client: Client, interaction: SettingInteraction, db: any, feature: AutomationFeature,
  onBack?: (interaction: SettingInteraction) => Promise<void>,
  navigation: SettingNavigation = {},
) {
  const key = `${feature}.${interaction.user.id}`;
  const read = async () => normalizeAutomation(await db.get(key), feature);
  const base = await read();
  const locale = uiLocale(await db.get(`${interaction.user.id}.locale`) || interaction.locale);
  const title = automationText(locale, feature === "autoDaily" ? "daily" : "redeem");
  const fields = feature === "autoDaily" ? ["enabled", "time", "notification"] : ["enabled", "notification"];
  const label = (s: SettingSession, field: string) => field === "notification" ? uiText(s.locale, "notification") : automationText(s.locale, field as "enabled" | "time");
  const value = (s: SettingSession, field: string) => {
    const c = s.draft as AutomationConfig;
    if (field === "enabled") return uiText(s.locale, c.enabled ? "on" : "off");
    if (field === "time") return `${c.time.padStart(2, "0")}:00 (UTC+8)`;
    return `${uiText(s.locale, !c.notificationEnabled ? "off" : c.notifyType)}${c.notificationEnabled && c.notifyType === "channel" && c.channelId ? ` · <#${c.channelId}>` : ""} · ${uiText(s.locale, "mention")}: ${uiText(s.locale, c.tag === "true" ? "on" : "off")}`;
  };
  await openSettingPanel(interaction, { ...navigation, onBack, locale, page: "home", base, draft: structuredClone(base), data: {},
    render: async s => {
      const c = s.draft as AutomationConfig;
      if (s.page === "home") return panelMessage(s, title, automationText(s.locale, feature === "autoDaily" ? "dailyDesc" : "redeemDesc"), [
        ...fields.map(field => settingEntry(s, field, label(s, field), value(s, field))),
        settingRow(settingButton(s, "done", uiText(s.locale, "done"))),
      ]);
      const controls: any[] = [];
      if (s.page === "enabled") controls.push(settingSelect(s, "enabled-value", label(s, "enabled"), [true, false].map(v => ({ label: uiText(s.locale, v ? "on" : "off"), value: String(v), default: c.enabled === v }))));
      if (s.page === "time") controls.push(settingSelect(s, "time-value", label(s, "time"), Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, "0")}:00`, value: String(hour), default: c.time === String(hour) }))));
      if (s.page === "notification") {
        const methods = ["off", "dm", "channel"] as const;
        controls.push(settingSelect(s, "notify-value", label(s, "notification"), methods.map(method => ({ label: uiText(s.locale, method), value: method, default: (c.notificationEnabled ? c.notifyType : "off") === method }))));
        if (c.notificationEnabled && c.notifyType === "channel") controls.push(settingRow({ type: 8, custom_id: settingId(s, "channel"), placeholder: uiText(s.locale, "channel"), channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement], min_values: 1, max_values: 1, disabled: !interaction.guildId,
          ...(c.channelId && c.guildId === interaction.guildId ? { default_values: [{ id: c.channelId, type: "channel" }] } : {}),
        }));
        if (c.notificationEnabled) controls.push(settingRow(settingButton(s, "mention", `${uiText(s.locale, "mention")}: ${uiText(s.locale, c.tag === "true" ? "on" : "off")}`, c.tag === "true" ? 3 : 2)));
      }
      controls.push(settingFooter(s));
      return panelMessage(s, `${title} · ${label(s, s.page)}`, `${s.page === "notification" ? automationText(s.locale, "notificationDesc") + "\n\n" : ""}${uiText(s.locale, "currentValue")}: ${value({ ...s, draft: s.base }, s.page)}\n${uiText(s.locale, "selectedValue")}: ${value(s, s.page)} · ${uiText(s.locale, "pending")}\n\n${uiText(s.locale, "editGuide")}`, controls);
    },
    action: async (s, action, i) => {
      const c = s.draft as AutomationConfig;
      if (action.startsWith("edit-") && fields.includes(action.slice(5))) { s.base = await read(); s.draft = structuredClone(s.base); s.page = action.slice(5); }
      else if (action === "cancel") { s.base = await read(); s.draft = structuredClone(s.base); s.page = "home"; }
      else if (action === "enabled-value" && s.page === "enabled" && i.isStringSelectMenu() && ["true", "false"].includes(i.values[0])) c.enabled = i.values[0] === "true";
      else if (action === "time-value" && s.page === "time" && i.isStringSelectMenu() && /^(?:[0-9]|1[0-9]|2[0-3])$/.test(i.values[0])) c.time = i.values[0];
      else if (action === "notify-value" && s.page === "notification" && i.isStringSelectMenu()) {
        const method = i.values[0];
        if (!["off", "channel", "dm"].includes(method)) throw new Error("invalid");
        c.notificationEnabled = method !== "off";
        if (method !== "off") c.notifyType = method;
        if (method !== "channel") { delete c.channelId; delete c.guildId; }
      } else if (action === "channel" && s.page === "notification" && i.isChannelSelectMenu() && i.guildId) { c.channelId = i.values[0]; c.guildId = i.guildId; }
      else if (action === "mention" && s.page === "notification") c.tag = c.tag === "true" ? "false" : "true";
      else if (action === "save" && fields.includes(s.page)) {
        if (s.page === "notification") {
          if (c.notificationEnabled && c.notifyType === "channel") {
            const guild = c.guildId ? await client.guilds.fetch(c.guildId).catch(() => null) : null;
            const channel = c.channelId ? await guild?.channels.fetch(c.channelId).catch(() => null) : null;
            const bot = await guild?.members.fetchMe().catch(() => null), member = await guild?.members.fetch(s.owner).catch(() => null);
            if (!channel || !bot || !member || !validateNotificationChannelForUser(channel, member, bot).ok) throw new Error("invalid");
          }
          delete c.notificationInvalidatedAt; delete c.notificationInvalidReason;
        }
        s.base = s.page === "enabled"
          ? await setAutomationEnabled(db, s.owner, feature, s.base, c.enabled)
          : await saveSettingGroup(db, key, s.base, c, groups[s.page], raw => normalizeAutomation(raw, feature));
        s.draft = structuredClone(s.base); s.page = "home"; s.notice = uiText(s.locale, "saved");
      }
    },
  });
}
