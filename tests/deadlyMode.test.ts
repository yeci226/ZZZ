import {
  buildDeadlyModeCustomId,
  buildDeadlyModeSelectData,
  getDeadlyModeBattle,
  getDeadlyModeLabels,
  hasDeadlyExtremeMode,
  parseDeadlyModeCustomId,
} from "../src/utilities/zzz/deadlyMode.js";

const normalOne = { score: 101, boss: [{ name: "一般首領甲" }] };
const normalTwo = { score: 202, boss: [{ name: "一般首領乙" }] };
const extremeOne = { score: 999, boss: [{ name: "絕境大首領" }] };
const ignoredExtreme = { score: 888, boss: [{ name: "不應顯示" }] };

describe("危局強襲戰模式選擇", () => {
  it("只有 API 明確 has_hard 且 hard_list 非空才提供絕境模式", () => {
    expect(
      hasDeadlyExtremeMode({ has_hard: true, hard_list: [extremeOne] }),
    ).toBe(true);
    expect(
      hasDeadlyExtremeMode({ has_hard: false, hard_list: [extremeOne] }),
    ).toBe(false);
    expect(hasDeadlyExtremeMode({ hard_list: [extremeOne] })).toBe(false);
    expect(hasDeadlyExtremeMode({ has_hard: true, hard_list: [] })).toBe(false);
  });

  it("一般模式只保留原本 list，多關資料不會混入 hard_list", () => {
    const data = {
      list: [normalOne, normalTwo],
      has_hard: true,
      hard_list: [extremeOne, ignoredExtreme],
    };

    expect(getDeadlyModeBattle(data, "normal")).toEqual({
      mode: "normal",
      battles: [normalOne, normalTwo],
    });
  });

  it("絕境模式只取 hard_list[0] 的單一大首領關卡", () => {
    const data = {
      list: [normalOne, normalTwo],
      has_hard: true,
      hard_list: [extremeOne, ignoredExtreme],
    };

    expect(getDeadlyModeBattle(data, "extreme")).toEqual({
      mode: "extreme",
      battle: extremeOne,
    });
  });

  it("絕境資料失效時安全退回一般模式", () => {
    expect(
      getDeadlyModeBattle(
        { list: [normalOne], has_hard: false, hard_list: [] },
        "extreme",
      ),
    ).toEqual({ mode: "normal", battles: [normalOne] });
  });

  it("customId 可在重啟後還原擁有者、目標、帳號與期別", () => {
    const customId = buildDeadlyModeCustomId({
      ownerId: "123456789012345678",
      targetUserId: "987654321098765432",
      accountIndex: 2,
      schedule: 1,
    });

    expect(customId.length).toBeLessThanOrEqual(100);
    expect(parseDeadlyModeCustomId(customId)).toEqual({
      ownerId: "123456789012345678",
      targetUserId: "987654321098765432",
      accountIndex: 2,
      schedule: 1,
    });
    expect(parseDeadlyModeCustomId("deadly-mode:broken")).toBeNull();
  });

  it("繁中選單與 Canvas 標籤不含英文", () => {
    expect(getDeadlyModeLabels("tw")).toEqual({
      placeholder: "切換危局強襲戰模式",
      normal: "一般模式",
      extreme: "絕境模式",
      score: "分數",
      stars: "星數",
      clearTime: "過關時刻",
      team: "出戰隊伍",
      bangboo: "邦布",
      weakness: "弱點",
      buff: "增益效果",
    });
    expect(getDeadlyModeLabels("en").extreme).toBe("Extreme Mode");
  });

  it("只有有絕境資料時建立繁中模式選單，並標示目前模式", () => {
    const context = {
      ownerId: "123456789012345678",
      targetUserId: "987654321098765432",
      accountIndex: 0,
      schedule: 2,
    };
    expect(
      buildDeadlyModeSelectData(
        "tw",
        { has_hard: false, hard_list: [extremeOne] },
        "normal",
        context,
      ),
    ).toBeNull();

    const menu = buildDeadlyModeSelectData(
      "tw",
      { has_hard: true, hard_list: [extremeOne] },
      "extreme",
      context,
    );
    expect(menu?.placeholder).toBe("切換危局強襲戰模式");
    expect(menu?.options).toEqual([
      expect.objectContaining({
        label: "一般模式",
        value: "normal",
        default: false,
      }),
      expect.objectContaining({
        label: "絕境模式",
        value: "extreme",
        default: true,
      }),
    ]);
  });
});
