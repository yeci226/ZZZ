import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { EMPTY_SIMULATION_STATE, simulatePulls, sProbability, type SimulationBanner } from "../src/utilities/zzz/gachaSimulationEngine.js";
import { GachaSimulationStore } from "../src/utilities/zzz/gachaSimulationStore.js";
import { getSimulationCatalog, selectSimulationBanner, simulationBannerChoices, cacheSimulationCalendar, assertSimulationAssets } from "../src/utilities/zzz/gachaSimulationCatalog.js";
import { simulationMessage } from "../src/utilities/zzz/gachaSimulationPresentation.js";
import { playSimulation, skipSimulation, selectSimulationGif, simulationPlaybackDelay } from "../src/utilities/zzz/gachaSimulationPlayback.js";
import { MessageFlags } from "discord.js";
import type { GachaAnimation } from "../src/utilities/zzz/gachaAnimationCache.js";
import command from "../src/commands/slash/zzz/gachaSimulate.js";
import { getInteractionPreflight } from "../src/utilities/shared/interactionPreflight.js";

const banner: SimulationBanner = {
  id: "test-up", name: "測試卡池", version: "3.2", pool: "character", startAt: "2026-09-01T00:00:00Z", endAt: "2026-10-01T00:00:00Z",
  featuredS: "1021", featuredA: ["1011"], standardS: ["1041"], agentsA: ["1011", "1031"], weaponsA: ["13103"], weaponsB: ["12001"],
};
const sequence = (...values: number[]) => { let i = 0; return () => values[i++] ?? .99; };
const initial = () => ({ ...EMPTY_SIMULATION_STATE });
const weapon = (): SimulationBanner => ({ ...banner, id: "weapon", pool: "weapon", featuredS: "14102", standardS: ["14104"], featuredA: ["13103"], agentsA: [], weaponsA: ["13103", "13101"] });

describe("Signal Search simulation rules", () => {
  it("uses separate agent and W-Engine rates and soft/hard boundaries", () => {
    expect(sProbability("character", 73)).toBe(.006);
    expect(sProbability("character", 74)).toBeCloseTo(.066);
    expect(sProbability("character", 89)).toBeCloseTo(.966);
    expect(sProbability("character", 90)).toBe(1);
    expect(sProbability("weapon", 64)).toBe(.01);
    expect(sProbability("weapon", 65)).toBeCloseTo(.07);
    expect(sProbability("weapon", 79)).toBeCloseTo(.91);
    expect(sProbability("weapon", 80)).toBe(1);
    expect(simulatePulls(banner, initial(), 1, sequence(.099)).pulls[0].rank).toBe("A");
    expect(simulatePulls(banner, initial(), 1, sequence(.100)).pulls[0].rank).toBe("B");
    expect(simulatePulls(weapon(), initial(), 1, sequence(.159)).pulls[0].rank).toBe("A");
  });
  it("guarantees A-or-higher on the tenth pull, not an additional A when S appears", () => {
    const ordinary = simulatePulls(banner, initial(), 10, () => .99);
    expect(ordinary.pulls.map(p => p.rank).join("")).toBe("BBBBBBBBBA");
    const sInstead = simulatePulls(banner, initial(), 10, sequence(0, 0));
    expect(sInstead.pulls.map(p => p.rank).join("")).toBe("SBBBBBBBBB");
    expect(sInstead.state.sinceAOrHigher).toBe(9);
    const overlap = simulatePulls(banner, { ...initial(), sinceS: 89, sinceAOrHigher: 9 }, 1, () => .99);
    expect(overlap.pulls[0].rank).toBe("S"); expect(overlap.state.sinceAOrHigher).toBe(0);
  });
  it("preserves S pity when A appears and guarantees UP after losing", () => {
    const a = simulatePulls(banner, { ...initial(), sinceS: 20 }, 1, sequence(.05));
    expect(a.state.sinceS).toBe(21);
    const lose = simulatePulls(banner, initial(), 1, sequence(0, .9, .5));
    expect(lose.pulls[0].id).toBe("1041"); expect(lose.state.guaranteedS).toBe(true);
    const changed = { ...banner, featuredS: "1101" };
    const win = simulatePulls(changed, lose.state, 1, sequence(0));
    expect(win.pulls[0].id).toBe("1101"); expect(win.state.guaranteedS).toBe(false);
  });
  it("uses 75/25 for W-Engines, and follows the configured weapon-only pool", () => {
    expect(simulatePulls(weapon(), initial(), 1, sequence(0, .74)).pulls[0].id).toBe("14102");
    expect(simulatePulls(weapon(), initial(), 1, sequence(0, .75)).pulls[0].id).toBe("14104");
    const lostA = simulatePulls(weapon(), initial(), 1, sequence(.1, .99, .99));
    expect(lostA.pulls[0].id).toBe("13101"); expect(lostA.state.guaranteedA).toBe(true);
    expect(simulatePulls(weapon(), lostA.state, 1, sequence(.1)).pulls[0].id).toBe("13103");
  });
});

