import type { Client } from "discord.js";
import { Routes } from "discord.js";
import { createHash } from "node:crypto";
import { getHoyolabs, getLegacyAccounts } from "../accountStore.js";
import { autoRefreshCookie, getUserLang } from "../utilities.js";
import { classifyRedeem, exchangeCode, redeemStore, reserveRedeemSlot } from "../core/redeemEngine.js";
import { classifyPermanentNotificationError } from "../core/notificationDestination.js";
import { buildZZZRedeemCards, redeemSummaryText } from "../canvas/redeemCard.js";
import { uiText } from "../settings/presentation.js";
import { MimoApi } from "./api.js";
import { MimoStore, type MimoConfig } from "./store.js";
import { MimoEngine } from "./engine.js";
import { resolveZzzRegion } from "../zzz/region.js";
const stores = new WeakMap<object, MimoStore>(), engines = new WeakMap<object, MimoEngine>();
export function getMimoStore(db: any): MimoStore {
  let store = stores.get(db); if (!store) { store = new MimoStore(db.driver.database); stores.set(db, store); } return store;
}
export async function mimoAccount(db: any, c: MimoConfig) {
  const h = (await getHoyolabs(db, c.owner)).find(h => h.ltuid_v2 === c.ltuid);
  const role = h?.characters.find(r => r.uid === c.uid);
  if (!h || h.invalid || !h.cookie || !role || role.invalid) return null;
  return { cookie: h.cookie, uid: role.uid, region: role.region || undefined, nickname: role.nickname || h.hoyolabName || role.uid };
}
export async function runAutoMimo(client: Client, db: any) {
  let engine = engines.get(db);
  const store = getMimoStore(db);
  if (!engine) {
    engine = new MimoEngine(store, {
      account: c => mimoAccount(db, c), api: cookie => new MimoApi(cookie),
      locale: async owner => (await getUserLang(owner)) || "en",
      refresh: async (c, scope = "general") => {
        const accounts = await getLegacyAccounts(db, c.owner), index = accounts.findIndex(a => String(a.uid) === c.uid);
        if (index < 0) return false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([autoRefreshCookie(c.owner, index, accounts[index].cookie, scope), new Promise<{ success: false }>(resolve => { timer = setTimeout(() => resolve({ success: false }), 30000); })]);
          return !!result?.success;
        } finally { if (timer) clearTimeout(timer); }
      },
      redeem: async (c, code) => {
        const a = await mimoAccount(db, c); if (!a) return "auth";
        const shared = redeemStore(db);
        if (!reserveRedeemSlot(shared, c.uid)) return "retry";
        const region = resolveZzzRegion(c.uid, a.region);
        const reply = await exchangeCode("https://public-operation-nap.hoyoverse.com/common/apicdkey/api/webExchangeCdkeyRisk", {
          method: "POST", headers: { "content-type": "application/json", cookie: a.cookie },
          body: JSON.stringify({ t: Date.now(), lang: "en-us", game_biz: "nap_global", uid: c.uid, region, cdkey: code, platform: "4" }),
        });
        if (reply.retryAfter) shared.cooldown(c.uid, Date.now() + reply.retryAfter);
        return classifyRedeem(reply);
      },
      notify: async (c, result) => {
        const locale = (await getUserLang(c.owner)) || "en";
        const description = result.reason && ["auth", "uncertain", "redeemFailed"].includes(result.reason) ? uiText(locale, result.reason as "auth") : uiText(locale, "result");
        try {
          const channel = c.notifyType === "dm" ? (await client.users.createDM(c.owner)).id : c.channelId;
          if (!channel) { store.state(c.ltuid, { notifyType: "off" }); return; }
          const payload = { ...result.payload, locale };
          const pages = payload.accounts.some((a: any) => a.codes.length) ? await buildZZZRedeemCards(payload).catch(() => []) : [];
          const fallback = redeemSummaryText(payload);
          for (let i = 0; i < Math.max(1, pages.length); i++) {
            const nonce = createHash("sha256").update(`${result.id}:${i}`).digest("hex").slice(0, 24);
            await client.rest.post(Routes.channelMessages(channel), {
              body: { content: `${c.tag && i === 0 ? `<@${c.owner}> ` : ""}${description}${pages.length ? "" : `\n${fallback}`}`.slice(0, 1900), nonce, enforce_nonce: true, allowed_mentions: { parse: [], users: c.tag && i === 0 ? [c.owner] : [] } },
              files: pages.length ? [{ data: pages[i], name: `mimo-${i + 1}.png` }] : [{ data: Buffer.from(fallback), name: "mimo-results.txt" }],
            });
          }
        } catch (e) { if (classifyPermanentNotificationError(e)) { store.state(c.ltuid, { notifyType: "off" }); return; } throw e; }
      },
    }); engines.set(db, engine);
  }
  await engine.tick();
}
