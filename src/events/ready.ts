import { client } from "../index.js";
import { Events, ActivityType, Client } from "discord.js";
import Logger from "../utilities/core/logger.js";
import autoDailySign from "../utilities/zzz/autoDaily.js";
import autoRedeem from "../utilities/zzz/autoRedeem.js";
import { updateCookie } from "../utilities/utilities.js";
import schedule from "node-schedule";

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
    autoRedeem();
    // 啟動時也執行一次 Cookie 更新
    refreshAllCookies(client);
  }

  schedule.scheduleJob("0 * * * *", function () {
    if (client.cluster.id == 0) {
      autoDailySign();
    }
  });

  schedule.scheduleJob("0 4 * * *", function () {
    if (client.cluster.id == 0) {
      refreshAllCookies(client);
    }
  });

  schedule.scheduleJob("0 5 * * *", function () {
    if (client.cluster.id == 0) {
      autoRedeem();
    }
  });

  setInterval(updatePresence, 10000);
});

async function refreshAllCookies(client: any) {
  const logger = new Logger("Cookie更新");
  try {
    const autoDailyData = await client.db.get("autoDaily");
    if (!autoDailyData) return;

    const userIds = Object.keys(autoDailyData);
    for (const userId of userIds) {
      const accounts = await client.db.get(`${userId}.account`);
      if (!accounts || accounts.length === 0) continue;

      for (let i = 0; i < accounts.length; i++) {
        try {
          const result = await updateCookie(userId, i, accounts[i].cookie);
          if (result && (result as any).success) {
            // logger.info(`已更新用戶 ${userId} 第 ${i + 1} 個帳號的 Cookie`);
          } else {
            // logger.error(
            //   `更新用戶 ${userId} 第 ${i + 1} 個帳號的 Cookie 失敗: ${
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
  }
}
