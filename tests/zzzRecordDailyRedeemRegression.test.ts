import {
  formatBattleRecordDate,
  formatBattleRecordTime,
  getClearTimeLabel,
  getDeadlyAssaultModeLabel,
  isDeadlyAssaultExtremeMode,
} from "../src/utilities/zzz/recordDisplay.js";
import {
  buildDailySignInPresentation,
  normalizeSuccessfulDailyClaimInfo,
} from "../src/utilities/zzz/dailyPresentation.js";
import {
  calculateRedeemCardLayout,
  getRedeemStatusPresentation,
} from "../src/utilities/zzz/redeemLayout.js";

const challengeTime = {
  year: 2026,
  month: 7,
  day: 30,
  hour: 18,
  minute: 6,
  second: 45,
};

describe("ZZZ 戰績時間顯示", () => {
  it("以 API challenge_time 顯示繁中通關時刻，不再把缺少的 battle_time 當成 0:00", () => {
    expect(formatBattleRecordTime(challengeTime, 0, "tw")).toBe(
      "2026年7月30日 18:06:45",
    );
    expect(formatBattleRecordTime(undefined, 0, "tw")).toBeNull();
  });

  it("英文 locale 保持英文日期格式", () => {
    expect(formatBattleRecordTime(challengeTime, 0, "en")).toBe(
      "Jul 30, 2026 18:06:45",
    );
  });

  it("通關時間標籤在繁中介面不會退回英文 key", () => {
    expect(getClearTimeLabel("tw")).toBe("過關時刻");
    expect(getClearTimeLabel("en")).toBe("Clear Time");
  });

  it("繁中介面的活動日期不會退回英文月份", () => {
    expect(formatBattleRecordDate({ month: 7, day: 31 }, "tw")).toBe("7月31日");
    expect(formatBattleRecordDate({ month: 7, day: 31 }, "en")).toBe("Jul 31");
  });

  it("只有舊 payload 提供正數 battle_time 時才顯示耗時", () => {
    expect(formatBattleRecordTime(undefined, 125, "tw")).toBe("02:05");
    expect(formatBattleRecordTime(undefined, -1, "tw")).toBeNull();
  });
});

describe("危局強襲戰絕境模式", () => {
  it("依官方 API 的 has_hard 與 hard_list 辨識，不誤把一般模式分數當成絕境模式", () => {
    expect(
      isDeadlyAssaultExtremeMode({
        has_hard: true,
        hard_list: [{ score: 100 }],
        room_max_score: 65000,
        total_max_score: 195000,
        list: [{ score: 100 }, { score: 200 }],
      }),
    ).toBe(true);
    expect(
      isDeadlyAssaultExtremeMode({
        has_hard: false,
        hard_list: [],
        room_max_score: 65000,
        total_max_score: 195000,
        list: [{ score: 100 }, { score: 200 }, { score: 300 }],
      }),
    ).toBe(false);
  });

  it("模式名稱依 locale 顯示", () => {
    expect(getDeadlyAssaultModeLabel("tw")).toBe("絕境模式");
    expect(getDeadlyAssaultModeLabel("cn")).toBe("绝境模式");
    expect(getDeadlyAssaultModeLabel("en")).toBe("Extreme Mode");
  });
});

describe("簽到後即時資料正規化", () => {
  it("成功簽到後 API 暫時回傳舊天數時，至少計入本次簽到", () => {
    const normalized = normalizeSuccessfulDailyClaimInfo(
      {
        total_sign_day: 0,
        is_sign: false,
      },
      {
        total_sign_day: 0,
        is_sign: true,
        sign_cnt_missed: 0,
      },
    );

    const result = buildDailySignInPresentation(
      normalized,
      [{ name: "第一天" }, { name: "第二天" }],
    );

    expect(normalized.total_sign_day).toBe(1);
    expect(normalized.is_sign).toBe(true);
    expect(result.signedDays).toBe(1);
    expect(result.todayReward).toEqual({ name: "第一天" });
    expect(result.tomorrowReward).toEqual({ name: "第二天" });
  });

  it("API 已回傳較新的天數時不覆寫官方值", () => {
    const normalized = normalizeSuccessfulDailyClaimInfo(
      { total_sign_day: 7, is_sign: false },
      { total_sign_day: 8, is_sign: true },
    );

    expect(normalized.total_sign_day).toBe(8);
    expect(normalized.is_sign).toBe(true);
  });
});

describe("31 日簽到資料", () => {
  const awards = Array.from({ length: 31 }, (_, index) => ({
    name: `第 ${index + 1} 天`,
  }));

  it("以 total_sign_day=31 顯示 31 天，並取零起算陣列的第 31 個獎勵", () => {
    const result = buildDailySignInPresentation(
      {
        total_sign_day: 31,
        short_sign_day: 0,
        sign_cnt_missed: 0,
        today: "2026-07-31",
        month_last_day: true,
      },
      awards,
    );

    expect(result.signedDays).toBe(31);
    expect(result.todayReward).toEqual({ name: "第 31 天" });
    expect(result.tomorrowReward).toBeUndefined();
    expect(result.missedDays).toBe(0);
    expect(result.daysInMonth).toBe(31);
  });
});

describe("自動兌換版面", () => {
  it("每個兌換碼固定一列，更多兌換碼會增加帳號區塊與畫布高度", () => {
    const oneCode = calculateRedeemCardLayout([1]);
    const threeCodes = calculateRedeemCardLayout([3]);
    expect(oneCode.rowHeight).toBeGreaterThanOrEqual(80);
    expect(threeCodes.accountHeights[0]).toBeGreaterThan(oneCode.accountHeights[0]);
    expect(threeCodes.canvasHeight).toBeGreaterThan(oneCode.canvasHeight);
  });

  it("每種結果都有簡短且不同的狀態文字", () => {
    expect(getRedeemStatusPresentation("success").label).toBe("兌換成功");
    expect(getRedeemStatusPresentation("already_claimed").label).toBe("已兌換");
    expect(getRedeemStatusPresentation("invalid").label).toBe("兌換碼無效");
    expect(getRedeemStatusPresentation("failed").label).toBe("兌換失敗");
  });
});
