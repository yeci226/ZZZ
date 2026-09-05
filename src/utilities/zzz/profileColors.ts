const PAPER = "#e9e5da";

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linearize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Return a role color that remains readable when drawn on the paper panels. */
export function getPaperAccent(rawAccent: string): string {
  const paperLuminance = relativeLuminance(hexToRgb(PAPER));
  const source = hexToRgb(rawAccent);
  const contrast = (candidate: [number, number, number]) => {
    const accentLuminance = relativeLuminance(candidate);
    return (
      (Math.max(paperLuminance, accentLuminance) + 0.05) /
      (Math.min(paperLuminance, accentLuminance) + 0.05)
    );
  };
  if (contrast(source) >= 3.5) return rawAccent;

  // Keep each character's hue while reducing only as much brightness as
  // needed for the paper panels. The result is calculated once per card.
  let factor = 1;
  while (factor >= 0.1) {
    const candidate: [number, number, number] = [
      Math.round(source[0] * factor),
      Math.round(source[1] * factor),
      Math.round(source[2] * factor),
    ];
    if (contrast(candidate) >= 3.5) return rgbToHex(candidate);
    factor -= 0.05;
  }
  return rgbToHex([
    Math.round(source[0] * 0.1),
    Math.round(source[1] * 0.1),
    Math.round(source[2] * 0.1),
  ]);
}
