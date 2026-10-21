import type { AnalyzedGachaRecord, GachaSummary } from "./gachaAnalysis.js";

export interface PityCycle {
  length: number;
  aPositions: number[];
  sRecord: AnalyzedGachaRecord | null;
  lost: boolean;
  partial: boolean;
}

/** Splits newest-first summary records into pity cycles, newest first; an open cycle without an S comes first. */
export function buildPityCycles(summary: GachaSummary, pityEstimated = false): PityCycle[] {
  const cycles: PityCycle[] = [];
  let pulls = 0;
  let aPositions: number[] = [];
  for (const record of [...summary.records].reverse()) {
    pulls++;
    if (record.rank === "A") aPositions.push(pulls);
    if (record.rank !== "S") continue;
    const length = record.pityPosition ?? pulls;
    // Only the oldest cycle can start before the first archived record.
    const partial = !cycles.length && (pityEstimated || length > pulls);
    cycles.push({ length, aPositions, sRecord: record, lost: record.isUp === false, partial });
    pulls = 0;
    aPositions = [];
  }
  // The open cycle uses the record count, not live pity: a past banner's
  // leftover pulls must not borrow the account's current pity.
  if (pulls) cycles.push({ length: pulls, aPositions, sRecord: null, lost: false, partial: !cycles.length && pityEstimated });
  return cycles.reverse();
}
