import { client } from "../index.js";
import { Events, ActivityType, Client } from "discord.js";
import Logger from "../utilities/core/logger.js";
import autoDailySign from "../utilities/zzz/autoDaily.js";
import autoRedeem from "../utilities/zzz/autoRedeem.js";
import { autoRefreshCookie } from "../utilities/utilities.js";
import schedule from "node-schedule";
import { refreshWallpapers } from "../utilities/zzz/wallpaperManager.js";
import { downloadAllWikiPaintings, downloadAllDiscIcons } from "../utilities/zzz/autoDownloadIcons.js";

let isRefreshingCookies = false;
let isAutoRedeemRunning = false;

async function updatePresence() {
  const results = await client.cluster.broadcastEval(
    (c: Client) => c.guilds.cache.size,
  );
  const totalGuilds = results.reduce(
    (prev: number, val: number) => prev + val,
    0,
  );

  client.user?.setPresence({
    activities: [
      {
        name: `${totalGuilds} 個伺服器`,
        type: ActivityType.Watching,
      },
    ],
    status: "online",
  });
}

client.on(Events.ClientReady, async () => {
  new Logger("系統").success(`${client.user?.tag} 已經上線！`);
  if (client.cluster.id == 0) {
    autoDailySign();
    // Fire background tasks immediately — don't wait for redeem/cookie flows
    refreshWallpapers(client.db).catch(() => {});
    downloadAllWikiPaintings().catch(() => {});
    downloadAllDiscIcons().catch(() => {});
    await runAutoRedeem();
    // 啟動時先做一次 Cookie 刷新
    await refreshAllCookies(client);
  }

  schedule.scheduleJob("0 * * * *", function () {
    if (client.cluster.id == 0) {
      autoDailySign();
    }
  });

  // 每天 07:50 刷新 Cookie，為自動兌換做準備
  schedule.scheduleJob("50 7 * * *", function () {
    if (client.cluster.id == 0) {
      refreshAllCookies(client);
    }
  });

  // 每天 08:00 自動兌換 + 刷新壁紙
  schedule.scheduleJob("0 8 * * *", function () {
    if (client.cluster.id == 0) {
      runAutoRedeem();
      refreshWallpapers(client.db).catch(() => {});
    }
  });

  setInterval(updatePresence, 300_000);
});

async function runAutoRedeem() {
  const logger = new Logger("自動兌換排程");
  if (isAutoRedeemRunning) {
    logger.info("上一輪自動兌換尚未完成，跳過本次觸發");
    return;
  }

  isAutoRedeemRunning = true;
  try {
    await autoRedeem();
  } catch (error: any) {
    logger.error(`自動兌換排程執行失敗: ${error?.message || error}`);
  } finally {
    isAutoRedeemRunning = false;
  }
}

async function refreshAllCookies(client: any) {
  const logger = new Logger("Cookie更新");
  if (isRefreshingCookies) {
    logger.info("上一輪 Cookie 保活尚未完成，跳過本次觸發");
    return;
  }

  isRefreshingCookies = true;

  try {
    const autoDailyData = await client.db.get("autoDaily");
    const autoRedeemData = await client.db.get("autoRedeem");
    if (!autoDailyData && !autoRedeemData) return;

    const userIds = Array.from(
      new Set([
        ...Object.keys(autoDailyData || {}),
        ...Object.keys(autoRedeemData || {}),
      ]),
    );
    for (const userId of userIds) {
      const accounts = await client.db.get(`${userId}.account`);
      if (!accounts || accounts.length === 0) continue;

      for (let i = 0; i < accounts.length; i++) {
        try {
          const result = await autoRefreshCookie(userId, i, accounts[i].cookie);
          if (result && (result as any).success) {
            // logger.info(`已完成用戶 ${userId} 第 ${i + 1} 個帳號 Cookie 保活`);
          } else {
            // logger.error(
            //   `保活用戶 ${userId} 第 ${i + 1} 個帳號 Cookie 失敗: ${
            //     (result as any)?.message || "原因未知"
            //   }`,
            // );
          }
        } catch (e: any) {
          logger.error(
            `更新用戶 ${userId} 第 ${i + 1} 個帳號的 Cookie 時發生錯誤: ${
              e.message || e
            }`,
          );
        }
      }
    }
    logger.success("已完成所有帳號的 Cookie 定期更新流程");
  } catch (error: any) {
    logger.error(`定期更新 Cookie 過程發生嚴重錯誤: ${error.message || error}`);
  } finally {
    isRefreshingCookies = false;
  }
}
