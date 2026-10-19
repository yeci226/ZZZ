import { createHash } from "node:crypto";
import { NewsStore } from "./store.js";
import {
  NewsSources,
  evaluateMaintenance,
  evaluateUpdates,
  type ArticlePage,
} from "./sources.js";
import {
  MESSAGE_LAYOUT_VERSION,
  renderMessage,
  type NewsMessageDocument,
} from "./messages.js";
import {
  DAY_MS,
  type NewsEvent,
  type NewsSubscription,
  type UpdateState,
  type MaintenanceState,
} from "./types.js";

/** Synchronous status-card preview; live article delivery uses NewsPublisher.prepare. */
export function deliveryPayload(event: NewsEvent, sub: NewsSubscription) {
  const nonce = createHash("sha256")
    .update(`${event.id}:${sub.id}:${sub.revision}`)
    .digest("hex")
    .slice(0, 24);
  const document: NewsMessageDocument = {
    version: "preview",
    layout: MESSAGE_LAYOUT_VERSION,
    event,
    locale: sub.locale,
    parts: [{ blocks: [] }],
  };
  return {
    ...renderMessage(document, 0, sub.scope === "channel" ? sub.roleId : null)
      .body,
    nonce,
    enforce_nonce: true,
  };
}
export function permanentDeliveryError(error: unknown): string | null {
  const code = Number((error as { code?: unknown } | null)?.code);
  return (
    (
      {
        10003: "unknown_channel",
        10004: "unknown_guild",
        10007: "unknown_member",
        10013: "unknown_user",
        50001: "missing_access",
        50007: "cannot_dm",
        50013: "missing_permissions",
        50278: "no_mutual_guild",
      } as Record<number, string>
    )[code] ?? null
  );
}
export type NewsSender = (
  event: NewsEvent,
  sub: NewsSubscription,
) => Promise<void>;
export async function collectArticles(
  fetchPage: (cursor: string | null) => Promise<ArticlePage>,
  known: (id: string) => boolean,
  initialized: boolean,
  now = Date.now(),
): Promise<{ events: NewsEvent[]; ids: string[] }> {
  const events: NewsEvent[] = [],
    ids: string[] = [];
  let cursor: string | null = null;
  const cursors = new Set<string>();
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await fetchPage(cursor);
    events.push(...page.events);
    ids.push(...page.ids);
    // A full page is processed before stopping: pinned/duplicated posts are not a cursor.
    const allKnown = page.ids.length > 0 && page.ids.every(known);
    const old =
      page.newestPublishedAt !== undefined
        ? page.newestPublishedAt < now - DAY_MS
        : page.events.length > 0 &&
          page.events.every((event) => event.publishedAt < now - DAY_MS);
    if (!initialized || page.last || allKnown || old) return { events, ids };
    if (!page.cursor || cursors.has(page.cursor))
      throw new Error("article_cursor_loop");
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
  throw new Error("article_page_limit"); // Do not advance checkpoint after an incomplete scan.
}

