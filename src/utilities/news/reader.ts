import type { NewsRequestOptions } from "./mediaDelivery.js";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  MessageFlags,
  Routes,
  type BaseInteraction,
  type Client,
  type MessageComponentInteraction,
} from "discord.js";
import { NewsStore } from "./store.js";
import { NewsSources } from "./sources.js";
import { NewsMediaCache } from "./media.js";
import {
  eventBlocks,
  pageRequest,
  paginate,
  type NewsDocument,
} from "./presentation.js";
import { COPY } from "./copy.js";
import type { NewsEvent, NewsLocale, NewsSubscription } from "./types.js";
import { messageRequest, type NewsMessageDocument } from "./messages.js";
export type NewsReadableDocument = NewsDocument | NewsMessageDocument;
export const readingPages = (doc: NewsReadableDocument) =>
  "parts" in doc ? doc.parts.length : doc.pages.length;
export const readingRequest = async (
  doc: NewsReadableDocument,
  index: number,
  token: string,
  role: string | null = null,
  back: string | null = null,
  options: NewsRequestOptions = {},
) => {
  const request =
    "parts" in doc
      ? await messageRequest(doc, index, role, back, token, options)
      : await pageRequest(doc, index, token, role, back, options);
  if ("parts" in doc && !role)
    request.body.flags |= MessageFlags.SuppressNotifications;
  return request;
};
export interface ReadingState {
  id: string;
  documentId: string;
  messageId: string | null;
  channelId: string;
  guildId: string | null;
  ownerId: string | null;
  page: number;
  back: string | null;
}
export const isNewsReadingInteraction = (id: string): boolean =>
  /^news:read:(hsr|zzz):[a-f0-9]{24}:(first|prev|next|last)$/.test(id);
