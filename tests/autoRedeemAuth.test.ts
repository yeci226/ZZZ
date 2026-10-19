const mockValues: Record<string, any> = {};
const mockDb = {
  get: jest.fn(async (key: string) => mockValues[key]),
  set: jest.fn(async (key: string, value: any) => { mockValues[key] = value; }),
  delete: jest.fn(async (key: string) => { delete mockValues[key]; }),
};
const mockRefresh = jest.fn();
let mockAccounts: any[] = [];
let mockAdapter: any;
jest.mock("../src/index.js", () => ({ database: mockDb, client: { db: mockDb, rest: { post: jest.fn() } } }));
jest.mock("../src/utilities/utilities.js", () => ({ getRedeemCodes: jest.fn(), autoRefreshCookie: mockRefresh, getUserLang: jest.fn(async () => "tw") }));
jest.mock("../src/utilities/accountStore.js", () => ({ getLegacyAccounts: jest.fn(async () => mockAccounts) }));
jest.mock("../src/utilities/core/i18n.js", () => ({ resolveBotLocale: jest.fn(() => "tw") }));
jest.mock("../src/utilities/canvas/redeemCard.js", () => ({ buildHSRRedeemCard: jest.fn(async () => Buffer.from("image")), getFirstHSRRedeemRewardIcon: jest.fn(), buildZZZRedeemCard: jest.fn(async () => Buffer.from("image")) }));
jest.mock("../src/utilities/core/logger.js", () => ({ __esModule: true, default: class { info() {} warn() {} error() {} } }));
jest.mock("../src/utilities/core/redeemEngine.js", () => ({
  ...jest.requireActual("../src/utilities/core/redeemEngine.js"),
  RedeemEngine: jest.fn().mockImplementation(adapter => { mockAdapter = adapter; return { tick: jest.fn() }; }),
}));
import autoRedeem from "../src/utilities/zzz/autoRedeem";
const uid = "130000001";
beforeEach(async () => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockValues)) delete mockValues[key];
  mockValues[`${uid}.redeemStateMigrated`] = true;
  mockAccounts = [{ uid, cookie: "old", nickname: "Synthetic" }];
  await autoRedeem();
});
test("healthy redemption never reads or writes general auth keys", async () => {
  expect(await mockAdapter.prepare("owner", uid, false)).toEqual(mockAccounts[0]);
  const keys = [...mockDb.get.mock.calls, ...mockDb.set.mock.calls, ...mockDb.delete.mock.calls].map(call => call[0]);
  for (const field of ["cookieExpired", "needsCookieUpdate", "lastCookieRefreshAttempt"]) expect(keys).not.toContain(`${uid}.${field}`);
});
test("refresh uses redeem scope and reselects by UID after account order changes", async () => {
  mockValues[`${uid}.redeemInvalid`] = true;
  mockRefresh.mockImplementation(async () => {
    mockAccounts = [{ uid: "other", cookie: "other" }, { uid, cookie: "new" }];
    return { success: true };
  });
  expect(await mockAdapter.prepare("owner", uid, true)).toEqual({ uid, cookie: "new" });
  expect(mockRefresh).toHaveBeenCalledWith("owner", 0, "old", "redeem");
  expect(mockValues[`${uid}.redeemInvalid`]).toBeUndefined();
});
test("manual login requirement is retained and does not invoke refresh", async () => {
  mockValues[`${uid}.redeemInvalid`] = true;
  mockValues[`${uid}.redeemNeedsCookieUpdate`] = true;
  expect(await mockAdapter.prepare("owner", uid, false)).toBeNull();
  expect(mockRefresh).not.toHaveBeenCalled();
});
test("transient exchange failures do not clear auth-invalid evidence", async () => {
  mockValues[`${uid}.redeemInvalid`] = true;
  const original = global.fetch;
  global.fetch = jest.fn(async () => ({ status: 503, headers: new Headers(), json: async () => ({ retcode: -999 }) } as Response));
  try {
    await mockAdapter.exchange(mockAccounts[0], { code: "NEW" });
    expect(mockValues[`${uid}.redeemInvalid`]).toBe(true);
  } finally { global.fetch = original; }
});

test.each([
  ["100000001", "prod_gf_us"], ["150000001", "prod_gf_eu"],
  ["130000001", "prod_gf_jp"], ["170000001", "prod_gf_sg"],
])("automatic redemption sends UID %s to %s", async (accountUid, region) => {
  const fetcher = jest.spyOn(global, "fetch").mockResolvedValue({
    status: 200, headers: new Headers(), json: async () => ({ retcode: 0 }),
  } as Response);
  try {
    await mockAdapter.exchange({ uid: accountUid, cookie: "test-cookie" }, { code: "EXAMPLE" });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ uid: accountUid, region });
  } finally { fetcher.mockRestore(); }
});
