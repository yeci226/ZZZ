import { automationText } from "../settings/automationCopy.js";
import type { SettingInteraction } from "../settings/panel.js";
import { uiText, renderSettingsPreview } from "../settings/presentation.js";
import { saveSettingGroup } from "../settings/patch.js";
import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  type BaseInteraction,
  type Client,
  type GuildBasedChannel,
  type ModalSubmitInteraction,
  type RepliableInteraction,
} from "discord.js";
import type { QuickDB } from "quick.db";
import { getUserLang } from "../utilities.js";
import {
  enableNotificationDestination,
  isNotificationEnabled,
} from "../core/notificationDestination.js";
import { validateNotificationChannelForUser } from "../core/notificationValidation.js";
import {
  DEFAULT_NOTE_REMINDER_CONFIG,
  normalizeNoteReminderConfig,
  type NoteReminderConfig,
} from "./reminderConfig.js";
import {
  REMINDER_COPY,
  toReminderLocale,
  type ReminderCopy,
  type ReminderLocale,
} from "./reminderCopy.js";
import { formatReminderDuration, parseReminderDuration } from "./reminderDuration.js";

const SESSION_TTL_MS = 15 * 60_000;
const PREFIX = "reminder:";

type WizardPage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ReminderWizardSession {
  backLabel?: string;
  reopenCommand?: string;
  onBack?: (interaction: SettingInteraction) => Promise<void>;
  token: string;
  userId: string;
  locale: ReminderLocale;
  draft: NoteReminderConfig;
  isNew: boolean;
  page: WizardPage;
  enableOnSave: boolean;
  guildId?: string;
  currentChannelId?: string;
  expiresAt: number;
  error?: string;
  baseline?: NoteReminderConfig;
  busy?: boolean;
}

const sessions = new Map<string, ReminderWizardSession>();
const activeByUser = new Map<string, string>();

function id(session: ReminderWizardSession, action: string): string {
  return `${PREFIX}${session.token}:${action}${session.reopenCommand === "setup" ? ":setup" : ""}`;
}

function copy(session: ReminderWizardSession): ReminderCopy {
  return REMINDER_COPY[session.locale];
}

