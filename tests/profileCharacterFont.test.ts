import { resolveProfileFont } from "../src/utilities/zzz/profileLocale.js";

describe("resolveProfileFont", () => {
  it.each(["tw", "zh-tw", "zh_TW", "zh-Hant", "zh-Hant-TW"])(
    "maps %s to the Traditional Chinese font",
    (locale) => {
      expect(resolveProfileFont(locale)).toBe("TW");
    },
  );

  it.each([
    ["en", "EN"],
    ["en-US", "EN"],
    ["zh-CN", "CN"],
    ["zh-Hans", "CN"],
    ["ja-JP", "JP"],
    ["ko-KR", "KR"],
  ])("maps %s to %s", (locale, expected) => {
    expect(resolveProfileFont(locale)).toBe(expected);
  });
});
