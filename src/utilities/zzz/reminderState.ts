import type { ReminderTrigger } from "./reminderEvaluator.js";

export interface ReminderState {
  sent?: Record<string, string>;
  energyArmed?: boolean;
  failureCooldownUntil?: number;
}

/**
 * Keep reminder state in a literal QuickDB key. Dot-separated numeric IDs are
 * interpreted by lodash/QuickDB as array indexes and can create arrays too
 * large to serialize.
 */
export function getReminderStateKey(userId: string, uid: string): string {
  return `noteReminderState:${userId}:${uid}`;
}

export function getPendingReminderTriggers(
  triggers: ReminderTrigger[],
  state: ReminderState,
): ReminderTrigger[] {
  return triggers.filter((trigger) => {
    if (trigger.key === "energy") return state.energyArmed !== false;
    const sentCycle = state.sent?.[trigger.key];
    // Older versions appended left_end_ts to the event ID. Honor those
    // deliveries as well so upgrading does not notify the same event again.
    if (
      trigger.key.startsWith("event:") &&
      trigger.cycle === trigger.key &&
      sentCycle?.startsWith(`${trigger.key}:`)
    )
      return false;
    return sentCycle !== trigger.cycle;
  });
}

export function markReminderTriggersDelivered(
  state: ReminderState,
  triggers: ReminderTrigger[],
): void {
  state.sent ??= {};
  for (const trigger of triggers) state.sent[trigger.key] = trigger.cycle;
  if (triggers.some((trigger) => trigger.key === "energy")) {
    state.energyArmed = false;
  }
  delete state.failureCooldownUntil;
}

export function rearmEnergyReminder(
  state: ReminderState,
  energyCondition: boolean,
): boolean {
  if (energyCondition || state.energyArmed !== false) return false;
  state.energyArmed = true;
  return true;
}