describe("durable simulation state", () => {
  let dir: string, store: GachaSimulationStore;
  beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "zzz-sim-test-")); store = new GachaSimulationStore(path.join(dir, "sim.sqlite")); });
  afterEach(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  it("survives restart, shares character banners, separates users/weapons, and is idempotent", () => {
    const first = store.draw("one", "req-1", banner, 10, () => .99, 10000);
    expect(first.state.total).toBe(10);
    expect(store.draw("one", "req-1", banner, 10, () => 0, 10001).id).toBe(first.id);
    expect(first.pulls[0].isNew).toBe(true); expect(first.pulls[1].isNew).toBe(false);
    expect(() => store.draw("one", "req-2", banner, 1, () => 0, 10001)).toThrow("操作太快");
    store.close(); store = new GachaSimulationStore(path.join(dir, "sim.sqlite"));
    const next = store.draw("one", "req-3", { ...banner, id: "another-character-banner" }, 1, () => .99, 20000);
    expect(next.state.total).toBe(11); expect(next.state.sinceS).toBe(11);
    expect(store.state("one", "weapon").total).toBe(0); expect(store.state("two", "character").total).toBe(0);
    expect(() => store.draw("two", "req-3", banner, 1, () => 0, 25000)).toThrow("不屬於你");
  });
  it("rolls back failed draws without changing saved counters", () => {
    expect(() => store.draw("one", "bad", banner, 10, sequence(.5, .5, NaN), 10000)).toThrow("Invalid random");
    expect(store.state("one", "character")).toEqual(initial()); expect(store.byRequest("bad")).toBeUndefined();
  });
  it("shares a single-use continuation claim across database connections and preserves separate command chains", () => {
    const root = store.draw("one", "root", banner, 10, () => .99, 10000);
    const independent = store.draw("one", "other-command", weapon(), 1, () => .99, 12000);
    store.finish(root.id); store.finish(independent.id);
    const second = new GachaSimulationStore(path.join(dir, "sim.sqlite"));
    try {
      const next = store.continueDraw(root.id, "one", "click-one", 1, undefined, () => .99, 20000)!;
      expect(second.continueDraw(root.id, "one", "click-ten", 10, undefined, () => 0, 22000)).toBeUndefined();
      expect(second.state("one", "character").total).toBe(11);
      expect(next.banner).toEqual(root.banner);
      expect(next.parentId).toBe(root.id);
      expect(second.continueDraw(independent.id, "one", "independent-click", 10, undefined, () => .99, 25000)?.banner.pool).toBe("weapon");
      expect(second.get(next.id)?.continuationId).toBeUndefined();
    } finally { second.close(); }
  });
  it("does not consume a parent's buttons or draw counters when continuation creation fails", () => {
    const root = store.draw("one", "root", banner, 10, () => .99, 10000); store.finish(root.id);
    expect(() => store.continueDraw(root.id, "one", "failed", 10, undefined, () => NaN, 20000)).toThrow("Invalid random");
    expect(store.get(root.id)?.continuationId).toBeUndefined();
    expect(store.state("one", "character")).toEqual(root.state);
    expect(store.byRequest("failed")).toBeUndefined();
    expect(store.continueDraw(root.id, "one", "valid", 1, undefined, () => .99, 20000)).toBeDefined();
  });
});

