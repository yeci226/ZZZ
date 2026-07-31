jest.mock("../src/utilities/zzz/autoDownloadIcons.js", () => ({
  downloadPaintingCache: async (source: string) => source,
}));

import en from "../src/assets/languages/en.js";
import tw from "../src/assets/languages/tw.js";
import cn from "../src/assets/languages/cn.js";
import vi from "../src/assets/languages/vi.js";
import jp from "../src/assets/languages/jp.js";
import kr from "../src/assets/languages/kr.js";
import fr from "../src/assets/languages/fr.js";
import { createTranslator } from "../src/utilities/core/i18n.js";
import { getDeadlyModeLabels } from "../src/utilities/zzz/deadlyMode.js";
import { drawKnockKnockMainProfile } from "../src/utilities/zzz/profileMain.js";

const locales = { en, tw, cn, vi, jp, kr, fr } as const;
const profileKeys = [
  "profileMain_Contacts",
  "profileMain_Online",
  "profileMain_Offline",
  "profileMain_NoTitle",
  "profileMain_Stats",
  "profileMain_ActiveDays",
  "profileMain_Agents",
  "profileMain_Bangboo",
  "profileMain_Achievements",
  "profileMain_Badges",
  "profileCharacter_Level",
  "profileCharacter_Cinema",
  "profileCharacter_AgentStats",
  "profileCharacter_Skills",
  "profileCharacter_BasicAttack",
  "profileCharacter_SpecialAttack",
  "profileCharacter_Dodge",
  "profileCharacter_ChainAttack",
  "profileCharacter_Assist",
  "profileCharacter_CoreSkill",
  "profileCharacter_WEngine",
  "profileCharacter_NoWEngine",
  "profileCharacter_SlotUnequipped",
  "profileCharacter_ValidRolls",
  "profileCharacter_TwoPiece",
  "profileCharacter_FourPiece",
  "profileCharacter_DriveDiscs",
  "profileCharacter_TotalValidRolls",
] as const;

describe("個人介面與危局強襲戰多語系", () => {
  it.each(Object.entries(locales))(
    "%s 自身包含全部個人頁翻譯 key",
    (locale, dictionary) => {
      for (const key of profileKeys) {
        expect(Object.prototype.hasOwnProperty.call(dictionary, key)).toBe(
          true,
        );
        expect(typeof (dictionary as Record<string, unknown>)[key]).toBe(
          "string",
        );
      }
      const tr = createTranslator(locale);
      expect(tr("profileCharacter_SlotUnequipped", { slot: 6 })).toContain("6");
      expect(tr("profileCharacter_SlotUnequipped", { slot: 6 })).not.toContain(
        "<slot>",
      );
    },
  );

  it.each(Object.keys(locales))(
    "%s 個人首頁可實際輸出 1000×625 PNG",
    async (locale) => {
      const image = await drawKnockKnockMainProfile(
        createTranslator(locale),
        locale,
        { nickname: "Test", level: 60, game_role_id: "100000001" },
        { stats: {}, game_data_show: { all_medal_list: [] } },
        [],
      );
      expect(image).toBeInstanceOf(Buffer);
      expect(image?.subarray(1, 4).toString("ascii")).toBe("PNG");
    },
  );

  it.each([
    ["jp", "通常モード"],
    ["kr", "일반 모드"],
    ["fr", "Mode normal"],
    ["vi", "Chế độ thường"],
  ])("%s 危局模式選單不退回英文", (locale, normalLabel) => {
    expect(getDeadlyModeLabels(locale).normal).toBe(normalLabel);
  });
});
