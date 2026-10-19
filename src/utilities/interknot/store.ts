import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { MainTab, SubTab } from "./customId.js";
import type { Tag } from "./rules.js";

export type Status = "visible" | "hidden" | "deleted";

export interface Profile {
  userId: string;
  nickname: string;
  avatarId: number;
  bannedUntil: number | null;
  createdAt: number;
}

export interface Post {
  id: number;
  authorId: string;
  guildId: string | null;
  tag: Tag;
  title: string;
  body: string;
  coverHash: string | null;
  anonymous: boolean;
  featured: boolean;
  status: Status;
  createdAt: number;
}

/** Author fields are the real profile; views decide what anonymous posts reveal. */
export interface FeedItem extends Post {
  nickname: string;
  avatarId: number;
  read: boolean;
}

export interface Comment {
  id: number;
  postId: number;
  authorId: string;
  floor: number;
  body: string;
  anonymous: boolean;
  status: Status;
  createdAt: number;
  nickname: string;
  avatarId: number;
}

export type NewPost = Pick<Post, "authorId" | "guildId" | "tag" | "title" | "body" | "coverHash" | "anonymous">;

const FEED_LIMIT = 300;

const postFrom = (r: any): Post => ({
  id: r.id,
  authorId: r.author_id,
  guildId: r.guild_id,
  tag: r.tag,
  title: r.title,
  body: r.body,
  coverHash: r.cover_hash,
  anonymous: !!r.anonymous,
  featured: !!r.featured,
  status: r.status,
  createdAt: r.created_at,
});

const commentFrom = (r: any): Comment => ({
  id: r.id,
  postId: r.post_id,
  authorId: r.author_id,
  floor: r.floor,
  body: r.body,
  anonymous: !!r.anonymous,
  status: r.status,
  createdAt: r.created_at,
  nickname: r.nickname ?? "",
  avatarId: r.avatar_id ?? 1,
});

export class InterknotStore {
  private db: Database.Database;

  constructor(filename = resolve("data/interknot.sqlite")) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ik_profiles (
        user_id TEXT PRIMARY KEY, nickname TEXT NOT NULL, avatar_id INTEGER NOT NULL,
        banned_until INTEGER, created_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS ik_profiles_nickname ON ik_profiles(nickname COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS ik_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, author_id TEXT NOT NULL, guild_id TEXT, tag TEXT NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, cover_hash TEXT, anonymous INTEGER NOT NULL DEFAULT 0,
        featured INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'visible',
        created_at INTEGER NOT NULL, edited_at INTEGER);
      CREATE INDEX IF NOT EXISTS ik_posts_feed ON ik_posts(status, created_at DESC);
      CREATE TABLE IF NOT EXISTS ik_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES ik_posts(id),
        author_id TEXT NOT NULL, floor INTEGER NOT NULL, body TEXT NOT NULL,
        anonymous INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'visible',
        created_at INTEGER NOT NULL, UNIQUE(post_id, floor));
      CREATE TABLE IF NOT EXISTS ik_hearts (
        post_id INTEGER NOT NULL REFERENCES ik_posts(id), user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL, PRIMARY KEY(post_id, user_id));
      CREATE TABLE IF NOT EXISTS ik_reads (
        user_id TEXT NOT NULL, post_id INTEGER NOT NULL REFERENCES ik_posts(id),
        read_at INTEGER NOT NULL, PRIMARY KEY(user_id, post_id));
      CREATE TABLE IF NOT EXISTS ik_reports (
        target_type TEXT NOT NULL, target_id INTEGER NOT NULL, reporter_id TEXT NOT NULL,
        reason TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
        PRIMARY KEY(target_type, target_id, reporter_id));
    `);
  }

  close(): void {
    this.db.close();
  }

  getProfile(userId: string): Profile | null {
    const r: any = this.db.prepare("SELECT * FROM ik_profiles WHERE user_id = ?").get(userId);
    return r
      ? { userId: r.user_id, nickname: r.nickname, avatarId: r.avatar_id, bannedUntil: r.banned_until, createdAt: r.created_at }
      : null;
  }

  saveProfile(userId: string, nickname: string, avatarId: number, now: number): "ok" | "nickname_taken" {
    try {
      this.db
        .prepare(
          `INSERT INTO ik_profiles (user_id, nickname, avatar_id, created_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET nickname = excluded.nickname, avatar_id = excluded.avatar_id`,
        )
        .run(userId, nickname, avatarId, now);
      return "ok";
    } catch (error: any) {
      if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") return "nickname_taken";
      throw error;
    }
  }

  setBan(userId: string, until: number | null): void {
    this.db.prepare("UPDATE ik_profiles SET banned_until = ? WHERE user_id = ?").run(until, userId);
  }

  createPost(p: NewPost, now: number): number {
    return Number(
      this.db
        .prepare(
          `INSERT INTO ik_posts (author_id, guild_id, tag, title, body, cover_hash, anonymous, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(p.authorId, p.guildId, p.tag, p.title, p.body, p.coverHash, p.anonymous ? 1 : 0, now).lastInsertRowid,
    );
  }

  getPost(id: number): Post | null {
    const r = this.db.prepare("SELECT * FROM ik_posts WHERE id = ?").get(id);
    return r ? postFrom(r) : null;
  }