describe("Discord Components V2 playback", () => {
  const gif = { file: "anim.gif", bytes: 1000, width: 960, height: 540, fps: 30, durationMs: 19000, endHoldMs: 6000, lastFrame: "exact-gif-last.png" };
  const animation: GachaAnimation = { directory: ".", key: "single-s", ranks: "S", gifs: [gif], lastFrame: "master.png" };
  let store: GachaSimulationStore;
  beforeEach(() => { jest.useFakeTimers(); store = new GachaSimulationStore(":memory:"); });
  afterEach(() => { store.close(); jest.useRealTimers(); });
  const setup = () => {
    const catalog = getSimulationCatalog();
    const session = store.draw("owner", "request", banner, 1, sequence(0, 0));
    const message = { id: "message", edit: jest.fn().mockResolvedValue(undefined) };
    const transport = { attachmentLimit: 2000, send: jest.fn().mockResolvedValue(message) };
    const deps = { loadAnimation: jest.fn().mockResolvedValue(animation), readGif: jest.fn().mockResolvedValue(Buffer.from("gif")), render: jest.fn().mockResolvedValue(Buffer.from("png")) };
    return { catalog, session, message, transport, deps };
  };
  it("renders against the exact final GIF frame, exposes skip, then replaces attachments once", async () => {
    const x = setup(); await playSimulation(x.session, x.catalog, store, x.transport, x.deps);
    expect(x.deps.render.mock.calls[0][0]).toBe("exact-gif-last.png");
    const first = x.transport.send.mock.calls[0][0];
    expect(first.flags).toBe(MessageFlags.IsComponentsV2); expect(first.embeds).toBeUndefined();
    expect(JSON.stringify(first.components)).toContain("跳過動畫");
    await skipSimulation(store.get(x.session.id)!, x.catalog, store, x.message, 2000, x.deps);
    await jest.advanceTimersByTimeAsync(20000);
    expect(x.message.edit).toHaveBeenCalledTimes(1);
    const final = x.message.edit.mock.calls[0][0];
    expect(final.attachments).toEqual([]); expect(final.files[0].name).toBe("gacha-result.png");
    expect(store.get(x.session.id)!.finished).toBe(true); expect(store.state("owner", "character").total).toBe(1);
    const flat = JSON.stringify(final.components); expect(flat).toContain("再抽10抽"); expect(flat).toContain('"disabled":true');
    expect(first.components[0].id).not.toBe(final.components[0].id);
    const galleryId = (payload: any) => payload.components[0].components.find((c: any) => c.type === 12).id;
    expect(galleryId(first)).not.toBe(galleryId(final));
  });
  it("starts the timer after sending and automatically ends playback", async () => {
    const x = setup(); let resolve!: (value: any) => void;
    Object.assign(x.transport, { applicationId: "test-bot", channelId: "test-channel", guildId: "test-guild" });
    x.transport.send.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const running = playSimulation(x.session, x.catalog, store, x.transport, x.deps);
    await jest.advanceTimersByTimeAsync(30000); expect(x.message.edit).not.toHaveBeenCalled();
    expect(store.pendingResults("test-bot")).toEqual([]);
    resolve(x.message); await running;
    expect(store.get(x.session.id)!.delivery).toMatchObject({ applicationId: "test-bot", channelId: "test-channel", completeAt: Date.now() + 16000 });
    await jest.advanceTimersByTimeAsync(15999); expect(x.message.edit).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1); expect(x.message.edit).toHaveBeenCalledTimes(1);
  });
  it("coalesces duplicate deliveries without a second message or timer", async () => {
    const x = setup();
    await Promise.all([playSimulation(x.session, x.catalog, store, x.transport, x.deps), playSimulation(x.session, x.catalog, store, x.transport, x.deps)]);
    await playSimulation(x.session, x.catalog, store, x.transport, x.deps);
    expect(x.transport.send).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(16000); expect(x.message.edit).toHaveBeenCalledTimes(1);
  });
  it("uses a verified CDN URL without reading or uploading the GIF", async () => {
    const x = setup(); x.transport.attachmentLimit = 100;
    x.deps.loadAnimation.mockResolvedValue({ ...animation, gifs: [{ ...gif, remoteUrl: "https://img.yeci.it.com/a.gif" }] });
    await playSimulation(x.session, x.catalog, store, x.transport, x.deps);
    expect(x.deps.readGif).not.toHaveBeenCalled(); expect(x.transport.send.mock.calls[0][0].files).toBeUndefined();
    expect(JSON.stringify(x.transport.send.mock.calls[0][0])).toContain("https://img.yeci.it.com/a.gif");
    await skipSimulation(store.get(x.session.id)!, x.catalog, store, x.message, 100, x.deps);
  });
  it("starts the CDN animation clock only after Discord has loaded the media", async () => {
    const x = setup();
    x.deps.loadAnimation.mockResolvedValue({ ...animation, gifs: [{ ...gif, remoteUrl: "https://img.yeci.it.com/a.gif" }] });
    const media = (loading_state: number) => ({ components: [{ type: 17, components: [{ type: 12, items: [{ media: { loading_state } }] }] }] });
    Object.assign(x.message, { fetch: jest.fn().mockResolvedValueOnce(media(1)).mockResolvedValueOnce(media(1)).mockResolvedValue(media(2)) });
    Object.assign(x.transport, { applicationId: "bot", channelId: "channel" });
    const task = playSimulation(x.session, x.catalog, store, x.transport, x.deps);
    await jest.advanceTimersByTimeAsync(2000); await task;
    expect(store.get(x.session.id)?.delivery?.completeAt).toBe(Date.now() + 16000);
    await jest.advanceTimersByTimeAsync(15999); expect(x.message.edit).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1); expect(x.message.edit).toHaveBeenCalledTimes(1);
  });
  it("lets a client starting 2.23 seconds late finish a 9.23-second A/B animation before replacement", async () => {
    const x = setup();
    const ab = { ...gif, durationMs: 15230, endHoldMs: 6000, remoteUrl: "https://img.yeci.it.com/ab.gif" };
    x.deps.loadAnimation.mockResolvedValue({ ...animation, gifs: [ab] });
    Object.assign(x.transport, { applicationId: "bot", channelId: "channel" });
    const readyAt = Date.now();
    await playSimulation(x.session, x.catalog, store, x.transport, x.deps);
    const completeAt = store.get(x.session.id)!.delivery!.completeAt;
    expect(completeAt).toBe(readyAt + 12230);
    // At the previous deadline a delayed client was only at 7s, before the reveal.
    await jest.advanceTimersByTimeAsync(9230); expect(x.message.edit).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2230); expect(x.message.edit).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(770); expect(x.message.edit).toHaveBeenCalledTimes(1);
    expect(completeAt - readyAt).toBeLessThan(ab.durationMs);
    expect(simulationPlaybackDelay({ ...gif, durationMs: 9230, endHoldMs: undefined })).toBe(12230);
  });
  it("does not mistake known dimensions for a loaded image while Discord reports Loading", async () => {
    const x = setup();
    x.deps.loadAnimation.mockResolvedValue({ ...animation, gifs: [{ ...gif, remoteUrl: "https://img.yeci.it.com/a.gif" }] });
    const media = (state: number) => ({ components: [{ type: 17, components: [{ type: 12, items: [{ media: { loading_state: state, width: 960, height: 540 } }] }] }] });
    Object.assign(x.message, { fetch: jest.fn().mockResolvedValueOnce(media(1)).mockResolvedValue(media(2)) });
    Object.assign(x.transport, { applicationId: "bot", channelId: "channel" });
    const task = playSimulation(x.session, x.catalog, store, x.transport, x.deps);
    await jest.advanceTimersByTimeAsync(1000); await task;
    expect(store.get(x.session.id)?.delivery?.completeAt).toBe(Date.now() + 16000);
    await skipSimulation(store.get(x.session.id)!, x.catalog, store, x.message, 2000, x.deps);
  });
  it("can skip while Discord is still fetching the CDN media", async () => {
    const x = setup();
    x.deps.loadAnimation.mockResolvedValue({ ...animation, gifs: [{ ...gif, remoteUrl: "https://img.yeci.it.com/a.gif" }] });
    Object.assign(x.message, { fetch: jest.fn().mockResolvedValue({ components: [{ type: 17, components: [{ type: 12, items: [{ media: { loading_state: 1 } }] }] }] }) });
    const task = playSimulation(x.session, x.catalog, store, x.transport, x.deps);
    await jest.advanceTimersByTimeAsync(0);
    await skipSimulation(store.get(x.session.id)!, x.catalog, store, x.message, 100, x.deps);
    expect(x.message.edit).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(30000); await task;
    expect(x.message.edit).toHaveBeenCalledTimes(1); expect(store.get(x.session.id)?.finished).toBe(true);
  });
  it("shows saved results if Discord cannot resolve the CDN image", async () => {
    const x = setup();
    x.deps.loadAnimation.mockResolvedValue({ ...animation, gifs: [{ ...gif, remoteUrl: "https://img.yeci.it.com/a.gif" }] });
    Object.assign(x.message, { fetch: jest.fn().mockResolvedValue({ components: [{ type: 17, components: [{ type: 12, items: [{ media: { loading_state: 3 } }] }] }] }) });
    await playSimulation(x.session, x.catalog, store, x.transport, x.deps);
    expect(x.message.edit).toHaveBeenCalledTimes(1); expect(store.get(x.session.id)?.finished).toBe(true);
    expect(store.state("owner", "character").total).toBe(1);
  });
  it("an uncached rare result stays unchanged and goes straight to its result", async () => {
    const x = setup(); x.deps.loadAnimation.mockRejectedValue(new Error("uncached"));
    await playSimulation(x.session, x.catalog, store, x.transport, x.deps);
    expect(x.transport.send).toHaveBeenCalledTimes(1); expect(x.deps.readGif).not.toHaveBeenCalled();
    expect(store.get(x.session.id)!.pulls).toEqual(x.session.pulls);
    expect(store.get(x.session.id)!.finished).toBe(true);
  });
  it("recovers skip after restart using the original GIF height", async () => {
    const x = setup(); store.setGifHeight(x.session.id, 540);
    await skipSimulation(store.get(x.session.id)!, x.catalog, store, x.message, 1, x.deps);
    expect(x.deps.render.mock.calls[0][0]).toBe("exact-gif-last.png"); expect(x.message.edit).toHaveBeenCalledTimes(1);
  });
  it("selects a compact attachment if CDN is unavailable", () => {
    const small = { ...gif, bytes: 300, width: 640, height: 360 };
    expect(selectSimulationGif([gif, small], 500)).toEqual(small);
    expect(selectSimulationGif([gif], 500)).toBeUndefined();
  });
});

