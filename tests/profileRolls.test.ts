import {
  collectEffectiveSystemIds,
  countEffectiveRolls,
  formatDriveDiscEnhancement,
  getCharacterEffectivePropertyNames,
  getCharacterEffectiveSystemIds,
  isCharacterEffectiveProperty,
  totalEffectiveRolls,
} from "../src/utilities/zzz/profileRolls.js";

const disc = (
  properties: Array<{
    system_id: number;
    valid: boolean;
    add: number;
  }>,
) => ({ properties });

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
  it("同一 system_id 的固定攻擊與攻擊百分比應視為同類有效詞條", () => {
    const effectiveSystemIds = collectEffectiveSystemIds(remielleDiscs);

    expect([...effectiveSystemIds]).toEqual(expect.arrayContaining([121, 312]));
    expect(
      remielleDiscs.map((item) =>
        countEffectiveRolls(item, effectiveSystemIds),
      ),
    ).toEqual([7, 6, 8, 5, 5, 5]);
    expect(totalEffectiveRolls(remielleDiscs)).toBe(36);
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
        { system_id: 121, valid: false, add: 2 },
        { system_id: 312, valid: false, add: 1 },
        { system_id: 201, valid: true, add: 3 },
      ]),
    ];
    const effectiveSystemIds = getCharacterEffectiveSystemIds(
      character,
      discs,
    );
    expect([...effectiveSystemIds]).toEqual([121, 312]);
    expect(countEffectiveRolls(discs[0], effectiveSystemIds)).toBe(5);
  });

  it("沒有任何有效變體的屬性類別仍不應計分", () => {
    const effectiveSystemIds = collectEffectiveSystemIds(remielleDiscs);
    expect(effectiveSystemIds.has(111)).toBe(false);
    expect(effectiveSystemIds.has(131)).toBe(false);
    expect(effectiveSystemIds.has(201)).toBe(false);
  });
});

describe("ZZZ 驅動盤副詞條強化次數", () => {
  it("顯示 add 對應的額外強化次數", () => {
    expect(formatDriveDiscEnhancement(3)).toBe("+3");
    expect(formatDriveDiscEnhancement("2")).toBe("+2");
  });

  it("沒有額外強化時不顯示空的標記", () => {
    expect(formatDriveDiscEnhancement(0)).toBe("");
    expect(formatDriveDiscEnhancement(undefined)).toBe("");
  });
});
