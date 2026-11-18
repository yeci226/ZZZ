import { GachaArchiveStore } from "../src/utilities/zzz/gachaArchive.js";
import { syncOfficialGachaStats } from "../src/utilities/zzz/gachaStatSync.js";
import {
  GachaStatError,
  type GachaStatClient,
  type GachaStatIndex,
  type GachaStatPool,
  type GachaStatRecord,
} from "../src/utilities/zzz/gachaStatApi.js";

const record = (sort: number): GachaStatRecord => ({
  itemId: "1581", name: "", icon: "", itemType: "ItemType_Avatar", rarity: "S", isUp: true,
  upTag: "UP_TAG_NONE", count: 30, sort, recordTime: 1785292496,
});
const poolWith = (version: string, records: GachaStatRecord[]): GachaStatPool => ({
  category: "character_up", version, state: "ended", startTs: 0, endTs: 0, upItems: [], records,
});

describe("syncOfficialGachaStats", () => {
  const index: GachaStatIndex = {
    totalCount: 300, totalS: 5, currentVersion: "3.3",
    tickets: { monochrome: 0, polychrome: 0, encrypted: 0, original: 0, boopon: 0 },
    types: [
      { category: "character_up", totalCount: 200, sCount: 3, upCount: 2, averageUp: 70, currentPity: 10, toHardPity: 90, versions: ["3.3", "3.2", "3.1"] },
      { category: "standard", totalCount: 100, sCount: 2, upCount: 0, averageUp: null, currentPity: 5, toHardPity: 90, versions: ["3.1"] },
    ],
  };
  const sameRecordAsCurrent = record(204);
  let store: GachaArchiveStore;
  let fake: { index: jest.Mock; currentPools: jest.Mock; historyPools: jest.Mock };
  const run = () => syncOfficialGachaStats({ client: fake as unknown as GachaStatClient, ownerId: "owner", uid: "1300000001", archive: store, delayMs: 0 });

  beforeEach(() => {
    store = new GachaArchiveStore(":memory:");
    store.upsertAccount({ ownerId: "owner", uid: "1300000001", source: "official", region: "prod_gf_jp" });
    fake = {
      index: jest.fn().mockResolvedValue(index),
      currentPools: jest.fn(async (category: string) => category === "character_up"
        ? [poolWith("3.3", [sameRecordAsCurrent]), poolWith("3.3", [])] : []),
      historyPools: jest.fn().mockResolvedValue([poolWith("3.1", [record(10)])]),
    };
  });

  it("fetches the index, current pools and unseen history, then stores them", async () => {
    const result = await run();
    expect(fake.currentPools.mock.calls.map(([category]) => category)).toEqual(["character_up", "standard"]);
    expect(fake.historyPools.mock.calls).toEqual([["character_up", ["3.3", "3.2", "3.1"]], ["standard", ["3.1"]]]);
    expect(result.requests).toBe(5);
    const rows = store.listOfficialStatPools("owner", "1300000001");
    expect(rows.filter((row) => row.category === "character_up").map((row) => [row.version, row.final, row.pools.length]).sort())
      .toEqual([["3.1", true, 1], ["3.2", true, 0], ["3.3", false, 2]]);
  });

  it("does not refetch finalised versions", async () => {
    await run();
    fake.historyPools.mockClear();
    await run();
    expect(fake.historyPools.mock.calls).toEqual([["character_up", ["3.3"]]]);
  });

  it("merges current-version records from both endpoints without duplicates", async () => {
    fake.historyPools.mockResolvedValueOnce([poolWith("3.3", [sameRecordAsCurrent])]);
    await run();
    const current = store.listOfficialStatPools("owner", "1300000001").find((row) => row.category === "character_up" && row.version === "3.3")!;
    expect(current.pools.flatMap((item) => item.records)).toHaveLength(1);
    expect(current.pools).toHaveLength(2);
  });

  it("keeps what was already stored when a later request fails", async () => {
    fake.historyPools.mockRejectedValueOnce(new GachaStatError("timeout", null));
    await expect(run()).rejects.toThrow("timeout");
    expect(store.getOfficialStatIndex("owner", "1300000001")).not.toBeNull();
  });

  it("waits between consecutive calls only", async () => {
    jest.useFakeTimers();
    try {
      const promise = syncOfficialGachaStats({ client: fake as unknown as GachaStatClient, ownerId: "owner", uid: "1300000001", archive: store, delayMs: 100 });
      await jest.advanceTimersByTimeAsync(100 * 4);
      await expect(promise).resolves.toEqual({ requests: 5 });
    } finally { jest.useRealTimers(); }
  });
});
