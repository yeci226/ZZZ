import { shouldMarkAutoDailyProcessed } from "../src/utilities/zzz/autoDailyPolicy.js";

describe("auto daily processing policy", () => {
  it("marks the day processed after a successful or already-signed account", () => {
    expect(shouldMarkAutoDailyProcessed({ success: 1, alreadySigned: 0 })).toBe(true);
    expect(shouldMarkAutoDailyProcessed({ success: 0, alreadySigned: 2 })).toBe(true);
  });

  it("does not mark the day processed when every account failed", () => {
    expect(shouldMarkAutoDailyProcessed({ success: 0, alreadySigned: 0 })).toBe(false);
  });

  it("marks the day processed after a completed legacy invalid probe", () => {
    expect(
      shouldMarkAutoDailyProcessed({
        success: 0,
        alreadySigned: 0,
        legacyProbeCompleted: true,
      }),
    ).toBe(true);
  });


  it("does not depend on notification delivery", () => {
    expect(
      shouldMarkAutoDailyProcessed({ success: 1, alreadySigned: 0, notificationDelivered: false }),
    ).toBe(true);
  });
});
