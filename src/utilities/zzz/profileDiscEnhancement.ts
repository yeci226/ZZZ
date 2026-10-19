export const DISC_SUBSTAT_STYLE = {
  fontSize: 14.5,
  columnWidth: 75,
  rowHeight: 32,
  dotDiameter: 6,
  dotGap: 3,
  dotColor: "#A84B12",
  cardExtraHeight: 24,
} as const;

/** The five upgrade rolls are additional to the initial substat. */
export function discEnhancementCount(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return 0;
  const count = Number(value);
  return Number.isInteger(count) && count > 0 && count <= 5 ? count : 0;
}

export function getDiscSubstatLayout(
  discX: number,
  discY: number,
  subIndex: number,
  enhancement: unknown,
) {
  const x = discX + (subIndex % 2) * DISC_SUBSTAT_STYLE.columnWidth;
  const y =
    discY + 82 + Math.floor(subIndex / 2) * DISC_SUBSTAT_STYLE.rowHeight;
  const valueX = x + 24;
  const radius = DISC_SUBSTAT_STYLE.dotDiameter / 2;
  return {
    icon: { x: x + 1, y },
    value: { x: valueX, y: y + 15 },
    dots: Array.from(
      { length: discEnhancementCount(enhancement) },
      (_, index) => ({
        x:
          valueX +
          radius +
          index * (DISC_SUBSTAT_STYLE.dotDiameter + DISC_SUBSTAT_STYLE.dotGap),
        y: y + 23,
        radius,
      }),
    ),
  };
}
