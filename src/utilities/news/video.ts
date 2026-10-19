import axios from "axios";
import { createHash } from "node:crypto";
import type { ArticleDocument, ArticleBlock } from "./article.js";
import type { NewsLocale } from "./types.js";
export function youtubeVideo(url: string): { id: string; url: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase();
    const id =
      host === "youtu.be"
        ? u.pathname.split("/")[1]
        : [
              "youtube.com",
              "www.youtube.com",
              "m.youtube.com",
              "www.youtube-nocookie.com",
              "youtube-nocookie.com",
            ].includes(host)
          ? u.pathname === "/watch"
            ? u.searchParams.get("v")
            : /^\/(embed|shorts)\//.test(u.pathname)
              ? u.pathname.split("/")[2]
              : null
          : null;
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    return { id, url: `https://www.youtube.com/watch?v=${id}` };
  } catch {
    return null;
  }
}
const FALLBACK: Record<NewsLocale, string> = {
  tw: "觀看影片",
  cn: "观看视频",
  en: "Watch video",
  jp: "動画を見る",
  kr: "영상 보기",
  fr: "Voir la vidéo",
  vi: "Xem video",
};
export class NewsVideoTitles {
  private cache = new Map<string, { title: string | null; expires: number }>();
  private pending = new Map<string, Promise<string | null>>();
  constructor(
    private request: (url: string) => Promise<unknown> = async (url) =>
      (
        await axios.get("https://www.youtube.com/oembed", {
          params: { url, format: "json" },
          timeout: 8000,
          maxContentLength: 64 * 1024,
          maxRedirects: 0,
        })
      ).data,
  ) {}
  private async title(id: string, url: string): Promise<string | null> {
    const hit = this.cache.get(id);
    if (hit && hit.expires > Date.now()) return hit.title;
    const existing = this.pending.get(id);
    if (existing) return existing;
    const request = (async () => {
      let title: string | null = null;
      try {
        const result = (await this.request(url)) as { title?: unknown };
        if (typeof result?.title === "string" && result.title.trim())
          title = result.title.trim();
      } catch {
        /* A metadata lookup must never prevent article delivery. */
      }
      this.cache.set(id, {
        title,
        expires: Date.now() + (title ? 86_400_000 : 60_000),
      });
      if (this.cache.size > 512)
        this.cache.delete(this.cache.keys().next().value!);
      return title;
    })();
    this.pending.set(id, request);
    try {
      return await request;
    } finally {
      this.pending.delete(id);
    }
  }
  async enrich(
    document: ArticleDocument,
    articleTitle: string,
    locale: NewsLocale,
  ): Promise<ArticleDocument> {
    const blocks = await Promise.all(
      document.blocks.map(async (block): Promise<ArticleBlock> => {
        if (block.type !== "video") return block;
        const youtube = youtubeVideo(block.url),
          url = youtube?.url ?? block.url;
        const provided = block.text.trim();
        if (
          provided &&
          !/^(?:[▶►]\s*)?(?:video|watch video|觀看影片|观看视频)$/i.test(
            provided,
          )
        )
          return { ...block, url, titleSource: "article" };
        const title = youtube ? await this.title(youtube.id, url) : null;
        return {
          ...block,
          url,
          text: title ?? `${FALLBACK[locale]}：${articleTitle}`,
          titleSource: title ? "youtube" : "fallback",
        };
      }),
    );
    return {
      blocks,
      version: createHash("sha256")
        .update(`article-v3:${JSON.stringify(blocks)}`)
        .digest("hex"),
    };
  }
}
export const newsVideoTitles = new NewsVideoTitles();
