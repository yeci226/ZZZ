import {
  collectEffectivePropertyIds,
  countEffectiveRolls,
  formatDriveDiscEnhancement,
  getCharacterEffectivePropertyNames,
  getCharacterEffectivePropertyIds,
  isCharacterEffectiveProperty,
  totalEffectiveRolls,
} from "../src/utilities/zzz/profileRolls.js";

const disc = (
  properties: Array<{
    system_id: number;
    valid: boolean;
    add: number;
  }>,
) => ({
  properties: properties.map((property) => ({
    ...property,
    property_id:
      property.system_id * 100 +
      (property.system_id === 121 && property.valid ? 2 : 3),
  })),
});

const remielleDiscs = [
  disc([
    { system_id: 121, valid: true, add: 0 },
    { system_id: 312, valid: true, add: 3 },
    { system_id: 131, valid: false, add: 0 },
    { system_id: 121, valid: false, add: 1 },
  ]),
  disc([
    { system_id: 312, valid: true, add: 2 },
    { system_id: 121, valid: true, add: 2 },
    { system_id: 131, valid: false, add: 0 },
    { system_id: 111, valid: false, add: 0 },
  ]),
  disc([
    { system_id: 201, valid: false, add: 0 },
    { system_id: 312, valid: true, add: 3 },
    { system_id: 121, valid: false, add: 0 },
    { system_id: 121, valid: true, add: 2 },
  ]),
  disc([
    { system_id: 121, valid: false, add: 1 },
    { system_id: 201, valid: false, add: 1 },
    { system_id: 121, valid: true, add: 2 },
    { system_id: 131, valid: false, add: 1 },
  ]),
  disc([
    { system_id: 312, valid: true, add: 3 },
    { system_id: 111, valid: false, add: 0 },
    { system_id: 121, valid: false, add: 0 },
    { system_id: 131, valid: false, add: 1 },
  ]),
  disc([
    { system_id: 121, valid: false, add: 0 },
    { system_id: 312, valid: true, add: 3 },
    { system_id: 111, valid: false, add: 1 },
    { system_id: 211, valid: false, add: 0 },
  ]),
];

describe("ZZZ 有效詞條分類", () => {
  it("固定攻擊與攻擊百分比共用 system_id 時不可互相標成有效", () => {
    const effectivePropertyIds = collectEffectivePropertyIds(remielleDiscs);

    expect([...effectivePropertyIds]).toEqual(
      expect.arrayContaining([12102, 31203]),
    );
    expect(
      remielleDiscs.map((item) =>
        countEffectiveRolls(item, effectivePropertyIds),
      ),
    ).toEqual([5, 6, 7, 3, 4, 4]);
    expect(totalEffectiveRolls(remielleDiscs)).toBe(29);
  });

  it("以 API 的 plan_effective_property_list 判定角色屬性與驅動盤詞條", () => {
    const character = {
      equip_plan_info: {
        plan_effective_property_list: [
          {
            id: 12102,
            name: "攻擊力",
            full_name: "攻擊力百分比",
            system_id: 121,
          },
          {
            id: 31203,
            name: "異常精通",
            full_name: "異常精通",
            system_id: 312,
          },
        ],
      },
    };

    expect(getCharacterEffectivePropertyNames(character)).toEqual(
      new Set(["攻擊力", "異常精通"]),
    );
    expect(
      isCharacterEffectiveProperty(character, { property_name: "攻擊力" }),
    ).toBe(true);
    expect(
      isCharacterEffectiveProperty(character, { property_name: "異常精通" }),
    ).toBe(true);
    expect(
      isCharacterEffectiveProperty(character, { property_name: "暴擊率" }),
    ).toBe(false);

    const discs = [
      disc([
        { system_id: 121, valid: true, add: 2 },
        { system_id: 312, valid: false, add: 1 },
        { system_id: 201, valid: true, add: 3 },
      ]),
    ];
    const effectivePropertyIds = getCharacterEffectivePropertyIds(
      character,
      discs,
    );
    expect([...effectivePropertyIds]).toEqual([12102, 31203]);
    expect(countEffectiveRolls(discs[0], effectivePropertyIds)).toBe(5);
  });

  it("沒有任何有效變體的屬性類別仍不應計分", () => {
    const effectivePropertyIds = collectEffectivePropertyIds(remielleDiscs);
    expect(effectivePropertyIds.has(11103)).toBe(false);
    expect(effectivePropertyIds.has(13103)).toBe(false);
    expect(effectivePropertyIds.has(20103)).toBe(false);
  });
});

describe("ZZZ 驅動盤副詞條強化次數", () => {
  it.each(["S", "A", "B"])("缺少 add 時從 %s 級詞條數值還原次數", (rarity) => {
    const scale = { S: 1, A: 2 / 3, B: 1 / 3 }[rarity]!;
    const item = {
      rarity,
      properties: [
        { property_id: 12102, base: `${12 * scale}%`, valid: true },
        {
          property_id: 12103,
          base: String(Math.round(57 * scale)),
          valid: false,
        },
      ],
    };
    expect(countEffectiveRolls(item, collectEffectivePropertyIds([item]))).toBe(
      4,
    );
  });

  it("完整與短 ID 格式應得到同樣的詞條數，生命固定值不可混入百分比", () => {
    const character = {
      equip_plan_info: {
        plan_effective_property_list: [{ id: 11102, system_id: 111 }],
      },
    };
    const long = {
      properties: [
        { property_id: 11102, system_id: 111, base: "9%", add: 2 },
        { property_id: 11103, system_id: 111, base: "336", add: 2 },
      ],
    };
    const short = {
      properties: long.properties.map((p) => ({ ...p, property_id: 1 })),
    };
    for (const item of [long, short]) {
      expect(
        countEffectiveRolls(
          item,
          getCharacterEffectivePropertyIds(character, [item]),
        ),
      ).toBe(3);
    }
  });

  it("沒有方案與精確 ID 時仍尊重每個詞條的 valid 標記", () => {
    const item = {
      properties: [
        { system_id: 121, valid: true, add: 2 },
        { system_id: 121, valid: false, add: 3 },
      ],
    };
    expect(totalEffectiveRolls([item])).toBe(3);
  });

  it("顯示 add 對應的額外強化次數", () => {
    expect(formatDriveDiscEnhancement(3)).toBe("+3");
    expect(formatDriveDiscEnhancement("2")).toBe("+2");
  });

  it("沒有額外強化時不顯示空的標記", () => {
    expect(formatDriveDiscEnhancement(0)).toBe("");
    expect(formatDriveDiscEnhancement(undefined)).toBe("");
  });
});
