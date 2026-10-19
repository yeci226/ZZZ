import { identifyReward, normalizeRewardDetails, type RewardDetail, type RewardKind } from "./rewards.js";
export const MIMO_BASE = "https://sg-public-api.hoyolab.com/event/e2023mimotravel";
export interface MimoGame { game_id: number; version_id: number; point: number; start_time: string; end_time: string }
export interface MimoTask { task_id: number; task_name: string; task_type: number; status: 1 | 2 | 3; point: number }
export interface MimoOffer { award_id: number; name: string; icon: string; cost: number; stock: number; status: number; user_count: number; kind?: RewardKind; reward: RewardDetail; rewards?: RewardDetail[] }
export interface MimoHistory { exchange_code: string; desc: string; created_at: number; point_type: number; point: number }
export class MimoApiError extends Error {
  constructor(public kind: "auth" | "network" | "format" | "rejected" | "rate", public code?: number, public retryAfter = 0) { super(`Mimo ${kind}${code === undefined ? "" : ` (${code})`}`); }
}
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
let gate = Promise.resolve(); let nextRequest = 0;
async function rateGate() {
  const work = gate.then(async () => { const wait = nextRequest - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait)); nextRequest = Date.now() + 1000; });
  gate = work.catch(() => {}); await work;
}
export class MimoApi {
  constructor(private cookie: string, private transport: typeof fetch = fetch, private throttle = true) {}
  async request(endpoint: string, version?: number, extra: Record<string, any> = {}, post = false, allowEmpty = false): Promise<any> {
    if (this.throttle) await rateGate();
    const args = { game_id: 8, lang: "en-us", ...(version === undefined ? {} : { version_id: version }), ...extra };
    let response: Response;
    try { response = await this.transport(`${MIMO_BASE}/${endpoint}${post ? "" : `?${new URLSearchParams(args as any)}`}`, {
      method: post ? "POST" : "GET", headers: { Cookie: this.cookie, "Content-Type": "application/json" },
      ...(post ? { body: JSON.stringify(args) } : {}), signal: AbortSignal.timeout(10000), redirect: "error",
    }); } catch { throw new MimoApiError("network"); }
    if (response.status === 429) { const raw = response.headers.get("retry-after") || ""; const delay = /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - Date.now(); throw new MimoApiError("rate", 429, Number.isFinite(delay) ? Math.max(0, delay) : 60000); }
    if (!response.ok) throw new MimoApiError("network", response.status);
    let body: any; try { body = await response.json(); } catch { throw new MimoApiError("format"); }
    if (!integer(body?.retcode)) throw new MimoApiError("format");
    if (body.retcode !== 0) throw new MimoApiError([-100, -1071].includes(body.retcode) ? "auth" : "rejected", body.retcode);
    if (body.data == null && allowEmpty) return {};
    if (!body.data || typeof body.data !== "object") throw new MimoApiError("format");
    return body.data;
  }
  async game(): Promise<MimoGame | null> {
    const data = await this.request("index");
    if (data.is_login === false) throw new MimoApiError("auth");
    if (!Array.isArray(data.list)) throw new MimoApiError("format");
    const game = data.list.find((v: any) => v.game_id === 8);
    if (!game) return null;
    if (!integer(game.version_id) || !integer(game.point) || !Number.isFinite(Number(game.start_time)) || !Number.isFinite(Number(game.end_time))) throw new MimoApiError("format");
    return game;
  }
  async tasks(version: number): Promise<MimoTask[]> {
    const data = await this.request("task-list", version);
    if (!Array.isArray(data.task_list) || data.task_list.some((t: any) => !integer(t.task_id) || !integer(t.task_type) || ![1, 2, 3].includes(t.status))) throw new MimoApiError("format");
    return data.task_list;
  }
  async shop(version: number): Promise<MimoOffer[]> {
    const data = await this.request("exchange-list", version);
    if (!Array.isArray(data.exchange_award_list)) throw new MimoApiError("format");
    return data.exchange_award_list.map((o: any) => {
      if (!integer(o.award_id) || typeof o.name !== "string" || !integer(o.cost) || o.cost <= 0 || !integer(o.status) || !integer(o.stock) || !integer(o.user_count)) throw new MimoApiError("format");
      const kind = identifyReward(o.name), rewards = normalizeRewardDetails(o.name, typeof o.icon === "string" ? [o.icon] : []);
      const reward = rewards.find(r => r.kind === kind) || rewards[0] || { name: o.name };
      return { ...o, kind, reward, rewards };
    });
  }
  async finish(version: number, task: number) { await this.request("finish-task", version, { task_id: task }, true, true); }
  async claim(version: number, task: number) { await this.request("receive-point", version, { task_id: task }, false, true); }
  async buy(version: number, award: number): Promise<string> {
    const data = await this.request("exchange", version, { award_id: award }, true);
    if (typeof data.exchange_code !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(data.exchange_code)) throw new MimoApiError("format");
    return data.exchange_code.toUpperCase();
  }
  async history(version: number): Promise<MimoHistory[]> {
    const records: MimoHistory[] = [];
    for (let page = 1; page <= 20; page++) {
      const data = await this.request("point-record", version, { operator_type: 2, page, page_size: 20 });
      if (!Array.isArray(data.list)) throw new MimoApiError("format");
      for (const r of data.list) if (typeof r.exchange_code === "string" && typeof r.desc === "string") records.push({ ...r, created_at: Number(r.created_at) });
      if (data.list.length < 20) return records;
    }
    throw new MimoApiError("format"); // Never reconcile against an incomplete history.
  }
}
export function chooseOffer(order: string[], offers: MimoOffer[], points: number): { offer?: MimoOffer; reason?: "waiting" | "unavailable" } {
  for (const kind of order) {
    const matching = offers.filter(o => o.kind === kind);
    if (!matching.length) return { reason: "unavailable" }; // Cannot infer that an absent offer has ended.
    const unfinished = matching.filter(o => o.status !== 3);
    if (!unfinished.length) continue;
    const ranked = unfinished.sort((a, b) => (b.reward.quantity || 0) / b.cost - (a.reward.quantity || 0) / a.cost || (b.reward.quantity || 0) - (a.reward.quantity || 0) || a.award_id - b.award_id);
    const offer = ranked.find(o => o.status === 1 && o.stock > 0 && o.cost <= points);
    if (offer) return { offer };
    return { reason: "waiting" };
  }
  return { reason: "unavailable" };
}
