const mockRoles = jest.fn();
const mockUpdate = jest.fn();
const mockPending = jest.fn();
const mockConsumed = jest.fn();
const mockDecrypt = jest.fn();
const mockAccounts = jest.fn();
const mockCharacter = jest.fn();
jest.mock("../src/utilities/utilities.js", () => ({
  getAllGameRoles: (...a: any[]) => mockRoles(...a),
  updateAccountInfo: (...a: any[]) => mockUpdate(...a),
}));
jest.mock("../src/utilities/gameRoles.js", () => ({
  getAccountGameRoles: (...a: any[]) => mockRoles(...a),
}));
jest.mock("../src/index.js", () => ({ client: { db: {} }, database: {} }));
jest.mock("../src/utilities/core/config.js", () => ({
  getConfig: () => ({ DEVIDS: [] }),
}));
jest.mock("../src/utilities/core/logger.js", () => ({
  __esModule: true,
  default: class {
    info() {}
    warn() {}
    error() {}
    success() {}
  },
}));
jest.mock("../src/utilities/core/supabase.js", () => ({
  claimPendingLogin: (...a: any[]) => mockPending(...a),
  finishPendingLogin: (...a: any[]) => mockConsumed(...a),
  renewPendingLogin: async () => true,
  decryptString: (...a: any[]) => mockDecrypt(...a),
}));
jest.mock("../src/utilities/accountStore.js", () => ({
  getLegacyAccounts: (...a: any[]) => mockAccounts(...a),
  upsertHoyolab: jest.fn(),
  upsertCharacter: (...a: any[]) => mockCharacter(...a),
}));
import { drainPendingLogins } from "../src/utilities/webhookLogin";
const roles = [
  { uid: "800000001", nickname: "Asia", region: "asia", gameId: 8 },
  { uid: "900000001", nickname: "TW", region: "taiwan", gameId: 8 },
];
const row = (extra: any = {}) => ({
  id: 1,
  discord_id: "user",
  ltuid_v2: "123",
  encrypted_cookies: "encrypted",
  owner: "owner",
  receipt: { attempts: 1 },
  ...extra,
});
const enqueue = (extra: any = {}) =>
  mockPending.mockResolvedValueOnce(row(extra));
beforeEach(() => {
  jest.resetAllMocks();
  mockPending.mockResolvedValue(null);
  mockConsumed.mockResolvedValue(true);
  mockAccounts.mockResolvedValue([]);
  mockRoles.mockResolvedValue(roles);
  mockDecrypt.mockReturnValue("ltuid_v2=123; cookie_token_v2=test");
});
it.each([
  null,
  { cards: [], fetched_at: "2026-09-17" },
  {
    cards: [
      {
        game_id: 8,
        game_role_id: "800000001",
        nickname: "Asia",
        region: "asia",
        data: [],
      },
    ],
    fetched_at: "2026-09-17",
  },
])("discovers all servers regardless of preview cards %j", async (enriched) => {
  enqueue({ enriched });
  const result = await drainPendingLogins("user");
  expect(result.map((r) => r.uid)).toEqual(roles.map((r) => r.uid));
  expect(mockUpdate).toHaveBeenCalledTimes(2);
  expect(mockConsumed).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "success" }),
  );
});
it("transient discovery failure schedules retry rather than success", async () => {
  enqueue();
  mockRoles.mockRejectedValue(new Error("network down"));
  expect(await drainPendingLogins("user")).toEqual([]);
  expect(mockConsumed).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "retrying", code: "sync_error" }),
  );
});
it("updates existing accounts at the cap and reports the skipped role", async () => {
  enqueue();
  mockAccounts.mockResolvedValue([
    roles[0],
    ...[1, 2, 3, 4].map((uid) => ({ uid: String(uid) })),
  ]);
  expect((await drainPendingLogins("user")).map((r) => r.uid)).toEqual([
    "800000001",
  ]);
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(mockConsumed).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      status: "partial",
      code: "account_limit",
      skipped: [expect.objectContaining({ uid: "900000001" })],
    }),
  );
});
it("reports empty roles after successful discovery", async () => {
  enqueue();
  mockRoles.mockResolvedValue([]);
  expect(await drainPendingLogins("user")).toEqual([]);
  expect(mockConsumed).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "no_roles" }),
  );
});
it("preserves successful roles on partial failure and retries only unfinished writes", async () => {
  enqueue();
  mockUpdate
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("db unavailable"));
  expect((await drainPendingLogins("user")).map((r) => r.uid)).toEqual([
    "800000001",
  ]);
  expect(mockConsumed).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      status: "retrying",
      roles: [expect.objectContaining({ uid: "800000001" })],
    }),
  );
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  enqueue({ receipt: { attempts: 2, roles: [roles[0]] } });
  expect((await drainPendingLogins("user")).map((r) => r.uid)).toEqual([
    "800000001",
    "900000001",
  ]);
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(mockUpdate).toHaveBeenCalledWith(
    "user",
    expect.objectContaining({ uid: "900000001" }),
  );
});
it("caps four existing roles at five", async () => {
  const accounts = [1, 2, 3, 4].map((uid) => ({ uid: String(uid) }));
  mockAccounts.mockImplementation(async () => accounts);
  mockUpdate.mockImplementation(async (_u: string, r: any) =>
    accounts.push({ uid: r.uid }),
  );
  enqueue();
  expect((await drainPendingLogins("user")).map((r) => r.uid)).toEqual([
    "800000001",
  ]);
  expect(accounts).toHaveLength(5);
});
it("does not attach metadata from another server", async () => {
  enqueue({
    enriched: {
      cards: [{ game_id: 8, game_role_id: "not-bound", nickname: "Wrong" }],
    },
  });
  await drainPendingLogins("user");
  expect(mockCharacter).not.toHaveBeenCalled();
});
it("reports a decryption failure and never binds it", async () => {
  enqueue();
  mockDecrypt.mockImplementation(() => {
    throw new Error("invalid");
  });
  await drainPendingLogins("user");
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockConsumed).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "failed", code: "invalid_credentials" }),
  );
});
it("stops automatic retries after the fourth attempt", async () => {
  enqueue({ receipt: { attempts: 4 } });
  mockRoles.mockRejectedValue(new Error("offline"));
  await drainPendingLogins("user");
  expect(mockConsumed).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "failed" }),
  );
});


it("releases a stalled queue and fences late writes after timeout", async () => {
  jest.useFakeTimers();
  try {
    enqueue();
    const { processLoginQueue } = await import("../src/utilities/loginQueue");
    let lateWrite: (() => void) | undefined;
    const pending = processLoginQueue(async (_row, _cookie, options) => {
      lateWrite = options.assertLease;
      return new Promise(() => {});
    }, "user");
    await jest.advanceTimersByTimeAsync(120000);
    await pending;
    expect(mockConsumed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "retrying", code: "sync_error" }),
    );
    expect(lateWrite).toBeDefined();
    expect(() => lateWrite!()).toThrow("lease_lost");
    enqueue();
    const next = await processLoginQueue(async () => ({ status: "success", roles: [roles[0]!] }), "user");
    expect(next).toHaveLength(1);
  } finally {
    jest.useRealTimers();
  }
});
