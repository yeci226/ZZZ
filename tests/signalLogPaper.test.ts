import { createCanvas } from "@napi-rs/canvas";
import { getZzzOfficialFont } from "../src/utilities/zzz/canvasFonts.js";
import {
  createScaledCanvas,
  drawPityPill,
  drawUpTag,
  localeText,
  pityTone,
  prepareSCard,
  progressColor,
  fitWithFont,
  OUTPUT_SCALE,
  WIDTH,
} from "../src/utilities/zzz/signalLogPaper.js";

describe("signal log paper primitives", () => {
  it("uses a 1000-wide canvas at twice the output scale", () => {
    expect(WIDTH).toBe(1000);
    expect(OUTPUT_SCALE).toBe(2);
    expect(createScaledCanvas(10).canvas.width).toBe(2000);
  });

  it("fits long titles within their width", () => {
    const { ctx } = createScaledCanvas(10);
    const fitted = fitWithFont(ctx, "很長的卡池名稱".repeat(10), 300, 32);
    ctx.font = `32px ${getZzzOfficialFont("tw")}`;
    expect(ctx.measureText(fitted).width).toBeLessThanOrEqual(300);
  });
});

describe("signal log shared primitives", () => {
  it("uses the new tone thresholds", () => {
    expect([75, 76, 52, 53, 1].map((position) => pityTone(position, 90))).toEqual(["#c9870f", "#d9473b", "#2f8f6f", "#c9870f", "#2f8f6f"]);
    expect(pityTone(null, 90)).toBe("#817a75");
    expect(progressColor(80, 90)).toBe("#d9473b");
  });

  it("shrinks or truncates text to the given width in the drawing locale", () => {
    const ctx = createCanvas(400, 100).getContext("2d");
    expect(localeText(ctx, "fr", "Résonance Amplificateur exclusive très longue", 0, 20, 30, "#000", { maxWidth: 120 })).toBeLessThanOrEqual(120);
  });

  it("draws untouched at the given size when maxWidth is omitted", () => {
    const ctx = createCanvas(400, 100).getContext("2d");
    expect(localeText(ctx, "tw", "短", 0, 20, 30, "#000")).toBeGreaterThan(0);
    expect(ctx.font).toContain("30px");
  });

  it("draws the UP tag and pity pill without throwing", () => {
    const ctx = createCanvas(200, 100).getContext("2d");
    expect(() => { drawUpTag(ctx, 100, 10, 12); drawPityPill(ctx, 10, 40, 40, 24, "77", "#d9473b"); }).not.toThrow();
  });

  it("prepares an S card from an entry", async () => {
    const card = await prepareSCard({ itemId: "1091", kind: "character" });
    expect(card).toMatchObject({ kind: "character", item: { id: "1091", rarity: "S" } });
  });
});
