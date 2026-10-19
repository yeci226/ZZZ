import {
  dailyAwardAt,
  normalizeDailyInfo,
  resolveDailySignIn,
} from "../src/utilities/core/dailyRewards.js";
const info = (today = "2026-09-22", days = 2, signed = true) => ({
  today,
  total_sign_day: days,
  is_sign: signed,
});
const awards = Array.from({ length: 31 }, (_, i) => ({
  name: `Reward ${i + 1}`,
  cnt: i + 1,
}));
const rewards = (month = 9) => ({ month, awards });
function api() {
  return {
    info: jest.fn().mockResolvedValue(info()),
    claim: jest.fn(),
    rewards: jest.fn().mockResolvedValue(rewards()),
  };
}
test("preserves the official missing-role reason without treating it as a successful claim", async () => {
  const daily = api();
  daily.info.mockResolvedValue(info("2026-09-22", 0, false));
  daily.claim.mockResolvedValue({
    code: -10002,
    status: "找不到遊戲內已建立的角色",
    info: info("2026-09-22", 0, false),
  });
  await expect(resolveDailySignIn(daily)).rejects.toMatchObject({
    code: -10002,
    message: "找不到遊戲內已建立的角色 (Code: -10002)",
  });
  expect(daily.claim).toHaveBeenCalledTimes(1);
  expect(daily.rewards).not.toHaveBeenCalled();
});
test("month/year boundaries never add the previous month's days", () => {
  for (const [before, after] of [
    ["2026-09-30", "2026-10-01"],
    ["2026-12-31", "2027-01-01"],
    ["2028-02-29", "2028-03-01"],
  ]) {
    expect(
      normalizeDailyInfo(info(before, 30, false), info(after, 1))
        .total_sign_day,
    ).toBe(1);
  }
  expect(
    normalizeDailyInfo({ ...info(), today: undefined }, info()).total_sign_day,
  ).toBe(2);
});
test("same-day success normalizes lagging count once", async () => {
  const daily = api();
  daily.info.mockResolvedValue(info("2026-09-22", 1, false));
  daily.claim.mockResolvedValue({
    code: 0,
    info: info("2026-09-22", 1, false),
  });
  const result = await resolveDailySignIn(daily);
  expect(result.status).toBe("success");
  expect(result.info.total_sign_day).toBe(2);
  expect(daily.claim).toHaveBeenCalledTimes(1);
});
test("already signed skips POST; explicit -5003 stays already signed", async () => {
  const daily = api();
  expect((await resolveDailySignIn(daily)).status).toBe("already_signed");
  expect(daily.claim).not.toHaveBeenCalled();
  daily.info.mockResolvedValue(info("2026-09-22", 1, false));
  daily.claim.mockResolvedValue({ code: -5003, info: info() });
  expect((await resolveDailySignIn(daily)).status).toBe("already_signed");
});
test("SDK follow-up failure confirms read-only without repeating POST", async () => {
  const daily = api();
  daily.info
    .mockResolvedValueOnce(info("2026-09-22", 1, false))
    .mockResolvedValue(info());
  daily.claim.mockRejectedValue(new Error("reward read failed"));
  daily.rewards.mockRejectedValue(new Error("unavailable"));
  const result = await resolveDailySignIn(daily);
  expect(result.info.is_sign).toBe(true);
  expect(result.rewards.awards).toEqual([]);
  expect(daily.claim).toHaveBeenCalledTimes(1);
  expect(daily.rewards).toHaveBeenCalledTimes(2);
});
test("unconfirmed failure and explicit API errors are not success", async () => {
  const daily = api();
  daily.info.mockResolvedValue(info("2026-09-22", 1, false));
  daily.claim.mockRejectedValue(new Error("network"));
  await expect(resolveDailySignIn(daily)).rejects.toThrow("network");
  expect(daily.claim).toHaveBeenCalledTimes(1);
  daily.claim.mockResolvedValue({ code: 10035, info: info() });
  await expect(resolveDailySignIn(daily)).rejects.toMatchObject({
    code: 10035,
  });
});
test("wrong month, empty or malformed rewards retry once and remain optional", async () => {
  for (const broken of [
    { month: 8, awards },
    { month: 9, awards: [] },
    { month: 9, awards: [null, { name: "", cnt: 1 }] },
    {},
  ]) {
    const daily = api();
    daily.rewards.mockResolvedValue(broken);
    expect((await resolveDailySignIn(daily)).rewards.awards).toEqual([]);
    expect(daily.rewards).toHaveBeenCalledTimes(2);
  }
  const daily = api();
  daily.rewards.mockResolvedValueOnce(rewards(8)).mockResolvedValue(rewards());
  expect((await resolveDailySignIn(daily)).rewards.awards).toHaveLength(31);
});
test("daily award indexes and calendar preview bounds", () => {
  expect(dailyAwardAt(info(), rewards())?.name).toBe("Reward 2");
  expect(dailyAwardAt(info(), rewards(), 1)?.name).toBe("Reward 3");
  expect(dailyAwardAt(info("2026-09-30", 5), rewards(), 1)).toBeUndefined();
  expect(dailyAwardAt(info("2028-02-28", 2), rewards(2), 1)?.name).toBe(
    "Reward 3",
  );
  expect(dailyAwardAt(info("2028-02-29", 2), rewards(2), 1)).toBeUndefined();
  expect(dailyAwardAt(info("2026-09-01", 1), rewards(), -1)).toBeUndefined();
  expect(dailyAwardAt(info("2026-09-22", 32), rewards())).toBeUndefined();
});
test("cross-month claim uses new state and new reward table", async () => {
  const daily = api();
  daily.info
    .mockResolvedValueOnce(info("2026-09-30", 30, false))
    .mockResolvedValue(info("2026-10-01", 1));
  daily.claim.mockResolvedValue({ code: 0, info: info("2026-10-01", 1) });
  daily.rewards.mockResolvedValue(rewards(10));
  const result = await resolveDailySignIn(daily);
  expect(result.info.total_sign_day).toBe(1);
  expect(dailyAwardAt(result.info, result.rewards)?.name).toBe("Reward 1");
});

