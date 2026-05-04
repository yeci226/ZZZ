import { QuickDB } from "quick.db";
import Logger from "../utilities/core/logger.js";
import colors from "colors";

async function resetCookies() {
  const db = new QuickDB();
  const logger = new Logger("Cookie修復");

  logger.info("正在獲取所有自動簽到數據...");
  const autoDailyData = await db.get("autoDaily");
  if (!autoDailyData) {
    logger.error("找不到 autoDaily 數據，修復中止。");
    return;
  }

  const userIds = Object.keys(autoDailyData);
  let totalReset = 0;
  let totalUsers = 0;

  for (const userId of userIds) {
    const accountKey = `${userId}.account`;
    const accounts = await db.get(accountKey);

    if (!accounts || !Array.isArray(accounts)) continue;

    let userReset = false;
    for (let i = 0; i < accounts.length; i++) {
      if (accounts[i].invalid === true) {
        accounts[i].invalid = false;
        userReset = true;
        totalReset++;
      }
    }

    if (userReset) {
      await db.set(accountKey, accounts);
      logger.success(`已重置用戶 ${userId} 的失效標記`);
    }
    totalUsers++;
  }

  logger.success(
    `修復完成！共檢查了 ${totalUsers} 位用戶，重置了 ${totalReset} 個帳號的失效標記。`,
  );
}

resetCookies().catch((err) => {
  console.error(colors.red("執行腳本時發生錯誤:"), err);
});
