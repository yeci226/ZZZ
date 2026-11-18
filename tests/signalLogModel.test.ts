import { analyzeGachaRecords } from "../src/utilities/zzz/gachaAnalysis.js";
import type { GachaArchiveBanner, GachaArchiveRecord } from "../src/utilities/zzz/gachaArchive.js";
import { createGachaStatClient, type GachaStatPool } from "../src/utilities/zzz/gachaStatApi.js";
import {
  channelFromArchive, emptyChannel, isLimitedCategory, modelFromOfficialStats, ticketsFromDetails,
} from "../src/utilities/zzz/signalLogModel.js";
import { rawCurrentCharacter, rawHistoryCharacter, rawIndex } from "./fixtures/gachaStat.js";

const client = { uid: 1300000001, region: "prod_gf_jp", lang: "en-us", cookie: { ltoken_v2: "t", ltuid_v2: "1" } };
const ok = (data: unknown) => ({ ok: true, json: async () => ({ retcode: 0, message: "OK", data }), headers: { getSetCookie: () => [] } });

let index: Awaited<ReturnType<NonNullable<ReturnType<typeof createGachaStatClient>>["index"]>>;
let stored: Array<{ category: "character_up" | "standard"; version: string; pools: GachaStatPool[] }>;

beforeAll(async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(ok(rawIndex)).mockResolvedValueOnce(ok(rawCurrentCharacter)).mockResolvedValueOnce(ok(rawHistoryCharacter));
  const api = createGachaStatClient(client, fetcher as any)!;
  index = await api.index();
  const current = await api.currentPools("character_up");
  const history = await api.historyPools("character_up", ["3.1"]);
  const standardPool: GachaStatPool = {
    category: "standard", version: "3.1", state: "ended", startTs: 0, endTs: 0, upItems: [],
    records: [{ itemId: "1021", name: "Standard Agent", icon: "", itemType: "ITEM_TYPE_AVATAR", rarity: "S", isUp: false, upTag: "", count: 50, sort: 50, recordTime: 1788000000 }],
  };
  stored = [
    { category: "character_up", version: "3.3", pools: current },
    { category: "character_up", version: "3.2", pools: [] },
    { category: "character_up", version: "3.1", pools: history },
    { category: "standard", version: "3.1", pools: [standardPool] },
  ];
});

it("builds a limited channel from official statistics", () => {
  const { model, incomplete } = modelFromOfficialStats(index, stored);
  const channel = model.channels.character_up;
  expect(incomplete).toEqual([]);
  expect(channel).toMatchObject({ limited: true, hasRecords: true, total: 300, sCount: 4, upCount: 3,
    averageS: 70, averageUpCost: 100, currentPity: 20, hardPity: 90, toHardPity: 70, pityEstimated: false });
  // The latest S is UP, so the next one is not guaranteed.
  expect(channel.guaranteed).toBe(false);
  expect(channel.entries.map((entry) => [entry.itemId, entry.pity, entry.isUp])).toEqual([["1641", 76, true], ["1581", 30, true], ["1221", 18, false], ["1581", 76, true]]);
  expect(channel.entries[0]!.pulledAt).toBe("2026-10-21T03:33:24.000Z");
  expect(channel.firstRecordAt).not.toBeNull();
});

it("splits the current version by pool and keeps one segment per past version", () => {
  const segments = modelFromOfficialStats(index, stored).model.channels.character_up.segments;
  expect(segments.map((segment) => [segment.version, segment.ongoing, segment.upNames.length, segment.entries.length, segment.pulls]))
    .toEqual([["3.3", true, 1, 0, null], ["3.3", false, 1, 1, null], ["3.2", false, 0, 0, null], ["3.1", false, 0, 3, null]]);
  expect(segments[0]!.startAt).toBe("2026-11-11T04:00:00.000Z");
  expect(segments[3]!.startAt).toBeNull();
});

it("hides UP information on channels without an UP concept", () => {
  const channel = modelFromOfficialStats(index, stored).model.channels.standard;
  expect(channel).toMatchObject({ limited: false, upCount: null, averageUpCost: null, guaranteed: null });
  expect(channel.entries.every((entry) => entry.isUp === null)).toBe(true);
});

it("reports a channel whose pools do not add up to its S count", () => {
  const short = stored.filter((row) => !(row.category === "character_up" && row.version === "3.1"));
  expect(modelFromOfficialStats(index, short).incomplete).toEqual(["character_up"]);
});

it("computes tickets and available pulls without monochrome", () => {
  expect(modelFromOfficialStats(index, stored).model.tickets)
    .toEqual({ monochrome: 100, polychrome: 1600, encrypted: 3, original: 0, boopon: 7, pullsAvailable: 13 });
});

