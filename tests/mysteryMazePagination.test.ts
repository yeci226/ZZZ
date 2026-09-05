import { encodeMysteryMazeContext, paginateMysteryMazeMaps, parseMysteryMazeContext } from "../src/utilities/zzz/mysteryMazeControls.js";

describe("Mystery Maze controls", () => {
  it("round-trips the map-choice page in component context", () => {
    const context = { invokerId: "1", targetId: "2", accountIndex: 3, page: 4, mapId: "5", difficulty: 2, mapPage: 6 };
    expect(parseMysteryMazeContext(encodeMysteryMazeContext("maze-map-page", context))).toEqual(context);
  });

  it("keeps every map reachable in 24-item selector pages", () => {
    const maps = Array.from({ length: 51 }, (_, id) => ({ id }));
    expect(paginateMysteryMazeMaps(maps, 0)).toMatchObject({ page: 0, pages: 3 });
    expect(paginateMysteryMazeMaps(maps, 1).items).toHaveLength(24);
    expect(paginateMysteryMazeMaps(maps, 99).items).toHaveLength(3);
  });
});
