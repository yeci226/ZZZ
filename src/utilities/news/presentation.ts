import { normalizeUrlLabels } from "./urlLabels.js";
import { deliveredMedia, type NewsRequestOptions } from "./mediaDelivery.js";
import { readFile } from "node:fs/promises";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { COPY, eventTitle } from "./copy.js";
import { quietText } from "./article.js";
import type { NewsEvent, NewsLocale } from "./types.js";
import type { DisplayBlock, NewsMedia } from "./media.js";
export interface NewsPage {
  blocks: DisplayBlock[];
}
export interface NewsDocument {
  version: string;
  event: NewsEvent;
  locale: NewsLocale;
  pages: NewsPage[];
}
/** Keep links indivisible; close/reopen inline and fenced formatting at page boundaries. */
export function splitMarkdown(text: string, limit = 2400): string[] {
  const chunks: string[] = [];
  let remaining = text,
    prefix = "";
  while (remaining.length + prefix.length > limit) {
    const max = limit - prefix.length - 32;
    let cut = remaining.lastIndexOf("\n\n", max);
    if (cut < max / 2) cut = remaining.lastIndexOf("\n", max);
    if (cut < max / 2) cut = remaining.lastIndexOf(" ", max);
    if (cut < max / 2) cut = max;
    // A Markdown link must not be separated from its destination.
    for (const link of remaining.matchAll(/\[[^\]\n]*\]\([^\n]*?\)/g)) {
      const start = link.index!,
        end = start + link[0].length;
      if (start < cut && end > cut && start > 0) {
        cut = start;
        break;
      }
    }
    if (/[\uD800-\uDBFF]/.test(remaining[cut - 1] ?? "")) cut--;
    const part = prefix + remaining.slice(0, cut);
    const fences = [...part.matchAll(/^```([^\n]*)/gm)];
    let next = "",
      closing = "";
    if (fences.length % 2) {
      next = `\`\`\`${fences.at(-1)![1]}\n`;
      closing = "\n```";
    } else {
      const stack: string[] = [];
      for (const match of part.matchAll(/(?<!\\)(\*\*|~~|\*|`)/g)) {
        const token = match[0];
        const lineStart = part.lastIndexOf("\n", match.index! - 1) + 1;
        if (
          token === "*" &&
          /^\s*$/.test(part.slice(lineStart, match.index)) &&
          /\s/.test(part[match.index! + 1] ?? "")
        )
          continue;
        const open = stack.lastIndexOf(token);
        if (open >= 0) stack.splice(open, 1);
        else stack.push(token);
      }
      next = stack.join("");
      closing = [...stack].reverse().join("");
    }
    chunks.push(part + closing);
    prefix = next;
    remaining = remaining.slice(cut);
  }
  if ((prefix + remaining).trim()) chunks.push(prefix + remaining);
  return chunks;
}
export function paginate(blocks: DisplayBlock[]): NewsPage[] {
  const pages: NewsPage[] = [];
  let page: NewsPage = { blocks: [] },
    galleries = 0,
    items = 0,
    chars = 0,
    bytes = 0;
  const flush = () => {
    if (page.blocks.length) pages.push(page);
    page = { blocks: [] };
    galleries = items = chars = bytes = 0;
  };
  for (const block of blocks) {
    const parts: DisplayBlock[] =
      block.type === "markdown"
        ? splitMarkdown(block.text).map((text) => ({ type: "markdown", text }))
        : [block];
    for (const part of parts) {
      if (part.type === "gallery") {
        // Preserve the original run decision, even when attachment limits split a gallery.
        let group: NewsMedia[] = [];
        const emit = () => {
          if (group.length) {
            page.blocks.push({ type: "gallery", media: group });
            galleries++;
            group = [];
          }
        };
        for (const media of part.media) {
          if (
            items >= 10 ||
            bytes + (media.bytes ?? 0) > 9 * 1024 * 1024 ||
            (group.length === 0 && galleries >= 4) ||
            page.blocks.length >= 24
          ) {
            emit();
            flush();
          }
          group.push(media);
          items++;
          bytes += media.bytes ?? 0;
        }
        emit();
      } else {
        if (chars + part.text.length > 2400 || page.blocks.length >= 24)
          flush();
        page.blocks.push(part);
        chars += part.text.length;
      }
    }
  }
  flush();
  return pages.length ? pages : [{ blocks: [] }];
}
export const READER_COPY: Record<
  NewsLocale,
  {
    first: string;
    last: string;
    previous: string;
    next: string;
    source: string;
    simulation: string;
    detected: string;
  }
> = {
  tw: {
    first: "第一頁",
    last: "最後一頁",
    previous: "上一頁",
    next: "下一頁",
    source: "官方原文",
    simulation: "測試預覽 · 模擬事件",
    detected: "偵測時間",
  },
  cn: {
    first: "第一页",
    last: "最后一页",
    previous: "上一页",
    next: "下一页",
    source: "官方原文",
    simulation: "测试预览 · 模拟事件",
    detected: "检测时间",
  },
  en: {
    first: "First page",
    last: "Last page",
    previous: "Previous",
    next: "Next",
    source: "Official source",
    simulation: "Test preview · Simulated event",
    detected: "Detected",
  },
  jp: {
    first: "最初のページ",
    last: "最後のページ",
    previous: "前のページ",
    next: "次のページ",
    source: "公式原文",
    simulation: "テスト · 模擬イベント",
    detected: "検出日時",
  },
  kr: {
    first: "첫 페이지",
    last: "마지막 페이지",
    previous: "이전",
    next: "다음",
    source: "공식 원문",
    simulation: "테스트 · 모의 이벤트",
    detected: "감지 시간",
  },
  fr: {
    first: "Première page",
    last: "Dernière page",
    previous: "Précédent",
    next: "Suivant",
    source: "Source officielle",
    simulation: "Aperçu · Événement simulé",
    detected: "Détecté le",
  },
  vi: {
    first: "Trang đầu",
    last: "Trang cuối",
    previous: "Trang trước",
    next: "Trang sau",
    source: "Bài viết chính thức",
    simulation: "Xem thử · Sự kiện mô phỏng",
    detected: "Thời gian phát hiện",
  },
};
export function eventBlocks(
  event: NewsEvent,
  locale: NewsLocale,
): DisplayBlock[] {
  return [
    {
      type: "markdown",
      text:
        event.kind === "article"
          ? quietText(event.summary || "HoYoLAB")
          : `${COPY[locale].version} **${event.version ?? "—"}**\n${READER_COPY[locale].detected} <t:${Math.floor(event.publishedAt / 1000)}:F>`,
    },
  ];
}
export function renderPage(
  document: NewsDocument,
  index: number,
  token: string,
  roleId: string | null = null,
  back: string | null = null,
  options: NewsRequestOptions = {},
) {
  const { event, locale, pages } = document,
    page = pages[index];
  if (!page) throw new Error("invalid_news_page");
  const c = READER_COPY[locale];
  const container = new ContainerBuilder().setAccentColor(
    event.game === "hsr" ? 0xb99d68 : 0xf3c846,
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${roleId ? `<@&${roleId}>\n` : ""}${event.simulated ? `-# ${c.simulation}\n` : ""}## ${quietText(eventTitle(event, locale)).slice(0, 650)}\n-# ${event.game.toUpperCase()} · ${COPY[locale].region} · ${locale === "tw" ? `第 ${index + 1}/${pages.length} 頁` : locale === "cn" ? `第 ${index + 1}/${pages.length} 页` : `${index + 1}/${pages.length}`}`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  const files: { file: string; name: string }[] = [];
  for (const block of page.blocks) {
    if (block.type === "markdown")
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(normalizeUrlLabels(block.text)),
      );
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
              .setDescription(
                media.slice
                  ? `${media.slice.top}–${media.slice.bottom} / ${media.original}`.slice(
                      0,
                      1024,
                    )
                  : media.original.slice(0, 1024),
              );
          }),
        ),
      );
  }
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (pages.length > 1)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`news:read:${event.game}:${token}:prev`)
        .setLabel(c.previous)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index === 0),
      new ButtonBuilder()
        .setCustomId(`news:read:${event.game}:${token}:next`)
        .setLabel(c.next)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index === pages.length - 1),
    );
  row.addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(c.source)
      .setURL(event.url),
  );
  if (back)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(back)
        .setLabel(COPY[locale].home)
        .setStyle(ButtonStyle.Secondary),
    );
  container.addActionRowComponents(row);
  const json = container.toJSON();
  const chars = json.components.reduce(
    (sum, b) => sum + (b.type === 10 ? b.content.length : 0),
    0,
  );
  const count =
    1 +
    json.components.reduce(
      (sum, b) => sum + 1 + (b.type === 1 ? b.components.length : 0),
      0,
    );
  if (chars > 3500 || count > 40 || files.length > 10)
    throw new Error("news_page_limits");
  return {
    body: {
      flags: MessageFlags.IsComponentsV2,
      components: [json],
      attachments: files.map((f, id) => ({ id: String(id), filename: f.name })),
      allowed_mentions: {
        parse: [] as string[],
        users: [] as string[],
        roles: roleId ? [roleId] : [],
        replied_user: false,
      },
    },
    files,
  };
}
export async function pageRequest(...args: Parameters<typeof renderPage>) {
  const result = renderPage(...args);
  const started = performance.now();
  const files = await Promise.all(
    result.files.map(async (f) => ({
      name: f.name,
      data: await readFile(f.file),
      contentType: f.name.endsWith(".png")
        ? "image/png"
        : "application/octet-stream",
    })),
  );
  args[5]?.onAttachmentsRead?.({
    attachmentReadMs: performance.now() - started,
    uploadBytes: files.reduce((n, f) => n + f.data.length, 0),
    attachmentCount: files.length,
  });
  return { body: result.body, files };
}
