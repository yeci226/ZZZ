import {
  ELEMENT_ICON_BY_TYPE,
  ELEMENT_ICON_FILE_BY_TYPE,
  ELEMENT_TYPES,
  SPECIAL_ELEMENT_BY_CHARACTER_ID,
  getElementEmojiKey,
  getElementIconPath,
} from "../src/utilities/zzz/elements.js";

describe("ZZZ 屬性圖示映射", () => {
  it("分別支援 Wind 204 與 Lumen 300", () => {
    expect(ELEMENT_ICON_BY_TYPE[204]).toBe("wind");
    expect(ELEMENT_ICON_BY_TYPE[300]).toBe("lumen");
    expect(ELEMENT_ICON_FILE_BY_TYPE[204]).toBe("wind.png");
    expect(ELEMENT_ICON_FILE_BY_TYPE[300]).toBe("lumen.png");
    expect(getElementIconPath(204)).toBe(
      "./src/assets/images/icons/element/wind.png",
    );
    expect(getElementIconPath(300)).toBe(
      "./src/assets/images/icons/element/lumen.png",
    );
    expect(ELEMENT_TYPES).toEqual(expect.arrayContaining([204, 300]));
  });

  it("特殊角色使用專屬元素 emoji key", () => {
    expect(SPECIAL_ELEMENT_BY_CHARACTER_ID).toEqual({
      "1091": "frost",
      "1371": "auricink",
      "1431": "honededge",
    });
    expect(getElementEmojiKey(202, 1091)).toBe("frost");
    expect(getElementEmojiKey(205, 1371)).toBe("auricink");
    expect(getElementEmojiKey(200, 1431)).toBe("honededge");
    expect(getElementEmojiKey(204, 9999)).toBe("wind");
    expect(getElementEmojiKey(300, 9999)).toBe("lumen");
  });
});