it("defaults to an active agent banner, never silently uses a future or expired banner", () => {
  const catalog = getSimulationCatalog(), now = Date.parse("2026-09-24T00:00:00Z");
  expect(selectSimulationBanner(catalog, undefined, now).pool).toBe("character");
  const choices = simulationBannerChoices("", catalog, now);
  expect(choices.length).toBeGreaterThanOrEqual(4); expect(choices.every(c => c.value.length <= 100 && c.name.length <= 100)).toBe(true);
  expect(() => selectSimulationBanner(catalog, undefined, Date.parse("2099-01-01"))).toThrow("尚未更新");
  expect(() => selectSimulationBanner(catalog, "tampered", now)).toThrow("找不到");
});

it("registers optional autocomplete banner/count and ACKs without a HoYoLAB login", () => {
  const data = command.data.toJSON();
  expect(data.name_localizations?.["zh-TW"]).toBe("模擬調頻");
  expect(data.options?.[0]).toMatchObject({ name: "banner", autocomplete: true, required: false });
  expect(data.options?.[1]).toMatchObject({ name: "count", required: false });
  expect(getInteractionPreflight({ commandName: data.name })).toEqual({ deferBeforeDrain: true, skipPendingLoginDrain: true, skipLocaleLookup: true });
});

it("refreshes public banner metadata, splits simultaneous UPs, and rejects missing result assets before drawing", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "zzz-catalog-test-"));
  const previous = process.env.ZZZ_GACHA_CATALOG;
  process.env.ZZZ_GACHA_CATALOG = path.join(dir, "catalog.json");
  try {
    const entry = {
      name: "同時開放", version: "test", channelCategory: "character_up",
      startAt: "2027-01-01T00:00:00Z", endAt: "2027-02-01T00:00:00Z",
      upItems: [{ id: "1021", name: "貓又", rarity: "S" }, { id: "1041", name: "11 號", rarity: "S" },
        { id: "1011", name: "安比", rarity: "A" }, { id: "1011", name: "安比", rarity: "A" }],
    };
    cacheSimulationCalendar([entry, { ...entry, channelCategory: "character_rerun", startAt: "2028-01-01T00:00:00Z" }]);
    let catalog = getSimulationCatalog();
    const added = catalog.banners.filter(b => b.version === "test");
    expect(added).toHaveLength(2);
    expect(added.map(b => b.featuredS)).toEqual(["1021", "1041"]);
    expect(added.every(b => b.featuredA.length === 1)).toBe(true);
    expect(added.every(b => b.startAt === entry.startAt)).toBe(true);
    added.forEach(b => assertSimulationAssets(b, catalog));
    cacheSimulationCalendar([{ ...entry, upItems: [{ id: "999999", name: "未備素材", rarity: "S" }, entry.upItems[2]] }]);
    catalog = getSimulationCatalog();
    const unavailable = catalog.banners.find(b => b.featuredS === "999999")!;
    expect(() => assertSimulationAssets(unavailable, catalog)).toThrow("尚未準備好");
    expect(JSON.parse(readFileSync(process.env.ZZZ_GACHA_CATALOG, "utf8")).banners).toEqual(catalog.banners);
  } finally {
    if (previous === undefined) delete process.env.ZZZ_GACHA_CATALOG; else process.env.ZZZ_GACHA_CATALOG = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
