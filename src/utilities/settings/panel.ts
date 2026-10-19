import { randomBytes } from "node:crypto";
import { MessageFlags, type BaseInteraction, type ChatInputCommandInteraction, type MessageComponentInteraction } from "discord.js";
import Logger from "../core/logger.js";
import { automationText } from "./automationCopy.js";
import { uiLocale, uiText, type UiLocale } from "./presentation.js";
export type SettingInteraction = ChatInputCommandInteraction | MessageComponentInteraction;
export interface SettingNavigation { backLabel?: string; reopenCommand?: "setup"; }
export interface SettingSession extends SettingNavigation {
  onBack?: (interaction: SettingInteraction) => Promise<void>;
  token: string; owner: string; locale: UiLocale; page: string; expires: number; busy: boolean;
  base: any; draft: any; notice?: string; data: any;
  render(s: SettingSession): Promise<any>;
  action(s: SettingSession, action: string, interaction: any): Promise<void>;
}
const sessions = new Map<string, SettingSession>();
export function closeSettingPanel(session: SettingSession) { sessions.delete(session.token); }
export const settingId = (s: SettingSession, action: string) => `settingui:${s.token}:${action}${s.reopenCommand ? ":setup" : ""}`;
export const settingButton = (s: SettingSession, action: string, label: string, style = 2, disabled = false) => ({ type: 2, custom_id: settingId(s, action), label: label.slice(0, 80), style, disabled });
export const settingRow = (...components: any[]) => ({ type: 1, components });
export function settingSelect(s: SettingSession, action: string, label: string, options: any[], multi = false) {
  return settingRow({ type: 3, custom_id: settingId(s, action), placeholder: label.slice(0, 150), min_values: multi ? 0 : 1, max_values: multi ? Math.min(25, options.length) : 1,
    options: options.slice(0, 25).map(o => ({ ...o, label: o.label.slice(0, 100), ...(o.description ? { description: o.description.slice(0, 100) } : {}) })) });
}
export function settingFooter(s: SettingSession) { return settingRow(settingButton(s, "save", uiText(s.locale, "save"), 3), settingButton(s, "cancel", uiText(s.locale, "cancel"))); }
export function panelMessage(s: SettingSession, title: string, text: string, controls: any[], png?: Buffer) {
  const components: any[] = [{ type: 10, content: `### ${title}` }];
  if (s.notice) components.push({ type: 10, content: s.notice });
  if (text) components.push({ type: 10, content: text });
  if (png) components.push({ type: 12, items: [{ media: { url: "attachment://settings.png" }, description: title.slice(0, 1024) }] });
  components.push(...controls);
  if (s.onBack) components.push(settingRow(settingButton(s, "back-settings", s.backLabel || automationText(s.locale, "back"))));
  return { flags: MessageFlags.IsComponentsV2, components: [{ type: 17, accent_color: 0xd9ed92, components }], attachments: [], files: png ? [{ attachment: png, name: "settings.png" }] : [], allowedMentions: { parse: [] } };
}
export function settingEntry(s: SettingSession, key: string, label: string, value: string, description = "") { return { type: 9, components: [{ type: 10, content: `**${label}**\n${description ? description + "\n" : ""}${uiText(s.locale, "currentValue")}: ${value}` }], accessory: settingButton(s, `edit-${key}`, uiText(s.locale, "edit")) }; }
export async function openSettingPanel(interaction: SettingInteraction, input: Omit<SettingSession, "token" | "owner" | "expires" | "busy">) {
  for (const [id, s] of sessions) if (s.expires < Date.now() || s.owner === interaction.user.id) sessions.delete(id);
  const s: SettingSession = { ...input, token: randomBytes(8).toString("hex"), owner: interaction.user.id, expires: Date.now() + 900000, busy: false };
  sessions.set(s.token, s);
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.editReply(await s.render(s));
}
export async function handleSettingPanel(interaction: BaseInteraction) {
  if (!interaction.isMessageComponent() || !interaction.customId.startsWith("settingui:")) return;
  const [, token, action] = interaction.customId.split(":"), s = sessions.get(token);
  if (!s || s.expires < Date.now() || s.owner !== interaction.user.id) { await interaction.reply({ flags: MessageFlags.Ephemeral, content: uiText(s?.locale || uiLocale(interaction.locale), s && s.owner !== interaction.user.id ? "forbidden" : "expired") + ((!s || s.owner === interaction.user.id) && interaction.customId.endsWith(":setup") ? " /setup" : "") }); return; }
  if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
  if (s.busy) return;
  s.busy = true; s.expires = Date.now() + 900000; s.notice = undefined;
  try {
    if (action === "back-settings" && s.onBack) { await s.onBack(interaction); return; }
    if (action === "done") { sessions.delete(token); await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [{ type: 10, content: uiText(s.locale, "done") }], attachments: [], files: [] }); return; }
    await s.action(s, action, interaction);
    if (sessions.get(token) !== s) return; // A settings shortcut opened another panel.
    await interaction.editReply(await s.render(s));
  } catch (error) {
    const e = error as Error & { kind?: string; code?: string | number };
    new Logger("設定互動").error(`${action}：${e.name} ${e.code ?? ""} ${e.message}`);
    s.notice = uiText(s.locale, e.message === "settings_conflict" ? "conflict" : e.message === "auth" || e.kind === "auth" ? "auth" : ["forbidden", "mimo_owned"].includes(e.message) ? "forbidden" : "failed");
    // A failed child panel must still show a response, even if the parent has
    // no notice field or its renderer also fails.
    await interaction.followUp({ flags: MessageFlags.Ephemeral, content: s.notice });
  } finally { s.busy = false; }
}
export const __settingSessions = sessions;
