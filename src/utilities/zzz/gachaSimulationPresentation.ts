import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder,
  MediaGalleryItemBuilder, MessageFlags, TextDisplayBuilder, escapeMarkdown,
} from "discord.js";
import { defaultSimulationRules, percent } from "./gachaSimulationRules.js";
import type { SimulationSession } from "./gachaSimulationStore.js";
import type { SimulationCatalog } from "./gachaSimulationCatalog.js";

export function simulationMessage(
  session: SimulationSession, catalog: SimulationCatalog,
  mode: "animation" | "result", media?: string, note?: string,
) {
  const b = session.banner, state = session.state;
  const rules = session.rules ?? defaultSimulationRules(b.pool);
  const name = (id: string) => escapeMarkdown(catalog.items[id]?.name || id);
  const componentBase = mode === "animation" ? 100 : 200;
  const box = new ContainerBuilder().setId(componentBase).setAccentColor(b.pool === "character" ? 0xf5bb39 : 0xa67aec)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `### 模擬調頻｜${escapeMarkdown(b.version)} ${escapeMarkdown(b.name)} - ${name(b.featuredS)}`,
    ));
  if (rules.mode === "custom") box.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**自訂規則 v${session.ruleVersion || session.rulesId}** · S／A／B ${percent(rules.s.base)}／${percent(rules.a.base)}／${percent(rules.b)}\nS ${rules.s.hard ? `${rules.s.hard} 抽保底` : "無硬保底"} · UP ${percent(rules.s.up)} · 歪後必 UP ${rules.s.guarantee ? "開" : "關"} · 完整規則見「詳情」`,
  ));
  // Keep the result gallery distinct from the GIF's asynchronous media job.
  if (media) box.addMediaGalleryComponents(new MediaGalleryBuilder().setId(componentBase + 1).addItems(
    new MediaGalleryItemBuilder().setURL(media).setDescription(mode === "animation" ? "調頻動畫，可按下方按鈕跳過" : "調頻結果"),
  ));
  const button = (action: string, label: string, disabled = false) => new ButtonBuilder()
    .setCustomId(`gsim:${action}:${session.id}`).setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(disabled);
  if (mode === "animation") {
    box.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(button("skip", "跳過動畫")));
  } else {
    if (!media) box.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      session.pulls.map(p => `**${p.rank}** ${name(p.id)}${p.isNew ? "（新！）" : ""}`).join("\n"),
    ));
    box.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("a", rules.a.hard ? `${Math.max(1, rules.a.hard - state.sinceAOrHigher)} 抽內必出 A 級或以上` : "A 級或以上：未啟用硬保底", true),
      button("s", rules.s.hard ? `${Math.max(1, rules.s.hard - state.sinceS)} 抽內必出 S 級` : "S 級：未啟用硬保底", true),
    ));
    if (!session.continuationId) box.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("one", "再抽1抽").setStyle(ButtonStyle.Primary), button("ten", "再抽10抽").setStyle(ButtonStyle.Primary),
    ));
  }
  if (mode === "result") box.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(button("settings", "設定"), button("details", "詳情")));
  if (note) box.addTextDisplayComponents(new TextDisplayBuilder().setContent(note));
  return { flags: MessageFlags.IsComponentsV2 as const, components: [box.toJSON()], allowedMentions: { parse: [] as never[] } };
}

/** Retain the existing result image/counters, removing only this message's draw actions. */
export function withoutSimulationContinuation(components: readonly unknown[], id: string) {
  const copied = JSON.parse(JSON.stringify(components)) as any[];
  const remove = (parts: any[]): any[] => parts.flatMap(part => {
    if (part.type === 17) return [{ ...part, components: remove(part.components || []) }];
    if (part.type !== 1) return [part];
    const buttons = (part.components || []).filter((button: any) =>
      button.custom_id !== `gsim:one:${id}` && button.custom_id !== `gsim:ten:${id}`);
    return buttons.length ? [{ ...part, components: buttons }] : [];
  });
  return { components: remove(copied) as ReturnType<typeof simulationMessage>["components"] };
}
