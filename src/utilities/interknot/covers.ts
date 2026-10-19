import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { LIMITS } from "./rules.js";

const DEFAULT_DIR = resolve("data/interknot/covers");
const MAX_SIDE = 8000;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const REENCODE_TIMEOUT_MS = 20_000;

export class CoverError extends Error {
  constructor(public reason: "type" | "size" | "decode" | "dimensions") {
    super(`interknot cover rejected: ${reason}`);
  }
}

/** Reads dimensions from PNG/JPEG/WebP/GIF headers so oversized images are refused before decoding. */
export function imageSize(b: Buffer): { width: number; height: number } | null {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString("ascii", 12, 16) === "IHDR")
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length >= 10 && b.toString("ascii", 0, 4) === "GIF8")
    return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.length >= 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length && b[i] === 0xff) {
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

export function coverPath(hash: string, dir = DEFAULT_DIR): string {
  return join(dir, `${hash}.webp`);
}

export async function downloadCover(a: { url: string; contentType: string | null; size: number }): Promise<Buffer> {
  if (!a.contentType?.startsWith("image/")) throw new CoverError("type");
  if (a.size > LIMITS.coverBytes) throw new CoverError("size");
  const res = await fetch(a.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new CoverError("decode");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > LIMITS.coverBytes) throw new CoverError("size");
  return buf;
}

// @napi-rs/canvas segfaults on some truncated images, so untrusted bytes are decoded in a child process.
const REENCODE_SCRIPT = `
const { createCanvas, loadImage } = require(process.argv[1]);
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c)).on("end", async () => {
  try {
    const img = await loadImage(Buffer.concat(chunks));
    if (!img.width || !img.height) process.exit(2);
    const scale = Math.min(1, Number(process.argv[2]) / img.width, Number(process.argv[3]) / img.height);
    const canvas = createCanvas(Math.round(img.width * scale), Math.max(1, Math.round(img.height * scale)));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    process.stdout.write(await canvas.encode("webp", 85));
  } catch { process.exit(2); }
});`;

function reencode(buf: Buffer): Promise<Buffer> {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      ["-e", REENCODE_SCRIPT, resolve("node_modules/@napi-rs/canvas"), String(LIMITS.coverWidth), String(LIMITS.coverHeight)],
      { stdio: ["pipe", "pipe", "ignore"], timeout: REENCODE_TIMEOUT_MS },
    );
    const out: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.on("error", () => fail(new CoverError("decode")));
    child.on("close", (code) => (code === 0 && out.length ? done(Buffer.concat(out)) : fail(new CoverError("decode"))));
    child.stdin.on("error", () => {}); // the child may die before reading everything
    child.stdin.end(buf);
  });
}

/** Re-encodes to webp (dropping EXIF and anything else non-pixel) and stores by content hash. */
export async function storeCover(buf: Buffer, dir = DEFAULT_DIR): Promise<string> {
  const size = imageSize(buf);
  if (!size) throw new CoverError("decode");
  if (size.width > MAX_SIDE || size.height > MAX_SIDE) throw new CoverError("dimensions");
  const out = await reencode(buf);
  const hash = createHash("sha256").update(out).digest("hex");
  const target = coverPath(hash, dir);
  if (!existsSync(target)) {
    await mkdir(dir, { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, out);
    await rename(tmp, target);
  }
  return hash;
}

export async function removeCoverIfUnused(hash: string, refCount: number, dir = DEFAULT_DIR): Promise<void> {
  if (refCount > 0) return;
  await rm(coverPath(hash, dir), { force: true });
}
