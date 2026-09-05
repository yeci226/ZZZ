import { createFakeDb } from "./helpers/fakeDb";
import {
  classifyInvalidScopes,
  clearLegacyInvalidProbe,
  getDailyAuthAccountKey,
  hasLegacyInvalidProbeCompleted,
  markLegacyInvalidProbeCompleted,
} from "../src/utilities/core/dailyAuthState";

describe("daily authentication state", () => {
  it("keeps redeem-only and general invalid scopes distinguishable", () => {
    expect(classifyInvalidScopes(false, false)).toBe("none");
    expect(classifyInvalidScopes(false, true)).toBe("redeem");
    expect(classifyInvalidScopes(true, false)).toBe("general");
    expect(classifyInvalidScopes(true, true)).toBe("both");
  });

  it("stores a legacy invalid probe completion marker per user and account", async () => {
    const db = createFakeDb();

    expect(
      await hasLegacyInvalidProbeCompleted(db, "user-1", "ltuid-test"),
    ).toBe(false);

    await markLegacyInvalidProbeCompleted(db, "user-1", "ltuid-test");
    expect(
      await hasLegacyInvalidProbeCompleted(db, "user-1", "ltuid-test"),
    ).toBe(true);
    expect(
      await hasLegacyInvalidProbeCompleted(db, "user-2", "ltuid-test"),
    ).toBe(false);

    await clearLegacyInvalidProbe(db, "user-1", "ltuid-test");
    expect(
      await hasLegacyInvalidProbeCompleted(db, "user-1", "ltuid-test"),
    ).toBe(false);
  });

  it("uses ltuid as the stable account identity without exposing the cookie", () => {
    expect(
      getDailyAuthAccountKey("ltuid_v2=ltuid-test; ltoken_v2=redacted", "800000001"),
    ).toBe("ltuid-test");
    expect(getDailyAuthAccountKey("cookie-without-ltuid", "800000001")).toBe(
      "uid:800000001",
    );
  });
});
