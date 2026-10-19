import { ZenlessZoneZero } from "@yeci226/hoyoapi";
import { createZzzDailyClient } from "../src/utilities/zzz/clientFactory.js";
import { classifyDailyClaim } from "../src/utilities/zzz/dailyClaim.js";

// Uses the installed SDK without mocking it or making authenticated requests.
describe("Daily-only client", () => {
  it.each([801422231, 416561269])(
    "does not infer a region from saved UID %s",
    (uid) => {
      const cookie = "ltuid_v2=1; ltoken_v2=synthetic-test";
      expect(() => new ZenlessZoneZero({ uid, cookie })).toThrow(
        `Given UID ${uid} is invalid`,
      );
      // Extra runtime properties must not leak through to the SDK either.
      const client = createZzzDailyClient({ uid, cookie } as any);
      expect(Object.keys(client)).toEqual(["daily"]);
      expect(typeof client.daily.info).toBe("function");
      expect(typeof client.daily.claim).toBe("function");
    },
  );
  it.each([
    [0, "success"],
    [-5003, "already_signed"],
  ] as const)("classifies code %s", (code, expected) => {
    expect(classifyDailyClaim({ code })).toBe(expected);
  });
  it.each([-100, -1071, 10035, -1, undefined, null, ""])(
    "rejects non-success code %s even with signed info",
    (code) => {
      expect(() =>
        classifyDailyClaim({ code, info: { is_sign: true } } as any),
      ).toThrow();
    },
  );
});