function button(
  session: ReminderWizardSession,
  action: string,
  label: string,
  style = ButtonStyle.Secondary,
  disabled = false,
) {
  return new ButtonBuilder()
    .setCustomId(id(session, action))
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

function invalidateSession(session: ReminderWizardSession): void {
  sessions.delete(session.token);
  if (activeByUser.get(session.userId) === session.token) activeByUser.delete(session.userId);
}

function sweepExpiredSessions(now = Date.now()): void {
  for (const session of sessions.values()) {
    if (session.expiresAt <= now) invalidateSession(session);
  }
}

function createSession(input: Omit<ReminderWizardSession, "token" | "expiresAt">): ReminderWizardSession {
  sweepExpiredSessions();
  const previous = activeByUser.get(input.userId);
  if (previous) sessions.delete(previous);
  const session: ReminderWizardSession = {
    ...input,
    token: randomBytes(8).toString("hex"),
    expiresAt: Date.now() + SESSION_TTL_MS,
    baseline: structuredClone(input.baseline || input.draft),
  };
  sessions.set(session.token, session);
  activeByUser.set(session.userId, session.token);
  return session;
}

function destinationReady(config: NoteReminderConfig): boolean {
  if (!isNotificationEnabled(config)) return false;
  return config.notifyType === "dm" || Boolean(config.channelId && config.guildId);
}

export function hasReminderTrigger(config: NoteReminderConfig): boolean {
  return config.energyMode !== "off"
    || config.vitalityEnabled
    || config.cardSignEnabled
    || config.vhsEnabled
    || config.bountyEnabled
    || config.weeklyEnabled
    || config.eventEnabled;
}

function chooseDm(config: NoteReminderConfig): void {
  Object.assign(config, enableNotificationDestination(config, { notifyType: "dm" }));
  delete config.channelId;
  delete config.guildId;
}

function chooseChannel(config: NoteReminderConfig, channel: GuildBasedChannel): void {
  Object.assign(config, enableNotificationDestination(config, {
    notifyType: "channel",
    channelId: channel.id,
    guildId: channel.guildId,
  }));
}

function destinationLabel(config: NoteReminderConfig, c: ReminderCopy): string {
  if (!destinationReady(config)) return c.notSet;
  if (config.notifyType === "dm") return c.dm;
  return config.channelId ? `<#${config.channelId}>` : c.currentChannel;
}

function energyLabel(config: NoteReminderConfig, c: ReminderCopy, locale: ReminderLocale): string {
  if (config.energyMode === "off") return c.modeOff;
  return config.energyMode === "amount"
    ? `${c.modeAmount}: ${config.energyValue} ${c.energyUnit}`
    : `${c.modeTime}: ${formatReminderDuration(config.energyValue, locale)}`;
}

function prefixedDuration(prefix: string, minutes: number, locale: ReminderLocale): string {
  return `${prefix} ${formatReminderDuration(minutes, locale)}`;
}

export function formatReminderSummary(
  config: NoteReminderConfig,
  c: ReminderCopy,
  locale: ReminderLocale,
): string {
  const mark = (enabled: boolean) => enabled ? "✓" : "✗";
  const effectivelyEnabled = config.enabled && destinationReady(config);
  return [
    `- **${c.status}:** ${effectivelyEnabled ? c.enabled : c.disabled}`,
    `- **${c.destination}:** ${destinationLabel(config, c)}`,
    `- **${c.mention}:** ${config.tag ? c.yes : c.no}`,
    `- **${c.energy}:** ${energyLabel(config, c, locale)}`,
    `- **${c.daily}:** ${prefixedDuration(c.beforeReset, config.dailyHours * 60, locale)} · ${c.vitality} ${mark(config.vitalityEnabled)} · ${c.scratch} ${mark(config.cardSignEnabled)} · ${c.vhs} ${mark(config.vhsEnabled)}`,
    `- **${c.weekly}:** ${prefixedDuration(c.beforeReset, config.weeklyHours * 60, locale)} · ${c.bounty} ${mark(config.bountyEnabled)} · ${c.weeklyPoints} ${config.weeklyEnabled ? `${mark(true)} (${config.weeklyTarget} ${c.pointUnit})` : mark(false)}`,
    `- **${c.event}:** ${config.eventEnabled ? `${mark(true)} · ${prefixedDuration(c.beforeEnd, config.eventHours * 60, locale)}` : mark(false)}`,
  ].join("\n");
}

function navigation(session: ReminderWizardSession) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(session, "save", uiText(session.locale, "save"), ButtonStyle.Success),
    button(session, "cancel", uiText(session.locale, "cancel")),
  );
}

function numberOptions(values: number[], current: number, label: (value: number) => string = String) {
  const options = values.map((value) => ({
    label: label(value), value: String(value), default: value === current,
  }));
  if (!values.includes(current)) options.unshift({
    label: label(current), value: String(current), default: true,
  });
  return options;
}

function toggleStyle(value: boolean): ButtonStyle {
  return value ? ButtonStyle.Success : ButtonStyle.Secondary;
}

interface ReminderPageBlock {
  heading?: string;
  row: ActionRowBuilder<any>;
}

