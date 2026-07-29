import {
  collectEffectiveSystemIds,
  countEffectiveRolls,
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

  it("沒有任何有效變體的屬性類別仍不應計分", () => {
    const effectiveSystemIds = collectEffectiveSystemIds(remielleDiscs);
    expect(effectiveSystemIds.has(111)).toBe(false);
    expect(effectiveSystemIds.has(131)).toBe(false);
    expect(effectiveSystemIds.has(201)).toBe(false);
  });
});
