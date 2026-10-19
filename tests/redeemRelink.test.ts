import { createFakeDb, type FakeDb } from "./helpers/fakeDb";

let mockDb: FakeDb;
jest.mock("../src/index.js", () => ({ client: { get db() { return mockDb; } } }));
jest.mock("../src/utilities/core/config.js", () => ({
  loadConfig: () => ({}), getConfig: () => ({}), getVerifyBaseUrl: () => "https://example.invalid",
}));
jest.mock("../src/utilities/core/logger.js", () => ({
  __esModule: true, default: class { info() {} error() {} }
}));

import { updateAccountInfo, updateCookie } from "../src/utilities/utilities.js";
import { inspectAccountAccess } from "../src/utilities/accountAccess.js";
import { getLegacyAccounts } from "../src/utilities/accountStore.js";
import { getRedeemCookieState, migrateLegacyRedeemCookieState } from "../src/utilities/core/redeemCookieState.js";

const ownerId = "owner";
const uid = "130000001";
const cookie = "ltuid_v2=123; ltoken_v2=new-general; cookie_token_v2=new-redeem; account_id_v2=123";
const options = { ownerId, accountIndex: 0, scope: "redeem" as const };

beforeEach(() => {
  mockDb = createFakeDb({
    [ownerId]: { account: [{ uid, cookie: "ltuid_v2=123; ltoken_v2=old", invalid: true }] },
    [uid]: { redeemInvalid: true, redeemNeedsCookieUpdate: true, redeemLastCookieRefreshAttempt: 123, redeemedCodes: ["CLAIMED"] },
    "other-uid": { redeemInvalid: true },
  });
});

it("a full account relink clears stale redeem evidence and lets the selected account run again", async () => {
  expect((await inspectAccountAccess(mockDb, options)).status).toBe("expired");
  await updateAccountInfo(ownerId, { uid, cookie, nickname: "Relinked" });

  expect(await getRedeemCookieState(mockDb, uid)).toEqual({ invalid: false, needsCookieUpdate: false, lastRefreshAttempt: null, legacyMigrated: true });
  expect(await inspectAccountAccess(mockDb, options)).toMatchObject({ status: "ready", account: { cookie, invalid: false } });
  expect(await getLegacyAccounts(mockDb, ownerId)).toHaveLength(1);
  expect(await mockDb.get(`${uid}.redeemedCodes`)).toEqual(["CLAIMED"]);
  expect(await mockDb.get("other-uid.redeemInvalid")).toBe(true);
});

it("relink also clears legacy evidence without reimporting it on the next automatic redeem", async () => {
  await mockDb.set(`${uid}.cookieExpired`, true);
  await mockDb.set(`${uid}.needsCookieUpdate`, true);
  await mockDb.set(`${uid}.lastCookieRefreshAttempt`, 456);
  await updateAccountInfo(ownerId, { uid, cookie });
  await migrateLegacyRedeemCookieState(mockDb, uid);
  expect((await inspectAccountAccess(mockDb, options)).status).toBe("ready");
  expect(await getRedeemCookieState(mockDb, uid)).toMatchObject({ invalid: false, needsCookieUpdate: false, lastRefreshAttempt: null });
});

it.each([
  "",
  "ltuid_v2=123; ltoken_v2=general-only",
  "ltuid_v2=123; cookie_token_v2=",
  "ltuid_v2=123; cookie_token_v2=undefined",
  "cookie_token_v2=missing-account-id",
])("does not clear redeem evidence when linking incomplete credentials: %s", async incompleteCookie => {
  await updateAccountInfo(ownerId, { uid, cookie: incompleteCookie });
  expect(await getRedeemCookieState(mockDb, uid)).toMatchObject({ invalid: true, needsCookieUpdate: true, lastRefreshAttempt: 123 });
});

it("a general background cookie refresh retains redemption failures", async () => {
  const fetcher = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true, json: async () => ({ code: 200, data: { cookie_info: { cookie_token: "refreshed", account_id: "123" } } }),
  } as Response);
  try {
    await updateCookie(ownerId, 0, cookie, "general");
    expect(await getRedeemCookieState(mockDb, uid)).toMatchObject({ invalid: true, needsCookieUpdate: true });
  } finally { fetcher.mockRestore(); }
});
