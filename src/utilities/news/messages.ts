import { normalizeUrlLabels } from "./urlLabels.js";
import { deliveredMedia, type NewsRequestOptions } from "./mediaDelivery.js";
import { STATUS_COPY, statusHeading } from "./statusCopy.js";
import { linkedTitle } from "./links.js";
export { linkedTitle } from "./links.js";
import {
  renderMessage as renderLegacyMessage,
  type NewsMessageDocument as LegacyDocument,
} from "./legacyMessages.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  escapeMarkdown,
} from "discord.js";
import { quietText } from "./article.js";
import { COPY, eventTitle } from "./copy.js";
import { READER_COPY, splitMarkdown } from "./presentation.js";
import { MAX_NEWS_FILE_BYTES, MAX_NEWS_MESSAGE_BYTES } from "./media.js";
import type { DisplayBlock } from "./media.js";
import type { NewsEvent, NewsLocale } from "./types.js";
export const MESSAGE_LAYOUT_VERSION = "continuous-v3";
export interface NewsMessagePart {
  blocks: DisplayBlock[];
}
export interface NewsMessageDocument {
  version: string;
  layout:
    | typeof MESSAGE_LAYOUT_VERSION
    | "continuous-v2"
    | "continuous-v1"
    | "paged-v1";
  event: NewsEvent;
  locale: NewsLocale;
  parts: NewsMessagePart[];
}
export function splitMessages(blocks: DisplayBlock[]): NewsMessagePart[] {
  const parts: NewsMessagePart[] = [];
  let part: NewsMessagePart = { blocks: [] },
    galleries = 0,
    items = 0,
    chars = 0,
    bytes = 0;
  const flush = () => {
    if (part.blocks.length) parts.push(part);
    part = { blocks: [] };
    galleries = items = chars = bytes = 0;
  };
  for (const block of blocks) {
    if (block.type === "markdown") {
      for (const text of splitMarkdown(block.text)) {
        if (chars + text.length > 2400 || part.blocks.length >= 24) flush();
        part.blocks.push({ type: "markdown", text });
        chars += text.length;
      }
      continue;
    }
    for (const media of block.media) {
      if ((media.bytes ?? 0) > MAX_NEWS_FILE_BYTES)
        throw new Error("news_file_limit");
      const canMerge = () => {
        const last = part.blocks.at(-1);
        return (
          !media.slice &&
          block.intent === "multi" &&
          last?.type === "gallery" &&
          last.intent === "multi" &&
          !!block.runId &&
          last.runId === block.runId &&
          last.media.length < 10
        );
      };
      if (
        items >= 10 ||
        bytes + (media.bytes ?? 0) > MAX_NEWS_MESSAGE_BYTES ||
        (!canMerge() && (galleries >= 4 || part.blocks.length >= 24))
      )
        flush();
      if (canMerge())
        (
          part.blocks.at(-1)! as Extract<DisplayBlock, { type: "gallery" }>
        ).media.push(media);
      else {
        part.blocks.push({
          ...block,
          media: [media],
          ...(media.slice ? { intent: "slice" as const } : {}),
        });
        galleries++;
      }
      items++;
      bytes += media.bytes ?? 0;
    }
  }
  flush();
  return parts.length ? parts : [{ blocks: [] }];
}
const SIMULATED: Record<NewsLocale, string> = {
  tw: "測試預覽 · 模擬事件",
  cn: "测试预览 · 模拟事件",
  en: "Test preview · Simulated event",
  jp: "テスト · 模擬イベント",
  kr: "테스트 · 모의 이벤트",
  fr: "Aperçu · Événement simulé",
  vi: "Xem thử · Sự kiện mô phỏng",
};
export function renderMessage(
  document: NewsMessageDocument,
  index: number,
  roleId: string | null = null,
  back: string | null = null,
  readerToken: string | null = null,
  options: NewsRequestOptions = {},
) {
  if (
    document.layout !== MESSAGE_LAYOUT_VERSION &&
    document.layout !== "paged-v1"
  )
    return renderLegacyMessage(
      document as LegacyDocument,
      index,
      roleId,
      back,
      options,
    );
  const part = document.parts[index];
  if (!part) throw new Error("invalid_news_part");
  const { event, locale } = document,
    container = new ContainerBuilder();
  const files: { file: string; name: string }[] = [];
  const text = (value: string) =>
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(normalizeUrlLabels(value)),
    );
  const paged = document.layout === "paged-v1";
  if (index === 0 || paged) {
    if (roleId && index === 0) text(`<@&${roleId}>`);
    if (event.simulated) text(`-# ${SIMULATED[locale]}`);
    const title = `## ${linkedTitle(eventTitle(event, locale), event.url)}`;
    if (event.kind === "article") {
      text(
        `${title}\n-# ${escapeMarkdown(quietText(event.authorName || (event.game === "hsr" ? "Honkai: Star Rail" : "Zenless Zone Zero"))).slice(0, 180)} - <t:${Math.floor(event.publishedAt / 1000)}:f>`,
      );
    } else {
      const name = `news-${event.game}.jpg`;
      files.push({
        name,
        file: join(process.cwd(), "src", "assets", "news", `${event.game}.jpg`),
      });
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ${escapeMarkdown(statusHeading(event.game, event.kind, locale))}`,
            ),
            new TextDisplayBuilder().setContent(
              `**${COPY[locale].version} ${event.version ?? "—"}**`,
            ),
            new TextDisplayBuilder().setContent(
              STATUS_COPY[locale][event.kind],
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(`attachment://${name}`),
          ),
      );
    }
  }
  for (const block of part.blocks) {
    if (block.type === "markdown") text(block.text);
    else
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          block.media.map((original) => {
            const media = deliveredMedia(original, options);
            if (
              media.file &&
              media.name &&
              !files.some((f) => f.name === media.name)
            )
              files.push({ file: media.file, name: media.name });
            return new MediaGalleryItemBuilder()
              .setURL(media.url)
              .setDescription(media.original.slice(0, 1024));
          }),
        ),
      );
  }
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (paged && readerToken && document.parts.length > 1) {
    const copy = READER_COPY[locale];
    const label =
      locale === "tw"
        ? `第 ${index + 1}/${document.parts.length} 頁`
        : locale === "cn"
          ? `第 ${index + 1}/${document.parts.length} 页`
          : `${index + 1}/${document.parts.length}`;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`news:read:${event.game}:${readerToken}:first`)
        .setLabel(copy.first)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index === 0),
      new ButtonBuilder()
        .setCustomId(`news:read:${event.game}:${readerToken}:prev`)
        .setLabel(copy.previous)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index === 0),
      new ButtonBuilder()
        .setCustomId(`news:read:${event.game}:${readerToken}:page`)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`news:read:${event.game}:${readerToken}:next`)
        .setLabel(copy.next)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index === document.parts.length - 1),
      new ButtonBuilder()
        .setCustomId(`news:read:${event.game}:${readerToken}:last`)
        .setLabel(copy.last)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index === document.parts.length - 1),
    );
  }
  if (row.components.length) container.addActionRowComponents(row);
  if (back && (index === 0 || paged))
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(back)
          .setLabel(COPY[locale].home)
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  const json = container.toJSON();
  let chars = 0,
    components = 0;
  const inspect = (node: {
    type: number;
    content?: string;
    components?: unknown[];
    accessory?: unknown;
  }) => {
    components++;
    chars += node.content?.length ?? 0;
    node.components?.forEach((child) => inspect(child as typeof node));
    if (node.accessory) inspect(node.accessory as typeof node);
  };
  inspect(json);
  if (chars > 3500 || components > 40 || files.length > 10)
    throw new Error("news_message_limits");
  return {
    body: {
      flags:
        MessageFlags.IsComponentsV2 |
        (index > 0 ? MessageFlags.SuppressNotifications : 0),
      components: [json],
      attachments: files.map((f, id) => ({ id: String(id), filename: f.name })),
      allowed_mentions: {
        parse: [] as string[],
        users: [] as string[],
        roles: index === 0 && roleId ? [roleId] : [],
        replied_user: false,
      },
    },
    files,
  };
}
export async function messageRequest(
  ...args: Parameters<typeof renderMessage>
) {
  const result = renderMessage(...args);
  const started = performance.now();
  const files = await Promise.all(
    result.files.map(async (f) => ({
      name: f.name,
      data: await readFile(f.file),
      contentType: f.name.endsWith(".png")
        ? "image/png"
        : f.name.endsWith(".gif")
          ? "image/gif"
          : f.name.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg",
    })),
  );
  if (
    files.some((f) => f.data.length > MAX_NEWS_FILE_BYTES) ||
    files.reduce((n, f) => n + f.data.length, 0) > MAX_NEWS_MESSAGE_BYTES
  )
    throw new Error("news_attachment_limits");
  args[5]?.onAttachmentsRead?.({
    attachmentReadMs: performance.now() - started,
    uploadBytes: files.reduce((n, f) => n + f.data.length, 0),
    attachmentCount: files.length,
  });
  return { body: result.body, files };
}
