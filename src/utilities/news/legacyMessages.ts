import { normalizeUrlLabels } from "./urlLabels.js";
import { deliveredMedia, type NewsRequestOptions } from "./mediaDelivery.js";
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
import { paginate } from "./presentation.js";
import type { DisplayBlock } from "./media.js";
import type { NewsEvent, NewsLocale } from "./types.js";
export const MESSAGE_LAYOUT_VERSION = "continuous-v2";
export interface NewsMessagePart {
  blocks: DisplayBlock[];
}
export interface NewsMessageDocument {
  version: string;
  layout: typeof MESSAGE_LAYOUT_VERSION;
  event: NewsEvent;
  locale: NewsLocale;
  parts: NewsMessagePart[];
}
export const splitMessages = paginate;
export function linkedTitle(title: string, url: string): string {
  const label =
    title
      .replace(/<a?:\w+:\d+>/g, "")
      .replace(
        /[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\u200D\uFE0E\uFE0F\u{E0020}-\u{E007F}]/gu,
        "",
      )
      .replace(/\s+/g, " ")
      .trim() || "HoYoLAB";
  const escaped = escapeMarkdown(quietText(label)).replace(/[\[\]]/g, "\\$&");
  return `[${escaped.slice(0, 650).replace(/\\$/, "")}](<${url}>)`;
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
  options: NewsRequestOptions = {},
) {
  const part = document.parts[index];
  if (!part) throw new Error("invalid_news_part");
  const { event, locale } = document,
    container = new ContainerBuilder();
  const files: { file: string; name: string }[] = [];
  const text = (value: string) =>
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(normalizeUrlLabels(value)),
    );
  if (index === 0) {
    if (roleId) text(`<@&${roleId}>`);
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
            new TextDisplayBuilder().setContent(title),
            new TextDisplayBuilder().setContent(
              `${event.game === "hsr" ? "Honkai: Star Rail" : "Zenless Zone Zero"}\n${COPY[locale].version} **${event.version ?? "—"}**`,
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
  if (back && index === 0)
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
  return {
    body: result.body,
    files: await Promise.all(
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
    ),
  };
}
