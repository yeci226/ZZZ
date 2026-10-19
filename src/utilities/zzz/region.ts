import { getZZZRegion, ZZZRegion } from "@yeci226/hoyoapi";

/** Prefer the role's official region; old bindings may only have a UID. */
export function resolveZzzRegion(uid: string, region?: unknown): string {
  if (typeof region === "string" && Object.values(ZZZRegion).includes(region as ZZZRegion)) return region;
  return getZZZRegion(Number(uid));
}
