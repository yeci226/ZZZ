import { client } from "../../index.js";
import { EmbedBuilder } from "discord.js";
import Logger from "../core/logger.js";
import { createTranslator } from "../core/i18n.js";
import {
  getUserLang,
  getRandomColor,
  getRedeemCodes,
  autoRefreshCookie,
} from "../utilities.js";
import { ColorResolvable } from "discord.js";

// Constants
const CONFIG = {
  API_TIMEOUT: 10000,
  REDEEM_DELAY: 3000,
  COOKIE_REFRESH_RETRY_INTERVAL: 6 * 60 * 60 * 1000,
  DEFAULT_LANGUAGE: "en",
  ERROR_CODES: {
    ALREADY_CLAIMED: -2017,
    CODE_CLAIMED: -2018,
    CODE_INVALID: -2001,
    CODE_EXPIRED: -2006,
    COOKIE_EXPIRED_VERIFY: -100, // 驗證 API 返回的 Cookie 過期
    RISK_CONTROL_BLOCKED: -502, // 風控限制，非 Cookie 過期
  },
};

interface RedeemStats {
  total: number;
  success: number;
  failed: number;
  alreadyClaimed: number;
  invalid: number;
}

class AutoRedeemSystem {
  client: any;
  db: any;
  logger: Logger;
  stats: RedeemStats;

