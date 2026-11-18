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
export function buildPityCycles(
  summary: GachaSummary,
  pityEstimated = false,
  openIsLive = true,
  livePity?: number | null,
): PityCycle[] {
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
  // Without a live pity the open cycle uses the record count: a past banner's
  // leftover pulls must not borrow the account's current pity. With one, the
  // archive may lag the live state, so the live number wins when positive.
  const live = openIsLive && typeof livePity === "number" && Number.isFinite(livePity) && livePity > 0 ? livePity : null;
  if ((pulls || live !== null) && openIsLive) {
    cycles.push({
      length: live ?? pulls, aPositions, sRecord: null, lost: false, partial: !cycles.length && pityEstimated, unknownPulls: 0,
    });
  }
  return cycles.reverse();
}
