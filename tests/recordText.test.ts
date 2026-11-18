import type { GachaChannelCategory } from "../src/utilities/zzz/gachaArchive.js";
import { noteText, signalCategoryText, signalText } from "../src/utilities/zzz/recordText.js";
import { formatSignalAction, signalActionText } from "../src/utilities/zzz/signalActionText.js";

const locales = ["tw", "cn", "en", "jp", "kr", "fr", "vi"];
const categories: GachaChannelCategory[] = ["character_up", "character_return", "weapon_up", "weapon_return", "standard", "bangboo", "unknown"];

describe("ZZZ Note and Signal Log localization", () => {
  it.each(locales)("provides a complete non-empty %s dictionary", (locale) => {
    expect(Object.values(noteText(locale)).every((value) => typeof value === "string" && value.length > 0)).toBe(true);
    expect(Object.values(signalText(locale)).every((value) => typeof value === "string" && value.length > 0)).toBe(true);
    expect(Object.values(signalActionText(locale)).every((value) => typeof value === "string" && value.length > 0)).toBe(true);
    expect(categories.every((category) => signalCategoryText(locale, category).length > 0)).toBe(true);
  });

  const newKeys = [
    "homeTitle", "allChannels", "monochrome", "pullsAvailable", "pullUnit", "sCountOf", "sCount", "toHardPity",
    "smallGuarantee", "upOverS", "averageUpCost", "averageSShort", "pityNow", "viewWall", "viewVersions",
    "newestFirst", "recordsSince", "ongoing", "noSInVersion", "continued", "upCountOf", "homeOption",
  ] as const;

  it.each(locales)("provides every poster key in %s", (locale) => {
    const text = signalText(locale) as unknown as Record<string, unknown>;
    for (const key of newKeys) {
      expect(typeof text[key]).toBe("string");
      expect((text[key] as string).length).toBeGreaterThan(0);
    }
    expect(text.toHardPity).toContain("{n}");
    expect(text.sCountOf).toContain("{n}");
    expect(text.recordsSince).toContain("{date}");
    expect(text.upCountOf).toContain("{n}");
  });

  it.each(locales.filter((locale) => locale !== "en"))("translates poster copy for %s", (locale) => {
    const text = signalText(locale) as unknown as Record<string, string>;
    const english = signalText("en") as unknown as Record<string, string>;
    expect(text.viewWall).not.toBe(english.viewWall);
    expect(text.homeTitle).not.toBe(english.homeTitle);
  });

  it("uses the fixed Traditional Chinese copy", () => {
    expect(signalText("tw").viewVersions).toBe("版本紀錄");
    expect(signalText("tw").viewWall).toBe("S 級一覽");
    expect(signalText("tw").sCountOf).toBe("S 級 {n} 個");
  });

  it("normalizes Discord and API locale aliases", () => {
    expect(noteText("zh-TW").title).toBe(noteText("tw").title);
    expect(noteText("zh-CN").title).toBe(noteText("cn").title);
    expect(signalText("ja-JP").recordTitle).toBe(signalText("jp").recordTitle);
    expect(signalText("ko-KR").recordTitle).toBe(signalText("kr").recordTitle);
  });

  it("formats localized action message placeholders", () => {
    expect(formatSignalAction(signalActionText("en").importComplete, { inserted: 3, fetched: 20 }))
      .toContain("3");
  });
});
