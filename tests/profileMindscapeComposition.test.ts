import {
  getMindscapeComposition,
  getPaintingSelectionRank,
} from "../src/utilities/zzz/mindscapeComposition.js";

describe("單角色影畫立繪目線", () => {
  it.each([
    [0, { baseIndex: 0 }],
    [1, { baseIndex: 0, overlayIndex: 1, clip: "face-fan" }],
    [2, { baseIndex: 0, overlayIndex: 1, clip: "stage-two-side" }],
    [3, { baseIndex: 1 }],
    [4, { baseIndex: 1, overlayIndex: 2, clip: "face-fan" }],
    [5, { baseIndex: 1, overlayIndex: 2, clip: "stage-two-side" }],
    [6, { baseIndex: 2 }],
  ])("影畫 %i 使用與多角色卡相同的分段合成", (rank, expected) => {
    expect(getMindscapeComposition(rank)).toEqual(expected);
  });

  it("異常影畫值會安全限制在 0 至 6", () => {
    expect(getMindscapeComposition(-1)).toEqual({ baseIndex: 0 });
    expect(getMindscapeComposition(99)).toEqual({ baseIndex: 2 });
  });

  it("關閉依影畫展示時應使用完整 6 畫，而不是 0 畫", () => {
    expect(getPaintingSelectionRank(2, false)).toBe(6);
    expect(getPaintingSelectionRank(6, false)).toBe(6);
    expect(getPaintingSelectionRank(2, true)).toBe(2);
  });
});
