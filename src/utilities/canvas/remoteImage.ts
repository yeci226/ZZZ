import { loadImage, type Image } from "@napi-rs/canvas";

const NONE_IMAGE = "./src/assets/images/None.png";
const FETCH_TIMEOUT_MS = 8_000;
const MAX_ENTRIES = 200;
// Budget for DECODED pixels (width * height * 4) per process; every cluster has its own cache.
const MAX_BYTES = 64 * 1024 * 1024;

/** Memory a cached Image really holds: decoded RGBA, not the compressed download. */
const decodedSize = (image: Image, fallback: number) =>
  image.width * image.height * 4 || fallback;
const SUCCESS_TTL_MS = 30 * 60_000;
const FAILURE_TTL_MS = 30_000;

interface Entry {
  promise: Promise<Image>;
  at: number;
  size: number;
  failed: boolean;
}

// Insertion order = LRU order (hits re-insert). Holds in-flight requests too.
const cache = new Map<string, Entry>();
let totalBytes = 0;

const isHttp = (source: string) => /^https?:\/\//i.test(source);

function drop(key: string) {
  const entry = cache.get(key);
  if (!entry) return;
  totalBytes -= entry.size;
  cache.delete(key);
}

function evict() {
  while (cache.size > MAX_ENTRIES || totalBytes > MAX_BYTES) {
    const oldest = cache.keys().next();
    if (oldest.done || cache.size <= 1) break;
    drop(oldest.value);
  }
}

async function fetchImage(url: string): Promise<{ image: Image; size: number }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const image = await loadImage(buffer);
  return { image, size: decodedSize(image, buffer.length) };
}

/**
 * Load one image. Remote URLs go through a bounded in-memory LRU with shared
 * in-flight requests and an 8s timeout; local paths are loaded directly.
 * Rejects on failure. `resolve` may map a URL to something else first
 * (e.g. a disk-cached local file).
 */
export function loadImageCached(
  source: string,
  resolve?: (url: string) => Promise<string>,
): Promise<Image> {
  if (!isHttp(source)) return loadImage(source);

  const now = Date.now();
  const hit = cache.get(source);
  if (hit) {
    const ttl = hit.failed ? FAILURE_TTL_MS : SUCCESS_TTL_MS;
    if (now - hit.at < ttl) {
      cache.delete(source);
      cache.set(source, hit);
      return hit.promise;
    }
    drop(source);
  }

  const entry: Entry = { promise: undefined as any, at: now, size: 0, failed: false };
  entry.promise = (async () => {
    try {
      const target = resolve ? await resolve(source) : source;
      if (isHttp(target)) {
        const { image, size } = await fetchImage(target);
        entry.size = size;
        return image;
      }
      const image = await loadImage(target);
      entry.size = decodedSize(image, 0);
      return image;
    } catch (error) {
      entry.failed = true;
      entry.at = Date.now();
      throw error;
    } finally {
      if (cache.get(source) === entry) {
        totalBytes += entry.size;
        evict();
      }
    }
  })();
  cache.set(source, entry);
  evict();
  return entry.promise;
}

/**
 * Drop-in for the four per-file copies: url, then fallbackUrl (or the None
 * placeholder), then the None placeholder. Only throws if None.png itself fails.
 */
export async function loadImageAsync(
  url: string,
  fallbackUrl?: string,
  resolve?: (url: string) => Promise<string>,
): Promise<Image> {
  try {
    return await loadImageCached(url, resolve);
  } catch {
    try {
      return await loadImageCached(fallbackUrl || NONE_IMAGE, resolve);
    } catch {
      return await loadImage(NONE_IMAGE);
    }
  }
}

/** Test hook. */
export function clearRemoteImageCache() {
  cache.clear();
  totalBytes = 0;
}
