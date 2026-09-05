import { createFakeDb } from "./helpers/fakeDb";
import {
  clearRedeemCookieState,
  getRedeemCookieState,
  migrateLegacyRedeemCookieState,
  markRedeemTokenInvalid,
  setRedeemCookieInvalid,
} from "../src/utilities/core/redeemCookieState";

describe("ZZZ redeem Cookie state isolation", () => {
  it("migrates legacy evidence once, writes the marker before deleting legacy fields", async () => {
    const inner = createFakeDb({
      "800000001": {
        cookieExpired: true,
        needsCookieUpdate: true,
        lastCookieRefreshAttempt: 123,
      },
    });
    const writes: string[] = [];
    const db = {
      get: inner.get,
      async set<T>(key: string, value: T) {
        writes.push(`set:${key}`);
        await inner.set(key, value);
      },
      async delete(key: string) {
        writes.push(`delete:${key}`);
        await inner.delete(key);
      },
    };

    await migrateLegacyRedeemCookieState(db, "800000001");

    expect(await getRedeemCookieState(db, "800000001")).toEqual({
      invalid: true,
      needsCookieUpdate: true,
      lastRefreshAttempt: 123,
      legacyMigrated: true,
    });
    const markerIndex = writes.indexOf("set:800000001.redeemStateMigrated");
    expect(markerIndex).toBeGreaterThanOrEqual(0);
    for (const field of [
      "cookieExpired",
      "needsCookieUpdate",
      "lastCookieRefreshAttempt",
    ]) {
      expect(writes.indexOf(`delete:800000001.${field}`)).toBeGreaterThan(
        markerIndex,
      );
      expect(await db.get(`800000001.${field}`)).toBeUndefined();
    }
  });

  it("does not re-import legacy evidence after redeem state is cleared", async () => {
    const db = createFakeDb({
      "800000001": { cookieExpired: true },
    });

    await migrateLegacyRedeemCookieState(db, "800000001");
    await clearRedeemCookieState(db, "800000001");
    await migrateLegacyRedeemCookieState(db, "800000001");

    expect(await getRedeemCookieState(db, "800000001")).toEqual({
      invalid: false,
      needsCookieUpdate: false,
      lastRefreshAttempt: null,
      legacyMigrated: true,
    });
  });

  it("marks only redeem invalid and never writes the general legacy key", async () => {
    const db = createFakeDb();

    await setRedeemCookieInvalid(db, "800000001", true);

    expect((await getRedeemCookieState(db, "800000001")).invalid).toBe(true);
    expect(await db.has("800000001.cookieExpired")).toBe(false);
    expect(await db.has("800000001.invalid")).toBe(false);
  });

  it("records redeem token invalidity without changing canonical general validity", async () => {
    const db = createFakeDb({
      "800000001": {
        hoyolabs: [{ invalid: true }],
      },
    });

    await markRedeemTokenInvalid(db, "800000001", 456);

    expect(await getRedeemCookieState(db, "800000001")).toEqual({
      invalid: true,
      needsCookieUpdate: false,
      lastRefreshAttempt: 456,
      legacyMigrated: false,
    });
    expect(await db.has("800000001.invalid")).toBe(false);
    expect((await db.get<any>("800000001.hoyolabs"))[0].invalid).toBe(true);
  });

  it("serializes concurrent legacy migrations for one account", async () => {
    const inner = createFakeDb({
      "800000001": { cookieExpired: true },
    });
    const markerWrites: string[] = [];
    const db = {
      get: inner.get,
      async set<T>(key: string, value: T) {
        if (key.endsWith("redeemStateMigrated")) {
          markerWrites.push(key);
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        await inner.set(key, value);
      },
      delete: inner.delete,
    };

    await Promise.all([
      migrateLegacyRedeemCookieState(db, "800000001"),
      migrateLegacyRedeemCookieState(db, "800000001"),
    ]);

    expect(markerWrites).toHaveLength(1);
    expect(await getRedeemCookieState(db, "800000001")).toMatchObject({
      invalid: true,
      legacyMigrated: true,
    });
  });
});