export class NewsService {
  private updateRunning = false;
  private articlesRunning = false;
  private deliveryRunning = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private backoff = new Map<string, { failures: number; nextAt: number }>();
  constructor(
    readonly store: NewsStore,
    readonly sources: NewsSources,
    private send: NewsSender,
    private log: (value: string) => void = console.log,
  ) {}
  private async sourceJob(
    key: string,
    work: () => Promise<void>,
    now: number,
  ): Promise<void> {
    if ((this.backoff.get(key)?.nextAt ?? 0) > now) return;
    try {
      await work();
      this.backoff.delete(key);
    } catch (error) {
      const failures = (this.backoff.get(key)?.failures ?? 0) + 1;
      this.backoff.set(key, {
        failures,
        nextAt:
          now + Math.min(3_600_000, 30_000 * 2 ** Math.min(failures - 1, 7)),
      });
      this.log(
        `[news] source=${key} failed=${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
  async pollUpdates(now = Date.now()): Promise<void> {
    if (this.updateRunning) return;
    this.updateRunning = true;
    try {
      await this.sourceJob(
        "updates",
        async () => {
          const snapshot = await this.sources.updates();
          const result = evaluateUpdates(
            this.sources.game,
            this.store.state<UpdateState>("updates"),
            snapshot,
            now,
          );
          this.store.ingest("updates", result.state, result.events, [], now);
          this.log(
            `[news] updates events=${result.events.map((e) => e.kind).join(",") || "0"}`,
          );
        },
        now,
      );
      const state = this.store.state<UpdateState>("updates");
      if (state)
        await this.sourceJob(
          "maintenance",
          async () => {
            const active = await this.sources.maintenance(state.main);
            const result = evaluateMaintenance(
              this.sources.game,
              this.store.state<MaintenanceState>("maintenance"),
              active,
              state.main,
              now,
            );
            this.store.ingest(
              "maintenance",
              result.state,
              result.events,
              [],
              now,
            );
          },
          now,
        );
    } finally {
      this.updateRunning = false;
    }
  }
  async pollArticles(now = Date.now()): Promise<void> {
    if (this.articlesRunning) return;
    this.articlesRunning = true;
    try {
      const locales = new Set(
        this.store
          .subscriptions()
          .filter((s) => s.enabled)
          .map((s) => s.locale),
      );
      for (const locale of locales)
        for (const type of [1, 2, 3]) {
          const key = `articles:${locale}:${type}`;
          await this.sourceJob(
            key,
            async () => {
              const result = await collectArticles(
                (cursor) => this.sources.articles(locale, type, cursor),
                (id) => this.store.seen(key, id),
                this.store.state(key) !== null,
                now,
              );
              this.store.ingest(
                key,
                { initialized: true },
                result.events.sort((a, b) => a.publishedAt - b.publishedAt),
                result.ids,
                now,
              );
              this.log(
                `[news] source=${key} articles=${result.events.length} categories=${[...new Set(result.events.flatMap((e) => e.categories))].join(",")}`,
              );
            },
            now,
          );
        }
    } finally {
      this.articlesRunning = false;
    }
  }
  async drain(now = Date.now()): Promise<void> {
    if (this.deliveryRunning) return;
    this.deliveryRunning = true;
    try {
      for (let n = 0; n < 100; n++) {
        const delivery = this.store.claim(now);
        if (!delivery) break;
        const event = this.store.event(delivery.eventId);
        const sub = this.store.getSubscription(delivery.subscriptionId);
        if (
          !event ||
          !sub?.enabled ||
          sub.revision !== delivery.revision ||
          !event.categories.some((c) => sub.categories.includes(c))
        ) {
          this.store.finish(delivery, "cancelled", null, now);
          continue;
        }
        try {
          await this.send(event, sub);
          this.store.finish(delivery, "sent", null, now);
        } catch (error) {
          const reason = permanentDeliveryError(error);
          if (reason) this.store.disable(sub.id, sub.revision, reason);
          this.store.finish(
            delivery,
            reason ? "cancelled" : "pending",
            reason ?? "temporary_failure",
            now,
          );
          this.log(
            `[news] delivery=${delivery.eventId} status=${reason ?? "retry"}`,
          );
        }
      }
    } finally {
      this.deliveryRunning = false;
    }
  }
  start(): void {
    if (this.timers.length) return;
    const run = (task: () => Promise<void>) => {
      void task().catch((error) =>
        this.log(`[news] job_failed ${String(error)}`),
      );
    };
    run(() => this.pollUpdates());
    run(() => this.pollArticles());
    run(() => this.drain());
    for (const [interval, task] of [
      [120_000, () => this.pollUpdates()],
      [300_000, () => this.pollArticles()],
      [15_000, () => this.drain()],
    ] as const) {
      const timer = setInterval(() => run(task), interval);
      timer.unref();
      this.timers.push(timer);
    }
    const diagnostic = setInterval(
      () => this.log(`[news] ${JSON.stringify(this.store.diagnostics())}`),
      300_000,
    );
    diagnostic.unref();
    this.timers.push(diagnostic);
  }
  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }
}
