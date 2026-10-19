import { client } from "../../index.js";
import { getRedeemCodes, autoRefreshCookie, getUserLang } from "../utilities.js";
import { buildZZZRedeemCards, redeemSummaryText, type ZZZRedeemCardPayload } from "../canvas/redeemCard.js";
import { getFirstRedeemRewardIcon } from "./redeemLayout.js";
import { classifyPermanentNotificationError, disableNotificationDestination } from "../core/notificationDestination.js";
import { Routes } from "discord.js";
import Logger from "../core/logger.js";
import { getLegacyAccounts } from "../accountStore.js";
import { migrateLegacyRedeemCookieState, getRedeemCookieState, setRedeemCookieInvalid,
  setRedeemRefreshAttempt, clearRedeemCookieState } from "../core/redeemCookieState.js";
import { RedeemEngine, exchangeCode, classifyRedeem, REDEEM_POLICY } from "../core/redeemEngine.js";
import { resolveZzzRegion } from "./region.js";

let engine: RedeemEngine | undefined;
const refreshes = new Map<string, Promise<any>>();
async function refresh(owner: string, index: number, uid: string, cookie: string) {
  let work = refreshes.get(uid);
  if (!work) {
    work = autoRefreshCookie(owner, index, cookie, "redeem");
    refreshes.set(uid, work);
    void work.finally(() => refreshes.delete(uid)).catch(() => {});
  }
  // The existing refresh helper owns its network calls; do not let it occupy a
  // redeem worker indefinitely, or start a second refresh while it is still running.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<{ success: false }>(resolve => {
      timer = setTimeout(() => resolve({ success: false }), 30000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
export default async function autoRedeem(discover = true) {
  const db = client.db;
  if (!engine) {
    const logger = new Logger("自動兌換");
    const accounts = (owner: string) => getLegacyAccounts(db as any, owner);
    engine = new RedeemEngine({
      db, codes: getRedeemCodes, accounts,
      log: message => logger.info(message),
      authRecovered: async uid => {
        const state = await getRedeemCookieState(db, uid);
        return !state.invalid && !state.needsCookieUpdate;
      },
      prepare: async (owner, uid, force) => {
        const current = await accounts(owner);
        const index = current.findIndex(a => String(a?.uid) === uid);
        const account = current[index];
        if (!account?.cookie) return null;
        await migrateLegacyRedeemCookieState(db, uid);
        if (force) await setRedeemCookieInvalid(db, uid, true);
        const state = await getRedeemCookieState(db, uid);
        if (state.needsCookieUpdate) return null;
        if (state.invalid) {
          if (!force && state.lastRefreshAttempt && Date.now() - state.lastRefreshAttempt < REDEEM_POLICY.maxRetry) return null;
          await setRedeemRefreshAttempt(db, uid, Date.now());
          const result = await refresh(owner, index, uid, account.cookie);
          if (!result.success) return null;
          await clearRedeemCookieState(db, uid);
          return (await accounts(owner)).find(a => String(a?.uid) === uid) || null;
        }
        return account;
      },
      exchange: async (account, code) => {
        const uid = String(account.uid);
        const region = resolveZzzRegion(uid, account.region);
        const reply = await exchangeCode("https://public-operation-nap.hoyoverse.com/common/apicdkey/api/webExchangeCdkeyRisk", {
          method: "POST", headers: { "content-type": "application/json;", cookie: account.cookie },
          body: JSON.stringify({ t: Date.now(), lang: "zh-tw", game_biz: "nap_global", uid, region, cdkey: code.code, platform: "4" }),
        });
        if (classifyRedeem(reply) === "auth") await setRedeemCookieInvalid(db, uid, true);
        if (["success", "already"].includes(classifyRedeem(reply))) await clearRedeemCookieState(db, uid);
        return reply;
      },
      notify: async (owner, account, config, codes, nonce) => {
        if (config.notificationEnabled === false || (config.notifyType !== "dm" && !config.channelId)) return "disabled";
        const tag = config.tag === true || config.tag === "true" ? `<@${owner}>` : undefined;
        const payload: ZZZRedeemCardPayload = { locale: (await getUserLang(owner)) || "en", source: "auto", accounts: [{ uid: String(account.uid), nickname: account.nickname || String(account.uid),
          codes: codes.map(code => ({ code: code.code, status: "success" as const, rewards: code.rewards,
            rewardIcons: code.rewardIcons || (getFirstRedeemRewardIcon(code) ? [getFirstRedeemRewardIcon(code)!] : []),
          })),
        }] };
        const buffers = await buildZZZRedeemCards(payload).catch(() => []);
        const fallback = redeemSummaryText(payload);
        try {
          const channelId = config.notifyType === "dm" ? (await client.users.createDM(owner)).id : config.channelId;
          for (let page = 0; page < Math.max(1, buffers.length); page++) await client.rest.post(Routes.channelMessages(channelId), {
            body: { content: buffers.length ? (page === 0 ? tag : undefined) : `${tag || ""} ${fallback}`.slice(0, 1900), allowed_mentions: { parse: [], users: tag && page === 0 ? [owner] : [] }, nonce: `${nonce.slice(0, 20)}${page}`, enforce_nonce: true },
            files: buffers.length ? [{ data: buffers[page], name: `redeem-zzz-${page + 1}.png` }] : [{ data: Buffer.from(fallback), name: "redeem-results.txt" }],
          });
          return "sent";
        } catch (error: any) {
          const reason = classifyPermanentNotificationError(error);
          if (reason) {
            await disableNotificationDestination(db, "autoRedeem", owner, config, reason);
            logger.warn(`UID ${account.uid} 通知目的地失效，自動兌換維持啟用`);
            return "disabled";
          }
          throw error;
        }
      },
    });
  }
  await engine.tick(discover);
}
