/** Offline uploader: no credentials in manifests, no uploads during a draw. */
import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DEFAULT_GACHA_CACHE } from "../utilities/zzz/gachaAnimationCache.js";

const args = process.argv.slice(2);
const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const directory = path.resolve(option("--cache") || process.env.ZZZ_GACHA_CACHE_DIR || DEFAULT_GACHA_CACHE);
const filename = path.join(directory, "manifest.json");
const manifest = JSON.parse(await readFile(filename, "utf8"));
const bucket = option("--bucket") || process.env.ZZZ_GACHA_R2_BUCKET;
const base = new URL(option("--base-url") || process.env.ZZZ_GACHA_CDN_BASE || "https://img.yeci.it.com/");
if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("CDN base must be a public HTTPS URL");
if (bucket && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("Invalid R2 bucket name");
const apply = args.includes("--apply");
if (apply && !bucket) throw new Error("Set --bucket or ZZZ_GACHA_R2_BUCKET. Dry-run never uploads.");
const plan: Array<{ file: string; relativeFile: string; object: string; remoteUrl: string; sha256: string; bytes: number; verifiedBefore: boolean }> = [];
// Validate the entire batch before creating any remote objects.
for (const [key, variant] of Object.entries(manifest.variants) as [string, any][]) {
  if (!/^[a-z0-9-]+$/.test(key) || !/^[a-z0-9-]+$/.test(manifest.animationRevision)) throw new Error("Invalid animation revision/key");
  for (const gif of variant.gifs) {
    const file = path.resolve(directory, gif.file);
    if (!file.startsWith(directory + path.sep)) throw new Error("Invalid cache path");
    const bytes = await readFile(file), hash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== gif.bytes || (gif.sha256 && hash !== gif.sha256) || !/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) throw new Error(`Incomplete cache: ${gif.file}`);
    const object = `zzz/gacha/${manifest.animationRevision}/${key}/${hash.slice(0, 20)}-${gif.height}.gif`;
    const url = new URL(object, base.href.endsWith("/") ? base : new URL(base.href + "/")).href;
    console.log(`${apply ? "UPLOAD" : "DRY RUN"} ${gif.file} (${bytes.length} bytes) → ${url}`);
    plan.push({ file, relativeFile: gif.file, object, remoteUrl: url, sha256: hash, bytes: bytes.length,
      verifiedBefore: gif.remoteUrl === url && gif.sha256 === hash });
  }
}

async function verifyRemote(item: typeof plan[number]) {
  const response = await fetch(item.remoteUrl, { signal: AbortSignal.timeout(60_000), redirect: "error" });
  if (!response.ok || !/image\/gif/i.test(response.headers.get("content-type") || "")) {
    await response.body?.cancel(); throw new Error(`CDN URL is not a public GIF: HTTP ${response.status}`);
  }
  const remoteHash = createHash("sha256"); let remoteBytes = 0;
  for await (const chunk of response.body as any) {
    remoteHash.update(chunk); remoteBytes += chunk.length;
    if (remoteBytes > item.bytes) throw new Error("CDN contents exceed the rendered GIF size");
  }
  if (remoteBytes !== item.bytes || remoteHash.digest("hex") !== item.sha256) throw new Error("CDN contents do not match the rendered GIF");
}

async function saveVerified(item: typeof plan[number]) {
  // Commit each verified object independently so an interruption can resume.
  // Re-read so an offline render completing during upload is not lost.
  const latest = JSON.parse(await readFile(filename, "utf8"));
  if (latest.animationRevision !== manifest.animationRevision) throw new Error("Animation revision changed during upload; rerun with the new cache");
  let matched = false;
  for (const variant of Object.values(latest.variants) as any[]) for (const gif of variant.gifs) {
    if (gif.file === item.relativeFile && gif.sha256 === item.sha256 && gif.bytes === item.bytes) {
      gif.remoteUrl = item.remoteUrl; matched = true;
    }
  }
  if (!matched) throw new Error(`Cache changed during upload: ${item.relativeFile}`);
  const temp = filename + `.upload-${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(latest, null, 2) + "\n"); await rename(temp, filename);
}

if (apply) {
  const auth = spawnSync("npx", ["--yes", "wrangler@4", "whoami"], { encoding: "utf8", timeout: 60_000 });
  if (auth.status !== 0 || /not authenticated/i.test(auth.stdout + auth.stderr)) throw new Error("Cloudflare 尚未登入；請在本機執行 npx wrangler login 後重試。");
  for (const item of plan) {
    if (item.verifiedBefore) {
      // A stale/broken CDN is an error, not a reason to silently skip validation.
      await verifyRemote(item);
      console.log(`VERIFIED (already uploaded) ${item.relativeFile}`);
      continue;
    }
    const result = spawnSync("npx", ["--yes", "wrangler@4", "r2", "object", "put", `${bucket}/${item.object}`, "--remote", "--file", item.file,
      "--content-type", "image/gif", "--cache-control", "public, max-age=31536000, immutable"], { stdio: "inherit", timeout: 180_000 });
    if (result.status !== 0) throw new Error(`Upload failed: ${item.relativeFile}; verified files are retained and can be resumed`);
    await verifyRemote(item);
    await saveVerified(item);
    console.log(`VERIFIED ${item.relativeFile}`);
  }
}
console.log(JSON.stringify({ mode: apply ? "uploaded" : "dry-run", files: plan.length,
  bytes: plan.reduce((sum, item) => sum + item.bytes, 0), alreadyVerified: plan.filter(item => item.verifiedBefore).length }));
