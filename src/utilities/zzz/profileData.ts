/**
 * The HoyoAPI ZZZ character endpoint returns `avatar_list` directly, so
 * `record.character()` resolves to a one-item array while some callers may
 * already provide the unwrapped object. Keep both shapes consistent before
 * rendering a profile.
 */
export function unwrapProfileCharacter(result: unknown): Record<string, any> | null {
  const character = Array.isArray(result) ? result[0] : result;
  return character && typeof character === "object"
    ? (character as Record<string, any>)
    : null;
}
