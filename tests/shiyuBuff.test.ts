import { createCanvas } from "@napi-rs/canvas";
import {
  drawBuffText,
  estimateTextHeight,
} from "../src/utilities/zzz/shiyu/utils.js";

function recordingContext() {
  const ctx = createCanvas(500, 500).getContext("2d");
  const drawn: {
    char: string;
    color: string;
    x: number;
    y: number;
    width: number;
  }[] = [];
  jest.spyOn(ctx, "fillText").mockImplementation((char, x, y) => {
    drawn.push({
      char,
      color: String(ctx.fillStyle),
      x,
      y,
      width: ctx.measureText(char).width,
    });
  });
  return { ctx, drawn };
}

describe("Shiyu buff text", () => {
  it("preserves exact colors after wrapping and Unicode code points", () => {
    const { ctx, drawn } = recordingContext();
    drawBuffText(
      ctx,
      "😀前文<color=#00ff00>提升10%/60%</color>，全隊獲得<color=#ff0000>500/1500</color>點。",
      20,
      30,
      80,
      "sans-serif",
    );
    expect(new Set(drawn.map((glyph) => glyph.y)).size).toBeGreaterThan(2);
    expect(
      drawn
        .filter((glyph) => glyph.color === "#00ff00")
        .map((glyph) => glyph.char)
        .join(""),
    ).toBe("提升10%/60%");
    expect(
      drawn
        .filter((glyph) => glyph.color === "#ff0000")
        .map((glyph) => glyph.char)
        .join(""),
    ).toBe("500/1500");
  });

  it("keeps nested colors across explicit and escaped newlines", () => {
    const { ctx, drawn } = recordingContext();
    drawBuffText(
      ctx,
      "<color=#00ff00>甲\\n<color=#ff0000>乙</color>\n丙</color>丁",
      0,
      20,
      400,
      "sans-serif",
    );
    expect(drawn.map(({ char, color }) => [char, color])).toEqual([
      ["甲", "#00ff00"],
      ["乙", "#ff0000"],
      ["丙", "#00ff00"],
      ["丁", "#E3E3E3"],
    ]);
  });

  it.each([40, 80, 400, 1340])(
    "measures the actual drawn lines within width %i",
    (width) => {
      const { ctx, drawn } = recordingContext();
      const text =
        "· 代理人的傷害提升20%，<color=#00ff00>提升10%/60%</color>。\n\n" +
        "重複文字，最後標點！".repeat(12);
      const height = estimateTextHeight(ctx, text, width, "sans-serif");
      drawBuffText(ctx, text, 20, 62.5, width, "sans-serif");
      for (const glyph of drawn) {
        expect(glyph.x).toBeGreaterThanOrEqual(20);
        expect(glyph.x + glyph.width).toBeLessThanOrEqual(20 + width + 0.001);
      }
      expect(Math.max(...drawn.map((glyph) => glyph.y)) - 62.5 + 18).toBe(
        height,
      );
      // The card reserves 70px for its heading and vertical padding.
      expect(Math.max(...drawn.map((glyph) => glyph.y)) + 18).toBeLessThan(
        height + 70,
      );
    },
  );

  it("restores the caller's canvas styles", () => {
    const { ctx } = recordingContext();
    ctx.font = "24px serif";
    ctx.fillStyle = "#123456";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    estimateTextHeight(ctx, "測試", 400, "sans-serif");
    drawBuffText(ctx, "測試", 0, 20, 400, "sans-serif");
    expect(ctx.font).toBe("24px serif");
    expect(ctx.fillStyle).toBe("#123456");
    expect(ctx.textAlign).toBe("center");
    expect(ctx.textBaseline).toBe("middle");
  });
});