function pageComponents(session: ReminderWizardSession): ReminderPageBlock[] {
  const c = copy(session);
  const config = session.draft;
  if (session.page === 0) {
    const entries = [c.destination, c.energy, c.daily, c.weekly, c.event];
    return [
      ...[entries.slice(0, 3), entries.slice(3)].map((labels, row) => ({ row: new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...labels.map((label, i) => button(session, `page-${row * 3 + i + 1}`, label)),
      ) })),
      { row: new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(session, config.enabled ? "disable" : "enable", config.enabled ? c.disable : c.enable, config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        button(session, "done", uiText(session.locale, "done")),
      ) },
    ];
  }

  if (session.page === 1) {
    const rows: ReminderPageBlock[] = [
      { heading: c.sectionDestination, row: new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...(session.guildId ? [button(session, "use-current", c.useCurrent,
          config.notifyType === "channel" && config.channelId === session.currentChannelId
            ? ButtonStyle.Success : ButtonStyle.Secondary)] : []),
        button(session, "use-dm", c.useDm,
          config.notifyType === "dm" && destinationReady(config) ? ButtonStyle.Success : ButtonStyle.Secondary),
      ) },
    ];
    if (session.guildId) {
      const select = new ChannelSelectMenuBuilder()
        .setCustomId(id(session, "channel"))
        .setPlaceholder(c.chooseChannel)
        .setMinValues(1)
        .setMaxValues(1)
        .setChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.AnnouncementThread,
        );
      if (config.notifyType === "channel" && config.guildId === session.guildId && config.channelId) {
        select.setDefaultChannels(config.channelId);
      }
      rows.push({ row: new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select) });
    }
    rows.push({
      heading: c.sectionMention,
      row: new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(session, "mention", config.tag ? c.mentionOn : c.mentionOff, toggleStyle(config.tag)),
      ),
    });
    rows.push({ row: navigation(session) });
    return rows;
  }

  if (session.page === 2) {
    const modes = new StringSelectMenuBuilder()
      .setCustomId(id(session, "energy-mode"))
      .setPlaceholder(c.chooseMode)
      .addOptions(
        { label: c.modeOff, value: "off", default: config.energyMode === "off" },
        { label: c.modeTime, value: "time", default: config.energyMode === "time" },
        { label: c.modeAmount, value: "amount", default: config.energyMode === "amount" },
      );
    const rows: ReminderPageBlock[] = [{
      heading: c.sectionCondition,
      row: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(modes),
    }];
    if (config.energyMode !== "off") {
      const values = config.energyMode === "time" ? [30, 60, 120, 240] : [120, 180, 200, 220];
      const label = config.energyMode === "time"
        ? (value: number) => formatReminderDuration(value, session.locale)
        : (value: number) => `${value} ${c.energyUnit}`;
      rows.push({
        heading: config.energyMode === "time" ? c.sectionTime : c.sectionCondition,
        row: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder().setCustomId(id(session, "energy-value"))
            .setPlaceholder(c.chooseValue).addOptions(numberOptions(values, config.energyValue, label)),
        ),
      });
      rows.push({ row: new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(session, "custom-energy",
          config.energyMode === "time" ? c.customTime : c.customValue, ButtonStyle.Secondary),
      ) });
    }
    rows.push({ row: navigation(session) });
    return rows;
  }

  if (session.page === 3) {
    return [
      { heading: c.sectionItems, row: new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(session, "vitality", c.vitality, toggleStyle(config.vitalityEnabled)),
        button(session, "scratch", c.scratch, toggleStyle(config.cardSignEnabled)),
        button(session, "vhs", c.vhs, toggleStyle(config.vhsEnabled)),
      ) },
      { heading: c.sectionTime, row: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(id(session, "daily-hours"))
          .setPlaceholder(c.chooseHours).addOptions(numberOptions(
            [1, 2, 3, 6, 12],
            config.dailyHours,
            (value) => prefixedDuration(c.beforeReset, value * 60, session.locale),
          )),
      ) },
      { row: new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(session, "custom-daily", c.customTime, ButtonStyle.Secondary),
      ) },
      { row: navigation(session) },
    ];
  }

  if (session.page === 4) {
    return [
      { heading: c.sectionItems, row: new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(session, "bounty", c.bounty, toggleStyle(config.bountyEnabled)),
        button(session, "weekly-points", c.weeklyPoints, toggleStyle(config.weeklyEnabled)),
      ) },
      { heading: c.sectionTime, row: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(id(session, "weekly-hours"))
          .setPlaceholder(c.chooseHours).addOptions(numberOptions(
            [6, 12, 24, 48, 72, 168],
            config.weeklyHours,
            (value) => prefixedDuration(c.beforeReset, value * 60, session.locale),
          )),
      ) },
      { heading: c.sectionTarget, row: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(id(session, "weekly-target"))
          .setPlaceholder(c.chooseTarget).addOptions(numberOptions(
            [800, 1100, 1600, 2100],
            config.weeklyTarget,
            (value) => `${value} ${c.pointUnit}`,
          )),
      ) },
      { row: new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(session, "custom-weekly", c.customTimeTarget, ButtonStyle.Secondary),
      ) },
      { row: navigation(session) },
    ];
  }

  if (session.page === 5) {
    return [
      { heading: c.sectionItems, row: new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(session, "event", c.eventRewards, toggleStyle(config.eventEnabled)),
      ) },
      { heading: c.sectionTime, row: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(id(session, "event-hours"))
          .setPlaceholder(c.chooseHours).addOptions(numberOptions(
            [24, 48, 72, 120, 168],
            config.eventHours,
            (value) => prefixedDuration(c.beforeEnd, value * 60, session.locale),
          )),
      ) },
      { row: new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(session, "custom-event", c.customTime, ButtonStyle.Secondary),
      ) },
      { row: navigation(session) },
    ];
  }

  return [{ row: new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(session, "back", c.back, ButtonStyle.Secondary),
    button(session, "save", session.isNew || session.enableOnSave ? c.saveEnable : c.save, ButtonStyle.Success),
    ...(!session.isNew && !session.enableOnSave && !config.enabled
      ? [button(session, "save-enable", c.saveEnable, ButtonStyle.Success)] : []),
    button(session, "cancel", c.cancel, ButtonStyle.Secondary),
  ) }];
}

