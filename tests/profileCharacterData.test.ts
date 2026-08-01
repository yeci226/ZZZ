import { unwrapProfileCharacter } from "../src/utilities/zzz/profileData.js";

describe("ZZZ 單角色資料解包", () => {
  it("應從 record.character() 回傳的陣列取出完整角色資料與影畫", () => {
    expect(
      unwrapProfileCharacter([
        { id: 1091, name_mi18n: "雅", level: 60, rank: 2 },
      ]),
    ).toEqual({ id: 1091, name_mi18n: "雅", level: 60, rank: 2 });
  });

  it("空陣列或空結果應回傳 null", () => {
    expect(unwrapProfileCharacter([])).toBeNull();
    expect(unwrapProfileCharacter(null)).toBeNull();
  });
});
