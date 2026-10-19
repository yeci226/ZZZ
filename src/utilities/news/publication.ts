import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  MessageFlags,
  Routes,
  type Client,
  type MessageComponentInteraction,
} from "discord.js";
import { NewsStore } from "./store.js";
import { NewsSources } from "./sources.js";
import { NewsMediaCache } from "./media.js";
import { NewsReader, type ReadingState } from "./reader.js";
import { PAGED_LAYOUT_VERSION, paginateArticle } from "./pagination.js";
import { quietText } from "./article.js";
import {
  renderMessage,
  messageRequest,
  type NewsMessageDocument,
} from "./messages.js";
import type { NewsEvent, NewsLocale, NewsSubscription } from "./types.js";
export function publicationId(event: NewsEvent, sub: NewsSubscription): string {
  return createHash("sha256")
    .update(`${event.id}:${sub.id}:${sub.revision}`)
    .digest("hex")
    .slice(0, 24);
}
export class NewsPublisher {
  constructor(
    readonly client: Client,
    readonly store: NewsStore,
    readonly sources: NewsSources,
    readonly media = new NewsMediaCache(
      join(process.cwd(), "data", "news-media"),
    ),
  ) {}
  async prepare(
    event: NewsEvent,
    locale: NewsLocale,
  ): Promise<NewsMessageDocument> {
    const key = `${PAGED_LAYOUT_VERSION}:${event.id}:${locale}`,
      cached = this.store.document<NewsMessageDocument>(key);
    if (cached) return cached;
    // Refetch old event documents: pre-continuous snapshots may lack authors or retain video JSON.
    const full =
      event.kind === "article"
        ? await this.sources.fullArticle(event, locale)
        : event;
    const blocks = full.article
      ? await this.media.blocks(full.article.blocks, full.url)
      : [];
    if (full.kind === "article" && full.title.length > 600)
      blocks.unshift({ type: "markdown", text: quietText(full.title) });
    const document: NewsMessageDocument = {
      version: "",
      layout: PAGED_LAYOUT_VERSION,
      event: full,
      locale,
      parts: paginateArticle(blocks),
    };
    // Validate real header/control budgets before accepting a cached snapshot.
    document.parts.forEach((_, index) =>
      renderMessage(
        document,
        index,
        "12345678901234567890",
        "news:preview:home",
        "0".repeat(24),
      ),
    );
    document.version = createHash("sha256")
      .update(JSON.stringify(document))
      .digest("hex");
    this.store.putDocument(document.version, document);
    this.store.putDocument(key, document);
    return this.store.document<NewsMessageDocument>(key)!;
  }
  async send(
    event: NewsEvent,
    sub: NewsSubscription,
    checkSubscription = true,
  ): Promise<string[]> {
    // Publication identity must not depend on rendering versions. Recognize previously deployed keys.
    const candidates = [
      publicationId(event, sub),
      ...["continuous-v2", "continuous-v1"].map((layout) =>
        createHash("sha256")
          .update(`${event.id}:${sub.id}:${sub.revision}:${layout}`)
          .digest("hex")
          .slice(0, 24),
      ),
    ];
    const id =
        candidates.find((key) => this.store.publication(key)) ?? candidates[0]!,
      existing = this.store.publication(id);
    const receipts = () =>
      this.store.publicationParts(id).map((p) => p.messageId);
    if (existing && existing.status !== "pending") return receipts();
    const valid = () =>
      !checkSubscription ||
      (() => {
        const current = this.store.getSubscription(sub.id);
        return current?.enabled && current.revision === sub.revision;
      })();
    if (!valid()) {
      this.store.finishPublication(id, "cancelled");
      return receipts();
    }
    const renew = () =>
      this.store.renewDelivery(event.id, sub.id, sub.revision);
    const deliveryHeartbeat = setInterval(renew, 60_000);
    deliveryHeartbeat.unref();
    try {
      let doc =
        existing && this.store.publicationParts(id).length > 0
          ? this.store.document<NewsMessageDocument>(existing.documentId)!
          : await this.prepare(event, sub.locale);
      if (!doc) throw new Error("missing_news_document");
      const channelId =
        existing?.channelId ??
        (sub.scope === "dm"
          ? (await (await this.client.users.fetch(sub.userId)).createDM()).id
          : sub.channelId);
      if (!channelId)
        throw Object.assign(new Error("missing_target"), { code: 10003 });
      const destination = `channel:${channelId}`,
        lock = `publication:${destination}`,
        owner = randomUUID(),
        deadline = Date.now() + 30_000;
      while (!this.store.acquireReader(lock, owner)) {
        if (Date.now() >= deadline) throw new Error("news_destination_busy");
        await delay(100);
      }
      const heartbeat = setInterval(
        () => this.store.acquireReader(lock, owner),
        10_000,
      );
      heartbeat.unref();
      try {
        if (!valid()) {
          this.store.finishPublication(id, "cancelled");
          return receipts();
        }
        const current = this.store.publication(id);
        if (current && current.status !== "pending") return receipts();
        // Another shard may have sent the first part while this shard prepared a new document.
        if (current && this.store.publicationParts(id).length > 0)
          doc = this.store.document<NewsMessageDocument>(current.documentId)!;
        if (
          !this.store.beginPublication(
            id,
            destination,
            sub,
            doc.version,
            channelId,
          )
        )
          throw new Error("news_destination_pending");
        this.store.refreshUnstartedPublication(id, doc.version);
        const sent = new Set(
          this.store.publicationParts(id).map((p) => p.index),
        );
        const paged = doc.layout === PAGED_LAYOUT_VERSION;
        const bindReader = (messageId: string | null) => {
          if (!paged || doc.parts.length < 2) return;
          const saved = this.store.reader<ReadingState>(id);
          this.store.putReader(id, {
            id,
            documentId: doc.version,
            channelId,
            guildId: sub.guildId,
            ownerId: sub.scope === "dm" ? sub.userId : null,
            page: saved?.documentId === doc.version ? saved.page : 0,
            back: null,
            messageId,
          } satisfies ReadingState);
        };
        // Recover a binding if the process died after recording the successful send.
        if (paged)
          bindReader(this.store.publicationParts(id)[0]?.messageId ?? null);
        for (let index = 0; index < (paged ? 1 : doc.parts.length); index++) {
          if (sent.has(index)) continue;
          const request = await messageRequest(
            doc,
            index,
            sub.scope === "channel" ? sub.roleId : null,
            null,
            paged ? id : null,
          );
          if (!valid() || this.store.publication(id)?.status !== "pending") {
            this.store.finishPublication(id, "cancelled");
            return receipts();
          }
          const nonce = createHash("sha256")
            .update(`${id}:${index}`)
            .digest("hex")
            .slice(0, 24);
          const message = (await this.client.rest.post(
            Routes.channelMessages(channelId),
            {
              ...request,
              body: { ...request.body, nonce, enforce_nonce: true },
            },
          )) as { id: string };
          this.store.savePublicationPart(id, index, message.id);
          if (paged) bindReader(message.id);
        }
        this.store.finishPublication(id, "sent");
        return receipts();
      } finally {
        clearInterval(heartbeat);
        this.store.releaseReader(lock, owner);
      }
    } finally {
      clearInterval(deliveryHeartbeat);
    }
  }
  async open(
    interaction: MessageComponentInteraction,
    event: NewsEvent,
    locale: NewsLocale,
    back: string,
  ): Promise<void> {
    const doc = await this.prepare(event, locale);
    if (doc.layout === PAGED_LAYOUT_VERSION) {
      await new NewsReader(
        this.client,
        this.store,
        this.sources,
        this.media,
      ).openDocument(interaction, doc, back);
      return;
    }
    for (let index = 0; index < doc.parts.length; index++) {
      const request = await messageRequest(doc, index, null, back);
      if (index === 0)
        await this.client.rest.patch(
          Routes.webhookMessage(
            interaction.applicationId,
            interaction.token,
            "@original",
          ),
          request,
        );
      else
        await this.client.rest.post(
          Routes.webhook(interaction.applicationId, interaction.token),
          {
            ...request,
            body: {
              ...request.body,
              flags: request.body.flags | MessageFlags.Ephemeral,
            },
          },
        );
    }
  }
}
