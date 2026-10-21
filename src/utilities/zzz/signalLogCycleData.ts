import type { AnalyzedGachaRecord, GachaSummary } from "./gachaAnalysis.js";

export interface PityCycle {
  length: number;
  aPositions: number[];
  sRecord: AnalyzedGachaRecord | null;
  lost: boolean;
  partial: boolean;
  /** Leading pulls counted by pity but missing from these records (other banners or before the archive). */
  unknownPulls: number;
}

/**
 * Splits newest-first summary records into pity cycles, newest first.
 * The open cycle without an S is only kept when it is the channel's live pity.
 */
export function buildPityCycles(summary: GachaSummary, pityEstimated = false, openIsLive = true): PityCycle[] {
  const cycles: PityCycle[] = [];
  let pulls = 0;
  let aPositions: number[] = [];
  for (const record of [...summary.records].reverse()) {
    pulls++;
    if (record.rank === "A") aPositions.push(pulls);
    if (record.rank !== "S") continue;
    const length = record.pityPosition ?? pulls;
    const unknownPulls = Math.max(0, length - pulls);
    // Only the oldest cycle can start before the first archived record.
    const partial = !cycles.length && (pityEstimated || record.pityPosition === null || unknownPulls > 0);
    cycles.push({
      length, aPositions: aPositions.map((position) => position + unknownPulls), sRecord: record,
      lost: record.isUp === false, partial, unknownPulls,
    });
    pulls = 0;
    aPositions = [];
  }
  // The open cycle uses the record count, not live pity: a past banner's
  // leftover pulls must not borrow the account's current pity.
  if (pulls && openIsLive) {
    cycles.push({ length: pulls, aPositions, sRecord: null, lost: false, partial: !cycles.length && pityEstimated, unknownPulls: 0 });
  }
  return cycles.reverse();
}
