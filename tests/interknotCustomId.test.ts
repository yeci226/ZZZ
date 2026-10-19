import { decodeIkId, encodeIkId, type IkState } from "../src/utilities/interknot/customId.js";

describe("interknot customId", () => {
  const full: IkState = {
    main: "guild",
    sub: "featured",
    page: 99,
    postId: 2147483647,
    cpage: 99,
    expanded: true,
    last: 2147483647,
  };

  it("round-trips a full state", () => {
    expect(decodeIkId(encodeIkId("detail", full))).toEqual({ action: "detail", state: full });
  });

  it("round-trips a minimal state without optional fields", () => {
    const s: IkState = { main: "all", sub: "all", page: 0 };
    expect(decodeIkId(encodeIkId("feed", s))).toEqual({ action: "feed", state: s });
  });

  it("stays within Discord's 100 character limit", () => {
    expect(encodeIkId("commentDelete", full).length).toBeLessThanOrEqual(100);
  });

  it("rejects foreign or malformed ids", () => {
    expect(decodeIkId("gsim:x")).toBeNull();
    expect(decodeIkId("ik:feed:zz")).toBeNull();
    expect(decodeIkId("ik:feed:all.nope.0")).toBeNull();
  });
});
