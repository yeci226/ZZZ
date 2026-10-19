import { integer } from "./stats.js";
import { validateRotation } from "./rotation.js";
import type { BuildSnapshot, Condition, RotationStep } from "./types.js";

export type RotationEdit =
  | { type: "insert"; index: number; step: RotationStep }
  | { type: "replace"; index: number; step: RotationStep }
  | { type: "delete"; index: number }
  | { type: "move"; index: number; to: number };

/** Atomic edits preserve nested imported repeats; invalid edits leave the original untouched. */
export function editRotation(
  steps: RotationStep[],
  edit: RotationEdit,
  actors: BuildSnapshot[],
): RotationStep[] {
  const next = structuredClone(steps);
  integer(
    edit.index,
    "step index",
    0,
    edit.type === "insert" ? next.length : next.length - 1,
  );
  if (edit.type === "insert")
    next.splice(edit.index, 0, structuredClone(edit.step));
  else if (edit.type === "replace")
    next[edit.index] = structuredClone(edit.step);
  else if (edit.type === "delete") next.splice(edit.index, 1);
  else {
    integer(edit.to, "destination step", 0, next.length - 1);
    const [step] = next.splice(edit.index, 1);
    next.splice(edit.to, 0, step);
  }
  return validateRotation(next, actors);
}

export function repeatStep(step: RotationStep, count: unknown): RotationStep {
  const times = integer(count, "repeat count", 1, 100);
  return times === 1
    ? structuredClone(step)
    : { type: "repeat", count: times, steps: [structuredClone(step)] };
}

export function stepCondition(
  preset: string,
  resource?: { name: string; atLeast: number },
): Condition | undefined {
  const presets: Record<string, Condition> = {
    always: {},
    stunned: { stunned: true },
    unstunned: { stunned: false },
    incoming: { incoming: true },
  };
  if (!Object.hasOwn(presets, preset))
    throw new Error("Unknown action condition");
  const result = { ...presets[preset], ...(resource ? { resource } : {}) };
  return Object.keys(result).length ? result : undefined;
}
