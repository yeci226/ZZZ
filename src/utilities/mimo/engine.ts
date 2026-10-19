import { MimoApiError, chooseOffer, type MimoApi } from "./api.js";
import { type MimoConfig, type MimoPurchase, MimoStore } from "./store.js";
import { identifyReward } from "./rewards.js";
import type { Outcome } from "../core/redeemEngine.js";
import type { ZZZRedeemCodeResult } from "../canvas/redeemCard.js";
interface Account { cookie: string; nickname: string; uid: string; region?: string }
export interface MimoAdapter {
  account(config: MimoConfig): Promise<Account | null>;
  api(cookie: string): Pick<MimoApi, "game" | "tasks" | "shop" | "finish" | "claim" | "buy" | "history">;
  refresh(config: MimoConfig, scope?: "general" | "redeem"): Promise<boolean>;
  redeem(config: MimoConfig, code: string): Promise<Outcome>;
  locale(owner: string): Promise<string>;
  notify(config: MimoConfig, result: any): Promise<void>;
}
export class MimoEngine {
  private running = false;
  constructor(readonly store: MimoStore, private adapter: MimoAdapter, private now = Date.now) {}
  async tick() {
    if (this.running) return; this.running = true;
    try {
      for (const config of this.store.configs()) {
        if (config.enabled && config.nextAt <= this.now() && this.store.lease(config.ltuid, this.now())) {
          try { await this.run(config); } catch { this.store.state(config.ltuid, { reason: "redeemFailed", nextAt: this.now() + 3600000 }); } finally { this.store.unlock(config.ltuid); }
        }
        const current = this.store.get(config.ltuid)!;
        for (const r of this.store.results(config.ltuid, true).reverse()) {
          if (current.notifyType === "off") { this.store.delivered(r.id); continue; }
          try { await this.adapter.notify(current, r); this.store.delivered(r.id); } catch { break; }
        }
      }
    } finally { this.running = false; }
  }
  private active(c: MimoConfig): MimoConfig {
    this.store.renew(c.ltuid);
    const latest = this.store.get(c.ltuid);
    if (!latest?.enabled || latest.owner !== c.owner || latest.uid !== c.uid) throw new Error("mimo_stopped");
    return latest;
  }
  private async redeemPending(config: MimoConfig, changes: (ZZZRedeemCodeResult & { uid: string; purchaseId: string })[]) {
    for (const p of this.store.purchases(config.ltuid).filter(p => p.status === "pending" && p.code && p.nextAt <= this.now())) {
      this.active(config);
      // A saved code remains bound to the UID selected when it was purchased.
      const target = { ...config, uid: p.uid };
      let outcome = await this.adapter.redeem(target, p.code!);
      if (outcome === "auth" && p.attempts === 0 && await this.adapter.refresh(target, "redeem")) outcome = "retry";
      p.attempts++;
      if (["success", "already", "invalid"].includes(outcome)) p.status = outcome as MimoPurchase["status"];
      p.nextAt = this.now() + Math.min(6 * 3600000, 60000 * 2 ** Math.min(8, p.attempts));
      this.store.purchase(p);
      if (p.status !== "pending") changes.push({ purchaseId: p.id, uid: p.uid, code: "", privateCode: true, rewardDetails: p.offer.rewards || [p.offer.reward], status: p.status === "already" ? "already_claimed" : p.status as "success" | "invalid" });
      if (outcome === "auth") throw new MimoApiError("auth");
    }
  }
  private async run(config: MimoConfig) {
    let reason: string | undefined, points = config.points || 0, earned = 0, spent = 0;
    const changes: (ZZZRedeemCodeResult & { uid: string; purchaseId: string })[] = [];
    let account: Account | null = null;
    try {
      account = await this.adapter.account(config);
      if (!account) { this.store.state(config.ltuid, { enabled: false }); throw new MimoApiError("auth"); }
      let api = this.adapter.api(account.cookie);
      let game;
      try { game = await api.game(); }
      catch (e) { if (!(e instanceof MimoApiError) || e.kind !== "auth" || !await this.adapter.refresh(config)) throw e;
        account = await this.adapter.account(config); if (!account) throw new MimoApiError("auth"); api = this.adapter.api(account.cookie); game = await api.game(); }
      for (const p of this.store.purchases(config.ltuid).filter(p => p.status === "purchasing")) {
        this.active(config);
        const history = await api.history(p.version);
        const matches = history.filter(r => r.exchange_code && !p.beforeCodes.includes(r.exchange_code.toUpperCase()) && r.created_at * 1000 >= p.at - 5000 && identifyReward(r.desc) === p.offer.kind && p.offer.kind);
        if (matches.length !== 1) throw new Error("mimo_uncertain");
        p.code = matches[0].exchange_code.toUpperCase(); p.status = "pending"; this.store.purchase(p);
      }
      await this.redeemPending(config, changes);
      if (!game || this.now() < Number(game.start_time) * 1000 || this.now() > Number(game.end_time) * 1000) { reason = "unavailable"; return; }
      const version = game.version_id; points = game.point;
      for (let task of await api.tasks(version)) {
        this.active(config);
        if (task.status === 2 && [1, 2, 4, 10].includes(task.task_type)) {
          await api.finish(version, task.task_id);
          task = (await api.tasks(version)).find(t => t.task_id === task.task_id) || task;
        }
        if (task.status === 1) { this.active(config); await api.claim(version, task.task_id); }
      }
      const refreshed = await api.game(); if (!refreshed || refreshed.version_id !== version) { reason = "unavailable"; return; }
      earned = Math.max(0, refreshed.point - points); points = refreshed.point;
      // Bound work per tick; the next tick continues from the official state.
      for (let i = 0; i < 20; i++) {
        const current = this.active(config), offers = await api.shop(version);
        const choice = chooseOffer(current.order, offers, points);
        if (!choice.offer) { reason = choice.reason; break; }
        const history = await api.history(version);
        const latest = this.active(config);
        if (latest.revision !== current.revision) { i--; continue; }
        const p = this.store.begin(config, version, choice.offer, history.map(r => r.exchange_code.toUpperCase()));
        try { p.code = await api.buy(version, choice.offer.award_id); p.status = "pending"; this.store.purchase(p); }
        catch (e) { if (e instanceof MimoApiError && ["rejected", "auth", "rate"].includes(e.kind)) { p.status = "rejected"; this.store.purchase(p); throw e; } throw new Error("mimo_uncertain"); }
        spent += choice.offer.cost; points = Math.max(0, points - choice.offer.cost);
        await this.redeemPending(config, changes);
        if (this.store.purchases(config.ltuid).find(v => v.id === p.id)?.status === "pending") changes.push({ purchaseId: p.id, uid: p.uid, code: "", privateCode: true, rewardDetails: p.offer.rewards || [p.offer.reward], status: "awaiting" });
        const after = await api.game(); if (!after || after.version_id !== version) break; points = after.point;
      }
    } catch (e) {
      if ((e as Error).message === "mimo_stopped") reason = "off";
      else if ((e as Error).message === "mimo_uncertain") reason = "uncertain";
      else if (e instanceof MimoApiError && e.kind === "auth") { reason = "auth"; this.store.state(config.ltuid, { enabled: false }); }
      else reason = "redeemFailed";
      if (e instanceof MimoApiError && e.retryAfter) this.store.state(config.ltuid, { nextAt: this.now() + Math.max(3600000, e.retryAfter) });
    } finally {
      const previousReason = this.store.get(config.ltuid)?.reason;
      this.store.state(config.ltuid, { lastAt: this.now(), nextAt: Math.max(this.store.get(config.ltuid)?.nextAt || 0, this.now() + 3600000), points, reason });
      const finalChanges = [...new Map(changes.map(c => [c.purchaseId, c])).values()];
      if (changes.length || (reason && ["auth", "uncertain", "redeemFailed"].includes(reason) && previousReason !== reason)) {
        this.store.result(config, { locale: await this.adapter.locale(config.owner), source: "mimo", at: this.now(), points: { earned, spent, remaining: points }, accounts: [...new Set(finalChanges.map(c => c.uid))].map(uid => ({ nickname: uid === config.uid ? account?.nickname || uid : uid, uid, codes: finalChanges.filter(c => c.uid === uid).map(({ uid: _uid, purchaseId: _id, ...result }) => result) })) }, reason);
      }
    }
  }
}