function buildContainer(
  session: ReminderWizardSession,
  title: string,
  description: string,
  accentColor = 0xF4D52D,
): ContainerBuilder {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
      new TextDisplayBuilder().setContent(description),
    );
  for (const block of pageComponents(session)) {
    if (block.heading) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${block.heading}**`),
      );
    }
    container.addActionRowComponents(block.row);
  }
  if (session.onBack) container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(button(session, "back-settings", session.backLabel || automationText(session.locale, "back"))),
  );
  return container;
}

function buildResultMessage(title: string, description: string, accentColor: number) {
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [new ContainerBuilder()
      .setAccentColor(accentColor)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${title}`),
        new TextDisplayBuilder().setContent(description),
      )],
  };
}

export function buildReminderMessage(session: ReminderWizardSession) {
  const c = copy(session);
  const home = session.page === 0;
  const titles = [c.title, c.destination, c.energy, c.daily, c.weekly, c.event];
  const description = home
    ? `${c.homeDescription}\n${uiText(session.locale, "homeGuide")}\n\n${session.draft.enabled ? c.enabled : c.disabled} · ${destinationLabel(session.draft, c)}\n${[session.draft.energyMode !== "off" ? c.energy : "", (session.draft.vitalityEnabled || session.draft.cardSignEnabled || session.draft.vhsEnabled) ? c.daily : "", (session.draft.bountyEnabled || session.draft.weeklyEnabled) ? c.weekly : "", session.draft.eventEnabled ? c.event : ""].filter(Boolean).join(" · ")}`
    : `**${titles[session.page] || c.title}** · ${uiText(session.locale, "pending")}\n${c.stepDescriptions[session.page - 1]}\n\n${uiText(session.locale, "editGuide")}`;
  const error = session.error ? `> ⚠️ **${session.error}**\n\n` : "";
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [buildContainer(session, c.title, `${error}${description}`)],
  };
}

async function reminderPayload(session: ReminderWizardSession) {
  const c = copy(session), keys = ["energy", "daily", "weekly", "event"];
  const active = [session.draft.energyMode !== "off", session.draft.vitalityEnabled || session.draft.cardSignEnabled || session.draft.vhsEnabled, session.draft.bountyEnabled || session.draft.weeklyEnabled, session.draft.eventEnabled];
  const labels = [c.energy, c.daily, c.weekly, c.event];
  const png = await renderSettingsPreview(session.locale, c.title, keys.map((key, i) => ({ name: labels[i], icon: key, selected: active[i], detail: !active[i] ? c.disabled : i === 0 ? energyLabel(session.draft, c, session.locale) : i === 1 ? prefixedDuration(c.beforeReset, session.draft.dailyHours * 60, session.locale) : i === 2 ? prefixedDuration(c.beforeReset, session.draft.weeklyHours * 60, session.locale) : prefixedDuration(c.beforeEnd, session.draft.eventHours * 60, session.locale) })).filter((_, i) => session.page === 0 || session.page === 1 || session.page === i + 2));
  const message = buildReminderMessage(session), container = message.components[0].toJSON();
  container.components.splice(2, 0, { type: 12, items: [{ media: { url: "attachment://reminder-settings.png" }, description: c.title }] } as any);
  return { ...message, components: [container], attachments: [], files: [{ attachment: png, name: "reminder-settings.png" }] };
}
const reminderGroups: Record<number, (keyof NoteReminderConfig)[]> = {
  1: ["notifyType", "channelId", "guildId", "notificationEnabled", "notificationInvalidReason", "notificationInvalidatedAt", "tag"],
  2: ["energyMode", "energyValue"], 3: ["vitalityEnabled", "cardSignEnabled", "vhsEnabled", "dailyHours"],
  4: ["bountyEnabled", "weeklyEnabled", "weeklyHours", "weeklyTarget"], 5: ["eventEnabled", "eventHours"],
};

