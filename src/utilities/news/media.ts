import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import axios from "axios";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { linkedTitle } from "./links.js";
import type { ArticleBlock } from "./article.js";
export interface NewsMedia {
  url: string;
  original: string;
  file?: string;
  name?: string;
  bytes?: number;
  width: number;
  height: number;
  slice?: { top: number; bottom: number; hash: string; version: string };
}
export type DisplayBlock =
  | { type: "markdown"; text: string }
  | {
      type: "gallery";
      media: NewsMedia[];
      runId?: string;
      intent?: "single" | "multi" | "slice";
    };
export const MAX_NEWS_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_NEWS_MESSAGE_BYTES = 24 * 1024 * 1024;
const CROP_VERSION = "v2-equal";
export function isAnimated(bytes: Buffer): boolean {
  // GIF remains intact even when a decoder only exposes its first frame.
  return (
    bytes.subarray(0, 6).toString().startsWith("GIF") ||
    (bytes.subarray(1, 4).toString() === "PNG" &&
      bytes.includes(Buffer.from("acTL"))) ||
    (bytes.subarray(8, 12).toString() === "WEBP" &&
      bytes.includes(Buffer.from("ANIM")))
  );
}
export function cropBoundaries(width: number, height: number): number[] {
  if (width <= 0 || height <= 0) throw new Error("invalid_image_dimensions");
  const count = Math.ceil(height / (width * 1.8));
  return Array.from({ length: count + 1 }, (_, i) =>
    Math.round((i * height) / count),
  );
}
export class NewsMediaCache {
  private pending = new Map<string, Promise<NewsMedia[]>>();
  constructor(
    readonly directory: string,
    private download: (url: string) => Promise<Buffer> = async (url) => {
      const host = new URL(url).hostname;
      if (
        !/(^|\.)(hoyolab\.com|hoyoverse\.com|mihoyo\.com|hoyocdn\.com|hoyolab-upload\.oss-accelerate\.aliyuncs\.com)$/.test(
          host,
        )
      )
        throw new Error("untrusted_image_host");
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 20_000,
        maxContentLength: 24 * 1024 * 1024,
        maxRedirects: 0,
      });
      return Buffer.from(response.data);
    },
  ) {}
  async prepare(
    block: Extract<ArticleBlock, { type: "image" }>,
  ): Promise<NewsMedia[]> {
    let pending = this.pending.get(block.url);
    if (!pending) {
      pending = this.process(block);
      this.pending.set(block.url, pending);
      if (this.pending.size > 256)
        this.pending.delete(this.pending.keys().next().value!);
      pending.catch(() => this.pending.delete(block.url));
    }
    return pending;
  }
  private async process(
    block: Extract<ArticleBlock, { type: "image" }>,
  ): Promise<NewsMedia[]> {
    await mkdir(this.directory, { recursive: true });
    const urlKey = createHash("sha256").update(block.url).digest("hex");
    const manifest = join(this.directory, `${urlKey}-${CROP_VERSION}.json`);
    try {
      const saved: NewsMedia[] = JSON.parse(await readFile(manifest, "utf8"));
      await Promise.all(saved.map((m) => readFile(m.file!)));
      return saved;
    } catch {
      /* New URL or incomplete cache: regenerate before publishing the manifest. */
    }
    const bytes = await this.download(block.url),
      hash = createHash("sha256").update(bytes).digest("hex");
    const key = `${urlKey.slice(0, 16)}-${hash.slice(0, 20)}-${CROP_VERSION}`;
    const animated = isAnimated(bytes);
    const img = animated ? null : await loadImage(bytes);
    const width = img?.width ?? block.width,
      height = img?.height ?? block.height;
    if (width * height > 100_000_000) throw new Error("image_pixel_limit");
    const results: NewsMedia[] = [];
    const save = async (
      data: Buffer,
      suffix: string,
      w: number,
      h: number,
      slice?: NewsMedia["slice"],
    ) => {
      if (data.length > MAX_NEWS_FILE_BYTES)
        throw new Error("image_attachment_limit");
      const name = `${key}-${suffix}`,
        file = join(this.directory, name);
      await writeFile(file, data);
      results.push({
        url: `attachment://${name}`,
        original: block.url,
        file,
        name,
        bytes: data.length,
        width: w,
        height: h,
        ...(slice ? { slice } : {}),
      });
    };
    if (img && height / width > 3) {
      const cuts = cropBoundaries(width, height);
      for (let i = 1; i < cuts.length; i++) {
        const top = cuts[i - 1]!,
          bottom = cuts[i]!,
          canvas = createCanvas(width, bottom - top);
        canvas
          .getContext("2d")
          .drawImage(
            img,
            0,
            top,
            width,
            bottom - top,
            0,
            0,
            width,
            bottom - top,
          );
        await save(
          canvas.toBuffer("image/png"),
          `${i}.png`,
          width,
          bottom - top,
          { top, bottom, hash, version: CROP_VERSION },
        );
      }
    } else {
      const ext =
        bytes.subarray(0, 3).toString() === "GIF"
          ? "gif"
          : bytes.subarray(1, 4).toString() === "PNG"
            ? "png"
            : bytes.subarray(8, 12).toString() === "WEBP"
              ? "webp"
              : "jpg";
      await save(bytes, `original.${ext}`, width, height);
    }
    const tmp = `${manifest}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(tmp, JSON.stringify(results));
    await rename(tmp, manifest);
    return results;
  }
  async blocks(
    blocks: ArticleBlock[],
    articleUrl: string,
  ): Promise<DisplayBlock[]> {
    const out: DisplayBlock[] = [],
      run: NewsMedia[] = [];
    let groupNumber = 0;
    const flush = () => {
      if (!run.length) return;
      const runId = `ordinary:${groupNumber++}`,
        intent = run.length > 4 ? "multi" : "single";
      const size = intent === "multi" ? 10 : 1;
      while (run.length)
        out.push({
          type: "gallery",
          media: run.splice(0, size),
          runId,
          intent,
        });
    };
    for (const block of blocks) {
      if (block.type === "markdown" && !block.text.trim()) continue;
      if (block.type !== "image") {
        flush();
        out.push({
          type: "markdown",
          text:
            block.type === "markdown"
              ? block.text
              : linkedTitle(block.text, block.url),
        });
        continue;
      }
      try {
        const media = await this.prepare(block);
        if (media.some((m) => m.slice)) {
          flush();
          out.push({
            type: "markdown",
            text: `[Original image](<${block.url}>)`,
          });
          media.forEach((m) =>
            out.push({
              type: "gallery",
              media: [m],
              runId: `slice:${block.identity}`,
              intent: "slice",
            }),
          );
        } else run.push(...media);
      } catch {
        flush();
        out.push({
          type: "markdown",
          text: `[Original image](<${block.url}>) · [HoYoLAB](<${articleUrl}>)`,
        });
      }
    }
    flush();
    return out;
  }
}
