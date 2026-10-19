import { layoutPosts } from "../src/utilities/interknot/feedRenderer.js";

describe("interknot masonry layout", () => {
  it("uses the measured in-game columns and first row", () => {
    const { boxes } = layoutPosts([300, 300, 300, 300, 300, 100]);
    expect(boxes.slice(0, 5).map((b) => b.x)).toEqual([93, 446, 800, 1154, 1507]);
    expect(boxes.slice(0, 5).every((b) => b.y === 208)).toBe(true);
    expect(boxes[5]).toEqual({ x: 93, y: 208 + 300 + 26, h: 100 });
  });

  it("places each post under the shortest column", () => {
    const { boxes, bottom } = layoutPosts([100, 300, 200, 150, 250, 50]);
    expect(boxes[5]).toEqual({ x: 93, y: 208 + 100 + 26, h: 50 });
    expect(bottom).toBe(208 + 300);
  });

  it("handles an empty feed", () => {
    expect(layoutPosts([])).toEqual({ boxes: [], bottom: 208 });
  });
});
