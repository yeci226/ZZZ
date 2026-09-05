export type ZzzProfileStyle = "formal" | "current";

export const DEFAULT_ZZZ_PROFILE_STYLE: ZzzProfileStyle = "formal";

export function normalizeZzzProfileStyle(value: unknown): ZzzProfileStyle {
  return value === "current" ? "current" : DEFAULT_ZZZ_PROFILE_STYLE;
}