test("stale reward year and malformed item counts are not displayed", () => {
  expect(
    dailyAwardAt(info(), {
      ...rewards(),
      now: String(Date.parse("2025-09-22T00:00:00Z") / 1000),
    }),
  ).toBeUndefined();
  expect(
    dailyAwardAt(info(), {
      month: 9,
      awards: [
        { name: "ok", cnt: 1 },
        { name: "bad", cnt: NaN },
      ],
    }),
  ).toBeUndefined();
});
test("reward timeouts remain bounded and keep confirmed sign-in", async () => {
  jest.useFakeTimers();
  try {
    const daily = api();
    daily.rewards.mockImplementation(() => new Promise(() => {}));
    const promise = resolveDailySignIn(daily);
    await jest.advanceTimersByTimeAsync(16001);
    expect((await promise).status).toBe("already_signed");
    expect(daily.rewards).toHaveBeenCalledTimes(2);
    expect(daily.claim).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

describe("delayed sign-in confirmation", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function settle(daily: ReturnType<typeof api>) {
    const outcome = resolveDailySignIn(daily).then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error }),
    );
    await jest.runAllTimersAsync();
    return outcome;
  }

  test("already-signed response waits for delayed status without another claim", async () => {
    const daily = api();
    const pending = info("2026-09-22", 1, false);
    daily.info
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(info());
    daily.claim.mockResolvedValue({ code: -5003, info: pending });
    const { value, error } = await settle(daily);
    expect(error).toBeNull();
    expect(value?.status).toBe("already_signed");
    expect(value?.info.total_sign_day).toBe(2);
    expect(daily.claim).toHaveBeenCalledTimes(1);
    expect(daily.info).toHaveBeenCalledTimes(4);
  });

  test("confirmation tolerates a transient read failure", async () => {
    const daily = api();
    const pending = info("2026-09-22", 1, false);
    daily.info
      .mockResolvedValueOnce(pending)
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValue(info());
    daily.claim.mockResolvedValue({ code: -5003, info: pending });
    const { value, error } = await settle(daily);
    expect(error).toBeNull();
    expect(value?.info.is_sign).toBe(true);
    expect(daily.claim).toHaveBeenCalledTimes(1);
  });

  test("SDK follow-up errors also wait for status propagation", async () => {
    const daily = api();
    const pending = info("2026-09-22", 1, false);
    daily.info
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(info());
    daily.claim.mockRejectedValue(new Error("reward read failed"));
    const { value, error } = await settle(daily);
    expect(error).toBeNull();
    expect(value?.info.is_sign).toBe(true);
    expect(daily.claim).toHaveBeenCalledTimes(1);
  });

  test("unconfirmed already-signed response is never fabricated as success", async () => {
    const daily = api();
    const pending = info("2026-09-22", 1, false);
    daily.info.mockResolvedValue(pending);
    daily.claim.mockResolvedValue({ code: -5003, info: pending });
    const { value, error } = await settle(daily);
    expect(value).toBeNull();
    expect(error.message).toMatch(/could not be confirmed/);
    expect(daily.claim).toHaveBeenCalledTimes(1);
    expect(daily.info).toHaveBeenCalledTimes(4);
    expect(daily.rewards).not.toHaveBeenCalled();
  });

  test("confirmation timeouts are bounded and preserve the original claim error", async () => {
    const daily = api();
    const original = new Error("claim timed out");
    daily.info
      .mockResolvedValueOnce(info("2026-09-22", 1, false))
      .mockImplementation(() => new Promise(() => {}));
    daily.claim.mockRejectedValue(original);
    const { value, error } = await settle(daily);
    expect(value).toBeNull();
    expect(error).toBe(original);
    expect(daily.claim).toHaveBeenCalledTimes(1);
    expect(daily.info).toHaveBeenCalledTimes(4);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("new-month confirmation keeps the server count without adding yesterday", async () => {
    const daily = api();
    const before = info("2026-09-30", 30, false);
    const pending = info("2026-10-01", 0, false);
    daily.info
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(info("2026-10-01", 1));
    daily.claim.mockResolvedValue({ code: -5003, info: pending });
    daily.rewards.mockResolvedValue(rewards(10));
    const { value, error } = await settle(daily);
    expect(error).toBeNull();
    expect(value?.info).toMatchObject({
      today: "2026-10-01",
      total_sign_day: 1,
      is_sign: true,
    });
    expect(daily.claim).toHaveBeenCalledTimes(1);
  });
});
