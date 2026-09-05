import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  drawGtCard,
  drawMindscapeBadge,
  GT_CARD_COMPACT_SIZE,
  GT_CARD_OVERLAY,
  GT_CARD_PC_SIZE,
  GT_CARD_WEAPON_LINE_COLORS,
  loadGtCardAssets,
  mindscapeBadgeRect,
  originalRatioPlacement,
} from "../src/utilities/zzz/gtCardRenderer.js";

describe("shared official GtCard renderer", () => {
  it("uses the Deadly Assault mindscape badge for ranks 1 through 6", () => {
    expect(mindscapeBadgeRect(10, 20, 68, 0)).toBeNull();
    expect(
      [1, 3, 6].map((rank) => mindscapeBadgeRect(10, 20, 68, rank)?.value),
    ).toEqual([1, 3, 6]);

    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext("2d");
    expect(drawMindscapeBadge(ctx, 3, 10, 20, 68, "EN")).toMatchObject({
      x: 59,
      y: 18,
      width: 21,
      height: 21,
      value: 3,
    });
    expect(Array.from(ctx.getImageData(60, 20, 1, 1).data)[3]).toBeGreaterThan(
      0,
    );
  });

  it("is pixel-identical to the previous Deadly Assault badge geometry", () => {
    const legacyBadge = (rank: number) => {
      const canvas = createCanvas(100, 100);
      const ctx = canvas.getContext("2d");
      const x = 10;
      const y = 20;
      const avatarSize = 74;
      const badgeSize = Math.max(18, Math.round(avatarSize * 0.31));
      const badgeX = x + avatarSize - badgeSize + 2;
      const badgeY = y - 2;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, 6);
      ctx.fillStyle = "rgba(12,12,15,0.92)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.52)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold ${Math.max(12, Math.round(badgeSize * 0.62))}px EN`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        String(rank),
        badgeX + badgeSize / 2,
        badgeY + badgeSize / 2,
      );
      return ctx.getImageData(0, 0, 100, 100).data;
    };

    for (const rank of [1, 3, 6]) {
      const canvas = createCanvas(100, 100);
      const ctx = canvas.getContext("2d");
      drawMindscapeBadge(ctx, rank, 10, 20, 74, "EN");
      expect(Buffer.from(ctx.getImageData(0, 0, 100, 100).data)).toEqual(
        Buffer.from(legacyBadge(rank)),
      );
    }
  });

  it("keeps the official 48px geometry while supporting 76px and 152px output", async () => {
    expect(GT_CARD_PC_SIZE).toBe(48);
    expect(GT_CARD_COMPACT_SIZE).toBe(76);
    expect(GT_CARD_OVERLAY.avatarSize).toBe(42);
    const assets = await loadGtCardAssets();
    const canvas = createCanvas(240, 170);
    const ctx = canvas.getContext("2d");
    const item = { id: "unknown", rarity: "S" as const };

    expect(() =>
      drawGtCard(
        ctx,
        item,
        "unknown",
        0,
        0,
        76,
        {
          art: null,
          element: null,
          profession: null,
        },
        assets,
      ),
    ).not.toThrow();
    expect(() =>
      drawGtCard(
        ctx,
        item,
        "unknown",
        84,
        0,
        152,
        {
          art: null,
          element: null,
          profession: null,
        },
        assets,
      ),
    ).not.toThrow();

    const image = await loadImage(canvas.toBuffer("image/png"));
    expect(image.width).toBe(240);
    expect(image.height).toBe(170);
  });

  it("preserves source aspect ratios for agent cropping and equipment placement", () => {
    const agent = originalRatioPlacement(152, 186, 42, 42, "width");
    expect(agent?.x).toBe(0);
    expect(agent?.y).toBe(0);
    expect(agent?.width).toBeCloseTo(42);
    expect(agent?.height).toBeCloseTo(186 * (42 / 152));

    const equipment = originalRatioPlacement(400, 300, 42, 42, "contain");
    expect(equipment?.width).toBeCloseTo(42);
    expect(equipment?.height).toBeCloseTo(31.5);
    expect(equipment?.y).toBeCloseTo(5.25);
  });

  it("anchors rank and optional metadata inside the artwork", () => {
    expect(GT_CARD_OVERLAY.agentRarityX).toBeLessThan(GT_CARD_OVERLAY.avatarX);
    expect(GT_CARD_OVERLAY.weaponLineX).toBe(GT_CARD_OVERLAY.avatarX);
    expect(GT_CARD_OVERLAY.weaponLineWidth).toBe(GT_CARD_OVERLAY.avatarSize);
    expect(GT_CARD_OVERLAY.weaponLineHeight).toBe(2);
  });

  it("draws every weapon rarity line with the shared programmatic geometry", async () => {
    const emptyAssets = {
      generic: null,
      cardPattern: null,
      rarityCorner: null,
      rarity: { S: null, A: null, B: null },
    };
    const pixelFor = (
      kind: "weapon" | "character" | "bangboo",
      rarity: "S" | "A" | "B",
    ) => {
      const canvas = createCanvas(48, 48);
      const ctx = canvas.getContext("2d");
      drawGtCard(
        ctx,
        { id: "12001", rarity },
        kind,
        0,
        0,
        48,
        {
          art: null,
          element: null,
          profession: null,
        },
        emptyAssets,
      );
      return Array.from(ctx.getImageData(24, 44, 1, 1).data);
    };

    expect(GT_CARD_WEAPON_LINE_COLORS).toEqual({
      S: "#ffb500",
      A: "#e900ff",
      B: "#20c7f4",
    });
    expect(pixelFor("weapon", "S")).toEqual([255, 181, 0, 255]);
    expect(pixelFor("weapon", "A")).toEqual([233, 0, 255, 255]);
    expect(pixelFor("weapon", "B")).toEqual([32, 199, 244, 255]);
    expect(pixelFor("character", "B")).not.toEqual([32, 199, 244, 255]);
    expect(pixelFor("bangboo", "B")).not.toEqual([32, 199, 244, 255]);

    const assets = await loadGtCardAssets();
    expect(assets.rarity.B).not.toBeNull();

    const markerCanvas = createCanvas(2, 2);
    const markerContext = markerCanvas.getContext("2d");
    markerContext.fillStyle = "#ff0000";
    markerContext.fillRect(0, 0, 2, 2);
    const marker = await loadImage(markerCanvas.toBuffer("image/png"));
    const markedAssets = {
      ...emptyAssets,
      rarity: { S: marker, A: marker, B: marker },
    };
    const metadata = { art: null, element: marker, profession: marker };
    const overlayPixel = (kind: "weapon" | "character") => {
      const canvas = createCanvas(48, 48);
      const ctx = canvas.getContext("2d");
      drawGtCard(
        ctx,
        { id: "12001", rarity: "B" },
        kind,
        0,
        0,
        48,
        metadata,
        markedAssets,
      );
      return {
        corner: Array.from(ctx.getImageData(6, 6, 1, 1).data),
        metadata: Array.from(ctx.getImageData(10, 24, 1, 1).data),
      };
    };

    expect(overlayPixel("weapon").corner).not.toEqual([255, 0, 0, 255]);
    expect(overlayPixel("character").corner).toEqual([255, 0, 0, 255]);
    expect(overlayPixel("character").metadata).not.toEqual([255, 0, 0, 255]);
  });
});
