import {
  formatProfileRank,
  loadProfileMainData,
  normalizeProfileDeadly,
  normalizeProfileShiyu,
} from "../src/utilities/zzz/profileMainData.js";

const start = { year: 2026, month: 9, day: 11 };
const end = { year: 2026, month: 9, day: 25 };
const deadly = {
  start_time: start,
  end_time: end,
  list: [
    { nest_type: "General", score: 105105, star: 9, rank: 1902 },
    { nest_type: "Hard", score: 11974, star: 1, rank: 8194 },
  ],
};
const shiyu = {
  hadal_info_v2: {
    hadal_begin_time: start,
    hadal_end_time: end,
    brief: {
      score: 119278,
      rank_percent: 1317,
      rating: "S+",
      cur_period_zone_layer_count: 5,
    },
  },
};

describe("profile summary normalization", () => {
  it.each([
    [1902, "19.02%"],
    [50, "0.50%"],
    [1, "0.01%"],
    [5000, "50.00%"],
    [5001, "50.00%+"],
    [8194, "50.00%+"],
    ["1317", "13.17%"],
    [0, null],
    [null, null],
    [undefined, null],
    ["", null],
    [NaN, null],
    [-1, null],
  ])("formats provider rank %s without guessing its unit", (raw, expected) => {
    expect(formatProfileRank(raw)).toBe(expected);
  });

  it("maps API General/Hard entries independently of their order", () => {
    const result = normalizeProfileDeadly(deadly, 2);
    expect(result).toEqual({
      schedule: 2,
      status: "ready",
      start: "2026.09.11",
      end: "2026.09.25",
      extreme: { score: 11974, rank: 8194, stars: 1 },
      trial: { score: 105105, rank: 1902, stars: 9 },
    });
    expect(
      normalizeProfileDeadly(
        { ...deadly, list: [...deadly.list].reverse() },
        2,
      ),
    ).toEqual(result);
  });

  it("keeps a single played mode and hides empty API placeholders", () => {
    const result = normalizeProfileDeadly(
      {
        list: [
          deadly.list[0],
          { nest_type: "Hard", score: 0, star: 0, rank: 0 },
        ],
      },
      1,
    );
    expect(result.status).toBe("ready");
    expect(result.trial?.score).toBe(105105);
    expect(result.extreme).toBeNull();
    expect(normalizeProfileDeadly({ list: [] }, 1).status).toBe("empty");
    expect(
      normalizeProfileDeadly(
        { list: [{ nest_type: "General", score: 0, rank: 0, star: 0 }] },
        1,
      ).status,
    ).toBe("empty");
  });

  it("retains a zero score when there is an actual recorded star", () => {
    expect(
      normalizeProfileDeadly(
        { list: [{ nest_type: "Hard", score: 0, star: 1 }] },
        1,
      ).extreme,
    ).toEqual({ score: 0, rank: null, stars: 1 });
  });

  it("uses the real Shiyu frontier, score and rating, including partial progress", () => {
    expect(normalizeProfileShiyu(shiyu, 1).battle).toEqual({
      score: 119278,
      rank: 1317,
      rating: "S+",
      floor: 5,
    });
    const partial = normalizeProfileShiyu(
      {
        hadal_info_v2: {
          brief: { score: 18000, cur_period_zone_layer_count: 2 },
        },
      },
      2,
    );
    expect(partial.status).toBe("ready");
    expect(partial.battle?.floor).toBe(2);
    expect(partial.battle?.rating).toBeUndefined();
    expect(
      normalizeProfileShiyu(
        {
          hadal_info_v2: {
            brief: {
              score: 0,
              rank_percent: 0,
              cur_period_zone_layer_count: 0,
            },
          },
        },
        1,
      ).status,
    ).toBe("empty");
  });
});