  constructor(client: any) {
    this.client = client;
    this.db = client.db;
    this.logger = new Logger("自動兌換");
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      alreadyClaimed: 0,
      invalid: 0,
    };
  }

  async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getUserPreferences(userId: string) {
    try {
      const userLang = (await getUserLang(userId)) || CONFIG.DEFAULT_LANGUAGE;
      const accounts = await this.db.get(`${userId}.account`);
      return { userLang, accounts };
    } catch (error: any) {
      this.logger.error(`獲取使用者偏好設定失敗: ${error.message}`);
      return {
        userLang: CONFIG.DEFAULT_LANGUAGE,
        accounts: [],
      };
    }
  }

  async shouldRetryCookieRefresh(uid: string) {
    const lastAttempt = await this.db.get(`${uid}.lastCookieRefreshAttempt`);
    if (!lastAttempt) return true;
    const elapsed = Date.now() - Number(lastAttempt);
    return elapsed >= CONFIG.COOKIE_REFRESH_RETRY_INTERVAL;
  }

  async markCookieRefreshAttempt(uid: string) {
    await this.db.set(`${uid}.lastCookieRefreshAttempt`, Date.now());
  }

  async processCode(code: any, account: any, userId: string) {
    try {
      // 根據 UID 判斷 Region ( nap_global )
      const uid = account.uid;
      let region = "prod_gf_sg"; // 預設亞洲 (SEA)
      if (uid.startsWith("5")) region = "prod_gf_us";
      else if (uid.startsWith("6")) region = "prod_gf_eu";
      else if (uid.startsWith("7")) region = "prod_gf_sg";
      else if (uid.startsWith("8")) region = "prod_gf_sg";
      else if (uid.startsWith("13")) region = "prod_gf_jp";

      const url =
        "https://public-operation-nap.hoyoverse.com/common/apicdkey/api/webExchangeCdkeyRisk";
      const body = {
        t: Date.now(),
        lang: "zh-tw",
        game_biz: "nap_global",
        uid: String(uid),
        region: region,
        cdkey: code.code,
        platform: "4",
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json;",
          cookie: account.cookie,
        },
        body: JSON.stringify(body),
      });

      const result: any = await response.json();
      // this.logger.info(
      //   `[除錯] 兌換 API 回傳內容: ${JSON.stringify(result)}`,
      // );

      const status = {
        success: result.retcode === 0,
        alreadyClaimed: [
          CONFIG.ERROR_CODES.ALREADY_CLAIMED,
          CONFIG.ERROR_CODES.CODE_CLAIMED,
        ].includes(result.retcode),
        invalid: [
          CONFIG.ERROR_CODES.CODE_INVALID,
          CONFIG.ERROR_CODES.CODE_EXPIRED,
          -2003, // Expired in some cases
        ].includes(result.retcode),
        riskBlocked: result.retcode === CONFIG.ERROR_CODES.RISK_CONTROL_BLOCKED,
        tokenInvalid: [
          CONFIG.ERROR_CODES.COOKIE_EXPIRED_VERIFY,
          -1071,
        ].includes(result.retcode),
      };

      if (status.tokenInvalid) {
        await this.db.set(`${account.uid}.cookieExpired`, true);
      }

      return {
        code,
        status,
        message: result.message,
      };
    } catch (error: any) {
      return {
        code,
        status: { failed: true },
        message: error.message,
      };
    }
  }

  formatResults(results: any[], tr: (key: string) => string) {
    const description: string[] = [];
    const stats = {
      success: 0,
      alreadyClaimed: 0,
      invalid: 0,
      failed: 0,
    };

    results.forEach((result) => {
      const { code, status } = result;
      if (status.success) {
        description.push(`✅ **${code.code}** - (${tr("redeem_Success")})`);
        stats.success++;
      } else if (status.alreadyClaimed) {
        description.push(`ℹ️ **${code.code}** - (${tr("redeem_Already")})`);
        stats.alreadyClaimed++;
      } else if (status.invalid) {
        description.push(`⚠️ **${code.code}** - (${tr("redeem_Invalid")})`);
        stats.invalid++;
      } else {
        // 失敗類型（包含 Cookie 待刷新、風控等）不推播到頻道，避免干擾使用者
        stats.failed++;
      }
    });

    return {
      description: description.join("\n"),
      stats,
      hasResults: description.length > 0,
    };
  }

  async processAccount(account: any, codes: any[], context: any) {
    const { userId, userLang, tr, accountIndex, accountNickname } = context;

    const displayNickname = accountNickname || String(account.uid);
    const isCookieExpired = await this.db.get(`${account.uid}.cookieExpired`);
    if (isCookieExpired) {
      const shouldRetry = await this.shouldRetryCookieRefresh(account.uid);
      if (!shouldRetry) {
        this.logger.info(
          `[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 刷新冷卻中，跳過本次刷新嘗試`,
        );
        return {
          uid: account.uid,
          nickname: displayNickname,
          description: "",
          hasSuccess: false,
          hasResults: false,
        };
      }

      await this.markCookieRefreshAttempt(account.uid);
      this.logger.info(
        `[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 被標記為過期，嘗試自動刷新...`,
      );

      // 嘗試自動刷新 Cookie
      const refreshResult = await autoRefreshCookie(
        userId,
        accountIndex,
        account.cookie,
      );

      if (!refreshResult.success) {
        this.logger.warn(
          `[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 刷新失敗，跳過本次兌換`,
        );
        return {
          uid: account.uid,
          nickname: displayNickname,
          description: "",
          hasSuccess: false,
          hasResults: false,
        };
      }

      // 刷新成功，重新從數據庫獲取更新後的 Cookie
      const refreshedAccounts = await this.db.get(`${userId}.account`);
      if (!refreshedAccounts?.[accountIndex]) {
        return {
          uid: account.uid,
          nickname: displayNickname,
          description: "",
          hasSuccess: false,
          hasResults: false,
        };
      }

      // 使用更新後的 Cookie 和帳號資料
      account = refreshedAccounts[accountIndex];
      this.logger.success(
        `[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 已成功刷新，繼續處理兌換`,
      );
    }

    const userRedeemedCodes: string[] =
      (await this.db.get(`${account.uid}.redeemedCodes`)) || [];
    const redeemedCodeSet = new Set(userRedeemedCodes);
    const unRedeemedCodes = codes.filter(
      (code) => !redeemedCodeSet.has(code.code),
    );

    this.logger.info(
      `[用戶 ${userId}] [帳號 #${accountIndex}] 正在處理禮包碼，總數: ${unRedeemedCodes.length}`,
    );

    if (!unRedeemedCodes || unRedeemedCodes.length === 0) {
      return {
        uid: account.uid,
        nickname: displayNickname,
        description: `ℹ️ ${tr("redeem_Already")}: ${codes.length} 個禮包碼已全部兌換`,
        hasSuccess: false,
      };
    }

    this.logger.info(
      `[用戶 ${userId}] [帳號 #${accountIndex}] 已兌換列表數量: ${userRedeemedCodes.length}`,
    );
    this.logger.info(
      `[用戶 ${userId}] [帳號 #${accountIndex}] 發現 ${unRedeemedCodes.length} 個未兌換的禮包碼`,
    );

    const results: any[] = [];

    for (const code of unRedeemedCodes) {
      try {
        this.stats.total++;
        // this.logger.info(
        //   `[用戶 ${userId}] [帳號 #${accountIndex}] 正在兌換: ${code.code}`
        // );
        const result: any = await this.processCode(code, account, userId);

        if (
          result.status &&
          !result.status.failed &&
          (result.status.success ||
            result.status.alreadyClaimed ||
            result.status.invalid)
        ) {
          redeemedCodeSet.add(code.code);
        }

        // 非 token 無效的回應表示這個 Cookie 仍然可用
        if (!(result.status as any).tokenInvalid) {
          await this.db.delete(`${account.uid}.cookieExpired`);
        }

        if ((result.status as any).tokenInvalid) {
          this.logger.warn(
            `[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 已過期，標記待自動刷新`,
          );
          await this.db.set(`${account.uid}.cookieExpired`, true);
          return {
            uid: account.uid,
            nickname: displayNickname,
            description: "",
            hasSuccess: false,
            hasResults: false,
          };
        }

        if ((result.status as any).riskBlocked) {
          this.logger.warn(
            `[用戶 ${userId}] [帳號 #${accountIndex}] 觸發風控限制（-502），稍後重試`,
          );
          await this.db.delete(`${account.uid}.cookieExpired`);
          return {
            uid: account.uid,
            nickname: displayNickname,
            description: "",
            hasSuccess: false,
            hasResults: false,
          };
        }

        if ((result.status as any).success) {
          this.logger.success(
            `[用戶 ${userId}] [帳號 #${accountIndex}] 兌換成功: ${code.code}`,
          );
        } else if ((result.status as any).alreadyClaimed) {
          this.logger.info(
            `[用戶 ${userId}] [帳號 #${accountIndex}] 已經兌換過: ${code.code}`,
          );
        } else if ((result.status as any).invalid) {
          this.logger.warn(
            `[用戶 ${userId}] [帳號 #${accountIndex}] 無效的禮包碼: ${code.code}`,
          );
        } else {
          // this.logger.error(
          //   `[用戶 ${userId}] [帳號 #${accountIndex}] 兌換失敗: ${code.code} - ${result.message}`
          // );
          // await this.db.set(`${account.uid}.cookieExpired`, true);
        }

        results.push(result);
        await this.sleep(CONFIG.REDEEM_DELAY);
      } catch (error: any) {
        this.logger.error(
          `[用戶 ${userId}] [帳號 #${accountIndex}] 兌換出錯: ${code.code} - ${error.message}`,
        );
      }
    }

    await this.db.set(`${account.uid}.redeemedCodes`, [...redeemedCodeSet]);

    const { description, stats, hasResults } = this.formatResults(results, tr);

    Object.entries(stats).forEach(([key, value]) => {
      this.stats[key as keyof RedeemStats] += value;
    });

    return {
      uid: account.uid,
      nickname: displayNickname,
      description,
      hasSuccess: stats.success > 0,
      hasResults,
    };
  }

  async processRedemption(userId: string, redeemData: any, codesList: any[]) {
    const { userLang, accounts } = await this.getUserPreferences(userId);
    // this.logger.info(
    //   `[除錯] 用戶 ${userId} 語言: ${userLang}, 帳號數量: ${accounts?.length || 0}`,
    // );
    if (!accounts?.length) {
      await this.db.delete(`autoRedeem.${userId}`);
      this.logger.warn(`用戶 ${userId} 無帳號資料，已自動移除 autoRedeem 設定`);
      return;
    }

    const userRedeemConfig = redeemData[userId];
    if (!userRedeemConfig?.channelId) {
      await this.db.delete(`autoRedeem.${userId}`);
      this.logger.warn(
        `用戶 ${userId} 缺少頻道設定，已自動移除 autoRedeem 設定`,
      );
      return;
    }

    // 預檢查：嘗試刷新所有標記為過期的 Cookie
    this.logger.info(`[用戶 ${userId}] 開始 Cookie 預檢查...`);
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      if (!account || !account.uid || !account.cookie) continue;

      const isCookieExpired = await this.db.get(`${account.uid}.cookieExpired`);
      if (isCookieExpired) {
        const shouldRetry = await this.shouldRetryCookieRefresh(account.uid);
        if (!shouldRetry) {
          this.logger.info(
            `[用戶 ${userId}] [帳號 #${i}] Cookie 刷新冷卻中，跳過預檢查刷新`,
          );
          continue;
        }

        await this.markCookieRefreshAttempt(account.uid);
        this.logger.warn(
          `[用戶 ${userId}] [帳號 #${i}] 偵測到過期 Cookie，嘗試自動刷新...`,
        );
        const refreshResult = await autoRefreshCookie(
          userId,
          i,
          account.cookie,
        );
        if (refreshResult.success) {
          this.logger.success(
            `[用戶 ${userId}] [帳號 #${i}] Cookie 已自動刷新成功`,
          );
        } else {
          this.logger.warn(
            `[用戶 ${userId}] [帳號 #${i}] Cookie 無法刷新，將在兌換時重試`,
          );
        }
      }
    }

    const channelId = userRedeemConfig.channelId;
    const tag = userRedeemConfig.tag === "true" ? `<@${userId}>` : "";
    const tr = createTranslator(userLang);

    const results = [];
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      if (!account || !account.uid || !account.cookie) continue;

      try {
        const result = await this.processAccount(account, codesList, {
          userId,
          channelId,
          tag,
          tr,
          userLang,
          accountIndex: i,
          accountNickname: account.nickname,
        });
        if (result) results.push(result);
      } catch (error: any) {
        this.logger.error(
          `使用者 ${userId} 的帳號 #${i} 處理失敗: ${error.message}`,
        );
        this.stats.failed++;
      }
    }

    const visibleResults = results.filter(
      (r) => r.hasResults && Boolean(r.description?.trim()),
    );

    if (visibleResults.length > 0) {
      const hasSuccess = visibleResults.some((r) => r.hasSuccess);
      const finalDescription = visibleResults
        .map((r) => `## ${r.nickname || r.uid} (${r.uid})\n${r.description}`)
        .join("\n\n");
      await this.sendRedeemMessage(channelId, {
        tr,
        tag,
        description: finalDescription,
        hasSuccess,
      });
    }
  }

  async sendRedeemMessage(channelId: string, data: any) {
    const embed = new EmbedBuilder()
      .setColor(getRandomColor() as ColorResolvable)
      .setTitle(
        data.hasSuccess
          ? data.tr("Auto") + data.tr("redeem_SuccessDesc")
          : data.tr("Auto") + data.tr("redeem_RedeemStats"),
      )
      .setDescription(data.description)
      .setThumbnail(
        "https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4c/Item_Polychrome.png",
      )
      .setTimestamp();

    try {
      await this.client.cluster.broadcastEval(
        async (c: any, { channelId, content, embed }: any) => {
          const channel = c.channels.cache.get(channelId);
          if (channel) await channel.send({ content, embeds: [embed] });
        },
        {
          context: { channelId, content: data.tag || "", embed },
          timeout: CONFIG.API_TIMEOUT,
        },
      );
    } catch (error) {
      this.logger.error(
        `發送訊息至頻道 ${channelId} 時發生錯誤: ${(error as any).message}`,
      );
    }
  }

  async updateStatistics() {
    this.logger.info("========== 自動兌換統計 ==========");
    this.logger.info(`總計處理: ${this.stats.total} 個禮包碼`);
    this.logger.info(`成功兌換: ${this.stats.success} 個`);
    this.logger.info(`已兌換過: ${this.stats.alreadyClaimed} 個`);
    this.logger.info(`無效代碼: ${this.stats.invalid} 個`);
    // 不顯示兌換失敗的統計
  }
}

export default async function autoRedeem() {
  const system = new AutoRedeemSystem(client);

  const redeemData = await system.db.get("autoRedeem");
  if (!redeemData) {
    system.logger.info("沒有找到需要自動兌換的用戶數據");
    return;
  }

  system.logger.info("========== 開始自動兌換 (每日排程) ==========");

  try {
    const codesList = await getRedeemCodes();
    system.logger.info(
      `已獲取 ${codesList.length} 個禮包碼 ${codesList.map((code: any) => code.code).join(", ")}`,
    );

    const userIds = Object.keys(redeemData);
    system.logger.info(`待處理使用者總數: ${userIds.length}`);
    const BATCH_SIZE = 5;

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (userId) => {
          try {
            await system.processRedemption(userId, redeemData, codesList);
          } catch (error) {
            system.logger.error(
              `處理用戶 ${userId} 時發生錯誤: ${(error as any).message}`,
            );
          }
        }),
      );
    }

    await system.updateStatistics();
  } catch (error: any) {
    system.logger.error("自動兌換過程中發生錯誤:");
    system.logger.error(error.message);
  }
  system.logger.info("========== 自動兌換結束 ==========");
}
