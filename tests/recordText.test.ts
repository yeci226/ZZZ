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
