const mockDb = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};
const mockClient = {
  db: mockDb,
  cluster: { broadcastEval: jest.fn() },
  rest: { get: jest.fn() },
  users: { fetch: jest.fn() },
};
const mockGetUserLang = jest.fn();
const mockGetAllGameRoles = jest.fn();
const mockGetLegacyAccounts = jest.fn();
const mockZzz = jest.fn();

jest.mock("../src/index.js", () => ({ client: mockClient }));
jest.mock("../src/utilities/utilities.js", () => ({
  getUserLang: (...args: unknown[]) => mockGetUserLang(...args),
  getAllGameRoles: (...args: unknown[]) => mockGetAllGameRoles(...args),
}));
jest.mock("../src/utilities/accountStore.js", () => ({
  getLegacyAccounts: (...args: unknown[]) => mockGetLegacyAccounts(...args),
  restoreGeneralValidity: jest.fn(),
  markGeneralInvalid: jest.fn(),
  updateLegacyAccountAtIndex: jest.fn(),
  getCharacter: jest.fn(),
}));
jest.mock("../src/utilities/core/config.js", () => ({
  getConfig: () => ({ LOGWEBHOOK: "not-a-valid-webhook-url", ERRWEBHOOK: "" }),
  getVerifyBaseUrl: () => "https://verify.invalid",
}));
jest.mock("../src/utilities/core/i18n.js", () => ({
  createTranslator: () => (key: string) => key,
}));
jest.mock("../src/utilities/canvas/dailyCard.js", () => ({
  buildZZZDailyCard: jest.fn(),
}));
jest.mock("../src/utilities/zzz/dailyPresentation.js", () => ({
  buildDailySignInPresentation: () => ({
    signedDays: 1,
    missedDays: 0,
    todayReward: { name: "Reward", cnt: 1, icon: "" },
  }),
  normalizeSuccessfulDailyClaimInfo: (_before: unknown, after: unknown) =>
    after,
}));
jest.mock("@yeci226/hoyoapi", () => ({
  LanguageEnum: { TRADIIONAL_CHINESE: "tw", ENGLISH: "en" },
  ZenlessZoneZero: mockZzz,
}));

import { AutoDailyService } from "../src/utilities/zzz/autoDaily";
import moment from "moment-timezone";

const RETRY_KEY = "user-1.autoDailyRetry";
const today = () => moment().tz("Asia/Taipei").format("YYYY-MM-DD");

function failWith(message: string) {
  mockZzz.mockImplementation(() => ({
    daily: {
      info: jest.fn().mockRejectedValue(new Error(message)),
      claim: jest.fn(),
      rewards: jest.fn(),
    },
  }));
}