function modalInput(customId: string, label: string, value: string, placeholder?: string) {
  const input = new TextInputBuilder().setCustomId(customId).setLabel(label.slice(0, 45))
    .setStyle(TextInputStyle.Short).setRequired(true).setValue(value);
  if (placeholder) input.setPlaceholder(placeholder.slice(0, 100));
  return new ActionRowBuilder<TextInputBuilder>().addComponents(
    input,
  );
}

function buildCustomModal(session: ReminderWizardSession, action: string): ModalBuilder | null {
  const c = copy(session);
  const modal = new ModalBuilder().setCustomId(id(session, action));
  if (action === "custom-energy") {
    const timeMode = session.draft.energyMode === "time";
    return modal.setTitle(c.customEnergyTitle.slice(0, 45))
      .addComponents(modalInput(
        "value",
        timeMode ? c.energyInput : c.energyAmountInput,
        timeMode
          ? formatReminderDuration(session.draft.energyValue, session.locale)
          : String(session.draft.energyValue),
        timeMode ? c.durationExample : undefined,
      ));
  }
  if (action === "custom-daily") {
    return modal.setTitle(c.customDailyTitle.slice(0, 45))
      .addComponents(modalInput(
        "hours",
        c.dailyInput,
        formatReminderDuration(session.draft.dailyHours * 60, session.locale),
        c.durationExample,
      ));
  }
  if (action === "custom-weekly") {
    return modal.setTitle(c.customWeeklyTitle.slice(0, 45)).addComponents(
      modalInput(
        "hours",
        c.weeklyHoursInput,
        formatReminderDuration(session.draft.weeklyHours * 60, session.locale),
        c.durationExample,
      ),
      modalInput("target", c.weeklyTargetInput, String(session.draft.weeklyTarget)),
    );
  }
  if (action === "custom-event") {
    return modal.setTitle(c.customEventTitle.slice(0, 45))
      .addComponents(modalInput(
        "hours",
        c.eventInput,
        formatReminderDuration(session.draft.eventHours * 60, session.locale),
        c.durationExample,
      ));
  }
  return null;
}

