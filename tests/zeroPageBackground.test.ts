import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  drawZeroPageBackground,
  ZERO_PAGE_BACKGROUND_FILES,
  zeroPageBackgroundLayout,
} from "../src/utilities/zzz/zeroPageBackground.js";
import { createCanvas } from "@napi-rs/canvas";

describe("shared HoYoLAB Zero page background", () => {
  it("uses the three official Banner background slices", () => {
    expect(ZERO_PAGE_BACKGROUND_FILES).toEqual({
      top: "zero-bg-top--pc.2d9b3a73.png",
      middle: "zero-bg-middle--pc.63932c7e.png",
      bottom: "zero-bg-bottom--pc.6e73fe00.png",
    });
  });

  it("scales the fixed top and bottom while filling the dynamic middle", () => {
    expect(zeroPageBackgroundLayout(1044, 1000)).toEqual({
      topHeight: 176,
      middleY: 176,
      middleHeight: 780,
      bottomY: 956,
      bottomHeight: 44,
    });
  });

  it("keeps a black fallback when one or all background slices are unavailable", () => {
    const canvas = createCanvas(1044, 300);
    const ctx = canvas.getContext("2d");
    expect(() => drawZeroPageBackground(ctx, 1044, 300, {
      top: null,
      middle: null,
      bottom: null,
    })).not.toThrow();
    expect([...ctx.getImageData(500, 150, 1, 1).data]).toEqual([0, 0, 0, 255]);
  });

  it.each(["noteRenderer.ts", "signalLogRenderer.ts", "bannerRenderer.ts"])(
    "%s uses the shared background instead of the legacy Note slices",
    (filename) => {
      const source = readFileSync(
        join(process.cwd(), "src", "utilities", "zzz", filename),
        "utf8",
      );
      expect(source).toContain("loadZeroPageBackground");
      expect(source).toContain("drawZeroPageBackground");
      expect(source).not.toMatch(/note-bg-(?:top|middle|bottom)/);
    },
  );
});
