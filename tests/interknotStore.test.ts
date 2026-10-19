import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InterknotStore, type FeedItem } from "../src/utilities/interknot/store.js";

const t = 1_800_000_000_000;
const ids = (items: FeedItem[]) => items.map((p) => p.id);
const base = {
  authorId: "u1",
  guildId: "g1" as string | null,
  tag: "灌水" as const,
  title: "標題",
  body: "內文",
  coverHash: null,
  anonymous: false,
};

let s: InterknotStore;
beforeEach(() => {
  s = new InterknotStore(":memory:");
  s.saveProfile("u1", "Yeci", 1, t);
  s.saveProfile("u2", "路人", 2, t);
});

describe("profiles", () => {
  it("keeps nicknames unique case-insensitively", () => {
    expect(s.saveProfile("u3", "yeci", 3, t)).toBe("nickname_taken");
    expect(s.saveProfile("u1", "YECI", 3, t)).toBe("ok");
    expect(s.getProfile("u1")).toMatchObject({ nickname: "YECI", avatarId: 3, bannedUntil: null });
  });
  it("stores bans", () => {
    s.setBan("u1", t + 1000);
    expect(s.getProfile("u1")!.bannedUntil).toBe(t + 1000);
    s.setBan("u1", null);
    expect(s.getProfile("u1")!.bannedUntil).toBeNull();
  });
  it("returns null for unknown users", () => {
    expect(s.getProfile("nobody")).toBeNull();
  });
});

describe("posts and comments", () => {
  it("numbers comment floors sequentially per post", () => {
    const p = s.createPost(base, t);
    const q = s.createPost(base, t + 1);
    expect([s.addComment(p, "u2", "a", false, t), s.addComment(p, "u1", "b", false, t)]).toEqual([1, 2]);
    expect(s.addComment(q, "u2", "c", false, t)).toBe(1);
    expect(s.listComments(p).map((c) => [c.floor, c.nickname])).toEqual([[1, "路人"], [2, "Yeci"]]);
  });
  it("excludes hidden comments but keeps floor numbers", () => {
    const p = s.createPost(base, t);
    s.addComment(p, "u2", "a", false, t);
    s.addComment(p, "u2", "b", false, t);
    s.setCommentStatus(s.listComments(p)[0].id, "hidden");
    expect(s.listComments(p).map((c) => c.floor)).toEqual([2]);
    expect(s.addComment(p, "u2", "c", false, t)).toBe(3);
  });
  it("keeps the real author of anonymous posts", () => {
    const id = s.createPost({ ...base, anonymous: true }, t);
    expect(s.getPost(id)).toMatchObject({ authorId: "u1", anonymous: true, status: "visible", featured: false });
  });
  it("returns any status from getPost", () => {
    const id = s.createPost(base, t);
    s.setPostStatus(id, "deleted");
    expect(s.getPost(id)!.status).toBe("deleted");
    expect(s.getPost(9999)).toBeNull();
  });
});

describe("hearts and reputation", () => {
  it("toggles one heart per user and sums visible posts into reputation", () => {
    const p = s.createPost(base, t);
    expect(s.toggleHeart(p, "u2", t)).toBe(true);
    expect(s.toggleHeart(p, "u2", t)).toBe(false);
    s.toggleHeart(p, "u2", t);
    s.toggleHeart(p, "u3", t);
    expect(s.heartCount(p)).toBe(2);
    expect(s.hasHeart(p, "u3")).toBe(true);
    expect(s.reputation("u1")).toBe(2);
    s.setPostStatus(p, "deleted");
    expect(s.reputation("u1")).toBe(0);
  });
});

