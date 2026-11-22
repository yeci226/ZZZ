import fs from "fs";
import os from "os";
import path from "path";
import {
  findWikiIcons,
  getProfessionIconPath,
} from "../src/utilities/zzz/elements.js";

describe("HoYoWiki 屬性／特性圖示", () => {
  const filters = [
    {
      key: "agent_stats",
      values: [
        { enum_string: "physical", icon: "https://hoyo/physical.png" },
        { enum_string: "electric", icon: "\thttps://hoyo/electric.png" },
        { enum_string: "honed_edge", icon: "https://hoyo/honed.png" },
        { enum_string: "light", value: "流明", icon: "https://hoyo/light.png" },
        { enum_string: "blue_flame", icon: "https://hoyo/new.png" },
        { enum_string: "", value: "無代號", icon: "https://hoyo/x.png" },
      ],
    },
    {
      key: "agent_specialties",
      values: [
        { enum_string: "breakthrough", icon: "https://hoyo/stun.png" },
        { enum_string: "defensive", icon: "https://hoyo/def.png" },
        { enum_string: "armero", icon: "https://hoyo/armero.png" },
      ],
    },
    { key: "agent_faction", values: [{ enum_string: "a", icon: "https://x" }] },
  ];

  it("把 Wiki 代號轉成本地檔名，未知代號沿用原名", () => {
    expect(findWikiIcons(filters)).toEqual({
      element: {
        physic: "https://hoyo/physical.png",
        thunder: "https://hoyo/electric.png",
        honededge: "https://hoyo/honed.png",
        lumen: "https://hoyo/light.png",
        blue_flame: "https://hoyo/new.png",
      },
      profession: {
        stun: "https://hoyo/stun.png",
        defense: "https://hoyo/def.png",
        armero: "https://hoyo/armero.png",
      },
    });
  });

  it("職業代碼 7 對應鋒御，並依實際存在的副檔名回傳路徑", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prof-"));
    fs.writeFileSync(`${dir}/armero.png`, "");
    fs.writeFileSync(`${dir}/attack.webp`, "");
    fs.writeFileSync(`${dir}/attack.png`, "");

    expect(getProfessionIconPath(7, ["webp", "png"], dir)).toBe(
      `${dir}/armero.png`,
    );
    expect(getProfessionIconPath(1, ["webp", "png"], dir)).toBe(
      `${dir}/attack.webp`,
    );
    expect(getProfessionIconPath("1", ["png", "webp"], dir)).toBe(
      `${dir}/attack.png`,
    );
    expect(getProfessionIconPath(99, ["webp"], dir)).toBeNull();
  });
});

describe("子屬性優先的屬性圖示查詢", () => {
  const {
    getElementIconName,
    getElementEmojiKey,
    registerIconCodes,
    resetGeneratedIconCodes,
    canonicalIconName,
  } = require("../src/utilities/zzz/elements.js");

  afterEach(() => resetGeneratedIconCodes());

  it("依 sub_element_type 判斷，不需要角色 ID", () => {
    expect(getElementIconName(202, 1)).toBe("frost");
    expect(getElementIconName(205, 2)).toBe("auricink");
    expect(getElementIconName(200, 4)).toBe("honededge");
    expect(getElementIconName(201, 5)).toBe("flare");
    expect(getElementIconName(201, 0)).toBe("fire");
  });

  it("缺少 sub_element_type 時退回角色 ID 對照", () => {
    expect(getElementIconName(202, undefined, 1091)).toBe("frost");
    expect(getElementIconName(202, null, "9999")).toBe("ice");
    expect(getElementEmojiKey(200, 1431)).toBe("honededge");
    expect(getElementEmojiKey(201, 9999, 5)).toBe("flare");
  });

  it("自動記錄新代碼，但不覆寫寫死的對照", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "codes-")), "c.json");
    expect(getElementIconName(203, 9)).toBe("thunder");
    expect(
      registerIconCodes("element", { "203_9": "spark", "202_1": "wrong" }, file),
    ).toBe(1);
    expect(getElementIconName(203, 9)).toBe("spark");
    expect(getElementIconName(202, 1)).toBe("frost");
    expect(JSON.parse(fs.readFileSync(file, "utf8")).element).toEqual({
      "203_9": "spark",
    });
  });

  it("計算機名稱轉為本地檔名", () => {
    expect(canonicalIconName("Fengyu")).toBe("armero");
    expect(canonicalIconName("light")).toBe("lumen");
    expect(canonicalIconName("flare")).toBe("flare");
  });
});
