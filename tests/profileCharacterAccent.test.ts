import { getPaperAccent } from "../src/utilities/zzz/profileColors.js";

const PAPER = [233, 229, 218] as const;

function parseHex(value: string): [number, number, number] {
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`Unexpected RGB color: ${value}`);
  return [
    Number.parseInt(match[1]!.slice(0, 2), 16),
    Number.parseInt(match[1]!.slice(2, 4), 16),
    Number.parseInt(match[1]!.slice(4, 6), 16),
  ];
}

function luminance([r, g, b]: readonly [number, number, number]): number {
  const linearize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrast(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

describe("getPaperAccent", () => {
  it("darkens a bright green enough for paper-background text", () => {
    const brightGreen = [223, 255, 115] as const;
    const adjustedColor = getPaperAccent("#dfff73");
    const adjusted = parseHex(adjustedColor);

    expect(contrast(brightGreen, PAPER)).toBeLessThan(4.5);
    expect(contrast(adjusted, PAPER)).toBeGreaterThanOrEqual(3.5);
    expect(adjustedColor).not.toBe("#606a41");
    expect(adjusted[1]).toBeGreaterThan(adjusted[0]);
  });

  it("keeps separate characters on their own adjusted colors", () => {
    expect(getPaperAccent("#e892a7")).not.toBe(getPaperAccent("#dfff73"));
  });

  it("keeps an already dark accent unchanged apart from Canvas color format", () => {
    expect(getPaperAccent("#123456")).toBe("#123456");
  });
});
