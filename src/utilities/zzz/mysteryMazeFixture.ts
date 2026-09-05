import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

import {
  normalizeMysteryMazeData,
  type MysteryMazeAbstract,
  type MysteryMazeDetail,
} from "./mysteryMazeRenderer.js";

export interface MysteryMazeFixturePayload {
  abstract: MysteryMazeAbstract;
  detail: MysteryMazeDetail;
}

export interface MysteryMazeCandidate {
  ownerId: string;
  accountIndex: number;
  uid: string;
  cookie: string;
  region?: string;
  recentAt?: number;
  updatedAt?: number;
}

export interface MysteryMazeRichness {
  pageCoverage: number;
  mapCount: number;
  challengedMapCount: number;
  medalCount: number;
  goodsCount: number;
  recordCount: number;
  hasAvatars: boolean;
  hasSuccessfulGains: boolean;
}

export interface MysteryMazeCandidateResult {
  candidate: MysteryMazeCandidate;
  payload: MysteryMazeFixturePayload;
  richness: MysteryMazeRichness;
}

export interface MysteryMazeScanResult {
  baseline: MysteryMazeRichness;
  selected: MysteryMazeCandidateResult | null;
  scanned: number;
  failed: number;
}

export interface MysteryMazeFetcher {
  abstract(account: MysteryMazeCandidate): Promise<MysteryMazeAbstract>;
  detail(account: MysteryMazeCandidate): Promise<MysteryMazeDetail>;
}

export function scoreMysteryMaze(
  payload: MysteryMazeFixturePayload,
): MysteryMazeRichness {
  const normalized = normalizeMysteryMazeData(payload.abstract, payload.detail);
  const hasOverview = Boolean(
    payload.abstract.season_unlock ||
    payload.abstract.season_data ||
    normalized.maps.length,
  );
  const hasCollection = normalized.medals.length + normalized.goods.length > 0;
  const hasRecords = normalized.records.length > 0;
  return {
    pageCoverage:
      Number(hasOverview) + Number(hasCollection) + Number(hasRecords),
    mapCount: normalized.maps.length,
    challengedMapCount: normalized.maps.filter(
      (map) => map.is_challenge === true,
    ).length,
    medalCount: normalized.medals.length,
    goodsCount: normalized.goods.length,
    recordCount: normalized.records.length,
    hasAvatars: normalized.records.some(
      (record) => (record.avatar_list ?? record.role_list ?? []).length > 0,
    ),
    hasSuccessfulGains: normalized.records.some(
      (record) =>
        record.is_success === true &&
        (record.item_list ?? record.gain_list ?? []).length > 0,
    ),
  };
}

export function richnessTuple(value: MysteryMazeRichness): number[] {
  return [
    value.pageCoverage,
    value.mapCount,
    value.challengedMapCount,
    Math.min(value.medalCount, 12),
    Math.min(value.goodsCount, 20),
    Math.min(value.recordCount, 4),
    Number(value.hasAvatars),
    Number(value.hasSuccessfulGains),
  ];
}

export function compareMysteryMazeRichness(
  a: MysteryMazeRichness,
  b: MysteryMazeRichness,
): number {
  const left = richnessTuple(a),
    right = richnessTuple(b);
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return 0;
}

export function isIdealMysteryMazeSample(value: MysteryMazeRichness): boolean {
  return (
    value.pageCoverage === 3 &&
    value.mapCount >= 3 &&
    value.medalCount >= 12 &&
    value.goodsCount >= 20 &&
    value.recordCount >= 4 &&
    value.hasAvatars &&
    value.hasSuccessfulGains
  );
}

export function sortMysteryMazeCandidates(
  candidates: MysteryMazeCandidate[],
): MysteryMazeCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      (b.recentAt ?? 0) - (a.recentAt ?? 0) ||
      (b.updatedAt ?? 0) - (a.updatedAt ?? 0) ||
      a.uid.localeCompare(b.uid),
  );
}

