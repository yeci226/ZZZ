export const TAGS = ["灌水", "情報", "求助", "同人", "廣告"] as const;
export type Tag = (typeof TAGS)[number];

export const LIMITS = {
  title: 40,
  body: 1000,
  comment: 300,
  nicknameMin: 2,
  nicknameMax: 12,
  coverBytes: 8 * 1024 * 1024,
  coverWidth: 1024,
};

export const NEW_WINDOW_MS = 24 * 3600e3;
export const REPORT_HIDE_THRESHOLD = 3;
export const POST_COOLDOWN_MS = 300_000;
export const POSTS_PER_DAY = 10;
export const COMMENT_COOLDOWN_MS = 15_000;

export type RateResult = { ok: true } | { ok: false; retryAt: number };

// Lengths are user-visible characters, so count code points rather than UTF-16 units.
const length = (s: string) => [...s].length;

export function isNew(createdAt: number, read: boolean, now: number): boolean {
  return !read && now - createdAt < NEW_WINDOW_MS;
}

export function checkPostRate(recentPostTimes: number[], now: number): RateResult {
  const recent = recentPostTimes.filter((t) => now - t < NEW_WINDOW_MS);
  const latest = Math.max(...recent);
  if (recent.length && now - latest < POST_COOLDOWN_MS) return { ok: false, retryAt: latest + POST_COOLDOWN_MS };
  if (recent.length >= POSTS_PER_DAY) return { ok: false, retryAt: Math.min(...recent) + NEW_WINDOW_MS };
  return { ok: true };
}

export function checkCommentRate(lastCommentAt: number | null, now: number): RateResult {
  if (lastCommentAt !== null && now - lastCommentAt < COMMENT_COOLDOWN_MS)
    return { ok: false, retryAt: lastCommentAt + COMMENT_COOLDOWN_MS };
  return { ok: true };
}

export function validatePost(i: { tag: string; title: string; body: string }): string[] {
  const errors: string[] = [];
  if (!(TAGS as readonly string[]).includes(i.tag)) errors.push("interknot_BadTag");
  if (!i.title.trim()) errors.push("interknot_TitleEmpty");
  if (length(i.title) > LIMITS.title) errors.push("interknot_TitleTooLong");
  if (!i.body.trim()) errors.push("interknot_BodyEmpty");
  if (length(i.body) > LIMITS.body) errors.push("interknot_BodyTooLong");
  return errors;
}

export function validateComment(body: string): string[] {
  if (!body.trim()) return ["interknot_CommentEmpty"];
  return length(body) > LIMITS.comment ? ["interknot_CommentTooLong"] : [];
}

export function validateNickname(n: string): string | null {
  const len = length(n.trim());
  return len < LIMITS.nicknameMin || len > LIMITS.nicknameMax ? "interknot_NicknameLength" : null;
}

export function shouldHide(distinctReporters: number): boolean {
  return distinctReporters >= REPORT_HIDE_THRESHOLD;
}