describe("AutoDaily failure backoff and de-duplication", () => {
  let state: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    state = new Map();
    mockDb.get.mockImplementation(async (key: string) => state.get(key));
    mockDb.set.mockImplementation(async (key: string, value: unknown) => {
      state.set(key, value);
    });
    mockDb.delete.mockImplementation(async (key: string) => {
      state.delete(key);
    });
    mockGetUserLang.mockResolvedValue("tw");
    mockGetAllGameRoles.mockResolvedValue([]);
    mockGetLegacyAccounts.mockResolvedValue([
      {
        uid: "800000001",
        cookie: "ltuid_v2=ltuid-test; ltoken_v2=fixture",
        nickname: "Test",
        invalid: false,
      },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("notifies a first failure, stores a 3h backoff, and does not repeat the notification", async () => {
    failWith("geetest 10035");
    const service = new AutoDailyService();
    const sendNotification = jest.fn().mockResolvedValue(true);
    (service as any).sendNotification = sendNotification;

    const before = Date.now();
    const first = await (service as any).processUser("user-1", {});
    expect(first.shouldMarkProcessed).toBe(false);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][2][0]).toMatchObject({
      status: "failed",
      errorType: "geetest",
    });

    const saved = state.get(RETRY_KEY);
    expect(saved.day).toBe(today());
    expect(saved.nextTryAt).toBeGreaterThanOrEqual(
      before + 3 * 60 * 60 * 1000,
    );
    expect(Object.values(saved.accounts)).toEqual([
      { sig: "geetest", notifiedDay: today(), webhookDay: undefined },
    ]);

    // A later retry with the same failure: still failed, but silent.
    const second = await (service as any).processUser("user-1", {});
    expect(second.failed).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("notifies again when the failure type changes, or on a new day", async () => {
    failWith("geetest 10035");
    const service = new AutoDailyService();
    const sendNotification = jest.fn().mockResolvedValue(true);
    (service as any).sendNotification = sendNotification;
    await (service as any).processUser("user-1", {});

    failWith("HTTP 500");
    await (service as any).processUser("user-1", {});
    expect(sendNotification).toHaveBeenCalledTimes(2);

    const saved = state.get(RETRY_KEY);
    for (const entry of Object.values<any>(saved.accounts))
      entry.notifiedDay = "2000-01-01";
    await (service as any).processUser("user-1", {});
    expect(sendNotification).toHaveBeenCalledTimes(3);
  });

  it("does not record a notification that was not delivered", async () => {
    failWith("HTTP 500");
    const service = new AutoDailyService();
    const sendNotification = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    (service as any).sendNotification = sendNotification;
    await (service as any).processUser("user-1", {});
    await (service as any).processUser("user-1", {});
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("a later success still notifies and clears the failure state", async () => {
    failWith("HTTP 500");
    const service = new AutoDailyService();
    const sendNotification = jest.fn().mockResolvedValue(true);
    (service as any).sendNotification = sendNotification;
    await (service as any).processUser("user-1", {});
    expect(state.has(RETRY_KEY)).toBe(true);

    mockZzz.mockImplementation(() => ({
      daily: {
        info: jest.fn().mockResolvedValue({
          is_sign: true,
          total_sign_day: 1,
          today: "2026-09-27",
        }),
        claim: jest.fn(),
        rewards: jest.fn().mockResolvedValue({
          month: 9,
          awards: [{ name: "Reward", cnt: 1, icon: "" }],
        }),
      },
    }));
    const ok = await (service as any).processUser("user-1", {});
    expect(ok.shouldMarkProcessed).toBe(true);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification.mock.calls[1][2][0].status).toBe("already_signed");
    expect(state.has(RETRY_KEY)).toBe(false);
  });

  it("run() skips a user inside the backoff window and retries after it", async () => {
    state.set("autoDaily", { "user-1": { time: "0" } });
    state.set(RETRY_KEY, {
      day: today(),
      nextTryAt: Date.now() + 60_000,
      accounts: {},
    });
    const service = new AutoDailyService();
    const processUser = jest
      .spyOn(service as any, "processUser")
      .mockResolvedValue({
        total: 0,
        success: 0,
        alreadySigned: 0,
        failed: 0,
        skipped: 0,
        shouldMarkProcessed: false,
      });
    await service.run();
    expect(processUser).not.toHaveBeenCalled();

    state.get(RETRY_KEY).nextTryAt = Date.now() - 1;
    await service.run();
    expect(processUser).toHaveBeenCalledTimes(1);
  });
});

describe("AutoDaily timeout cancellation", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("a cancelled run performs no notification or state write", async () => {
    jest.clearAllMocks();
    const writes: string[] = [];
    mockDb.get.mockResolvedValue(undefined);
    mockDb.set.mockImplementation(async (key: string) => {
      writes.push(key);
    });
    mockGetUserLang.mockResolvedValue("tw");
    mockGetAllGameRoles.mockResolvedValue([]);
    mockGetLegacyAccounts.mockResolvedValue([
      { uid: "800000001", cookie: "ltuid_v2=a", nickname: "T", invalid: false },
    ]);
    const token = { cancelled: false };
    mockZzz.mockImplementation(() => ({
      daily: {
        info: jest.fn().mockImplementation(async () => {
          token.cancelled = true; // timeout fires while the API call is in flight
          return { is_sign: true, total_sign_day: 1, today: "2026-09-27" };
        }),
        claim: jest.fn(),
        rewards: jest.fn().mockResolvedValue({ month: 9, awards: [] }),
      },
    }));
    const service = new AutoDailyService();
    const sendNotification = jest.fn().mockResolvedValue(true);
    (service as any).sendNotification = sendNotification;

    await expect(
      (service as any).processUser("user-1", {}, {}, token),
    ).rejects.toThrow(/cancelled/);
    expect(sendNotification).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("run() cancels the token of a user that exceeds the timeout", async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockDb.get.mockImplementation(async (key: string) =>
      key === "autoDaily" ? { slow: { time: "0" } } : undefined,
    );
    const service = new AutoDailyService();
    let seen: { cancelled: boolean } | undefined;
    jest.spyOn(service as any, "processUser").mockImplementation(
      (async (_u: string, _c: unknown, _o: unknown, token: any) => {
        seen = token;
        return new Promise(() => {});
      }) as any,
    );
    const run = service.run();
    await jest.advanceTimersByTimeAsync(61_000);
    await run;
    expect(seen?.cancelled).toBe(true);
  });
});

describe("AutoDaily bounded user concurrency", () => {
  it("processes at most 3 users at once and still processes everyone", async () => {
    jest.clearAllMocks();
    const users: Record<string, unknown> = {};
    for (let i = 0; i < 8; i++) users[`u${i}`] = { time: "0" };
    mockDb.get.mockImplementation(async (key: string) =>
      key === "autoDaily" ? users : undefined,
    );
    mockDb.set.mockResolvedValue(undefined);
    const service = new AutoDailyService();
    let inFlight = 0;
    let maxInFlight = 0;
    const done: string[] = [];
    jest.spyOn(service as any, "processUser").mockImplementation(
      (async (userId: string) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight--;
        done.push(userId);
        return {
          total: 1,
          success: 1,
          alreadySigned: 0,
          failed: 0,
          skipped: 0,
          shouldMarkProcessed: true,
        };
      }) as any,
    );
    await service.run();
    expect(maxInFlight).toBe(3);
    expect(done).toHaveLength(8);
  });
});
