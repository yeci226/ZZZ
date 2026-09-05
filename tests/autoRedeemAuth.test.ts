import { createFakeDb } from "./helpers/fakeDb";
import { getRedeemCookieState } from "../src/utilities/core/redeemCookieState";

const mockClient = { db: null };

jest.mock("../src/index.js", () => ({ client: mockClient }));
jest.mock("../src/utilities/utilities.js", () => ({
  getUserLang: jest.fn(),
  getRedeemCodes: jest.fn(),
  autoRefreshCookie: jest.fn(),
}));
jest.mock("../src/utilities/accountStore.js", () => ({
  getLegacyAccounts: jest.fn(),
}));
jest.mock("../src/utilities/canvas/redeemCard.js", () => ({
  buildZZZRedeemCard: jest.fn(),
}));
jest.mock("../src/utilities/zzz/redeemLayout.js", () => ({
  getFirstRedeemRewardIcon: jest.fn(),
}));
jest.mock("../src/utilities/core/redeemSchedule.js", () => ({
  hasUnredeemedCodes: jest.fn(),
}));

import { AutoRedeemSystem } from "../src/utilities/zzz/autoRedeem";

describe("AutoRedeem redeem-scoped auth state", () => {
  it("migrates legacy refresh evidence and stores attempts only in redeem state", async () => {
    const db = createFakeDb({
      "800000001": {
        cookieExpired: true,
        needsCookieUpdate: true,
        lastCookieRefreshAttempt: 123,
      },
    });
    const system = new AutoRedeemSystem({ db });

    await system.shouldRetryCookieRefresh("800000001");
    await system.markCookieRefreshAttempt("800000001");

    expect(await getRedeemCookieState(db, "800000001")).toMatchObject({
      invalid: true,
      needsCookieUpdate: true,
      legacyMigrated: true,
    });
    expect(await db.has("800000001.cookieExpired")).toBe(false);
    expect(await db.has("800000001.needsCookieUpdate")).toBe(false);
    expect(await db.has("800000001.lastCookieRefreshAttempt")).toBe(false);
    expect(await db.has("800000001.redeemLastCookieRefreshAttempt")).toBe(true);
  });
});
