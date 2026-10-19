import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import {
  DISC_SUBSTAT_STYLE,
  discEnhancementCount,
  getDiscSubstatLayout,
} from "../src/utilities/zzz/profileDiscEnhancement.js";

it.each([0, 1, 2, 3, 4, 5])(
  "represents %s additional upgrades without counting the initial stat",
  (count) => {
    const layout = getDiscSubstatLayout(25, 474, 0, count);
    expect(layout.dots).toHaveLength(count);
    expect(discEnhancementCount(String(count))).toBe(count);
    if (count)
      expect(layout.dots[0].x - layout.dots[0].radius).toBe(layout.value.x);
  },
);
it.each([undefined, null, "", NaN, Infinity, -1, 1.5, 6, "bad", true, {}])(
  "does not draw invalid count %s",
  (value) => {
    expect(getDiscSubstatLayout(25, 474, 0, value).dots).toEqual([]);
  },
);
it("keeps full-size values and five dots inside every column, clear of dividers and the next row", () => {
  GlobalFonts.registerFromPath("src/assets/Nunito-BlackItalic.ttf", "Nunito");
  const ctx = createCanvas(1, 1).getContext("2d");
  ctx.font = `900 italic ${DISC_SUBSTAT_STYLE.fontSize}px Nunito`;
  expect(DISC_SUBSTAT_STYLE.fontSize).toBe(14.5);
  for (let disc = 0; disc < 6; disc++)
    for (let sub = 0; sub < 4; sub++) {
      const discX = 25 + disc * 160;
      const layout = getDiscSubstatLayout(discX, 474, sub, 5);
      const columnX = discX + (sub % 2) * 75;
      for (const value of ["4.8%", "14.4%", "28.8%", "224"]) {
        const metric = ctx.measureText(value);
        expect(layout.value.x + metric.actualBoundingBoxRight).toBeLessThan(
          columnX + 75,
        );
      }
      const last = layout.dots[4];
      expect(last.x + last.radius).toBeLessThan(columnX + 75);
      expect(last.x + last.radius).toBeLessThan(discX + 155);
      expect(last.y - last.radius).toBeGreaterThan(layout.value.y);
      expect(last.y + last.radius).toBeLessThan(layout.icon.y + 32);
    }
});
