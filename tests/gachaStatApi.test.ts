import { createGachaStatClient } from "../src/utilities/zzz/gachaStatApi.js";
import { rawCurrentCharacter, rawHistoryCharacter, rawIndex } from "./fixtures/gachaStat.js";

const client = { uid: 1300000001, region: "prod_gf_jp", lang: "zh-tw", cookie: { ltoken_v2: "t", ltuid_v2: "1" } };
const ok = (data: unknown) => ({ ok: true, json: async () => ({ retcode: 0, message: "OK", data }), headers: { getSetCookie: () => [] } });

it("requests the index with uid, region, lang and the HoYoLAB cookie only", async () => {
  const fetcher = jest.fn().mockResolvedValue(ok(rawIndex));
  const index = await createGachaStatClient(client, fetcher as any)!.index();
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://sg-act-public-api.hoyolab.com/event/nap_gacha_record/api/zzz/index?uid=1300000001&region=prod_gf_jp&lang=zh-tw");
  expect(options.method ?? "GET").toBe("GET");
  expect(options.headers.Cookie).toBe("ltoken_v2=t; ltuid_v2=1");
  expect(index).toMatchObject({ totalCount: 360, totalS: 5, currentVersion: "3.3",
    tickets: { monochrome: 100, polychrome: 1600, encrypted: 3, original: 0, boopon: 7 } });
  expect(index.types[0]).toEqual({ category: "character_up", totalCount: 300, sCount: 4, upCount: 3,
    averageUp: 100, currentPity: 20, toHardPity: 70, versions: ["3.3", "3.2", "3.1"] });
  expect(index.types[1]!.category).toBe("standard");
});

it("maps pools and records, converting string numbers", async () => {
  const fetcher = jest.fn().mockResolvedValueOnce(ok(rawCurrentCharacter)).mockResolvedValueOnce(ok(rawHistoryCharacter));
  const api = createGachaStatClient(client, fetcher as any)!;
  const current = await api.currentPools("character_up");
  expect(fetcher.mock.calls[0][0]).toContain("/api/zzz/cur_pool_stat?uid=1300000001&region=prod_gf_jp&lang=zh-tw&gacha_type=2");
  expect(current.map((pool) => [pool.state, pool.version, pool.startTs, pool.upItems[0]!.itemId, pool.records.length]))
    .toEqual([["in_progress", "3.3", 1794369600, "1631", 0], ["ended", "3.3", 1792544400, "1641", 1]]);
  expect(current[1]!.records[0]).toMatchObject({ itemId: "1641", count: 76, sort: 280, isUp: true, recordTime: 1792553604 });
  const history = await api.historyPools("character_up", ["3.2", "3.1"]);
  expect(fetcher.mock.calls[1][0]).toContain("gacha_type=2&vers=3.2%2C3.1");
  expect(history).toHaveLength(1);
  expect(history[0]!.records.map((record) => record.isUp)).toEqual([true, false, true]);
});

it("splits history into requests of at most eight versions", async () => {
  const fetcher = jest.fn().mockResolvedValue(ok({ list: [] }));
  await createGachaStatClient(client, fetcher as any)!.historyPools("standard", Array.from({ length: 19 }, (_, i) => `1.${i}`));
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[0][0]).toContain("gacha_type=1&");
});

it("turns malformed numbers into 0 or null instead of NaN", async () => {
  const broken = { ...rawIndex, total_gacha_count: "", type_stats: [{ gacha_type: "GACHA_TYPE_WEAPON_UP", total_count: null, s_count: "x", avr_up_count: "", has_data_vers: null }] };
  const index = await createGachaStatClient(client, jest.fn().mockResolvedValue(ok(broken)) as any)!.index();
  expect(index.totalCount).toBe(0);
  expect(index.types[0]).toEqual({ category: "weapon_up", totalCount: 0, sCount: 0, upCount: 0, averageUp: null, currentPity: 0, toHardPity: 0, versions: [] });
});

it("throws a typed error on a login rejection and returns no client without a cookie", async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ retcode: -100, message: "Please log in", data: null }), headers: { getSetCookie: () => [] } });
  await expect(createGachaStatClient(client, fetcher as any)!.index()).rejects.toMatchObject({ name: "GachaStatError", retcode: -100 });
  expect(createGachaStatClient({ ...client, cookie: "" })).toBeUndefined();
  expect(createGachaStatClient({ ...client, region: "bad" })).toBeUndefined();
});