describe("feed tabs", () => {
  let a: number, b: number, c: number, d: number;
  beforeEach(() => {
    a = s.createPost({ ...base, guildId: "g1" }, t + 1);
    b = s.createPost({ ...base, guildId: null, tag: "求助" }, t + 2);
    c = s.createPost({ ...base, authorId: "u2", guildId: "g2" }, t + 3);
    d = s.createPost(base, t + 4);
    s.setFeatured(c, true);
    s.setPostStatus(d, "hidden");
  });
  const q = (viewerId: string, main: "all" | "guild" | "mine", sub: "all" | "featured" | "help", guildId: string | null) =>
    ids(s.listFeed({ viewerId, main, sub, guildId }));

  it("push tab shows every visible post newest first", () => {
    expect(q("v", "all", "all", "g1")).toEqual([c, b, a]);
  });
  it("guild tab shows only that guild; DMs get nothing", () => {
    expect(q("v", "guild", "all", "g1")).toEqual([a]);
    expect(q("v", "guild", "all", null)).toEqual([]);
  });
  it("mine tab shows the viewer's own posts", () => {
    expect(q("u1", "mine", "all", "g1")).toEqual([b, a]);
  });
  it("featured and help sub-tabs filter", () => {
    expect(q("v", "all", "featured", null)).toEqual([c]);
    expect(q("v", "all", "help", null)).toEqual([b]);
  });
  it("reports read state and author profile", () => {
    s.markRead("v", a, t);
    s.markRead("v", a, t + 5);
    const feed = s.listFeed({ viewerId: "v", main: "all", sub: "all", guildId: null });
    expect(feed.find((x) => x.id === a)).toMatchObject({ read: true, nickname: "Yeci", avatarId: 1 });
    expect(feed.find((x) => x.id === b)!.read).toBe(false);
  });
});

describe("reports and rate inputs", () => {
  it("counts distinct reporters only", () => {
    const p = s.createPost(base, t);
    expect(s.addReport("post", p, "r1", "spam", "", t)).toBe(1);
    expect(s.addReport("post", p, "r1", "spam", "", t)).toBe(1);
    expect(s.addReport("post", p, "r2", "spam", "", t)).toBe(2);
    expect(s.addReport("comment", p, "r3", "spam", "", t)).toBe(1);
  });
  it("exposes recent post times and last comment time", () => {
    const p = s.createPost(base, t - 100);
    s.createPost(base, t - 10);
    s.createPost({ ...base, authorId: "u2" }, t);
    expect(s.recentPostTimes("u1", t - 50)).toEqual([t - 10]);
    expect(s.lastCommentAt("u2")).toBeNull();
    s.addComment(p, "u2", "x", false, t + 7);
    expect(s.lastCommentAt("u2")).toBe(t + 7);
  });
  it("counts cover references from non-deleted posts", () => {
    const p = s.createPost({ ...base, coverHash: "abc" }, t);
    s.createPost({ ...base, coverHash: "abc" }, t);
    expect(s.coverRefCount("abc")).toBe(2);
    s.setPostStatus(p, "deleted");
    expect(s.coverRefCount("abc")).toBe(1);
  });
});

describe("persistence", () => {
  it("survives reopening the database file", () => {
    const dir = mkdtempSync(join(tmpdir(), "interknot-"));
    const file = join(dir, "ik.sqlite");
    const first = new InterknotStore(file);
    first.saveProfile("u1", "Yeci", 1, t);
    const id = first.createPost(base, t);
    first.close();
    const second = new InterknotStore(file);
    expect(second.getPost(id)!.title).toBe("標題");
    second.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("reputation privacy", () => {
  it("excludes hearts on anonymous posts unless asked for the owner's own total", () => {
    const named = s.createPost(base, t);
    const anon = s.createPost({ ...base, anonymous: true }, t);
    s.toggleHeart(named, "u2", t);
    s.toggleHeart(anon, "u2", t);
    expect(s.reputation("u1")).toBe(1);
    expect(s.reputation("u1", { includeAnonymous: true })).toBe(2);
  });
});

describe("report reset", () => {
  it("clears reports for one target", () => {
    const p = s.createPost(base, t);
    s.addReport("post", p, "r1", "spam", "", t);
    s.addReport("post", p, "r2", "spam", "", t);
    s.clearReports("post", p);
    expect(s.addReport("post", p, "r3", "spam", "", t)).toBe(1);
  });
});
