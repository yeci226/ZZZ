import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { adaptScoringSource, type ScoringSnapshot } from "./scoring.js";

export const SCORING_SYNC_INTERVAL = 6 * 60 * 60 * 1000;
export interface ScoringEnvelope { revision: string; fetchedAt: string; data: unknown }
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
export function validateCoverage(snapshot: ScoringSnapshot, required: string[]): void {
  const missing = required.filter(id => !snapshot.agents[id]);
  if (missing.length) throw new Error(`Scoring coverage missing: ${missing.join(", ")}`);
}
export async function fetchScoringSource(): Promise<ScoringEnvelope> {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "zzz-discord-scoring" };
  const json = async (url: string) => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Scoring HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > 5_000_000) throw new Error("Scoring source too large");
    if (!response.body) throw new Error("Empty scoring response");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
      if (size > 5_000_000) throw new Error("Scoring source too large"); chunks.push(part.value); }
    } finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  };
  const commit = await json("https://api.github.com/repos/SouthxPaw/zzz.optimizer/commits/trunk");
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error("Invalid scoring revision");
  return {revision: commit.sha, fetchedAt: new Date().toISOString(), data: await json(`https://raw.githubusercontent.com/SouthxPaw/zzz.optimizer/${commit.sha}/src/assets/data/agent-stat-weights.json`)};
}

export class ScoringStore {
  private value: ScoringSnapshot;
  private timer?: ReturnType<typeof setInterval>;
  private inFlight?: Promise<void>;
  lastError?: string;
  constructor(private options: {seed: ScoringEnvelope; required: string[]; cachePath?: string; fetch?: () => Promise<ScoringEnvelope>}) {
    this.value = this.parse(options.seed);
    if (options.cachePath) {
      try { this.value = this.parse(JSON.parse(readFileSync(options.cachePath, "utf8"))); }
      catch { /* The bundled validated snapshot remains available. */ }
    }
  }
  private parse(source: ScoringEnvelope) {
    const snapshot = adaptScoringSource(source.data, source.revision, source.fetchedAt);
    validateCoverage(snapshot, this.options.required);
    return freeze(snapshot);
  }
  snapshot(): ScoringSnapshot { return this.value; }
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.update().finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }
  private async update() {
    try {
      const source = await (this.options.fetch ?? fetchScoringSource)();
      const candidate = this.parse(source);
      // Also reject accidental deletion of previously supported agents/builds.
      validateCoverage(candidate, Object.keys(this.value.agents));
      for (const [id, previous] of Object.entries(this.value.agents)) {
        if (previous.builds.some(b => !candidate.agents[id].builds.some(n => n.id === b.id))) throw new Error(`Scoring build removed: ${id}`);
      }
      if (this.options.cachePath) {
        const file = this.options.cachePath, tmp = `${file}.${randomUUID()}.tmp`;
        await mkdir(dirname(file), {recursive: true});
        try { await writeFile(tmp, JSON.stringify(source), {mode: 0o600}); await rename(tmp, file); }
        finally { await unlink(tmp).catch(() => undefined); }
      }
      this.value = candidate; this.lastError = undefined;
    } catch (error) { this.lastError = error instanceof Error ? error.message : "Scoring update failed"; throw error; }
  }
  start(onError: (error: unknown) => void = console.error) {
    if (this.timer) return;
    const refresh = () => { void this.refresh().catch(onError); };
    this.timer = setInterval(refresh, SCORING_SYNC_INTERVAL); this.timer.unref(); refresh();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
}
let store: ScoringStore | undefined;
export function getScoringStore(): ScoringStore {
  if (!store) {
    const seed = JSON.parse(readFileSync(resolve("src/assets/combat/scoring-source.json"), "utf8"));
    // Scoring coverage is pinned to its own bundled source, independent of combat adapters.
    const required = Object.keys(adaptScoringSource(seed.data, seed.revision, seed.fetchedAt).agents);
    store = new ScoringStore({seed, required, cachePath: resolve("data/zzz-disc-scoring.json")});
  }
  return store;
}
