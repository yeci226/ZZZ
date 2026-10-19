const mockDb = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};
const mockBroadcastEval = jest.fn();
const mockUsersFetch = jest.fn();
const mockRestGet = jest.fn();
const mockUserSend = jest.fn();
const mockBuildDailyCard = jest.fn();
const mockClient = {
  db: mockDb,
  cluster: { broadcastEval: mockBroadcastEval },
  rest: { get: mockRestGet },
  users: { fetch: mockUsersFetch },
};
const mockGetUserLang = jest.fn();
const mockGetAllGameRoles = jest.fn();
const mockGetLegacyAccounts = jest.fn();
const mockUpdateLegacyAccountAtIndex = jest.fn();
const mockRestoreGeneralValidity = jest.fn();
const mockMarkGeneralInvalid = jest.fn();
const mockZzz = jest.fn();

jest.mock("../src/index.js", () => ({ client: mockClient }));
jest.mock("../src/utilities/utilities.js", () => ({
  getUserLang: (...args: unknown[]) => mockGetUserLang(...args),
  getAllGameRoles: (...args: unknown[]) => mockGetAllGameRoles(...args),
}));
jest.mock("../src/utilities/accountStore.js", () => ({
  getLegacyAccounts: (...args: unknown[]) => mockGetLegacyAccounts(...args),
  restoreGeneralValidity: (...args: unknown[]) =>
    mockRestoreGeneralValidity(...args),
  markGeneralInvalid: (...args: unknown[]) => mockMarkGeneralInvalid(...args),
  updateLegacyAccountAtIndex: (...args: unknown[]) =>
    mockUpdateLegacyAccountAtIndex(...args),
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
  buildZZZDailyCard: (...args: unknown[]) => mockBuildDailyCard(...args),
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

describe("AutoDaily passive authentication recovery", () => {
  test("disabled saved settings never enter the sign-in worker", async () => {
    mockDb.get.mockImplementation(async (key: string) =>
      key === "autoDaily"
        ? { owner: { enabled: false, time: "0" } }
        : undefined,
    );
    const service = new AutoDailyService();
    const process = jest.spyOn(service as any, "processUser");
    await service.run();
    expect(process).not.toHaveBeenCalled();
    expect(mockZzz).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildDailyCard.mockResolvedValue(Buffer.from("synthetic-png"));
    mockGetUserLang.mockResolvedValue("tw");
    mockGetAllGameRoles.mockResolvedValue([]);
    mockUpdateLegacyAccountAtIndex.mockResolvedValue(undefined);
    mockDb.get.mockResolvedValue(undefined);
    mockDb.set.mockResolvedValue(undefined);
    mockDb.delete.mockResolvedValue(undefined);
    mockUserSend.mockResolvedValue(undefined);
    mockUsersFetch.mockResolvedValue({ send: mockUserSend });
    mockRestGet.mockResolvedValue({ guild_id: "guild-rest" });
    mockGetLegacyAccounts.mockResolvedValue([
      {
        uid: "800000001",
        cookie: "synthetic-cookie",
        nickname: "Test",
        invalid: true,
      },
    ]);
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
  });

  it("probes an old invalid account once, then skips it after -100", async () => {
    const state = new Map<string, unknown>();
    mockDb.get.mockImplementation(async (key: string) => state.get(key));
    mockDb.set.mockImplementation(async (key: string, value: unknown) => {
      state.set(key, value);
    });
    mockGetLegacyAccounts.mockResolvedValue([
      {
        uid: "800000001",
        cookie: "ltuid_v2=ltuid-test; ltoken_v2=fixture",
        nickname: "Test",
        invalid: true,
      },
    ]);
    mockZzz.mockImplementation(() => ({
      daily: {
        info: jest.fn().mockRejectedValue(new Error("尚未登入")),
        claim: jest.fn(),
        rewards: jest.fn(),
      },
    }));

    const service = new AutoDailyService();
    const sendNotification = jest.fn().mockResolvedValue(true);
    (service as any).sendNotification = sendNotification;

    const first = await (service as any).processUser(
      "user-1",
      {},
      {
        allowLegacyInvalidRecovery: true,
      },
    );

    expect(first.failed).toBe(1);
    expect(first.shouldMarkProcessed).toBe(true);
    expect(mockZzz).toHaveBeenCalledTimes(1);
    expect(mockMarkGeneralInvalid).toHaveBeenCalledWith(
      mockDb,
      "user-1",
      "800000001",
    );
    // Legacy-invalid recovery is a one-time classification probe.
    // If Daily itself confirms the old account is expired, persist the
    // classification silently instead of notifying the user again.
    expect(sendNotification).not.toHaveBeenCalled();

    const second = await (service as any).processUser(
      "user-1",
      {},
      {
        allowLegacyInvalidRecovery: true,
      },
    );

    expect(second.skipped).toBe(1);
    expect(mockZzz).toHaveBeenCalledTimes(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("notifies once when a previously valid account gets an explicit auth failure", async () => {
    mockGetLegacyAccounts.mockResolvedValue([
      {
        uid: "800000001",
        cookie: "ltuid_v2=ltuid-test; ltoken_v2=fixture",
        nickname: "Test",
        invalid: false,
      },
    ]);

    mockZzz.mockImplementation(() => ({
      daily: {
        info: jest.fn().mockRejectedValue(new Error("尚未登入")),
        claim: jest.fn(),
        rewards: jest.fn(),
      },
    }));

    const service = new AutoDailyService();
    const sendNotification = jest.fn().mockResolvedValue(true);
    (service as any).sendNotification = sendNotification;

    const result = await (service as any).processUser(
      "user-1",
      {},
      {
        allowLegacyInvalidRecovery: true,
      },
    );

    expect(result.failed).toBe(1);

    // This was a previously valid/general account, not a legacy recovery
    // probe, so its first confirmed auth expiry must still be shown once.
    expect(sendNotification).toHaveBeenCalledTimes(1);

    const results = sendNotification.mock.calls[0][2];
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      uid: "800000001",
      status: "failed",
      error: "daily_AuthExpiredDesc",
      errorType: "account_expired",
    });

    expect(mockMarkGeneralInvalid).toHaveBeenCalledTimes(1);
    expect(mockMarkGeneralInvalid).toHaveBeenCalledWith(
      mockDb,
      "user-1",
      "800000001",
    );

    expect(mockRestoreGeneralValidity).not.toHaveBeenCalled();
  });

  it("attempts an old-invalid credentialed account and restores only general validity", async () => {
    mockGetLegacyAccounts.mockResolvedValue([
      {
        uid: "800000001",
        cookie: "ltuid_v2=ltuid-test; ltoken_v2=fixture",
        nickname: "Test",
        invalid: true,
      },
    ]);
    const service = new AutoDailyService();
    (service as any).sendNotification = jest.fn().mockResolvedValue(true);

    const result = await (service as any).processUser(
      "user-1",
      {},
      {
        allowLegacyInvalidRecovery: true,
      },
    );

    expect(result.alreadySigned).toBe(1);
    expect(mockZzz).toHaveBeenCalledTimes(1);
    expect(mockRestoreGeneralValidity).toHaveBeenCalledWith(
      mockDb,
      "user-1",
      "800000001",
    );
    expect(mockMarkGeneralInvalid).not.toHaveBeenCalled();
  });

  it("backfills a missing legacy nickname after Daily authentication succeeds", async () => {
    mockGetLegacyAccounts.mockResolvedValue([
      {
        uid: "800000001",
        cookie: "ltuid_v2=ltuid-test; ltoken_v2=fixture",
        nickname: null,
        invalid: false,
      },
    ]);

    mockGetAllGameRoles.mockResolvedValue([
      {
        uid: "800000001",
        nickname: "RecoveredPlayer",
        gameId: 8,
      },
    ]);

    const service = new AutoDailyService();
    const sendNotification = jest.fn().mockResolvedValue(true);
    (service as any).sendNotification = sendNotification;

    const result = await (service as any).processUser(
      "user-1",
      {},
      {
        allowLegacyInvalidRecovery: true,
      },
    );

    expect(result.alreadySigned).toBe(1);

    expect(mockGetAllGameRoles).toHaveBeenCalledTimes(1);
    expect(mockGetAllGameRoles).toHaveBeenCalledWith(
      "ltuid_v2=ltuid-test; ltoken_v2=fixture",
    );

    expect(mockUpdateLegacyAccountAtIndex).toHaveBeenCalledTimes(1);
    expect(mockUpdateLegacyAccountAtIndex).toHaveBeenCalledWith(
      mockDb,
      "user-1",
      0,
      { nickname: "RecoveredPlayer" },
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][2][0]).toMatchObject({
      uid: "800000001",
      nickname: "RecoveredPlayer",
      status: "already_signed",
    });

    expect(mockMarkGeneralInvalid).not.toHaveBeenCalled();
  });

  it("does not fail AutoDaily when legacy nickname lookup fails", async () => {
    mockGetLegacyAccounts.mockResolvedValue([
      {
        uid: "800000001",
        cookie: "ltuid_v2=ltuid-test; ltoken_v2=fixture",
        nickname: null,
        invalid: false,
      },
    ]);

    mockGetAllGameRoles.mockRejectedValue(new Error("game record unavailable"));

    const service = new AutoDailyService();
    const sendNotification = jest.fn().mockResolvedValue(true);
    (service as any).sendNotification = sendNotification;

    const result = await (service as any).processUser(
      "user-1",
      {},
      {
        allowLegacyInvalidRecovery: true,
      },
    );

    expect(result.alreadySigned).toBe(1);
    expect(result.failed).toBe(0);

    expect(mockUpdateLegacyAccountAtIndex).not.toHaveBeenCalled();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][2][0]).toMatchObject({
      uid: "800000001",
      nickname: "Unknown",
      status: "already_signed",
    });

    expect(mockMarkGeneralInvalid).not.toHaveBeenCalled();
  });

  it("resolves and persists guildId when the legacy channel setting has none", async () => {
    mockBroadcastEval
      .mockResolvedValueOnce([null, "guild-1"])
      .mockResolvedValueOnce([false, true])
      .mockResolvedValueOnce([true]);
    const service = new AutoDailyService();

    const delivered = await (service as any).sendNotification(
      "user-1",
      { channelId: "channel-1", notifyType: "channel" },
      [
        {
          uid: "800000001",
          nickname: "Test",
          status: "success",
          rewardName: "Reward",
          rewardCount: 1,
        },
      ],
      (key: string) => key,
    );

    expect(delivered).toBe(true);
    expect(mockUsersFetch).not.toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith(
      "autoDaily.user-1",
      expect.objectContaining({
        channelId: "channel-1",
        guildId: "guild-1",
        notifyType: "channel",
      }),
    );
  });

  it("uses DM only when notifyType is explicitly dm", async () => {
    const service = new AutoDailyService();

    const delivered = await (service as any).sendNotification(
      "user-1",
      { channelId: "channel-1", notifyType: "dm" },
      [
        {
          uid: "800000001",
          nickname: "Test",
          status: "success",
          rewardName: "Reward",
          rewardCount: 1,
        },
      ],
      (key: string) => key,
    );

    expect(delivered).toBe(true);
    expect(mockUsersFetch).toHaveBeenCalledWith("user-1");
    expect(mockUserSend).toHaveBeenCalledTimes(1);
    expect(mockBroadcastEval).not.toHaveBeenCalled();
  });

  it("does not fall back to DM when channel delivery fails", async () => {
    mockBroadcastEval
      .mockResolvedValueOnce([true])
      .mockRejectedValueOnce(new Error("channel send failed"));
    const service = new AutoDailyService();

    const delivered = await (service as any).sendNotification(
      "user-1",
      {
        channelId: "channel-1",
        guildId: "guild-1",
        notifyType: "channel",
      },
      [
        {
          uid: "800000001",
          nickname: "Test",
          status: "success",
          rewardName: "Reward",
          rewardCount: 1,
        },
      ],
      (key: string) => key,
    );

    expect(delivered).toBe(false);
    expect(mockUsersFetch).not.toHaveBeenCalled();
  });
});

describe("AutoDaily UID and claim regression", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserLang.mockResolvedValue("tw");
    mockDb.get.mockResolvedValue(undefined);
    mockGetLegacyAccounts.mockResolvedValue([
      { uid: "801422231", cookie: "first-cookie", nickname: "First" },
      { uid: "416561269", cookie: "second-cookie", nickname: "Second" },
    ]);
  });
  it.each([0, -5003, -100, 10035, -1])(
    "preserves identities and classifies claim code %s",
    async (code) => {
      mockZzz.mockImplementation((options) => {
        if (options.uid !== undefined)
          throw new Error("UID must not reach constructor");
        return {
          daily: {
            info: jest.fn().mockResolvedValue({
              is_sign: false,
              total_sign_day: 0,
              today: "2026-09-27",
            }),
            claim: jest.fn().mockResolvedValue({
              code,
              info: { is_sign: true, total_sign_day: 1, today: "2026-09-27" },
            }),
            rewards: jest.fn().mockResolvedValue({
              month: 9,
              awards: [{ name: "Reward", cnt: 1 }],
            }),
          },
        };
      });
      const service = new AutoDailyService();
      const send = jest.fn().mockResolvedValue(true);
      (service as any).sendNotification = send;
      const stats = await (service as any).processUser("user-1", {});
      const success = code === 0 || code === -5003;
      expect(stats.shouldMarkProcessed).toBe(success);
      expect(stats.failed).toBe(success ? 0 : 2);
      expect(mockMarkGeneralInvalid).toHaveBeenCalledTimes(
        code === -100 ? 2 : 0,
      );
      expect(mockRestoreGeneralValidity).toHaveBeenCalledTimes(success ? 2 : 0);
      expect(send.mock.calls[0][2]).toEqual([
        expect.objectContaining({
          uid: "801422231",
          nickname: "First",
          status:
            code === 0
              ? "success"
              : code === -5003
                ? "already_signed"
                : "failed",
        }),
        expect.objectContaining({ uid: "416561269", nickname: "Second" }),
      ]);
    },
  );
  it("leaves a timed-out daily request retryable without invalidating the account", async () => {
    mockZzz.mockImplementation(() => ({
      daily: {
        info: jest
          .fn()
          .mockRejectedValue(new Error("Request timed out after 15000ms")),
      },
    }));
    const service = new AutoDailyService();
    (service as any).sendNotification = jest.fn().mockResolvedValue(true);
    const stats = await (service as any).processUser("user-1", {});
    expect(stats.shouldMarkProcessed).toBe(false);
    expect(mockMarkGeneralInvalid).not.toHaveBeenCalled();
  });
});

