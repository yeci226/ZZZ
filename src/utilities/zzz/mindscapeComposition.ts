export type MindscapeComposition = {
  baseIndex: 0 | 1 | 2;
  overlayIndex?: 1 | 2;
  clip?: "face-fan" | "stage-two-side";
};

/**
 * Select the painting rank used by the portrait renderer.
 *
 * When rank-dependent painting is disabled, the setting means "show the
 * complete painting", which is the rank-6 artwork—not the rank-0 base image.
 */
export function getPaintingSelectionRank(
  rank: unknown,
  rankDependentPainting: boolean,
): number {
  if (!rankDependentPainting) return 6;

  const numeric = Number(rank);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(6, Math.floor(numeric)));
}

export function getMindscapeComposition(rank: number): MindscapeComposition {
  const normalized = Math.max(0, Math.min(6, Math.floor(Number(rank) || 0)));
  if (normalized === 1) return { baseIndex: 0, overlayIndex: 1, clip: "face-fan" };
  if (normalized === 2)
    return { baseIndex: 0, overlayIndex: 1, clip: "stage-two-side" };
  if (normalized === 3) return { baseIndex: 1 };
  if (normalized === 4) return { baseIndex: 1, overlayIndex: 2, clip: "face-fan" };
  if (normalized === 5)
    return { baseIndex: 1, overlayIndex: 2, clip: "stage-two-side" };
  if (normalized === 6) return { baseIndex: 2 };
  return { baseIndex: 0 };
}
