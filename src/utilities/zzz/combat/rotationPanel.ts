import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { editorText, simulationText } from "./editorCopy.js";
import { combatText } from "./copy.js";
import type { BuildSnapshot, RotationStep } from "./types.js";

export interface RotationSelection {
  step: number;
  actor: number;
  picking: boolean;
  actionPage: number;
}
export const newRotationSelection = (): RotationSelection => ({
  step: 0,
  actor: 0,
  picking: false,
  actionPage: 0,
});

export function stepLabel(
  step: RotationStep,
  actors: BuildSnapshot[],
  locale: string,
): string {
  const t = editorText(locale);
  if (step.type === "wait")
    return `${t.addWait} · ${(step.ms / 1000).toFixed(2)}s`;
  if (step.type === "repeat")
    return `×${step.count} · ${step.steps.map((s) => stepLabel(s, actors, locale)).join(" → ")}`;
  const actor = actors.find((a) => a.id === step.actor);
  return step.type === "switch"
    ? `${t.addSwitch} · ${actor?.name ?? step.actor}`
    : `${actor?.name ?? step.actor} · ${actor?.actions[step.action]?.name ?? step.action}${step.when ? " ◇" : ""}`;
}

export function rotationComponents(
  steps: RotationStep[],
  actors: BuildSnapshot[],
  selection: RotationSelection,
  locale: string,
  id: (action: string) => string,
) {
  const t = editorText(locale),
    c = combatText(locale);
  const button = (action: string, label: string, disabled = false) =>
    new ButtonBuilder()
      .setCustomId(id(action))
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled);
  if (selection.picking) {
    const actor = actors[selection.actor],
      actions = Object.values(actor.actions).filter(
        (a) => a.execution !== "trigger",
      );
    const page = Math.min(
      selection.actionPage,
      Math.floor((actions.length - 1) / 25),
    );
    return [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id("r-action"))
          .setPlaceholder(t.selectAction)
          .addOptions(
            actions
              .slice(page * 25, page * 25 + 25)
              .map((a) => ({ label: a.name.slice(0, 100), value: a.id })),
          ),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button("r-back", t.back),
        button("r-prev", t.previous, page === 0),
        button("r-next", t.next, (page + 1) * 25 >= actions.length),
      ),
    ];
  }
  const start = Math.floor(selection.step / 20) * 20;
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(id("r-step"))
        .setPlaceholder(t.selectStep)
        .addOptions(
          steps.slice(start, start + 20).map((step, index) => ({
            label:
              `${start + index + 1}. ${stepLabel(step, actors, locale)}`.slice(
                0,
                100,
              ),
            value: String(start + index),
            default: start + index === selection.step,
          })),
        ),
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(id("r-actor"))
        .setPlaceholder(t.selectActor)
        .addOptions(
          actors.map((a, index) => ({
            label: a.name.slice(0, 100),
            value: String(index),
            default: index === selection.actor,
          })),
        ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("r-add", t.addAction),
      button("r-switch", t.addSwitch),
      button("r-wait", t.addWait),
      button("r-edit", c.edit),
      button("r-delete", t.remove, steps.length === 1),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("r-prev", t.previous, start === 0),
      button("r-next", t.next, start + 20 >= steps.length),
      button("r-up", t.up, selection.step === 0),
      button("r-down", t.down, selection.step === steps.length - 1),
    ),
  ];
}

export function rotationModal(
  step: RotationStep | undefined,
  locale: string,
  id: string,
): ModalBuilder {
  const t = editorText(locale),
    modal = new ModalBuilder()
      .setCustomId(id)
      .setTitle(step ? combatText(locale).edit : t.addWait);
  const text = (key: string, label: string, value: string) =>
    new LabelBuilder()
      .setLabel(label)
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId(key)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(6)
          .setValue(value),
      );
  if (!step || step.type === "wait")
    modal.addLabelComponents(text("ms", t.waitMs, String(step?.ms ?? 1000)));
  modal.addLabelComponents(
    text("repeat", t.repeat, String(step?.type === "repeat" ? step.count : 1)),
  );
  if (step?.type === "action") {
    const preset = step.when?.incoming
      ? "incoming"
      : step.when?.stunned === true
        ? "stunned"
        : step.when?.stunned === false
          ? "unstunned"
          : "always";
    modal.addLabelComponents(
      new LabelBuilder().setLabel(t.condition).setStringSelectMenuComponent(
        new StringSelectMenuBuilder().setCustomId("when").addOptions(
          ["always", "stunned", "unstunned", "incoming"].map((value) => ({
            label: t[value as "always"],
            value,
            default: value === preset,
          })),
        ),
      ),
    );
  }
  if (step?.type === "action") {
    const x = simulationText(locale);
    const policy = step.onUnavailable ?? (step.when ? "skip" : "error");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(x.unavailable)
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("unavailable")
            .addOptions(
              (["skip", "wait", "error"] as const).map((value) => ({
                label: x[value],
                value,
                default: value === policy,
              })),
            ),
        ),
      text("maxWait", x.maxWait, String(step.maxWaitMs ?? 30_000)),
    );
  }
  return modal;
}
