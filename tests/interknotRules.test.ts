import {
  checkCommentRate,
  checkPostRate,
  isNew,
  shouldHide,
  validateComment,
  validateNickname,
  validatePost,
} from "../src/utilities/interknot/rules.js";

const now = 1_800_000_000_000;
const HOUR = 3600e3;

describe("interknot NEW window", () => {
  it("marks unread posts younger than 24h as new", () => {
    expect(isNew(now - 23 * HOUR, false, now)).toBe(true);
    expect(isNew(now - 25 * HOUR, false, now)).toBe(false);
  });
  it("never marks read posts as new", () => {
    expect(isNew(now, true, now)).toBe(false);
  });
});

describe("interknot rate limits", () => {
  it("enforces the 5 minute post cooldown", () => {
    expect(checkPostRate([now - 299_000], now)).toEqual({ ok: false, retryAt: now + 1_000 });
    expect(checkPostRate([now - 301_000], now)).toEqual({ ok: true });
  });
  it("caps posts at 10 per 24h until the oldest ages out", () => {
    const times = Array.from({ length: 10 }, (_, i) => now - HOUR * (i + 1));
    expect(checkPostRate(times, now)).toEqual({ ok: false, retryAt: now - HOUR * 10 + 24 * HOUR });
  });
  it("enforces the 15 second comment cooldown", () => {
    expect(checkCommentRate(now - 14_000, now)).toEqual({ ok: false, retryAt: now + 1_000 });
    expect(checkCommentRate(now - 15_000, now)).toEqual({ ok: true });
    expect(checkCommentRate(null, now)).toEqual({ ok: true });
  });
});

describe("interknot validation", () => {
  const ok = { tag: "灌水", title: "標題", body: "內文" };
  it("accepts a valid post", () => {
    expect(validatePost(ok)).toEqual([]);
  });
  it("rejects bad tag, long and blank fields", () => {
    expect(validatePost({ ...ok, title: "a".repeat(41) })).toContain("interknot_TitleTooLong");
    expect(validatePost({ ...ok, tag: "攻略" })).toContain("interknot_BadTag");
    expect(validatePost({ ...ok, title: "  " })).toContain("interknot_TitleEmpty");
    expect(validatePost({ ...ok, body: "" })).toContain("interknot_BodyEmpty");
    expect(validatePost({ ...ok, body: "字".repeat(1001) })).toContain("interknot_BodyTooLong");
  });
  it("counts title length by code point", () => {
    expect(validatePost({ ...ok, title: "🐱".repeat(40) })).toEqual([]);
  });
  it("validates comments", () => {
    expect(validateComment("嗨")).toEqual([]);
    expect(validateComment(" ")).toContain("interknot_CommentEmpty");
    expect(validateComment("a".repeat(301))).toContain("interknot_CommentTooLong");
  });
  it("validates nickname length by code point", () => {
    expect(validateNickname("a")).toBe("interknot_NicknameLength");
    expect(validateNickname("繩網".repeat(7))).toBe("interknot_NicknameLength");
    expect(validateNickname("🐱🐱")).toBeNull();
    expect(validateNickname("  a  ")).toBe("interknot_NicknameLength");
  });
});

describe("interknot report threshold", () => {
  it("hides at 3 distinct reporters", () => {
    expect(shouldHide(2)).toBe(false);
    expect(shouldHide(3)).toBe(true);
  });
});
