import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  compareMysteryMazeRichness,
  isIdealMysteryMazeSample,
  materializeMysteryMazeIcons,
  sanitizeMysteryMazeFixture,
  selectRicherMysteryMazeSample,
  serializedFixtureContainsPrivateData,
  sortMysteryMazeCandidates,
  writeMysteryMazeFixtureAtomic,
  type MysteryMazeCandidate,
  type MysteryMazeFixturePayload,
} from "../src/utilities/zzz/mysteryMazeFixture.js";
import {
  createMinimumIntervalGate,
  linkedAccountsFromRows,
  parseMysteryMazeFixtureArgs,
  sanitizeMysteryMazeScanError,
} from "../src/scripts/findMysteryMazeFixture.js";

const account = (uid: string, recentAt = 0): MysteryMazeCandidate => ({
  ownerId: `owner-${uid}`,
  accountIndex: 0,
  uid,
  cookie: `cookie-${uid}`,
  recentAt,
});

function payload(
  options: {
    maps?: number;
    medals?: number;
    goods?: number;
    records?: number;
    gains?: boolean;
  } = {},
): MysteryMazeFixturePayload {
  const maps = options.maps ?? 1,
    medals = options.medals ?? 0,
    goods = options.goods ?? 0,
    records = options.records ?? 0;
  return {
    abstract: {
      season_unlock: true,
      season_data: { season_level: 1 },
      map_list: Array.from({ length: maps }, (_, map_id) => ({
        map_id,
        is_challenge: true,
      })),
      collection_data: {
        medal_data: {
          list: Array.from({ length: medals }, (_, medal_id) => ({
            medal_id,
            unlock: true,
          })),
        },
        goods_data: {
          list: Array.from({ length: goods }, (_, goods_id) => ({
            goods_id,
            unlock: true,
          })),
        },
      },
    },
    detail: {
      record_list: Array.from({ length: records }, (_, id) => ({
        is_success: true,
        avatar_list: [{ id: id + 1000 }],
        item_list: options.gains ? [{ id }] : [],
      })),
    },
  };
}

describe("Mystery Maze fixture selection", () => {
  it("sorts recent accounts first and stops after the first richer batch", async () => {
    const baseline = account("baseline");
    const candidates = [
      account("older", 1),
      account("rich", 3),
      account("broken", 4),
    ];
    const data = new Map([
      ["baseline", payload({ maps: 1, records: 1 })],
      ["older", payload({ maps: 1, records: 1 })],
      [
        "rich",
        payload({ maps: 3, medals: 12, goods: 20, records: 4, gains: true }),
      ],
    ]);
    const calls: string[] = [];
    const result = await selectRicherMysteryMazeSample({
      baseline,
      candidates,
      batchSize: 2,
      fetcher: {
        abstract: async (candidate) => {
          calls.push(`a:${candidate.uid}`);
          if (candidate.uid === "broken") throw new Error("expired");
          return data.get(candidate.uid)!.abstract;
        },
        detail: async (candidate) => {
          calls.push(`d:${candidate.uid}`);
          return data.get(candidate.uid)!.detail;
        },
      },
    });
    expect(result.selected?.candidate.uid).toBe("rich");
    expect(result.scanned).toBe(2);
    expect(result.failed).toBe(1);
    expect(calls).not.toContain("a:older");
    expect(isIdealMysteryMazeSample(result.selected!.richness)).toBe(true);
    expect(
      compareMysteryMazeRichness(result.selected!.richness, result.baseline),
    ).toBeGreaterThan(0);
  });

  it("returns no sample when no complete candidate is strictly richer", async () => {
    const same = payload({ maps: 1, records: 1 });
    const result = await selectRicherMysteryMazeSample({
      baseline: account("baseline"),
      candidates: [account("same")],
      fetcher: {
        abstract: async () => same.abstract,
        detail: async () => same.detail,
      },
    });
    expect(result.selected).toBeNull();
  });

  it("scores every account in a batch before choosing its richest sample", async () => {
    const data = new Map([
      ["baseline", payload({ maps: 1, records: 1 })],
      [
        "complete",
        payload({ maps: 3, medals: 12, goods: 20, records: 4, gains: true }),
      ],
      [
        "more-maps",
        payload({ maps: 5, medals: 12, goods: 20, records: 4, gains: true }),
      ],
    ]);
    const result = await selectRicherMysteryMazeSample({
      baseline: account("baseline"),
      candidates: [account("complete", 2), account("more-maps", 1)],
      batchSize: 2,
      fetcher: {
        abstract: async (candidate) => data.get(candidate.uid)!.abstract,
        detail: async (candidate) => data.get(candidate.uid)!.detail,
      },
    });
    expect(result.scanned).toBe(2);
    expect(result.selected?.candidate.uid).toBe("more-maps");
  });

  it("uses recent time, update time, then UID for deterministic order", () => {
    expect(
      sortMysteryMazeCandidates([
        { ...account("3"), updatedAt: 3 },
        { ...account("2"), recentAt: 4 },
        { ...account("1"), recentAt: 4 },
      ]).map((candidate) => candidate.uid),
    ).toEqual(["1", "2", "3"]);
  });
});