export async function selectRicherMysteryMazeSample(options: {
  baseline: MysteryMazeCandidate;
  candidates: MysteryMazeCandidate[];
  fetcher: MysteryMazeFetcher;
  batchSize?: number;
  limit?: number;
  onFailure?: (error: unknown) => void;
}): Promise<MysteryMazeScanResult> {
  const batchSize = Math.min(
    10,
    Math.max(1, Math.trunc(options.batchSize ?? 10)),
  );
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 50)));
  const baselinePayload = {
    abstract: await options.fetcher.abstract(options.baseline),
    detail: await options.fetcher.detail(options.baseline),
  };
  const baseline = scoreMysteryMaze(baselinePayload);
  const candidates = sortMysteryMazeCandidates(options.candidates)
    .filter((candidate) => candidate.uid !== options.baseline.uid)
    .slice(0, limit);
  let scanned = 0,
    failed = 0;

  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    let best: MysteryMazeCandidateResult | null = null;
    for (const candidate of candidates.slice(offset, offset + batchSize)) {
      scanned++;
      try {
        const abstract = await options.fetcher.abstract(candidate);
        const summary = scoreMysteryMaze({ abstract, detail: {} });
        if (summary.pageCoverage === 0) continue;
        const detail = await options.fetcher.detail(candidate);
        const result = {
          candidate,
          payload: { abstract, detail },
          richness: scoreMysteryMaze({ abstract, detail }),
        };
        if (result.richness.pageCoverage < 3) continue;
        if (
          !best ||
          compareMysteryMazeRichness(result.richness, best.richness) > 0
        )
          best = result;
      } catch (error) {
        failed++;
        options.onFailure?.(error);
      }
    }
    if (best && compareMysteryMazeRichness(best.richness, baseline) > 0) {
      return { baseline, selected: best, scanned, failed };
    }
  }
  return { baseline, selected: null, scanned, failed };
}

const PRIVATE_KEYS =
  /^(?:cookie|discord_?id|owner_?id|uid|role_id|game_role_id|nickname|avatar_icon)$/i;

function sanitizeValue(value: unknown, key = ""): unknown {
  if (PRIVATE_KEYS.test(key)) return undefined;
  if (Array.isArray(value))
    return value
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const sanitized = sanitizeValue(childValue, childKey);
    if (sanitized !== undefined) result[childKey] = sanitized;
  }
  return result;
}

export function sanitizeMysteryMazeFixture(
  payload: MysteryMazeFixturePayload,
): MysteryMazeFixturePayload {
  const sanitized = sanitizeValue(payload) as MysteryMazeFixturePayload;
  delete sanitized.abstract.nick_name;
  const records =
    sanitized.detail.record_list ??
    sanitized.detail.records ??
    sanitized.detail.challenge_record_list ??
    [];
  records.forEach((record, index) => {
    record.start_time = {
      year: 2026,
      month: 1,
      day: Math.max(1, 15 - index),
      hour: 12,
      minute: index * 3,
      second: 0,
    };
    delete record.challenge_time_data;
  });
  return sanitized;
}

export function serializedFixtureContainsPrivateData(value: unknown): boolean {
  const text = JSON.stringify(value);
  return /(?:cookie|discord_?id|owner_?id|game_role_id|"uid"|"nick_?name"|ltoken|ltuid|stoken)/i.test(
    text,
  );
}

function extensionFor(url: string, contentType: string | null): string {
  const byType: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const mime = String(contentType ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase();
  if (byType[mime]) return byType[mime]!;
  const extension = extname(new URL(url).pathname).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)
    ? extension
    : ".img";
}

export async function materializeMysteryMazeIcons(
  payload: MysteryMazeFixturePayload,
  options: {
    assetDirectory: string;
    referenceDirectory: string;
    fetchImpl?: typeof fetch;
  },
): Promise<MysteryMazeFixturePayload> {
  const fetchImpl = options.fetchImpl ?? fetch;
  await mkdir(options.assetDirectory, { recursive: true });
  const cache = new Map<string, string>();

  async function visit(value: unknown, key = ""): Promise<unknown> {
    if (Array.isArray(value))
      return Promise.all(value.map((item) => visit(item)));
    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [childKey, childValue] of Object.entries(
        value as Record<string, unknown>,
      ))
        result[childKey] = await visit(childValue, childKey);
      return result;
    }
    if (
      typeof value !== "string" ||
      !/^https:\/\//i.test(value) ||
      !/(?:icon(?:_url)?|role_square_url)$/i.test(key)
    )
      return value;
    if (cache.has(value)) return cache.get(value)!;
    try {
      const response = await fetchImpl(value);
      if (!response.ok)
        throw new Error(`icon request failed (${response.status})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const filename = `${createHash("sha256").update(bytes).digest("hex")}${extensionFor(value, response.headers.get("content-type"))}`;
      await writeFile(join(options.assetDirectory, filename), bytes);
      const reference = join(options.referenceDirectory, filename).replaceAll(
        "\\",
        "/",
      );
      cache.set(value, reference);
      return reference;
    } catch {
      return "";
    }
  }
  return visit(payload) as Promise<MysteryMazeFixturePayload>;
}

export async function writeMysteryMazeFixtureAtomic(
  path: string,
  payload: MysteryMazeFixturePayload,
): Promise<void> {
  if (serializedFixtureContainsPrivateData(payload))
    throw new Error("sanitized fixture still contains private identifiers");
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, path);
}
