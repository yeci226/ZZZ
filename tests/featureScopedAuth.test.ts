import { createFakeDb } from "./helpers/fakeDb";
import {
  getHoyolabByLtuid,
  getLegacyAccounts,
  markCharacterInvalid,
  markHoyolabInvalid,
  restoreGeneralValidity,
  updateLegacyAccountAtIndex,
  upsertCharacter,
  upsertHoyolab,
} from "../src/utilities/accountStore";

describe("feature-scoped canonical authentication", () => {
  it("redeem-scoped cookie writes preserve general Hoyolab and character invalidity", async () => {
    const db = createFakeDb();
    await upsertHoyolab(db, "user-1", {
      ltuid_v2: "ltuid-test",
      cookie: "synthetic-cookie-v1",
    });
    await upsertCharacter(db, "user-1", "ltuid-test", {
      uid: "800000001",
      nickname: "Test",
      region: "asia",
      lastUpdate: "2026-01-01T00:00:00.000Z",
      invalid: false,
    });
    await markHoyolabInvalid(db, "user-1", "ltuid-test", true);
    await markCharacterInvalid(db, "user-1", "800000001", true);

    await upsertHoyolab(
      db,
      "user-1",
      { ltuid_v2: "ltuid-test", cookie: "synthetic-cookie-v2" },
      { scope: "redeem" },
    );

    const hoyolab = await getHoyolabByLtuid(db, "user-1", "ltuid-test");
    expect(hoyolab?.invalid).toBe(true);
    expect(hoyolab?.characters[0]?.invalid).toBe(true);
    expect(hoyolab?.cookie).toBe("synthetic-cookie-v2");
  });

  it("restores general validity after a usable daily account succeeds", async () => {
    const db = createFakeDb();
    await upsertHoyolab(db, "user-1", {
      ltuid_v2: "ltuid-test",
      cookie: "synthetic-cookie-v1",
    });
    await upsertCharacter(db, "user-1", "ltuid-test", {
      uid: "800000001",
      nickname: "Test",
      region: "asia",
      lastUpdate: "2026-01-01T00:00:00.000Z",
      invalid: true,
    });
    await markHoyolabInvalid(db, "user-1", "ltuid-test", true);

    await restoreGeneralValidity(db, "user-1", "800000001");

    const hoyolab = await getHoyolabByLtuid(db, "user-1", "ltuid-test");
    expect(hoyolab?.invalid).toBe(false);
    expect(hoyolab?.characters[0]?.invalid).toBe(false);
    expect((await getLegacyAccounts(db, "user-1"))[0]?.invalid).toBe(false);
  });

  it("redeem-scoped legacy cookie writes preserve general invalidity", async () => {
    const db = createFakeDb();
    await upsertHoyolab(db, "user-1", {
      ltuid_v2: "ltuid-test",
      cookie: "synthetic-cookie-v1",
    });
    await upsertCharacter(db, "user-1", "ltuid-test", {
      uid: "800000001",
      nickname: "Test",
      region: "asia",
      lastUpdate: "2026-01-01T00:00:00.000Z",
      invalid: false,
    });
    await markHoyolabInvalid(db, "user-1", "ltuid-test", true);
    await markCharacterInvalid(db, "user-1", "800000001", true);

    await updateLegacyAccountAtIndex(
      db,
      "user-1",
      0,
      {
        cookie: "synthetic-cookie-v2",
        invalid: false,
      },
      { scope: "redeem" },
    );

    const hoyolab = await getHoyolabByLtuid(db, "user-1", "ltuid-test");
    expect(hoyolab?.cookie).toBe("synthetic-cookie-v2");
    expect(hoyolab?.invalid).toBe(true);
    expect(hoyolab?.characters[0]?.invalid).toBe(true);
  });
});