test("statistics stay local even when LOGWEBHOOK is configured", async () => {
  jest.clearAllMocks();
  const service = new AutoDailyService();
  await expect(
    (service as any).updateStatistics(
      { total: 0, success: 0, alreadySigned: 0, skipped: 0, failed: 0 },
      Date.now(),
      1,
    ),
  ).resolves.toBeUndefined();
  expect(mockUserSend).not.toHaveBeenCalled();
});

describe("AutoDaily missing game role", () => {
  let state: Map<string, unknown>;
  let now: number;
  let claim: jest.Mock;
  let send: jest.Mock;
  let webhook: jest.Mock;
  const account = {
    uid: "130000001",
    cookie: "ltuid_v2=123456789; ltoken_v2=fixture",
    nickname: "Test",
  };
  function service() {
    const result = new AutoDailyService();
    (result as any).sendNotification = send;
    (result as any).errorWebhook = { send: webhook };
    return result as any;
  }
  beforeEach(() => {
    jest.resetAllMocks();
    now = Date.UTC(2026, 9, 19, 6);
    jest.spyOn(Date, "now").mockImplementation(() => now);
    state = new Map();
    mockDb.get.mockImplementation(async (key: string) => state.get(key));
    mockDb.set.mockImplementation(async (key: string, value: unknown) =>
      state.set(key, value),
    );
    mockDb.delete.mockImplementation(async (key: string) => state.delete(key));
    mockGetUserLang.mockResolvedValue("tw");
    mockGetLegacyAccounts.mockResolvedValue([account]);
    claim = jest.fn().mockResolvedValue({
      code: -10002,
      status: "找不到遊戲內已建立的角色",
      info: { is_sign: false, total_sign_day: 0, today: "2026-10-19" },
    });
    mockZzz.mockImplementation(() => ({
      daily: {
        info: jest.fn().mockResolvedValue({
          is_sign: false,
          total_sign_day: 0,
          today: "2026-10-19",
        }),
        claim,
        rewards: jest.fn().mockResolvedValue({
          month: 10,
          awards: [{ name: "Reward", cnt: 1 }],
        }),
      },
    }));
    send = jest.fn().mockResolvedValue(true);
    webhook = jest.fn().mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("persists a 24-hour cooldown across restart and silent cookie refresh; notifies once", async () => {
    await service().processUser("user", {});
    expect(claim).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2][0].error).toBe("daily_MissingRoleDesc");
    expect(mockMarkGeneralInvalid).not.toHaveBeenCalled();
    expect(mockRestoreGeneralValidity).not.toHaveBeenCalled();

    now += 3600_000;
    mockGetLegacyAccounts.mockResolvedValue([
      { ...account, cookie: "ltuid_v2=123456789; ltoken_v2=refreshed" },
    ]);
    expect((await service().processUser("user", {})).skipped).toBe(1);
    expect(claim).toHaveBeenCalledTimes(1);
    now += 23 * 3600_000;
    await service().processUser("user", {});
    expect(claim).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(webhook).toHaveBeenCalledTimes(1);
  });

  it("keeps healthy accounts working and clears the restriction after recovery", async () => {
    await service().processUser("user", {});
    const successful = {
      info: jest.fn().mockResolvedValue({
        is_sign: true,
        total_sign_day: 1,
        today: "2026-10-20",
      }),
      claim: jest.fn(),
      rewards: jest
        .fn()
        .mockResolvedValue({ month: 10, awards: [{ name: "Reward", cnt: 1 }] }),
    };
    mockZzz.mockImplementation(() => ({ daily: successful }));
    mockGetLegacyAccounts.mockResolvedValue([
      account,
      {
        ...account,
        uid: "130000002",
        cookie: "ltuid_v2=987654321; ltoken_v2=healthy",
      },
    ]);
    const mixed = await service().processUser("user", {});
    expect(mixed.skipped).toBe(1);
    expect(mixed.alreadySigned).toBe(1);
    now += 24 * 3600_000;
    expect((await service().processUser("user", {})).alreadySigned).toBe(2);
    expect(
      [...state.keys()].some((key) => key.startsWith("dailyMissingRole:")),
    ).toBe(false);
  });

  it.each([-100, 10035, -1])(
    "does not apply the missing-role cooldown to code %s",
    async (code) => {
      claim.mockResolvedValue({ code, info: { is_sign: false } });
      await service().processUser("user", {});
      expect(
        [...state.keys()].some((key) => key.startsWith("dailyMissingRole:")),
      ).toBe(false);
    },
  );
});