export function parseReminderInteger(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function selectedChannelIsValid(interaction: BaseInteraction, channel: GuildBasedChannel): boolean {
  const guild = interaction.guild;
  const botMember = guild?.members.me;
  if (!guild || !botMember || channel.guildId !== guild.id) return false;
  return validateNotificationChannelForUser(channel, interaction.user, botMember).ok;
}

async function respondUnavailable(interaction: RepliableInteraction, content: string) {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

function resolveSession(interaction: BaseInteraction): ReminderWizardSession | null {
  if (!("customId" in interaction) || typeof interaction.customId !== "string") return null;
  const [, token] = interaction.customId.split(":");
  const session = sessions.get(token ?? "");
  if (!session) return null;
  if (session.expiresAt <= Date.now() || activeByUser.get(session.userId) !== session.token) {
    invalidateSession(session);
    return null;
  }
  return session;
}

type ModalInputError = "duration" | "number" | null;

function applyModal(
  session: ReminderWizardSession,
  interaction: ModalSubmitInteraction,
  action: string,
): ModalInputError {
  const fields = interaction.fields;
  if (action === "custom-energy") {
    const amountMode = session.draft.energyMode === "amount";
    const value = amountMode
      ? parseReminderInteger(fields.getTextInputValue("value"), 1, 240)
      : parseReminderDuration(fields.getTextInputValue("value"), "minutes", 15, 720);
    if (value === null) return amountMode ? "number" : "duration";
    session.draft.energyValue = value;
    return null;
  }
  if (action === "custom-daily") {
    const minutes = parseReminderDuration(fields.getTextInputValue("hours"), "hours", 60, 720);
    if (minutes === null) return "duration";
    session.draft.dailyHours = minutes / 60;
    return null;
  }
  if (action === "custom-weekly") {
    const minutes = parseReminderDuration(fields.getTextInputValue("hours"), "hours", 60, 10_080);
    const target = parseReminderInteger(fields.getTextInputValue("target"), 1, 2100);
    if (minutes === null) return "duration";
    if (target === null) return "number";
    session.draft.weeklyHours = minutes / 60;
    session.draft.weeklyTarget = target;
    return null;
  }
  if (action === "custom-event") {
    const minutes = parseReminderDuration(fields.getTextInputValue("hours"), "hours", 60, 10_080);
    if (minutes === null) return "duration";
    session.draft.eventHours = minutes / 60;
    return null;
  }
  return "number";
}

function toggleDraft(session: ReminderWizardSession, action: string): boolean {
  const keys: Record<string, keyof Pick<NoteReminderConfig,
    "tag" | "vitalityEnabled" | "cardSignEnabled" | "vhsEnabled" | "bountyEnabled" | "weeklyEnabled" | "eventEnabled">> = {
    mention: "tag", vitality: "vitalityEnabled", scratch: "cardSignEnabled", vhs: "vhsEnabled",
    bounty: "bountyEnabled", "weekly-points": "weeklyEnabled", event: "eventEnabled",
  };
  const key = keys[action];
  if (!key) return false;
  session.draft[key] = !session.draft[key];
  return true;
}

export async function openReminderSettings(
  _client: Client,
  interaction: SettingInteraction,
  db: Pick<QuickDB, "get" | "set">,
  onBack?: (interaction: SettingInteraction) => Promise<void>,
  navigation: { backLabel?: string; reopenCommand?: string } = {},
): Promise<void> {
  const storedLocale = await getUserLang(interaction.user.id).catch(() => undefined);
  const locale = toReminderLocale(storedLocale || interaction.locale);
  const raw = await db.get(`noteReminder.${interaction.user.id}`);
  const isNew = !raw || typeof raw !== "object";
  const draft = normalizeNoteReminderConfig(isNew ? DEFAULT_NOTE_REMINDER_CONFIG : raw);

  if (isNew) {
    draft.enabled = false;
    if (!interaction.guild || navigation.reopenCommand === "setup") {
      chooseDm(draft);
    } else if (interaction.channel && "guildId" in interaction.channel
      && selectedChannelIsValid(interaction, interaction.channel as GuildBasedChannel)) {
      chooseChannel(draft, interaction.channel as GuildBasedChannel);
    } else {
      draft.notificationEnabled = false;
      delete draft.channelId;
      delete draft.guildId;
    }
  }

  const session = createSession({
    backLabel: navigation.backLabel,
    reopenCommand: navigation.reopenCommand,
    onBack,
    userId: interaction.user.id,
    locale,
    draft,
    isNew,
    page: 0,
    baseline: normalizeNoteReminderConfig(raw),
    enableOnSave: false,
    guildId: interaction.guildId ?? undefined,
    currentChannelId: interaction.channelId ?? undefined,
  });
  const payload = await reminderPayload(session);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
}

export async function handleReminderInteraction(
  _client: Client,
  interaction: BaseInteraction,
  db: Pick<QuickDB, "get" | "set">,
): Promise<void> {
  if (!("customId" in interaction) || !interaction.isRepliable()) return;
  const session = resolveSession(interaction);
  const fallbackCopy = REMINDER_COPY[toReminderLocale(interaction.locale)];
  if (!session) {
    await respondUnavailable(interaction, interaction.customId.endsWith(":setup") ? `${uiText(toReminderLocale(interaction.locale), "expired")} /setup` : fallbackCopy.expired);
    return;
  }
  const c = copy(session);
  if (interaction.user.id !== session.userId) {
    await respondUnavailable(interaction, c.notOwner);
    return;
  }
  if (session.busy) { await respondUnavailable(interaction, uiText(session.locale, "pending")); return; }
  const actionParts = interaction.customId.split(":").slice(2);
  if (actionParts.at(-1) === "setup") actionParts.pop();
  const action = actionParts.join(":");
  if (interaction.isButton()) {
    const modal = buildCustomModal(session, action);
    if (modal) {
      session.expiresAt = Date.now() + SESSION_TTL_MS;
      await interaction.showModal(modal);
      return;
    }
  }

  if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
    session.busy = true;
    try { await interaction.deferUpdate(); } catch (error) { session.busy = false; throw error; }
  } else {
    return;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  session.error = undefined;

  try {
  if (interaction.isModalSubmit()) {
    const inputError = applyModal(session, interaction, action);
    if (inputError) session.error = inputError === "duration" ? c.invalidDuration : c.invalidNumber;
  } else if (interaction.isChannelSelectMenu() && action === "channel") {
    const channel = interaction.channels.first() as GuildBasedChannel | undefined;
    if (!channel || !selectedChannelIsValid(interaction, channel)) session.error = c.invalidChannel;
    else chooseChannel(session.draft, channel);
  } else if (interaction.isStringSelectMenu()) {
    const value = interaction.values[0] ?? "";
    if (action === "energy-mode" && ["off", "time", "amount"].includes(value)) {
      const oldMode = session.draft.energyMode;
      session.draft.energyMode = value as NoteReminderConfig["energyMode"];
      if (oldMode !== value) session.draft.energyValue = value === "amount" ? 200 : 60;
    } else {
      const numeric = Number(value);
      if (action === "energy-value") session.draft.energyValue = numeric;
      if (action === "daily-hours") session.draft.dailyHours = numeric;
      if (action === "weekly-hours") session.draft.weeklyHours = numeric;
      if (action === "weekly-target") session.draft.weeklyTarget = numeric;
      if (action === "event-hours") session.draft.eventHours = numeric;
    }
  } else if (interaction.isButton()) {
    if (action === "back-settings" && session.onBack) {
      await session.onBack(interaction);
      invalidateSession(session);
      return;
    } else if (toggleDraft(session, action)) {
      // The draft was updated by toggleDraft.
    } else if (action === "use-dm") {
      chooseDm(session.draft);
    } else if (action === "use-current") {
      const channel = interaction.channel as GuildBasedChannel | null;
      if (!channel || !selectedChannelIsValid(interaction, channel)) session.error = c.invalidChannel;
      else chooseChannel(session.draft, channel);
    } else if (/^page-[1-5]$/.test(action)) {
      session.baseline = normalizeNoteReminderConfig(await db.get(`noteReminder.${session.userId}`));
      // Until the first save retain useful in-memory destination defaults.
      if (!session.isNew) session.draft = structuredClone(session.baseline);
      session.page = Number(action.slice(5)) as WizardPage;
    } else if (action === "enable" || action === "disable") {
      const current = normalizeNoteReminderConfig(await db.get(`noteReminder.${session.userId}`));
      if (action === "enable" && (!destinationReady(current) || !hasReminderTrigger(current))) { session.error = !destinationReady(current) ? c.noDestination : c.noTriggers; session.baseline = structuredClone(current); session.draft = current; session.page = !destinationReady(current) ? 1 : 2; return void await interaction.editReply(await reminderPayload(session)); }
      session.draft = await saveSettingGroup(db, `noteReminder.${session.userId}`, current, { ...current, enabled: action === "enable" }, ["enabled"], normalizeNoteReminderConfig);
      session.isNew = false; session.baseline = structuredClone(session.draft);
    } else if (action === "cancel") {
      session.page = 0;
      session.draft = structuredClone(session.baseline || normalizeNoteReminderConfig(await db.get(`noteReminder.${session.userId}`)));
      if (session.isNew) session.draft.enabled = false;
    } else if (action === "done") {
      invalidateSession(session);
      await interaction.editReply({ ...buildResultMessage(c.title, uiText(session.locale, "done"), 0x57F287), attachments: [] }); return;
    } else if (action === "save" && reminderGroups[session.page]) {
      if (session.page === 1 && session.draft.notifyType === "channel") {
        const channel = await interaction.guild?.channels.fetch(session.draft.channelId!);
        const bot = await interaction.guild?.members.fetchMe();
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        if (!channel || !bot || !member || !("guildId" in channel) || channel.guildId !== session.draft.guildId || !validateNotificationChannelForUser(channel as GuildBasedChannel, member, bot).ok) { session.error = c.invalidChannel; return void await interaction.editReply(await reminderPayload(session)); }
      }
      const baseline = session.baseline || session.draft;
      const draft = normalizeNoteReminderConfig(session.draft);
      // A first partial save must not turn on the legacy default enabled=true.
      const fields = [...reminderGroups[session.page], ...(session.isNew ? ["enabled" as const] : [])];
      if (session.isNew) draft.enabled = false;
      session.draft = await saveSettingGroup(db, `noteReminder.${session.userId}`, baseline, draft, fields, normalizeNoteReminderConfig);
      session.baseline = structuredClone(session.draft); session.isNew = false; session.page = 0; session.error = undefined;
    } else if (["next", "back", "edit", "save-enable"].includes(action)) session.error = uiText(session.locale, "expired");
  }

  } catch (error) { session.error = uiText(session.locale, (error as Error).message === "settings_conflict" ? "conflict" : "failed"); } finally { session.busy = false; }

  await interaction.editReply(await reminderPayload(session));
}

export const __reminderWizardInternals = {
  SESSION_TTL_MS,
  createSession,
  destinationReady,
  invalidateSession,
  sweepExpiredSessions,
  sessions,
  activeByUser,
};
