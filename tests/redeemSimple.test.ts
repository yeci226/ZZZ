import fs from "node:fs";
import { ZZZ_REDEEM_BACKGROUND } from "../src/utilities/canvas/redeemCard.js";
import {
  calculateRedeemCardLayout,
  getFirstRedeemRewardIcon,
  getRedeemStatusPresentation,
  normalizeRedeemRewards,
} from "../src/utilities/zzz/redeemLayout.js";

describe("簡潔自動兌換卡", () => {
  it("使用本地塗鴉背景", () => {
    expect(ZZZ_REDEEM_BACKGROUND.endsWith("profileBgDark.png")).toBe(true);
    expect(fs.existsSync(ZZZ_REDEEM_BACKGROUND)).toBe(true);
  });

  it("每個兌換碼固定一列，更多兌換碼會增加高度", () => {
    const oneCode = calculateRedeemCardLayout([1]);
    const threeCodes = calculateRedeemCardLayout([3]);
    expect(oneCode.rowHeight).toBeGreaterThanOrEqual(80);
    expect(threeCodes.accountHeights[0]).toBeGreaterThan(oneCode.accountHeights[0]);
    expect(threeCodes.canvasHeight).toBeGreaterThan(oneCode.canvasHeight);
  });

  it("同時支援 API 的字串與陣列獎勵內容", () => {
    expect(normalizeRedeemRewards("菲林 ×60", "success")).toBe("菲林 ×60");
    expect(normalizeRedeemRewards(["菲林 ×60", "丁尼 ×20,000"], "success")).toBe(
      "菲林 ×60、丁尼 ×20,000",
    );
  });

  it("有獎勵圖示時只取第一張，沒有時自然省略", () => {
    expect(
      getFirstRedeemRewardIcon({ rewardIcons: ["https://example.com/first.png", "https://example.com/second.png"] }),
    ).toBe("https://example.com/first.png");
    expect(getFirstRedeemRewardIcon({ rewards: [{ icon: "reward.png" }] })).toBe(
      "reward.png",
    );
    expect(getFirstRedeemRewardIcon({ rewards: "菲林 ×60" })).toBeUndefined();
  });

  it("狀態只保留簡短文字，不再顯示統計區塊", () => {
    expect(getRedeemStatusPresentation("success").label).toBe("兌換成功");
    expect(getRedeemStatusPresentation("invalid").label).toBe("兌換碼無效");
  });
});