function clientFixture(failure?: string) {
  let busy = false;
  let query: any = {};
  const calls: string[] = [];
  const run = async (name: string, result: any) => {
    if (busy) throw new Error("Concurrent use of SDK request builder");
    busy = true;
    calls.push(name);
    await new Promise((resolve) => setTimeout(resolve, 1));
    busy = false;
    if (failure === name) throw new Error("Provider unavailable");
    return result;
  };
  const avatars = Array.from({ length: 12 }, (_, i) => ({
    id: 200 - i,
    rank: i % 7,
  }));
  const characters = [{ id: 999 }, ...avatars];
  const request: {
    setQueryParams: jest.Mock;
    setDs: () => any;
    send: jest.Mock;
  } = {
    setQueryParams: jest.fn((value) => {
      if (busy) throw new Error("Request mutated in flight");
      query = value;
      return request;
    }),
    setDs: () => request,
    send: jest.fn(async () => {
      const schedule = query.schedule_type;
      const result = {
        ...deadly,
        list: deadly.list.map((entry) => ({
          ...entry,
          score: entry.score + schedule,
        })),
      };
      return run(`deadly-${schedule}`, {
        response: { retcode: 0, data: result },
      });
    }),
  };
  const zzz = {
    uid: 123456,
    region: "prod_gf_jp",
    lang: "zh-tw",
    record: {
      records: jest.fn(() =>
        run("records", { avatar_list: avatars, stats: { avatar_num: 13 } }),
      ),
      characters: jest.fn(() => run("characters", characters)),
      hadalInfo: jest.fn((schedule) =>
        run(`shiyu-${schedule}`, {
          hadal_info_v2: {
            ...shiyu.hadal_info_v2,
            brief: { ...shiyu.hadal_info_v2.brief, score: 90000 + schedule },
          },
        }),
      ),
      request,
    },
  };
  const loadAccount = jest.fn(async () => ({
    game_role_id: "123456",
    nickname: "Selected account",
    level: 60,
  }));
  const options = {
    targetUserId: "283946584461410305",
    accountIndex: 2,
    locale: "tw",
    loadAccount,
  };
  return { zzz, options, calls, avatars, characters };
}

describe("shared profile loader", () => {
  it("serializes SDK requests, retains period identity and uses the selected account context", async () => {
    const { zzz, options, calls, avatars, characters } = clientFixture();
    const result = await loadProfileMainData(zzz, options);
    expect(calls).toEqual([
      "records",
      "characters",
      "deadly-1",
      "shiyu-1",
      "deadly-2",
      "shiyu-2",
    ]);
    expect(options.loadAccount).toHaveBeenCalledWith(
      options.targetUserId,
      "tw",
      2,
    );
    expect(result.account.game_role_id).toBe("123456");
    expect(result.showcase).toEqual(avatars.slice(0, 9));
    expect(result.characters).toEqual(characters);
    expect(result.deadly.map((p) => [p.schedule, p.trial?.score])).toEqual([
      [1, 105106],
      [2, 105107],
    ]);
    expect(result.shiyu.map((p) => [p.schedule, p.battle?.score])).toEqual([
      [1, 90001],
      [2, 90002],
    ]);
    expect(zzz.record.request.setQueryParams).toHaveBeenCalledWith({
      uid: "123456",
      region: "prod_gf_jp",
      lang: "zh-tw",
      schedule_type: 2,
      need_all: "true",
    });
  });

  it.each(["deadly-1", "shiyu-2"])(
    "isolates %s failure from the rest of the profile",
    async (failure) => {
      const { zzz, options } = clientFixture(failure);
      const result = await loadProfileMainData(zzz, options);
      const periods = [...result.deadly, ...result.shiyu];
      expect(periods.filter((p) => p.status === "unavailable")).toHaveLength(1);
      expect(periods.filter((p) => p.status === "ready")).toHaveLength(3);
      expect(result.showcase).toHaveLength(9);
    },
  );

  it("treats malformed responses as unavailable and empty valid responses as unplayed", async () => {
    const { zzz, options } = clientFixture();
    zzz.record.request.send.mockResolvedValueOnce({
      response: { retcode: 0, data: {} },
    } as any);
    zzz.record.hadalInfo.mockResolvedValueOnce({ hadal_info_v2: {} } as any);
    const result = await loadProfileMainData(zzz, options);
    expect(result.deadly[0].status).toBe("unavailable");
    expect(result.shiyu[0].status).toBe("empty");
  });

  it("reuses the selector roster but keeps public showcase order", async () => {
    const { zzz, options } = clientFixture();
    const roster = [{ id: 777 }];
    const result = await loadProfileMainData(zzz, {
      ...options,
      characters: roster,
    });
    expect(zzz.record.characters).not.toHaveBeenCalled();
    expect(result.characters).toBe(roster);
    expect(result.showcase[0].id).toBe(200);
  });

  it("does not display another account's name alongside the selected UID", async () => {
    const { zzz, options } = clientFixture();
    options.loadAccount.mockResolvedValueOnce({
      game_role_id: "654321",
      nickname: "Different account",
      level: 12,
    });
    const result = await loadProfileMainData(zzz, options);
    expect(result.account).toEqual({ game_role_id: "123456" });
  });
});
