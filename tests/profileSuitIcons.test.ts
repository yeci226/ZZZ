import { buildFlatSuitIconMap } from "../src/utilities/zzz/profileSuitIcons.js";

describe("單角色頁官方平面驅動盤映射", () => {
  it("將套裝ID映射到IconSuit而不是立體ItemSuit", () => {
    const rows = [
      {
        suitId: 31000,
        icon: "UI/Sprite/A1DynamicLoad/IconSuit/UnPacker/SuitWoodpeckerElectro.png",
      },
      {
        suitId: 31300,
        icon: "UI/Sprite/A1DynamicLoad/IconSuit/UnPacker/SuitFreedomBlues.png",
      },
      {
        suitId: 34100,
        icon: "UI/Sprite/A1DynamicLoad/IconSuit/UnPacker/SuitFeatheredFate.png",
      },
    ];

    expect(buildFlatSuitIconMap(rows)).toEqual({
      "31000": "https://static.nanoka.cc/assets/zzz/SuitWoodpeckerElectro.webp",
      "31300": "https://static.nanoka.cc/assets/zzz/SuitFreedomBlues.webp",
      "34100": "https://static.nanoka.cc/assets/zzz/SuitFeatheredFate.webp",
    });
  });
});