export class NewsReader {
  constructor(
    readonly client: Client,
    readonly store: NewsStore,
    readonly sources: NewsSources,
    readonly media = new NewsMediaCache(
      join(process.cwd(), "data", "news-media"),
    ),
  ) {}
  async prepare(event: NewsEvent, locale: NewsLocale): Promise<NewsDocument> {
    const key = `article:${event.id}:${locale}`;
    const cached = this.store.document<NewsDocument>(key);
    if (cached) return cached;
    const full =
      event.kind === "article"
        ? event.article
          ? event
          : await this.sources.fullArticle(event, locale)
        : event;
    const blocks = full.article
      ? await this.media.blocks(full.article.blocks, full.url)
      : eventBlocks(full, locale);
    if (full.title.length > 650)
      blocks.unshift({ type: "markdown", text: full.title });
    const document: NewsDocument = {
      version: "",
      event: full,
      locale,
      pages: paginate(blocks),
    };
    document.version = createHash("sha256")
      .update(JSON.stringify(document))
      .digest("hex");
    this.store.putDocument(document.version, document);
    this.store.putDocument(key, document);
    return this.store.document<NewsDocument>(key)!;
  }
  async send(
    event: NewsEvent,
    sub: NewsSubscription,
    checkSubscription = true,
  ): Promise<void> {
    const doc = await this.prepare(event, sub.locale);
    // Preparing full text/media can take time. Recheck the subscription at the actual send boundary.
    if (checkSubscription) {
      const current = this.store.getSubscription(sub.id);
      if (!current?.enabled || current.revision !== sub.revision) return;
    }
    const id = createHash("sha256")
      .update(`${event.id}:${sub.id}:${sub.revision}`)
      .digest("hex")
      .slice(0, 24);
    const old = this.store.reader<ReadingState>(id);
    if (old?.messageId) return;
    const channelId =
      sub.scope === "dm"
        ? (await (await this.client.users.fetch(sub.userId)).createDM()).id
        : sub.channelId;
    if (!channelId)
      throw Object.assign(new Error("missing_target"), { code: 10003 });
    const state: ReadingState = old ?? {
      id,
      documentId: doc.version,
      messageId: null,
      channelId,
      guildId: sub.guildId,
      ownerId: sub.scope === "dm" ? sub.userId : null,
      page: 0,
      back: null,
    };
    this.store.putReader(id, state);
    const request = await pageRequest(
      doc,
      0,
      id,
      sub.scope === "channel" ? sub.roleId : null,
    );
    if (checkSubscription) {
      const current = this.store.getSubscription(sub.id);
      if (!current?.enabled || current.revision !== sub.revision) return;
    }
    const message = (await this.client.rest.post(
      Routes.channelMessages(channelId),
      { ...request, body: { ...request.body, nonce: id, enforce_nonce: true } },
    )) as { id: string };
    this.store.putReader(id, { ...state, messageId: message.id });
  }
  async open(
    interaction: MessageComponentInteraction,
    event: NewsEvent,
    locale: NewsLocale,
    back: string,
  ): Promise<void> {
    await this.openDocument(
      interaction,
      await this.prepare(event, locale),
      back,
    );
  }
  async openDocument(
    interaction: MessageComponentInteraction,
    doc: NewsReadableDocument,
    back: string,
  ): Promise<void> {
    const id = randomUUID().replace(/-/g, "").slice(0, 24);
    const state: ReadingState = {
      id,
      documentId: doc.version,
      messageId: interaction.message.id,
      channelId: interaction.channelId!,
      guildId: interaction.guildId,
      ownerId: interaction.user.id,
      page: 0,
      back,
    };
    await this.edit(interaction, doc, state);
    this.store.putReader(id, state);
  }
  private async edit(
    interaction: MessageComponentInteraction,
    doc: NewsReadableDocument,
    state: ReadingState,
  ): Promise<void> {
    const started = performance.now();
    let attachments = {
      attachmentReadMs: 0,
      uploadBytes: 0,
      attachmentCount: 0,
    };
    const request = await readingRequest(
      doc,
      state.page,
      state.id,
      null,
      state.back,
      {
        onAttachmentsRead: (metrics) => {
          attachments = metrics;
        },
      },
    );
    const patchStarted = performance.now();
    let succeeded = false;
    try {
      // Raw webhook edit permits an explicit attachment allow-list and the V2 wire payload.
      await this.client.rest.patch(
        Routes.webhookMessage(
          interaction.applicationId,
          interaction.token,
          "@original",
        ),
        request,
      );
      succeeded = true;
    } finally {
      console.info(
        `[news:page-edit] ${JSON.stringify({
          page: state.page,
          ...attachments,
          requestMs: patchStarted - started,
          discordUpdateMs: performance.now() - patchStarted,
          succeeded,
        })}`,
      );
    }
  }
  async turn(
    id: string,
    channelId: string,
    messageId: string,
    userId: string,
    guildId: string | null,
    direction: string,
    edit: (doc: NewsReadableDocument, state: ReadingState) => Promise<void>,
  ): Promise<boolean> {
    if (!["first", "prev", "next", "last"].includes(direction)) return false;
    const started = performance.now();
    let documentReadMs = 0;
    const owner = randomUUID(),
      deadline = Date.now() + 30_000;
    while (!this.store.acquireReader(id, owner)) {
      if (Date.now() >= deadline) throw new Error("news_reader_busy");
      await delay(100);
    }
    const lockWaitMs = performance.now() - started;
    const heartbeat = setInterval(
      () => this.store.acquireReader(id, owner),
      10_000,
    );
    heartbeat.unref();
    try {
      const state = this.store.reader<ReadingState>(id);
      if (
        !state ||
        state.messageId !== messageId ||
        state.channelId !== channelId ||
        state.guildId !== guildId ||
        (state.ownerId !== null && state.ownerId !== userId)
      )
        return false;
      const documentStarted = performance.now();
      const document = this.store.document<NewsReadableDocument>(
        state.documentId,
      );
      documentReadMs = performance.now() - documentStarted;
      if (!document) return false;
      const page = Math.max(
        0,
        Math.min(
          readingPages(document) - 1,
          direction === "first"
            ? 0
            : direction === "last"
              ? readingPages(document) - 1
              : state.page + (direction === "next" ? 1 : -1),
        ),
      );
      if (page === state.page) return true;
      const next = { ...state, page };
      await edit(document, next);
      this.store.putReader(id, next);
      return true;
    } finally {
      clearInterval(heartbeat);
      this.store.releaseReader(id, owner);
      console.info(
        `[news:page-turn] ${JSON.stringify({ lockWaitMs, documentReadMs, totalMs: performance.now() - started })}`,
      );
    }
  }
  async handle(base: BaseInteraction): Promise<void> {
    if (!base.isMessageComponent() || !isNewsReadingInteraction(base.customId))
      return;
    const [, , game, id, action] = base.customId.split(":");
    if (game !== this.sources.game) return;
    await base.deferUpdate();
    const locale = this.store.reader<ReadingState>(id!)?.documentId;
    const copy =
      COPY[
        (locale ? this.store.document<NewsDocument>(locale)?.locale : null) ??
          "en"
      ];
    try {
      const ok = await this.turn(
        id!,
        base.channelId!,
        base.message.id,
        base.user.id,
        base.guildId,
        action!,
        (doc, state) => this.edit(base, doc, state),
      );
      if (!ok)
        await base.followUp({
          content: copy.expired,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
    } catch {
      await base
        .followUp({
          content: copy.failed,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    }
  }
}
