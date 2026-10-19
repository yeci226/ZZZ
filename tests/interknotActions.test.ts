import { createCanvas } from "@napi-rs/canvas";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  deleteOwn,
  saveProfileAction,
  setFeaturedAction,
  submitComment,
  submitPost,
  submitReport,
  toggleHeartAction,
  type Notifier,
} from "../src/utilities/interknot/actions.js";
import { coverPath } from "../src/utilities/interknot/covers.js";
import { applyModeration, PERMANENT_BAN } from "../src/utilities/interknot/moderation.js";
import { InterknotStore } from "../src/utilities/interknot/store.js";

const t = 1_800_000_000_000;
const png = () => {
  const c = createCanvas(40, 30);
  c.getContext("2d").fillRect(0, 0, 40, 30);
  return c.encodeSync("png");
};

let s: InterknotStore;
let n: Notifier & { calls: unknown[][] };
let dir: string;
let p: number;
const okPost = { userId: "u1", guildId: "g1", tag: "灌水", title: "標題", body: "內文", anonymous: false, cover: null as Buffer | null };
const c = { userId: "u2", postId: 0, body: "留言", anonymous: false };
const rep = (userId: string) => ({ userId, type: "post" as const, targetId: p, reason: "spam", note: "" });

beforeEach(() => {
  s = new InterknotStore(":memory:");
  s.saveProfile("u1", "Yeci", 1, t);
  s.saveProfile("u2", "路人", 2, t);
  dir = mkdtempSync(join(tmpdir(), "ik-actions-"));
  const calls: unknown[][] = [];
  n = {
    calls,
    newPost: async (id) => void calls.push(["newPost", id]),
    autoHidden: async (type, id, reporters) => void calls.push(["autoHidden", type, id, reporters]),
  };
  p = s.createPost({ authorId: "u1", guildId: "g1", tag: "灌水", title: "既有文", body: "x", coverHash: null, anonymous: false }, t - 3600e3);
  c.postId = p;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("submitPost", () => {
  it("creates the post and notifies developers", async () => {
    const r = await submitPost(s, n, okPost, t, dir);
    expect(r.ok).toBe(true);
    expect(n.calls).toEqual([["newPost", r.ok && r.postId]]);
  });
  it("stores an uploaded cover", async () => {
    const r = await submitPost(s, n, { ...okPost, cover: png() }, t, dir);
    const hash = s.getPost(r.ok ? r.postId! : -1)!.coverHash!;
    expect(existsSync(coverPath(hash, dir))).toBe(true);
  });
  it("requires a profile", async () => {
    expect(await submitPost(s, n, { ...okPost, userId: "nobody" }, t, dir)).toEqual({ ok: false, error: "interknot_NoProfile" });
  });
  it("enforces the post cooldown", async () => {
    await submitPost(s, n, okPost, t, dir);
    expect(await submitPost(s, n, okPost, t + 1000, dir)).toMatchObject({ ok: false, error: "interknot_RateLimited" });
  });
  it("rejects invalid fields", async () => {
    expect(await submitPost(s, n, { ...okPost, title: "" }, t, dir)).toMatchObject({ error: "interknot_TitleEmpty" });
  });
  it("creates no post and leaves no file for a bad cover", async () => {
    const before = s.listFeed({ viewerId: "v", main: "all", sub: "all", guildId: null }).length;
    expect(await submitPost(s, n, { ...okPost, cover: Buffer.from("nope") }, t, dir)).toMatchObject({ error: "interknot_Cover_decode" });
    expect(s.listFeed({ viewerId: "v", main: "all", sub: "all", guildId: null })).toHaveLength(before);
    expect(readdirSync(dir)).toEqual([]);
    expect(n.calls).toEqual([]);
  });
  it("still succeeds when notifying fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const r = await submitPost(s, { ...n, newPost: async () => Promise.reject(new Error("dm closed")) }, okPost, t, dir);
    expect(r.ok).toBe(true);
    warn.mockRestore();
  });
});

describe("ban", () => {
  it("blocks posting, commenting and hearts", async () => {
    s.setBan("u1", t + 3600e3);
    expect(await submitPost(s, n, okPost, t, dir)).toMatchObject({ error: "interknot_Banned" });
    expect(submitComment(s, { ...c, userId: "u1" }, t)).toMatchObject({ error: "interknot_Banned" });
    expect(toggleHeartAction(s, "u1", p, t)).toMatchObject({ error: "interknot_Banned" });
  });
  it("expires", async () => {
    s.setBan("u1", t - 1);
    expect((await submitPost(s, n, okPost, t, dir)).ok).toBe(true);
  });
});

describe("comments and hearts", () => {
  it("enforces the comment cooldown", () => {
    expect(submitComment(s, c, t).ok).toBe(true);
    expect(submitComment(s, c, t + 14_000)).toMatchObject({ error: "interknot_RateLimited" });
    expect(submitComment(s, c, t + 15_000).ok).toBe(true);
  });
  it("refuses self hearts", () => {
    expect(toggleHeartAction(s, "u1", p, t)).toMatchObject({ error: "interknot_SelfHeart" });
    expect(toggleHeartAction(s, "u2", p, t).ok).toBe(true);
    expect(s.heartCount(p)).toBe(1);
  });
  it("returns NotFound on hidden or deleted posts without writing", async () => {
    s.setPostStatus(p, "hidden");
    expect(submitComment(s, c, t)).toMatchObject({ error: "interknot_NotFound" });
    expect(toggleHeartAction(s, "u2", p, t)).toMatchObject({ error: "interknot_NotFound" });
    expect(await submitReport(s, n, rep("u2"), t)).toMatchObject({ error: "interknot_NotFound" });
    expect(s.listComments(p)).toHaveLength(0);
    expect(s.heartCount(p)).toBe(0);
  });
});

describe("reports", () => {
  it("auto-hides at the third distinct reporter and notifies", async () => {
    for (const r of ["a", "b", "b", "c"]) await submitReport(s, n, rep(r), t);
    expect(s.getPost(p)!.status).toBe("hidden");
    expect(n.calls).toContainEqual(["autoHidden", "post", p, 3]);
  });
  it("reports comments by id", async () => {
    submitComment(s, c, t);
    const cid = s.listComments(p)[0].id;
    for (const r of ["a", "b", "c"]) await submitReport(s, n, { ...rep(r), type: "comment", targetId: cid }, t);
    expect(s.listComments(p)).toHaveLength(0);
    expect(n.calls).toContainEqual(["autoHidden", "comment", cid, 3]);
  });
});

describe("deleteOwn", () => {
  it("only lets the author delete, and removes the unused cover", async () => {
    const r = await submitPost(s, n, { ...okPost, cover: png() }, t, dir);
    const id = r.ok ? r.postId! : -1;
    const hash = s.getPost(id)!.coverHash!;
    expect(await deleteOwn(s, "u2", "post", id, dir)).toMatchObject({ error: "interknot_NotFound" });
    expect(await deleteOwn(s, "u1", "post", id, dir)).toEqual({ ok: true });
    expect(s.getPost(id)!.status).toBe("deleted");
    expect(existsSync(coverPath(hash, dir))).toBe(false);
  });
  it("deletes own comments", async () => {
    submitComment(s, c, t);
    const cid = s.listComments(p)[0].id;
    expect(await deleteOwn(s, "u1", "comment", cid, dir)).toMatchObject({ error: "interknot_NotFound" });
    expect((await deleteOwn(s, "u2", "comment", cid, dir)).ok).toBe(true);
    expect(s.listComments(p)).toHaveLength(0);
  });
});

describe("developer and profile actions", () => {
  it("only developers can feature", () => {
    expect(setFeaturedAction(s, "u2", p, true, false)).toMatchObject({ error: "interknot_NotDeveloper" });
    expect(setFeaturedAction(s, "dev", p, true, true).ok).toBe(true);
    expect(s.getPost(p)!.featured).toBe(true);
  });
  it("validates profiles", () => {
    expect(saveProfileAction(s, "u9", "a", 1, t)).toMatchObject({ error: "interknot_NicknameLength" });
    expect(saveProfileAction(s, "u9", "新代理人", 99, t).ok).toBe(false);
    expect(saveProfileAction(s, "u9", "yeci", 2, t)).toMatchObject({ error: "interknot_NicknameTaken" });
    expect(saveProfileAction(s, "u9", "  新代理人  ", 2, t).ok).toBe(true);
    expect(s.getProfile("u9")!.nickname).toBe("新代理人");
  });
});

describe("applyModeration", () => {
  it("restores, deletes and bans the real author", async () => {
    s.setPostStatus(p, "hidden");
    await applyModeration(s, "restore", "post", p, t, dir);
    expect(s.getPost(p)!.status).toBe("visible");
    await applyModeration(s, "ban7", "post", p, t, dir);
    expect(s.getPost(p)!.status).toBe("deleted");
    expect(s.getProfile("u1")!.bannedUntil).toBe(t + 7 * 24 * 3600e3);
    submitComment(s, c, t);
    const cid = s.listComments(p)[0]?.id ?? s.addComment(p, "u2", "x", false, t);
    await applyModeration(s, "banPerm", "comment", cid, t, dir);
    expect(s.getProfile("u2")!.bannedUntil).toBe(PERMANENT_BAN);
  });
});