  listFeed(q: { viewerId: string; main: MainTab; sub: SubTab; guildId: string | null }): FeedItem[] {
    if (q.main === "guild" && !q.guildId) return [];
    const where = ["p.status = 'visible'"];
    const args: unknown[] = [q.viewerId];
    if (q.main === "guild") (where.push("p.guild_id = ?"), args.push(q.guildId));
    if (q.main === "mine") (where.push("p.author_id = ?"), args.push(q.viewerId));
    if (q.sub === "featured") where.push("p.featured = 1");
    if (q.sub === "help") where.push("p.tag = '求助'");
    const rows: any[] = this.db
      .prepare(
        `SELECT p.*, pr.nickname, pr.avatar_id, (r.user_id IS NOT NULL) AS is_read
         FROM ik_posts p
         LEFT JOIN ik_profiles pr ON pr.user_id = p.author_id
         LEFT JOIN ik_reads r ON r.post_id = p.id AND r.user_id = ?
         WHERE ${where.join(" AND ")}
         ORDER BY p.created_at DESC, p.id DESC LIMIT ${FEED_LIMIT}`,
      )
      .all(...args);
    return rows.map((r) => ({ ...postFrom(r), nickname: r.nickname ?? "", avatarId: r.avatar_id ?? 1, read: !!r.is_read }));
  }

  addComment(postId: number, authorId: string, body: string, anonymous: boolean, now: number): number {
    const insert = this.db.transaction(() => {
      const { floor } = this.db
        .prepare("SELECT COALESCE(MAX(floor), 0) + 1 AS floor FROM ik_comments WHERE post_id = ?")
        .get(postId) as { floor: number };
      this.db
        .prepare("INSERT INTO ik_comments (post_id, author_id, floor, body, anonymous, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(postId, authorId, floor, body, anonymous ? 1 : 0, now);
      return floor;
    });
    try {
      return insert();
    } catch (error: any) {
      // Another process took the same floor between our read and write; one retry reads the new max.
      if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") return insert();
      throw error;
    }
  }

  getComment(id: number): Comment | null {
    const r = this.db
      .prepare(
        `SELECT c.*, pr.nickname, pr.avatar_id FROM ik_comments c
         LEFT JOIN ik_profiles pr ON pr.user_id = c.author_id WHERE c.id = ?`,
      )
      .get(id);
    return r ? commentFrom(r) : null;
  }

  listComments(postId: number): Comment[] {
    return this.db
      .prepare(
        `SELECT c.*, pr.nickname, pr.avatar_id FROM ik_comments c
         LEFT JOIN ik_profiles pr ON pr.user_id = c.author_id
         WHERE c.post_id = ? AND c.status = 'visible' ORDER BY c.floor`,
      )
      .all(postId)
      .map(commentFrom);
  }

  setPostStatus(id: number, status: Status): void {
    this.db.prepare("UPDATE ik_posts SET status = ? WHERE id = ?").run(status, id);
  }

  setCommentStatus(id: number, status: Status): void {
    this.db.prepare("UPDATE ik_comments SET status = ? WHERE id = ?").run(status, id);
  }

  setFeatured(id: number, on: boolean): void {
    this.db.prepare("UPDATE ik_posts SET featured = ? WHERE id = ?").run(on ? 1 : 0, id);
  }

  toggleHeart(postId: number, userId: string, now: number): boolean {
    const removed = this.db.prepare("DELETE FROM ik_hearts WHERE post_id = ? AND user_id = ?").run(postId, userId).changes;
    if (removed) return false;
    this.db.prepare("INSERT INTO ik_hearts (post_id, user_id, created_at) VALUES (?, ?, ?)").run(postId, userId, now);
    return true;
  }

  heartCount(postId: number): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM ik_hearts WHERE post_id = ?").get(postId) as { n: number }).n;
  }

  hasHeart(postId: number, userId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM ik_hearts WHERE post_id = ? AND user_id = ?").get(postId, userId);
  }

  reputation(userId: string): number {
    return (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM ik_hearts h JOIN ik_posts p ON p.id = h.post_id
           WHERE p.author_id = ? AND p.status = 'visible'`,
        )
        .get(userId) as { n: number }
    ).n;
  }

  markRead(userId: string, postId: number, now: number): void {
    this.db.prepare("INSERT OR IGNORE INTO ik_reads (user_id, post_id, read_at) VALUES (?, ?, ?)").run(userId, postId, now);
  }

  addReport(type: "post" | "comment", targetId: number, reporterId: string, reason: string, note: string, now: number): number {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO ik_reports (target_type, target_id, reporter_id, reason, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(type, targetId, reporterId, reason, note, now);
    return (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM ik_reports WHERE target_type = ? AND target_id = ?")
        .get(type, targetId) as { n: number }
    ).n;
  }

  recentPostTimes(userId: string, since: number): number[] {
    return this.db
      .prepare("SELECT created_at FROM ik_posts WHERE author_id = ? AND created_at >= ? ORDER BY created_at")
      .all(userId, since)
      .map((r: any) => r.created_at);
  }

  lastCommentAt(userId: string): number | null {
    return (this.db.prepare("SELECT MAX(created_at) AS t FROM ik_comments WHERE author_id = ?").get(userId) as { t: number | null }).t;
  }

  coverRefCount(hash: string): number {
    return (
      this.db.prepare("SELECT COUNT(*) AS n FROM ik_posts WHERE cover_hash = ? AND status != 'deleted'").get(hash) as {
        n: number;
      }
    ).n;
  }
}

let store: InterknotStore | undefined;
export function getInterknotStore(): InterknotStore {
  return (store ??= new InterknotStore(process.env.ZZZ_INTERKNOT_DB || undefined));
}
