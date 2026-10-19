import { integer, record } from "./stats.js";
import type { BuildSnapshot, Condition, RotationStep } from "./types.js";

function condition(input: unknown): Condition {
  const value = record(input);
  if (
    Object.keys(value).some(
      (k) => !["resource", "stunned", "incoming"].includes(k),
    )
  )
    throw new Error("Unknown condition");
  if (value.stunned !== undefined && typeof value.stunned !== "boolean")
    throw new Error("Invalid stun condition");
  if (value.incoming !== undefined && typeof value.incoming !== "boolean")
    throw new Error("Invalid incoming condition");
  if (value.resource) {
    const r = record(value.resource);
    if (typeof r.name !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(r.name))
      throw new Error("Invalid resource");
    integer(r.atLeast, "resource condition", 0, 100_000);
  }
  return structuredClone(value) as Condition;
}
export function validateRotation(
  input: unknown,
  actors: BuildSnapshot[],
): RotationStep[] {
  let count = 0;
  const walk = (raw: unknown, depth: number): RotationStep[] => {
    if (!Array.isArray(raw) || !raw.length || depth > 4 || raw.length > 500)
      throw new Error("Invalid rotation length/depth");
    return raw.map((value) => {
      if (++count > 2000) throw new Error("Rotation too large");
      const step = record(value);
      if (step.type === "wait")
        return {
          type: "wait",
          ms: integer(step.ms, "wait duration", 1, 300_000),
        };
      if (step.type === "repeat")
        return {
          type: "repeat",
          count: integer(step.count, "repeat count", 1, 100),
          steps: walk(step.steps, depth + 1),
        };
      const actor = actors.find(
        (a) => a.id === step.actor && a.kind === "agent",
      );
      if (!actor) throw new Error(`Unknown actor ${step.actor}`);
      if (step.type === "switch") return { type: "switch", actor: actor.id };
      if (
        step.type !== "action" ||
        !Object.hasOwn(actor.actions, step.action) ||
        actor.actions[step.action].execution === "trigger"
      )
        throw new Error(`Unknown or passive-only action ${step.action}`);
      if (
        step.onUnavailable !== undefined &&
        !["skip", "wait", "error"].includes(step.onUnavailable)
      )
        throw new Error("Invalid unavailable-action behavior");
      if (step.maxWaitMs !== undefined && step.onUnavailable !== "wait")
        throw new Error("Wait limit requires wait behavior");
      const when = step.when ? condition(step.when) : undefined;
      if (when?.resource && !Object.hasOwn(actor.resources, when.resource.name))
        throw new Error("Unknown condition resource");
      if (step.cancelAtMs !== undefined) {
        const action = actor.actions[step.action];
        const atMs = integer(
          step.cancelAtMs,
          "cancel time",
          1,
          action.durationMs - 1,
        );
        if (
          !action.cancelWindows?.some(
            (window) => atMs >= window.startMs && atMs <= window.endMs,
          )
        )
          throw new Error("Cancellation is outside authored windows");
      }
      return {
        type: "action",
        actor: actor.id,
        action: step.action,
        ...(when ? { when } : {}),
        ...(step.onUnavailable !== undefined
          ? { onUnavailable: step.onUnavailable }
          : {}),
        ...(step.maxWaitMs !== undefined
          ? {
              maxWaitMs: integer(
                step.maxWaitMs,
                "action wait limit",
                1,
                300_000,
              ),
            }
          : {}),
        ...(step.cancelAtMs !== undefined
          ? { cancelAtMs: step.cancelAtMs }
          : {}),
      };
    });
  };
  const result = walk(input, 0);
  // Bound expansion before allocating it.
  const size = (steps: RotationStep[]): number =>
    steps.reduce(
      (n, s) => n + (s.type === "repeat" ? s.count * size(s.steps) : 1),
      0,
    );
  if (size(result) > 10_000) throw new Error("Expanded rotation too large");
  return result;
}
export function expandRotation(
  steps: RotationStep[],
): Exclude<RotationStep, { type: "repeat" }>[] {
  return steps.flatMap((s) =>
    s.type === "repeat"
      ? Array.from({ length: s.count }, () => expandRotation(s.steps)).flat()
      : [s],
  );
}
export function importRotation(
  text: string,
  actors: BuildSnapshot[],
): RotationStep[] {
  if (Buffer.byteLength(text) > 64_000)
    throw new Error("Rotation import too large");
  const data = record(JSON.parse(text));
  if (data.schemaVersion !== 1) throw new Error("Unsupported rotation version");
  return validateRotation(data.steps, actors);
}
export function exportRotation(steps: RotationStep[]): string {
  return JSON.stringify({ schemaVersion: 1, steps }, null, 2);
}
/** Authored priority list; conditional actions skip, unconditional actions are fallbacks. */
export function defaultRotation(actors: BuildSnapshot[]): RotationStep[] {
  const steps: RotationStep[] = [];
  for (const actor of actors) {
    steps.push({ type: "switch", actor: actor.id });
    for (const id of actor.defaultPriority) {
      const action = actor.actions[id];
      if (!action) throw new Error(`Missing default action ${actor.id}/${id}`);
      steps.push({
        type: "action",
        actor: actor.id,
        action: id,
        when: {
          ...action.requires,
          ...(Object.keys(action.cost).length === 1
            ? {
                resource: {
                  name: Object.keys(action.cost)[0],
                  atLeast: Object.values(action.cost)[0],
                },
              }
            : {}),
        },
      });
    }
  }
  return validateRotation(steps, actors);
}
