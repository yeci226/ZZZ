import { normalizeUrlLabels } from "./urlLabels.js";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { AnyNode } from "domhandler";

export type ArticleBlock =
  | { type: "markdown"; text: string }
  | {
      type: "image";
      url: string;
      identity: string;
      width: number;
      height: number;
    }
  | {
      type: "video";
      url: string;
      text: string;
      titleSource?: "article" | "youtube" | "fallback";
    };
export interface ArticleDocument {
  version: string;
  blocks: ArticleBlock[];
}
export function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export const quietText = (text: string): string =>
  text.replace(/@/g, "@\u200b");
const identity = (url: string) => {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
};
/** HoYoLAB video posts sometimes store transport metadata in the content field. */
export function readableBody(value: string): string {
  return value.replace(
    /\{[^{}]*"(?:video|video_id|video_url)"\s*:[^{}]*\}/g,
    (raw) => {
      try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object") return raw;
        const description =
          typeof data.describe === "string" ? data.describe.trim() : "";
        const url = httpUrl(data.video_url ?? data.video);
        return [description, url ? `[Video](<${url}>)` : ""]
          .filter(Boolean)
          .join("\n");
      } catch {
        return raw;
      }
    },
  );
}
export function parseArticle(
  structured: unknown,
  html: unknown,
  cover: string | null,
): ArticleDocument {
  let blocks: ArticleBlock[] = [];
  const text = (value: string) => {
    const last = blocks.at(-1);
    if (last?.type === "markdown") last.text += value;
    else blocks.push({ type: "markdown", text: value });
  };
  const image = (url: unknown, width: unknown = 0, height: unknown = 0) => {
    const safe = httpUrl(url);
    if (safe)
      blocks.push({
        type: "image",
        url: safe,
        identity: identity(safe),
        width: Number(width) || 0,
        height: Number(height) || 0,
      });
  };
  let delta: unknown = structured;
  try {
    if (typeof delta === "string") delta = JSON.parse(delta);
  } catch {
    delta = null;
  }
  if (delta && typeof delta === "object" && "ops" in delta) delta = delta.ops;
  if (Array.isArray(delta)) {
    let line = "";
    const flush = (a: Record<string, unknown> = {}) => {
      const indent = "  ".repeat(Math.min(8, Number(a.indent) || 0));
      if (a["code-block"]) text(`\n\`\`\`\n${line}\n\`\`\`\n`);
      else
        text(
          `${indent}${a.header ? "#".repeat(Math.min(3, Number(a.header))) + " " : a.blockquote ? "> " : a.list === "ordered" ? "1. " : a.list ? "- " : ""}${line}\n`,
        );
      line = "";
    };
    for (const op of delta) {
      if (!op || typeof op !== "object") continue;
      const a = op.attributes ?? {};
      if (typeof op.insert === "string") {
        const lines = op.insert.split("\n");
        lines.forEach((part: string, i: number) => {
          let value = part;
          if (value) {
            if (a.code) value = `\`${value.replace(/`/g, "ˋ")}\``;
            if (a.bold) value = `**${value}**`;
            if (a.italic) value = `*${value}*`;
            if (a.strike) value = `~~${value}~~`;
            if (httpUrl(a.link)) value = `[${value}](<${httpUrl(a.link)}>)`;
          }
          line += value;
          if (i < lines.length - 1) flush(a);
        });
      } else if (op.insert && typeof op.insert === "object") {
        if (line) flush();
        if (op.insert.image)
          image(
            typeof op.insert.image === "string"
              ? op.insert.image
              : op.insert.image.url,
            a.width,
            a.height,
          );
        else {
          const video = op.insert.video ?? op.insert.video_card;
          const url = httpUrl(
            typeof video === "string"
              ? video
              : (video?.url ?? video?.video_url),
          );
          if (url)
            blocks.push({
              type: "video",
              url,
              text:
                typeof video?.title === "string"
                  ? video.title
                  : typeof a.title === "string"
                    ? a.title
                    : "Video",
            });
          else if (typeof op.insert.text === "string") text(op.insert.text);
        }
      }
    }
    if (line) flush();
  }
  if (!blocks.some((b) => b.type !== "markdown" || b.text.trim())) {
    blocks = [];
    const body =
      typeof html === "string" &&
      !/^(zh-tw|zh-cn|en-us|ja-jp|ko-kr|fr-fr|vi-vn)$/.test(html.trim())
        ? html
        : "";
    const $ = load(body);
    $("script,style").remove();
    const walk = (node: AnyNode): void => {
      if (node.type === "text") {
        text(node.data);
        return;
      }
      if (!("tagName" in node)) return;
      const tag = node.tagName.toLowerCase(),
        attrs = node.attribs;
      if (tag === "img") {
        image(attrs.src ?? attrs["data-src"], attrs.width, attrs.height);
        return;
      }
      if (["video", "iframe"].includes(tag)) {
        const url = httpUrl(attrs.src ?? $(node).find("source").attr("src"));
        if (url)
          blocks.push({ type: "video", url, text: attrs.title || "Video" });
        return;
      }
      if (tag === "br") {
        text("\n");
        return;
      }
      const marker = ["strong", "b"].includes(tag)
        ? "**"
        : ["em", "i"].includes(tag)
          ? "*"
          : ["s", "del", "strike"].includes(tag)
            ? "~~"
            : tag === "pre"
              ? "\n```\n"
              : tag === "code" &&
                  node.parent?.type === "tag" &&
                  node.parent.name !== "pre"
                ? "`"
                : "";
      const paragraph = [
        "p",
        "div",
        "section",
        "blockquote",
        "li",
        "pre",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
      ].includes(tag);
      if (paragraph) text("\n");
      if (/^h[1-6]$/.test(tag))
        text(`${"#".repeat(Math.min(3, Number(tag[1])))} `);
      if (tag === "blockquote") text("> ");
      if (tag === "li")
        text(
          node.parent?.type === "tag" && node.parent.name === "ol"
            ? "1. "
            : "- ",
        );
      const link = tag === "a" ? httpUrl(attrs.href) : null;
      if (link) text("[");
      text(marker);
      node.children.forEach(walk);
      text(marker);
      if (link) text(`](<${link}>)`);
      if (paragraph) text("\n");
    };
    $("body")
      .contents()
      .each((_, node) => walk(node));
  }
  blocks = blocks
    .filter((b) => b.type !== "markdown" || b.text.trim())
    .map((b) =>
      b.type === "markdown"
        ? {
            ...b,
            text: normalizeUrlLabels(quietText(readableBody(b.text).trim())),
          }
        : b,
    );
  blocks = blocks.filter((b) => b.type !== "markdown" || b.text.trim());
  blocks = blocks.flatMap((block): ArticleBlock[] => {
    if (block.type !== "markdown") return [block];
    const result: ArticleBlock[] = [];
    let end = 0;
    for (const match of block.text.matchAll(
      /\[Video\]\(<(https?:\/\/[^>]+)>\)/g,
    )) {
      const before = block.text.slice(end, match.index).trim();
      if (before) result.push({ type: "markdown", text: before });
      result.push({ type: "video", url: match[1]!, text: "Video" });
      end = match.index! + match[0].length;
    }
    if (!end) return [block];
    const after = block.text.slice(end).trim();
    if (after) result.push({ type: "markdown", text: after });
    return result;
  });
  if (!blocks.some((b) => b.type === "image")) image(cover);
  return {
    version: createHash("sha256").update(JSON.stringify(blocks)).digest("hex"),
    blocks,
  };
}
