import { createCanvas, loadImage } from "@napi-rs/canvas";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CoverError,
  coverPath,
  downloadCover,
  imageSize,
  removeCoverIfUnused,
  storeCover,
} from "../src/utilities/interknot/covers.js";

const pngOf = (w: number, h: number) => {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f6db00";
  ctx.fillRect(0, 0, w, h);
  return c.encodeSync("png");
};

// Valid PNG signature + IHDR claiming the given size, with no pixel data.
const pngHeader = (w: number, h: number) => {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4);
  ihdr.writeUInt32BE(w, 8);
  ihdr.writeUInt32BE(h, 12);
  ihdr[16] = 8;
  ihdr[17] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr]);
};

const jpegWithExif = () => {
  const c = createCanvas(64, 32);
  c.getContext("2d").fillRect(0, 0, 64, 32);
  const jpeg = c.encodeSync("jpeg");
  const payload = Buffer.concat([Buffer.from("Exif\0\0"), Buffer.alloc(32, 1)]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), app1, payload, jpeg.subarray(2)]);
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ik-covers-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("imageSize", () => {
  it("reads PNG, JPEG and WebP headers", async () => {
    expect(imageSize(pngOf(30, 20))).toEqual({ width: 30, height: 20 });
    expect(imageSize(jpegWithExif())).toEqual({ width: 64, height: 32 });
    const c = createCanvas(12, 7);
    c.getContext("2d").fillRect(0, 0, 12, 7);
    expect(imageSize(c.encodeSync("webp"))).toEqual({ width: 12, height: 7 });
  });
  it("returns null for unknown bytes", () => {
    expect(imageSize(Buffer.from("not an image"))).toBeNull();
  });
});

describe("storeCover", () => {
  it("resizes to 1024 wide webp", async () => {
    const h = await storeCover(pngOf(2048, 1024), dir);
    const img = await loadImage(coverPath(h, dir));
    expect([img.width, img.height]).toEqual([1024, 512]);
    expect(readFileSync(coverPath(h, dir)).subarray(8, 12).toString()).toBe("WEBP");
  });
  it("keeps small images at their size", async () => {
    const img = await loadImage(coverPath(await storeCover(pngOf(300, 200), dir), dir));
    expect([img.width, img.height]).toEqual([300, 200]);
  });
  it("dedupes identical content", async () => {
    const b = pngOf(40, 40);
    expect(await storeCover(b, dir)).toBe(await storeCover(b, dir));
    expect(readdirSync(dir)).toHaveLength(1);
  });
  it("strips EXIF", async () => {
    const h = await storeCover(jpegWithExif(), dir);
    expect(readFileSync(coverPath(h, dir)).includes(Buffer.from("Exif"))).toBe(false);
  });
  it("rejects non-image bytes", async () => {
    await expect(storeCover(Buffer.from("not an image"), dir)).rejects.toMatchObject({ reason: "decode" });
  });
  it("rejects huge dimensions before decoding", async () => {
    await expect(storeCover(pngHeader(20000, 20000), dir)).rejects.toMatchObject({ reason: "dimensions" });
  });
  it("rejects a truncated image as decode error", async () => {
    await expect(storeCover(pngHeader(100, 100), dir)).rejects.toBeInstanceOf(CoverError);
    expect(readdirSync(dir)).toEqual([]);
  });
  it("survives truncated JPEG and WebP that crash the native decoder", async () => {
    for (const format of ["jpeg", "webp"] as const) {
      const c = createCanvas(200, 100);
      c.getContext("2d").fillRect(0, 0, 120, 60);
      const full = c.encodeSync(format);
      await expect(storeCover(full.subarray(0, full.length >> 1), dir)).rejects.toMatchObject({ reason: "decode" });
    }
  });
});

describe("downloadCover", () => {
  it("validates type and size before downloading", async () => {
    await expect(downloadCover({ url: "x", contentType: "text/plain", size: 1 })).rejects.toMatchObject({ reason: "type" });
    await expect(downloadCover({ url: "x", contentType: null, size: 1 })).rejects.toMatchObject({ reason: "type" });
    await expect(
      downloadCover({ url: "x", contentType: "image/png", size: 8 * 1024 * 1024 + 1 }),
    ).rejects.toMatchObject({ reason: "size" });
  });
});

describe("removeCoverIfUnused", () => {
  it("removes only when no post references it", async () => {
    const h = await storeCover(pngOf(10, 10), dir);
    await removeCoverIfUnused(h, 1, dir);
    expect(existsSync(coverPath(h, dir))).toBe(true);
    await removeCoverIfUnused(h, 0, dir);
    expect(existsSync(coverPath(h, dir))).toBe(false);
    await expect(removeCoverIfUnused(h, 0, dir)).resolves.toBeUndefined();
  });
});

describe("storeCover size cap", () => {
  it("fits tall images inside 1024x1536 so decoded covers stay small", async () => {
    const img = await loadImage(coverPath(await storeCover(pngOf(500, 4000), dir), dir));
    expect([img.width, img.height]).toEqual([192, 1536]);
  });
});
