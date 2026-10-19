import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, type RepliableInteraction } from "discord.js";
import type { SimulationPanel } from "./gachaSimulationStore.js";
import { actionEmoji } from "./gachaSimulationEmoji.js";
export const panelId = (panel: SimulationPanel, action: string) => `gsim:panel:${panel.id}:${action}`;
export const uiButton = (panel: SimulationPanel, action: string, label: string, style = 2, disabled = false) => ({ type: 2, style, custom_id: panelId(panel, action), label, disabled, emoji: actionEmoji(panel.value.applicationId, action) });
export const uiRow = (...components: any[]) => ({ type: 1, components });
export function uiSelect(panel: SimulationPanel, action: string, placeholder: string, options: Array<{ label: string; value: string; description?: string; default?: boolean; emoji?: { id?: string; name: string } }>, min = 1, max = 1) {
  return uiRow({ type: 3, custom_id: panelId(panel, action), placeholder: placeholder.slice(0, 150), min_values: min, max_values: max, options: options.map(o => ({ ...o, label: o.label.slice(0, 100), description: o.description?.slice(0, 100) })) });
}
export function uiMessage(title: string, text: string, controls: any[] = [], png?: Buffer) {
  const parts: any[] = [{ type: 10, content: `### ${title}` }];
  if (text) { let chunk = ""; for (const line of text.split("\n")) { if ((chunk + line).length > 3500) { parts.push({ type: 10, content: chunk }); chunk = ""; } chunk += line + "\n"; } if (chunk) parts.push({ type: 10, content: chunk }); }
  if (png) parts.push({ type: 12, items: [{ media: { url: "attachment://simulation-chart.png" }, description: title }] });
  return { flags: MessageFlags.IsComponentsV2 as const, components: [{ type: 17, accent_color: 0xddfa64, components: [...parts, ...controls] }], allowedMentions: { parse: [] as never[] }, attachments: [], files: png ? [{ attachment: png, name: "simulation-chart.png" }] : [] };
}
export async function privateReply(interaction: RepliableInteraction, payload: any) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}
export function uiModal(panel: SimulationPanel, action: string, title: string, fields: Array<{ id: string; label: string; value?: string; placeholder?: string; optional?: boolean; paragraph?: boolean }>) {
  const modal = new ModalBuilder().setCustomId(panelId(panel, action)).setTitle(title.slice(0, 45));
  for (const field of fields) { const input = new TextInputBuilder().setCustomId(field.id).setLabel(field.label.slice(0, 45)).setStyle(field.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!field.optional).setMaxLength(field.paragraph ? 1000 : 160); if (field.value !== undefined) input.setValue(field.value); if (field.placeholder) input.setPlaceholder(field.placeholder); modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)); }
  return modal;
}
export function numeric(text: string, label: string, integer = false): number {
  if (!/^\d+(?:\.\d{1,4})?$/.test(text.trim())) throw new Error(`${label} 請輸入非負數字，最多小數四位。`);
  const n = Number(text); if (!Number.isFinite(n) || (integer && !Number.isSafeInteger(n))) throw new Error(`${label} 請輸入整數。`); return n;
}
export function yesNo(text: string): boolean { if (["開", "是", "1", "true"].includes(text.trim().toLowerCase())) return true; if (["關", "否", "0", "false"].includes(text.trim().toLowerCase())) return false; throw new Error("開關請填「開」或「關」。"); }
