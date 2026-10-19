import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  CATEGORIES,
  DAY_MS,
  type NewsSubscription,
  type NewsEvent,
  type NewsDelivery,
} from "./types.js";

export class NewsConflictError extends Error {}

/** Each bot has its own database. WAL and CAS protect concurrent shard settings. */
export class NewsStore {
  private db: Database.Database;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS news_publications (
        id TEXT PRIMARY KEY, destination TEXT NOT NULL, subscription_id TEXT NOT NULL, revision INTEGER NOT NULL,
        document_id TEXT NOT NULL, channel_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS news_delivery_parts (
        publication_id TEXT NOT NULL, part_index INTEGER NOT NULL, message_id TEXT NOT NULL,
        PRIMARY KEY(publication_id,part_index)
      );
      CREATE TABLE IF NOT EXISTS news_documents (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS news_readers (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS news_reader_locks (id TEXT PRIMARY KEY, owner TEXT NOT NULL, until_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS news_subscriptions (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS news_events (id TEXT PRIMARY KEY, published_at INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS news_sources (id TEXT PRIMARY KEY, body TEXT NOT NULL, success_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS news_seen (source TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(source,id));
      CREATE TABLE IF NOT EXISTS news_deliveries (
        event_id TEXT NOT NULL, subscription_id TEXT NOT NULL, revision INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        next_at INTEGER NOT NULL, error TEXT,
        PRIMARY KEY(event_id,subscription_id)
      );
      CREATE INDEX IF NOT EXISTS news_delivery_due ON news_deliveries(status,next_at);
      CREATE INDEX IF NOT EXISTS news_event_time ON news_events(published_at);
    `);
  }
  close(): void {
    this.db.close();
  }
  getSubscription(id: string): NewsSubscription | null {
    const row = this.db
      .prepare("SELECT body FROM news_subscriptions WHERE id=?")
      .get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : null;
  }
  subscriptions(): NewsSubscription[] {
    return (
      this.db
        .prepare("SELECT body FROM news_subscriptions ORDER BY id")
        .all() as { body: string }[]
    ).map((r) => JSON.parse(r.body));
  }
  saveSubscription(
    input: NewsSubscription,
    expectedRevision: number,
    now = Date.now(),
  ): NewsSubscription {
    return this.db.transaction(() => {
      const old = this.getSubscription(input.id);
      if ((old?.revision ?? 0) !== expectedRevision)
        throw new NewsConflictError("subscription_changed");
      if (
        !input.categories.length ||
        input.categories.some((c) => !CATEGORIES.includes(c))
      )
        throw new Error("empty_categories");
      if (
        input.scope === "channel"
          ? !input.channelId ||
            !input.guildId ||
            input.id !== `channel:${input.channelId}`
          : input.id !== `dm:${input.userId}`
      )
        throw new Error("invalid_destination");
      const next: NewsSubscription = {
        ...input,
        categories: [...new Set(input.categories)],
        revision: expectedRevision + 1,
        updatedAt: now,
        categorySince: {},
      };
      for (const category of next.categories) {
        next.categorySince[category] =
          old?.enabled &&
          old.locale === next.locale &&
          old.categories.includes(category)
            ? (old.categorySince[category] ?? now)
            : now;
      }
      this.db
        .prepare(
          "INSERT OR REPLACE INTO news_subscriptions(id,body) VALUES (?,?)",
        )
        .run(next.id, JSON.stringify(next));
      this.db
        .prepare(
          "UPDATE news_deliveries SET status='cancelled' WHERE subscription_id=? AND status IN ('pending','sending')",
        )
        .run(next.id);
      this.db
        .prepare(
          "UPDATE news_publications SET status='cancelled' WHERE subscription_id=? AND status='pending'",
        )
        .run(next.id);
      return next;
    })();
  }
  /** Move a shared channel subscription atomically without resetting its history. */
  moveChannelSubscription(
    id: string,
    revision: number,
    guildId: string,
    channelId: string,
    now = Date.now(),
  ): NewsSubscription {
    return this.db.transaction(() => {
      const source = this.getSubscription(id);
      const targetId = `channel:${channelId}`;
      if (
        !source ||
        source.revision !== revision ||
        !source.enabled ||
        source.scope !== "channel" ||
        source.guildId !== guildId
      )
        throw new NewsConflictError("subscription_changed");
      if (id === targetId || this.getSubscription(targetId))
        throw new NewsConflictError("target_exists");
      const next = this.saveSubscription(
        { ...source, id: targetId, channelId },
        0,
        now,
      );
      next.categorySince = { ...source.categorySince };
      this.db
        .prepare("UPDATE news_subscriptions SET body=? WHERE id=?")
        .run(JSON.stringify(next), targetId);
      this.saveSubscription(
        { ...source, enabled: false, invalidReason: null },
        revision,
        now,
      );
      return next;
    })();
  }
  disable(id: string, revision: number, reason: string): void {
    const sub = this.getSubscription(id);
    if (!sub || sub.revision !== revision) return;
    try {
      this.saveSubscription(
        { ...sub, enabled: false, invalidReason: reason },
        revision,
      );
    } catch (e) {
      if (!(e instanceof NewsConflictError)) throw e;
    }
  }
  state<T>(source: string): T | null {
    const row = this.db
      .prepare("SELECT body FROM news_sources WHERE id=?")
      .get(source) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : null;
  }
  seen(source: string, id: string): boolean {
    return Boolean(
      this.db
        .prepare("SELECT 1 FROM news_seen WHERE source=? AND id=?")
        .get(source, id),
    );
  }
  event(id: string): NewsEvent | null {
    const row = this.db
      .prepare("SELECT body FROM news_events WHERE id=?")
      .get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : null;
  }
  /** Source checkpoint, event insertion and fan-out commit together. */
  ingest(
    source: string,
    state: unknown,
    events: NewsEvent[],
    seenIds: string[] = [],
    now = Date.now(),
  ): void {
    this.db.transaction(() => {
      const initialized = this.state(source) !== null;
      const subs = this.subscriptions();
      for (const event of events) {
        const inserted = this.db
          .prepare(
            "INSERT OR IGNORE INTO news_events(id,published_at,body) VALUES (?,?,?)",
          )
          .run(event.id, event.publishedAt, JSON.stringify(event)).changes;
        // Article timestamps let a first poll safely include publications made
        // after subscription. Status baselines have no such publication time.
        if (
          !inserted ||
          (!initialized && event.source !== "hoyolab") ||
          event.publishedAt < now - DAY_MS
        )
          continue;
        for (const sub of subs) {
          if (!sub.enabled || (event.locale && sub.locale !== event.locale))
            continue;
          if (
            !event.categories.some(
              (c) =>
                sub.categories.includes(c) &&
                event.publishedAt >= (sub.categorySince[c] ?? Infinity),
            )
          )
            continue;
          this.db
            .prepare(
              "INSERT OR IGNORE INTO news_deliveries(event_id,subscription_id,revision,next_at) VALUES (?,?,?,?)",
            )
            .run(event.id, sub.id, sub.revision, now);
        }
      }
      for (const id of seenIds)
        this.db
          .prepare("INSERT OR IGNORE INTO news_seen(source,id) VALUES (?,?)")
          .run(source, id);
      this.db
        .prepare(
          "INSERT OR REPLACE INTO news_sources(id,body,success_at) VALUES (?,?,?)",
        )
        .run(source, JSON.stringify(state), now);
    })();
  }
  claim(now = Date.now()): NewsDelivery | null {
    return this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE news_deliveries SET status='cancelled' WHERE status IN ('pending','sending') AND event_id IN (SELECT id FROM news_events WHERE published_at < ?)",
        )
        .run(now - DAY_MS);
      const row = this.db
        .prepare(
          "SELECT event_id,subscription_id,revision,attempts FROM news_deliveries WHERE status IN ('pending','sending') AND next_at<=? ORDER BY next_at LIMIT 1",
        )
        .get(now) as
        | {
            event_id: string;
            subscription_id: string;
            revision: number;
            attempts: number;
          }
        | undefined;
      if (!row) return null;
      this.db
        .prepare(
          "UPDATE news_deliveries SET status='sending',attempts=attempts+1,next_at=? WHERE event_id=? AND subscription_id=?",
        )
        .run(now + 300_000, row.event_id, row.subscription_id);
      return {
        eventId: row.event_id,
        subscriptionId: row.subscription_id,
        revision: row.revision,
        attempts: row.attempts + 1,
      };
    })();
  }
  finish(
    d: NewsDelivery,
    status: "sent" | "cancelled" | "pending",
    error: string | null = null,
    now = Date.now(),
  ): void {
    const delay = Math.min(
      3_600_000,
      30_000 * 2 ** Math.min(d.attempts - 1, 7),
    );
    this.db
      .prepare(
        "UPDATE news_deliveries SET status=?,error=?,next_at=? WHERE event_id=? AND subscription_id=? AND revision=? AND status='sending'",
      )
      .run(status, error, now + delay, d.eventId, d.subscriptionId, d.revision);
  }
  renewDelivery(
    eventId: string,
    subscriptionId: string,
    revision: number,
  ): void {
    this.db
      .prepare(
        "UPDATE news_deliveries SET next_at=? WHERE event_id=? AND subscription_id=? AND revision=? AND status='sending'",
      )
      .run(Date.now() + 300_000, eventId, subscriptionId, revision);
  }
  publication(
    id: string,
  ): { documentId: string; channelId: string; status: string } | null {
    return (
      (this.db
        .prepare(
          "SELECT document_id AS documentId,channel_id AS channelId,status FROM news_publications WHERE id=?",
        )
        .get(id) as
        | { documentId: string; channelId: string; status: string }
        | undefined) ?? null
    );
  }
  beginPublication(
    id: string,
    destination: string,
    sub: NewsSubscription,
    documentId: string,
    channelId: string,
  ): boolean {
    return this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE news_publications SET status='cancelled' WHERE status='pending' AND created_at<?",
        )
        .run(Date.now() - DAY_MS);
      const previous = this.db
        .prepare(
          "SELECT id FROM news_publications WHERE destination=? AND status='pending' AND id<>? LIMIT 1",
        )
        .get(destination, id);
      if (previous) return false;
      this.db
        .prepare(
          "INSERT OR IGNORE INTO news_publications(id,destination,subscription_id,revision,document_id,channel_id,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          id,
          destination,
          sub.id,
          sub.revision,
          documentId,
          channelId,
          Date.now(),
        );
      return true;
    })();
  }
  refreshUnstartedPublication(id: string, documentId: string): void {
    this.db
      .prepare(
        "UPDATE news_publications SET document_id=? WHERE id=? AND status='pending' AND NOT EXISTS (SELECT 1 FROM news_delivery_parts WHERE publication_id=?)",
      )
      .run(documentId, id, id);
  }
  publicationParts(id: string): { index: number; messageId: string }[] {
    return this.db
      .prepare(
        "SELECT part_index AS 'index',message_id AS messageId FROM news_delivery_parts WHERE publication_id=? ORDER BY part_index",
      )
      .all(id) as { index: number; messageId: string }[];
  }
  savePublicationPart(id: string, index: number, messageId: string): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO news_delivery_parts(publication_id,part_index,message_id) VALUES (?,?,?)",
      )
      .run(id, index, messageId);
  }
  finishPublication(id: string, status: "sent" | "cancelled"): void {
    this.db
      .prepare(
        "UPDATE news_publications SET status=? WHERE id=? AND status='pending'",
      )
      .run(status, id);
  }
  document<T>(id: string): T | null {
    const row = this.db
      .prepare("SELECT body FROM news_documents WHERE id=?")
      .get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : null;
  }
  putDocument(id: string, body: unknown): void {
    this.db
      .prepare("INSERT OR IGNORE INTO news_documents(id,body) VALUES (?,?)")
      .run(id, JSON.stringify(body));
  }
  reader<T>(id: string): T | null {
    const row = this.db
      .prepare("SELECT body FROM news_readers WHERE id=?")
      .get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : null;
  }
  putReader(id: string, body: unknown): void {
    this.db
      .prepare("INSERT OR REPLACE INTO news_readers(id,body) VALUES (?,?)")
      .run(id, JSON.stringify(body));
  }
  acquireReader(id: string, owner: string, now = Date.now()): boolean {
    return (
      this.db
        .prepare(
          "INSERT INTO news_reader_locks(id,owner,until_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,until_at=excluded.until_at WHERE news_reader_locks.until_at < ? OR news_reader_locks.owner=?",
        )
        .run(id, owner, now + 120_000, now, owner).changes === 1
    );
  }
  releaseReader(id: string, owner: string): void {
    this.db
      .prepare("DELETE FROM news_reader_locks WHERE id=? AND owner=?")
      .run(id, owner);
  }
  diagnostics(): { sources: unknown[]; deliveries: unknown[] } {
    return {
      sources: this.db.prepare("SELECT id,success_at FROM news_sources").all(),
      deliveries: this.db
        .prepare(
          "SELECT status,count(*) AS count FROM news_deliveries GROUP BY status",
        )
        .all(),
    };
  }
}
