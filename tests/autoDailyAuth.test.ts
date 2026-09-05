import {
  isDailyAccountExpiredError,
  isExplicitAuthenticationError,
  shouldMarkGeneralInvalid,
  shouldRestoreGeneralValidity,
  shouldSkipAutoDailyAccount,
} from "../src/utilities/zzz/autoDailyAuth";
import { shouldMarkAutoDailyProcessed } from "../src/utilities/zzz/autoDailyPolicy";

describe("AutoDaily authentication policy", () => {
  it("does not skip a credentialed account merely because legacy invalid is true", () => {
    expect(
      shouldSkipAutoDailyAccount(
        {
          uid: "800000001",
          cookie: "synthetic-cookie",
          invalid: true,
          legacyInvalidProbeCompleted: false,
        },
        { allowLegacyInvalidRecovery: true },
      ),
    ).toBe(false);
  });

  it("skips and logs only accounts missing UID or Cookie", () => {
    expect(shouldSkipAutoDailyAccount({ uid: "800000001", cookie: "" })).toBe(
      true,
    );
    expect(shouldSkipAutoDailyAccount({ uid: "", cookie: "synthetic-cookie" })).toBe(
      true,
    );
    expect(shouldSkipAutoDailyAccount({ uid: "800000001", cookie: "synthetic-cookie" })).toBe(
      false,
    );
  });

  it("attempts legacy invalid accounts only when scheduled recovery is explicitly allowed", () => {
    const account = {
      uid: "130000001",
      cookie: "fixture-cookie",
      invalid: true,
      legacyInvalidProbeCompleted: false,
    };

    expect(
      shouldSkipAutoDailyAccount(account, { allowLegacyInvalidRecovery: true }),
    ).toBe(false);
    expect(
      shouldSkipAutoDailyAccount(account, { allowLegacyInvalidRecovery: false }),
    ).toBe(true);
  });

  it("never probes an invalid account again after the legacy probe completed", () => {
    expect(
      shouldSkipAutoDailyAccount(
        {
          uid: "130000001",
          cookie: "fixture-cookie",
          invalid: true,
          legacyInvalidProbeCompleted: true,
        },
        { allowLegacyInvalidRecovery: true },
      ),
    ).toBe(true);
  });

  it("marks API success as processed even when notification delivery later fails", () => {
    expect(shouldMarkAutoDailyProcessed({ success: 1, alreadySigned: 0 })).toBe(true);
    expect(shouldMarkAutoDailyProcessed({ success: 0, alreadySigned: 1 })).toBe(true);
    expect(shouldMarkAutoDailyProcessed({ success: 0, alreadySigned: 0 })).toBe(false);
  });

  it("recognizes a direct -100 daily response as a whole-account expiration", () => {
    expect(isDailyAccountExpiredError({ code: -100, message: "尚未登入" })).toBe(
      true,
    );
    expect(isDailyAccountExpiredError(new Error("尚未登入"))).toBe(true);
    expect(isDailyAccountExpiredError(new Error("request timed out"))).toBe(
      false,
    );
  });

  it("recognizes explicit authentication failures but not transport, server, or notification failures", () => {
    expect(isExplicitAuthenticationError({ code: -100 })).toBe(true);
    expect(isExplicitAuthenticationError({ response: { status: 401 } })).toBe(
      true,
    );
    expect(isExplicitAuthenticationError(new Error("login required"))).toBe(
      true,
    );
    expect(isExplicitAuthenticationError(new Error("尚未登入"))).toBe(true);
    expect(isExplicitAuthenticationError(new Error("request timed out"))).toBe(
      false,
    );
    expect(isExplicitAuthenticationError(new Error("HTTP 503"))).toBe(false);
    expect(isExplicitAuthenticationError(new Error("notification failed"))).toBe(
      false,
    );
  });

  it("restores general validity only after a successful or already-signed daily result", () => {
    expect(shouldRestoreGeneralValidity("success")).toBe(true);
    expect(shouldRestoreGeneralValidity("already_signed")).toBe(true);
    expect(shouldRestoreGeneralValidity("failed")).toBe(false);
  });

  it("marks general validity only for explicit authentication failures", () => {
    expect(shouldMarkGeneralInvalid({ code: -1071 })).toBe(true);
    expect(shouldMarkGeneralInvalid(new Error("request timed out"))).toBe(false);
    expect(shouldMarkGeneralInvalid(new Error("HTTP 503"))).toBe(false);
  });
});