describe("Mystery Maze fixture CLI input", () => {
  it("uses the canonical flattened account index and skips invalid accounts", () => {
    const accounts = linkedAccountsFromRows([
      {
        ID: "123456789",
        json: JSON.stringify({
          lastAutoDaily: "2026-09-01T00:00:00Z",
          hoyolabs: [
            {
              cookie: "first",
              characters: [
                { uid: "100", invalid: true },
                { uid: "101", region: "prod_gf_us" },
              ],
            },
            { cookie: "second", characters: [{ uid: "102" }] },
          ],
        }),
      },
    ]);

    expect(
      accounts.map(({ accountIndex, uid, cookie }) => ({
        accountIndex,
        uid,
        cookie,
      })),
    ).toEqual([
      { accountIndex: 1, uid: "101", cookie: "first" },
      { accountIndex: 2, uid: "102", cookie: "second" },
    ]);
  });

  it("enforces a one-second minimum request interval in parsed options", () => {
    const options = parseMysteryMazeFixtureArgs([
      "--baseline-user",
      "123456789",
      "--account",
      "2",
      "--limit",
      "100",
      "--batch-size",
      "100",
      "--delay-ms",
      "10",
    ]);
    expect(options).toMatchObject({
      accountIndex: 2,
      limit: 50,
      batchSize: 10,
      delayMs: 1000,
    });
  });

  it("waits for the remaining interval between sequential API calls", async () => {
    let now = 100;
    const waits: number[] = [];
    const gate = createMinimumIntervalGate(
      1000,
      () => now,
      async (milliseconds) => {
        waits.push(milliseconds);
        now += milliseconds;
      },
    );
    await gate(async () => "first");
    now += 250;
    await gate(async () => "second");
    expect(waits).toEqual([750]);
  });

  it("redacts credentials and long user identifiers from errors", () => {
    const text = sanitizeMysteryMazeScanError(
      new Error("uid 1300007596 failed with cookie=private-value"),
    );
    expect(text).toBe("uid [redacted-id] failed with cookie=[redacted]");
    expect(text).not.toContain("1300007596");
    expect(text).not.toContain("private-value");
  });
});

describe("Mystery Maze fixture anonymization", () => {
  it("keeps the committed rich fixture anonymous and offline", async () => {
    const fixture = JSON.parse(
      await readFile(
        join(process.cwd(), "tests", "fixtures", "mysteryMaze.rich.json"),
        "utf8",
      ),
    ) as MysteryMazeFixturePayload;
    expect(serializedFixtureContainsPrivateData(fixture)).toBe(false);
    expect(JSON.stringify(fixture)).not.toMatch(/https?:\/\//i);
    const records = fixture.detail.record_list ?? [];
    expect(records.length).toBeGreaterThanOrEqual(4);
    expect(
      records.every(
        (record) =>
          typeof record.start_time === "object" &&
          Number(record.start_time?.year) === 2026,
      ),
    ).toBe(true);
  });

  it("removes credentials and identity while fixing record dates", () => {
    const raw = payload({
      maps: 3,
      medals: 12,
      goods: 20,
      records: 1,
      gains: true,
    }) as any;
    raw.cookie = "secret";
    raw.ownerId = "123456789";
    raw.abstract.uid = "900000001";
    raw.abstract.nick_name = "Real Player";
    raw.abstract.avatar_icon = "https://example.test/player.png";
    raw.detail.record_list[0].start_time = { year: 2030, month: 12, day: 31 };
    const sanitized = sanitizeMysteryMazeFixture(raw);
    expect(sanitized.abstract.nick_name).toBeUndefined();
    expect((sanitized.abstract as any).uid).toBeUndefined();
    expect(sanitized.abstract.avatar_icon).toBeUndefined();
    expect(sanitized.detail.record_list?.[0]?.start_time).toEqual({
      year: 2026,
      month: 1,
      day: 15,
      hour: 12,
      minute: 0,
      second: 0,
    });
    expect(serializedFixtureContainsPrivateData(sanitized)).toBe(false);
  });

  it("localizes remote icons and writes only the sanitized fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "maze-fixture-"));
    try {
      const sanitized = sanitizeMysteryMazeFixture({
        abstract: {
          collection_data: {
            medal_data: {
              list: [
                {
                  medal_id: 1,
                  medal_icon: "https://cdn.test/icon.png",
                  unlock: true,
                },
              ],
            },
          },
        },
        detail: {},
      });
      const localized = await materializeMysteryMazeIcons(sanitized, {
        assetDirectory: join(root, "assets"),
        referenceDirectory: "tests/fixtures/mystery-maze-assets",
        fetchImpl: jest.fn(
          async () =>
            new Response(new Uint8Array([137, 80, 78, 71]), {
              status: 200,
              headers: { "content-type": "image/png" },
            }),
        ) as typeof fetch,
      });
      const reference =
        localized.abstract.collection_data?.medal_data?.list?.[0]?.medal_icon;
      expect(reference).toMatch(
        /^tests\/fixtures\/mystery-maze-assets\/[a-f0-9]{64}\.png$/,
      );
      const output = join(root, "mysteryMaze.rich.json");
      await writeMysteryMazeFixtureAtomic(output, localized);
      expect(await readFile(output, "utf8")).not.toContain("cdn.test");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
