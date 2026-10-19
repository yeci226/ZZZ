import { integer, type Element } from "./stats.js";

export const BURNICE_AWAKENING_SOURCE = "src/assets/combat/evidence/account-combat-text.json";
export interface BurniceAwakeningState {
  level: number;
  afterburnCount: number;
  flowingFire: boolean;
}
export type BurniceAwakeningEvent =
  | { type: "ally-afterburn-triggered" }
  | { type: "enhanced-basic-afterburn-hit" }
  | { type: "swap-in" };
export interface BurniceAwakeningTransition {
  state: BurniceAwakeningState;
  entryAttack: null | {
    action: "awakening-ex-entry";
    entryType: "quick-assist";
    flowingFireSpent: 1;
  };
}

export function initialBurniceAwakeningState(level: number): BurniceAwakeningState {
  integer(level, "awakening level", 0, 6);
  return { level, afterburnCount: 0, flowingFire: false };
}

/**
 * Official awakening I: 12 ally Afterburn triggers grant one Flowing Fire;
 * an enhanced-basic Afterburn hit adds two counts. Counting pauses while held.
 * Consume only on entering the field, then clear the counter.
 * Callers supply already-valid triggers/hits; this is not a timing/action adapter.
 */
export function advanceBurniceAwakening(
  previous: Readonly<BurniceAwakeningState>,
  event: BurniceAwakeningEvent,
): BurniceAwakeningTransition {
  integer(previous.level, "awakening level", 0, 6);
  integer(previous.afterburnCount, "afterburn counter", 0, 12);
  if (
    typeof previous.flowingFire !== "boolean" ||
    previous.flowingFire !== (previous.afterburnCount === 12) ||
    (previous.level === 0 && previous.afterburnCount !== 0)
  ) throw new Error("Invalid Burnice awakening counter state");
  if (!["ally-afterburn-triggered", "enhanced-basic-afterburn-hit", "swap-in"].includes(event.type)) throw new Error("Unknown Burnice awakening event");
  const state = { ...previous };
  if (state.level === 0) return { state, entryAttack: null };
  if (event.type === "swap-in") {
    if (!state.flowingFire) return { state, entryAttack: null };
    state.afterburnCount = 0;
    state.flowingFire = false;
    return { state, entryAttack: { action: "awakening-ex-entry", entryType: "quick-assist", flowingFireSpent: 1 } };
  }
  if (!state.flowingFire) {
    state.afterburnCount = Math.min(12, state.afterburnCount + (event.type === "enhanced-basic-afterburn-hit" ? 2 : 1));
    state.flowingFire = state.afterburnCount === 12;
  }
  return { state, entryAttack: null };
}

/** Existing anomaly settlement fractions; luminous is not one of the listed states. */
export function burniceAnomalyReleaseRatio(element: Element): number | null {
  const ratios: Record<Element, number | null> = {
    ether: 4.8, electric: 2.4, fire: 6, physical: 0.4, ice: 0.6, wind: 0.24, luminous: null,
  };
  if (!Object.hasOwn(ratios, element)) throw new Error("Unknown anomaly release element");
  return ratios[element];
}
