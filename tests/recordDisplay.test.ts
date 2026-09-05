import {
  formatBattleRecordDate,
  formatBattleRecordTime,
  getClearTimeLabel,
  getDeadlyAssaultModeLabel,
} from "../src/utilities/zzz/recordDisplay.js";

describe("ZZZ record display locale policy", () => {
  const time = {
    year: 2026,
    month: 8,
    day: 1,
    hour: 2,
    minute: 3,
    second: 4,
  };

  it("keeps Traditional and Simplified Chinese labels", () => {
    expect(formatBattleRecordDate(time, "tw")).toBe("8月1日");
    expect(formatBattleRecordDate(time, "cn")).toBe("8月1日");
    expect(getClearTimeLabel("zh-tw")).toBe("過關時刻");
    expect(getClearTimeLabel("zh-cn")).toBe("过关时刻");
  });

  it("uses English for all other preview locales", () => {
    expect(formatBattleRecordDate(time, "ja-jp")).toBe("Aug 1");
    expect(formatBattleRecordTime(time, 0, "ko-kr")).toBe("Aug 1, 2026 02:03:04");
    expect(getClearTimeLabel("fr-fr")).toBe("Clear Time");
    expect(getDeadlyAssaultModeLabel("vi-vn")).toBe("Extreme Mode");
  });
});
