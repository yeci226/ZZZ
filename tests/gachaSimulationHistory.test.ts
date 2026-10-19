import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertSimulationAssets, cacheSimulationCalendar, getSimulationCatalog, selectSimulationBanner, simulationBannerChoices, type SimulationCatalog } from "../src/utilities/zzz/gachaSimulationCatalog.js";
import { EMPTY_SIMULATION_STATE, simulatePulls } from "../src/utilities/zzz/gachaSimulationEngine.js";
import { GachaSimulationStore } from "../src/utilities/zzz/gachaSimulationStore.js";

const now = Date.parse("2026-09-24T00:00:00Z");
// Fixed historical assertions must not depend on the running bot's live calendar,
// which may already contain announced future banners without local portraits.
const catalog = JSON.parse(readFileSync("src/assets/gacha-simulation/catalog.json", "utf8")) as SimulationCatalog;
const banner = (id: string) => selectSimulationBanner(catalog, id, now);

it("offers playable historical channels from every released version without changing the current default", () => {
  expect(new Set(catalog.banners.map(b => b.id)).size).toBe(catalog.banners.length);
  expect(new Set(catalog.banners.map(b => b.version)).size).toBe(20);
  expect(catalog.banners.filter(b => Date.parse(b.endAt) < now)).toHaveLength(126);
  for (const b of catalog.banners) {
    assertSimulationAssets(b, catalog);
    expect(Date.parse(b.startAt)).toBeLessThan(Date.parse(b.endAt));
    const { pulls } = simulatePulls(b, { ...EMPTY_SIMULATION_STATE, guaranteedS: true }, 1, () => 0);
    expect(pulls[0].id).toBe(b.featuredS);
    if (b.pool === "weapon") expect(b.agentsA).toEqual([]);
  }
  expect(selectSimulationBanner(catalog, undefined, now).id).toBe("character-1611-2026-09-09");
  expect(banner("character-1191-2024-07-04").version).toBe("1.0");
});

it("searches past versions, UP names and pool types before applying Discord's 25-choice limit", () => {
  expect(simulationBannerChoices("1.4 雅", catalog, now).map(c => c.value)).toEqual(["character-1091-2024-12-18"]);
  expect(simulationBannerChoices("１.０ 音擎", catalog, now).map(c => c.value)).toEqual([
    "weapon-14124-2024-07-24", "weapon-14119-2024-07-04",
  ]);
  expect(simulationBannerChoices("艾蓮", catalog, now)).toHaveLength(3);
  expect(simulationBannerChoices("", catalog, now)).toHaveLength(25);
  expect(simulationBannerChoices("2024-07-04", catalog, now)).toHaveLength(2);
  expect(simulationBannerChoices("3.2", catalog, Date.parse("2026-09-08"))).toEqual([]);
  expect(simulationBannerChoices("不存在的卡池", catalog, now)).toEqual([]);
});

it("keeps different A UPs separate when simultaneous S banners were merged upstream", () => {
  expect(banner("character-1091-2024-12-18").featuredA).toEqual(["1131", "1281"]);
  expect(banner("character-1201-2024-12-18").featuredA).toEqual(["1151", "1271"]);
  expect(banner("weapon-14120-2024-12-18").featuredA).toEqual(["13115", "13127"]);
  expect(banner("character-1431-2025-12-30").featuredA).toEqual(["1031", "1151"]);
  expect(banner("character-1341-2025-12-30").featuredA).toEqual(["1011", "1121"]);
  expect(banner("character-1581-2026-07-29").featuredA).toEqual(["1281", "1271"]);
  expect(banner("character-1591-2026-08-19").featuredA).toEqual(["1131", "1151"]);
});

it("excludes later items and waits until the following version before adding debut A items to off-UP pools", () => {
  const ellen = banner("character-1191-2024-07-04");
  for (const id of ["1271", "1351", "1421", "1441"]) expect(ellen.agentsA).not.toContain(id);
  for (const id of ["13127", "13135", "13142", "13144", "13012", "13017"]) expect(ellen.weaponsA).not.toContain(id);
  expect(ellen.weaponsB).not.toContain("12015"); expect(ellen.weaponsB).not.toContain("12016");
  const jane = banner("character-1261-2024-09-04");
  expect(jane.featuredA).toContain("1271"); expect(jane.agentsA).not.toContain("1271");
  expect(banner("character-1071-2024-09-25").agentsA).toContain("1271");
  const fufu = banner("character-1391-2025-06-25");
  expect(fufu.agentsA).not.toContain("1421"); expect(fufu.weaponsA).not.toContain("13142");
  expect(fufu.weaponsA).toContain("13012"); expect(fufu.weaponsB).toContain("12015");
  expect(banner("character-1411-2025-07-16").agentsA).toContain("1421");
});

it("shares persisted pity with current banners while keeping the old message's banner snapshot", () => {
  const store = new GachaSimulationStore(":memory:");
  try {
    let index = 0;
    const old = store.draw("owner", "history", banner("character-1191-2024-07-04"), 1, () => [0, .99, 0][index++] ?? .99, 10000);
    expect(old.state.guaranteedS).toBe(true);
    const next = store.draw("owner", "current", selectSimulationBanner(catalog, undefined, now), 1, () => 0, 20000);
    expect(next.pulls[0].id).toBe("1611"); expect(next.state.total).toBe(2);
    const saved = store.get(old.id)!;
    expect(saved.banner.id).toBe(old.banner.id);
    expect(saved.banner.weaponsB).not.toContain("12016");
    expect(store.state("owner", "weapon").total).toBe(0);
  } finally { store.close(); }
});

it("retains bundled history when an older live cache or a new public calendar is loaded", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "zzz-history-"));
  const before = process.env.ZZZ_GACHA_CATALOG;
  process.env.ZZZ_GACHA_CATALOG = path.join(dir, "catalog.json");
  try {
    const stale = structuredClone(catalog);
    stale.banners = stale.banners.filter(b => b.version === "3.2");
    delete stale.items["1191"];
    writeFileSync(process.env.ZZZ_GACHA_CATALOG, JSON.stringify(stale));
    const loaded = getSimulationCatalog();
    expect(loaded.banners).toHaveLength(130); expect(loaded.items["1191"]).toBeDefined();
    cacheSimulationCalendar([{
      name: "測試新池", version: "4.0", channelCategory: "character_up",
      startAt: "2027-01-01T02:00:00.000Z", endAt: "2027-02-01T03:59:59.000Z",
      upItems: [{ id: "1191", name: "艾蓮", rarity: "S" }, { id: "1011", name: "安比", rarity: "A" }],
    }]);
    const refreshed = getSimulationCatalog();
    expect(refreshed.banners).toHaveLength(131);
    expect(refreshed.banners.find(b => b.id === "character-1191-2024-07-04")).toEqual(banner("character-1191-2024-07-04"));
    expect(JSON.parse(readFileSync(process.env.ZZZ_GACHA_CATALOG, "utf8")).banners).toHaveLength(131);
  } finally {
    if (before === undefined) delete process.env.ZZZ_GACHA_CATALOG; else process.env.ZZZ_GACHA_CATALOG = before;
    rmSync(dir, { recursive: true, force: true });
  }
});
