import { createCanvas } from "@napi-rs/canvas";
import { getZzzOfficialNumberFont } from "../src/utilities/zzz/canvasFonts.js";
import { cycleTrackCells } from "../src/utilities/zzz/signalLogCycles.js";
import { fittedNumberSize, gtCardKind, itemIcon } from "../src/utilities/zzz/signalLogPaper.js";

describe("signal log drawing helpers", () => {
  it("shrinks oversized information values instead of letting them reach a divider", () => {
    const ctx = createCanvas(400, 100).getContext("2d");
    const value = "999,999,999,999,999";
    const size = fittedNumberSize(ctx, value, 154, 30);
    expect(size).toBeLessThan(30);
    ctx.font = `${size}px ${getZzzOfficialNumberFont("tw")}`;
    expect(ctx.measureText(value).width).toBeLessThanOrEqual(154);
  });

  it("maps official item URLs", () => {
    expect(itemIcon({ itemId: "1021" } as any)).toContain("role_square_avatar_1021.png");
    expect(itemIcon({ itemId: "" } as any)).toBe("");
  });

  it("selects the correct shared GtCard kind without inventing unknown metadata", () => {
    expect(gtCardKind("代理人", "1091")).toBe("character");
    expect(gtCardKind("音擎", "12001")).toBe("weapon");
    expect(gtCardKind("邦布", "50001")).toBe("bangboo");
    expect(gtCardKind("", "not-an-id")).toBe("unknown");
  });
});

describe("pity cycle track cells", () => {
  const sRecord = { itemId: "1091", itemType: "代理人", rarity: "S" } as any;

  it("maps a cycle onto exactly hardPity track cells", () => {
    const cells = cycleTrackCells({ length: 5, aPositions: [3], sRecord, lost: false, partial: false, unknownPulls: 0 }, 80);
    expect(cells).toHaveLength(80);
    expect(cells.slice(0, 6)).toEqual(["b", "b", "a", "b", "s", "empty"]);
  });

  it("leaves pulls before the archive empty instead of drawing them as B", () => {
    expect(cycleTrackCells({ length: 5, aPositions: [4], sRecord, lost: false, partial: true, unknownPulls: 2 }, 90).slice(0, 6))
      .toEqual(["empty", "empty", "b", "a", "s", "empty"]);
  });

  it("marks in-progress cells as current", () => {
    expect(cycleTrackCells({ length: 2, aPositions: [], sRecord: null, lost: false, partial: false, unknownPulls: 0 }, 90).slice(0, 3))
      .toEqual(["current", "current", "empty"]);
  });

  it("clamps cycles longer than hardPity without overflowing", () => {
    const cells = cycleTrackCells({ length: 95, aPositions: [], sRecord, lost: false, partial: true, unknownPulls: 0 }, 90);
    expect(cells).toHaveLength(90);
    expect(cells.at(-1)).toBe("s");
  });
});