it("fills channels the account never pulled on with an empty model", () => {
  expect(modelFromOfficialStats(index, stored).model.channels.bangboo)
    .toMatchObject({ hasRecords: false, total: 0, sCount: 0, entries: [], segments: [] });
});

describe("archived pulls", () => {
  const base = { ownerId: "o", uid: "1", source: "official" as const, gachaType: "2", channelCategory: "character_up" as const };
  const pull = (n: number, bannerId: string | null, rarity: string, itemId: string, isUp: boolean | null): GachaArchiveRecord => ({
    ...base, bannerId, recordId: String(1000 + n), itemId, name: `Item ${itemId}`, itemType: "Agent", rarity,
    pulledAt: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(), isUp,
  } as GachaArchiveRecord);
  const records = [
    pull(1, null, "A", "9001", null), pull(2, null, "S", "1221", false), pull(3, "b1", "A", "9002", null),
    pull(4, "b1", "S", "1581", true), pull(5, "b1", "A", "9003", null), pull(6, "b2", "A", "9004", null),
    pull(7, "b2", "S", "1641", true), pull(8, "b2", "A", "9005", null),
  ];
  const banner = (bannerId: string, version: string, startAt: string, upId: string): GachaArchiveBanner => ({
    ownerId: "o", uid: "1", source: "official", bannerId, channelCategory: "character_up", name: `Banner ${bannerId}`,
    version, startAt, endAt: null, upItems: [{ id: upId, name: `Up ${upId}`, icon: "", rarity: "S" }],
  } as GachaArchiveBanner);
  const banners = [banner("b1", "3.1", "2026-09-01T00:00:00.000Z", "1581"), banner("b2", "3.2", "2026-10-01T00:00:00.000Z", "1641")];
  const summary = analyzeGachaRecords({ records, category: "character_up" });

  it("builds a channel from archived pulls, grouped by banner with pull counts", () => {
    const channel = channelFromArchive({ category: "character_up", summary, pityEstimated: true, banners, unclassifiedLabel: "Unclassified" });
    expect(channel).toMatchObject({ total: summary.total, sCount: summary.sRecords.length, upCount: summary.upEligible ? summary.upWins : null,
      averageUpCost: summary.averageUpCost, guaranteed: summary.nextGuaranteed, pityEstimated: true });
    expect(channel.segments.map((segment) => segment.key)).toEqual(["b2", "b1", "__unclassified__"]);
    expect(channel.segments.at(-1)).toMatchObject({ key: "__unclassified__", version: "", upNames: ["Unclassified"] });
    expect(channel.segments[0]).toMatchObject({ version: "3.2", upNames: ["Up 1641"], pulls: 3 });
    expect(channel.segments[0]!.pulls).toBeGreaterThan(0);
    expect(channel.entries.map((entry) => entry.itemId)).toEqual(["1641", "1581", "1221"]);
  });

  it("drops UP flags on channels without an UP concept", () => {
    const bangboo = analyzeGachaRecords({ records: records.map((record) => ({ ...record, channelCategory: "bangboo" as const })), category: "bangboo" });
    const channel = channelFromArchive({ category: "bangboo", summary: bangboo, pityEstimated: false, banners: [], unclassifiedLabel: "x" });
    expect(channel).toMatchObject({ limited: false, upCount: null, averageUpCost: null, guaranteed: null });
    expect(channel.entries.every((entry) => entry.isUp === null)).toBe(true);
  });
});

it("reads tickets from live details and rejects missing ones", () => {
  expect(ticketsFromDetails({ tickets: [
    { ticket_type: "GACHA_TICKET_TYPE_POLYCHROME", ticket_cnt: "320" },
    { ticket_type: "GACHA_TICKET_TYPE_ENCRYPTED_MASTER_TAPE", ticket_cnt: "2" },
    { ticket_type: "GACHA_TICKET_TYPE_MASTER_TAPE", ticket_cnt: "1" },
  ] })).toEqual({ monochrome: null, polychrome: 320, encrypted: 2, original: 1, boopon: 0, pullsAvailable: 4 });
  expect(ticketsFromDetails({ tickets: [] })).toBeNull();
  expect(ticketsFromDetails(undefined)).toBeNull();
});

it("knows which channels are limited and builds empty channels", () => {
  expect(["character_up", "weapon_return", "standard", "bangboo"].map((category) => isLimitedCategory(category as any))).toEqual([true, true, false, false]);
  expect(emptyChannel("weapon_up")).toMatchObject({ limited: true, hasRecords: false, hardPity: 80, segments: [], entries: [] });
});
