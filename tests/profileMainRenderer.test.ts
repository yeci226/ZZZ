import { loadImage } from "@napi-rs/canvas";
import { drawOfficialMainProfile, getProfileMainLayout } from "../src/utilities/zzz/profileMain.js";
import { normalizeProfileDeadly, normalizeProfileShiyu, type ProfileMainData } from "../src/utilities/zzz/profileMainData.js";
import { createTranslator } from "../src/utilities/core/i18n.js";

function fixture(): ProfileMainData {
  return {
    account: { nickname: "Very long player nickname 測試測試測試", game_role_id: "123456789", level: 60, region_name: "Asia" },
    record: { stats: { active_days: 809, avatar_num: 41, buddy_num: 30, achievement_count: 359 } },
    characters: [], showcase: [{ id: 1411, rarity: "S", level: 60, rank: 6, element_type: 200, avatar_profession: 1 }],
    deadly: [1, 2].map((schedule) => normalizeProfileDeadly({ list: [{ nest_type: "Hard", score: 11974, star: 1, rank: 8194 }] }, schedule as 1 | 2)),
    shiyu: [1, 2].map((schedule) => normalizeProfileShiyu({ hadal_info_v2: { brief: { score: 119278, rank_percent: 50, cur_period_zone_layer_count: 5, rating: "S+" } } }, schedule as 1 | 2)),
  };
}

describe("official profile renderer", () => {
  it("renders full records at 2× with the complete roster and battle sections", async () => {
    const data = fixture();
    const png = await drawOfficialMainProfile(createTranslator("tw"), "tw", data);
    const decoded = await loadImage(png);
    expect(decoded.width).toBe(2400);
    expect(decoded.height).toBe(2340);
    expect(png.length).toBeLessThan(10 * 1024 * 1024);
  });

  it("collapses unplayed periods while preserving current/previous column identity", () => {
    const data = fixture();
    data.deadly[0] = normalizeProfileDeadly({ list: [] }, 1);
    data.shiyu[0] = normalizeProfileShiyu({ hadal_info_v2: {} }, 1);
    const layout = getProfileMainLayout(data);
    expect(layout.deadly.map((p) => p.schedule)).toEqual([2]);
    expect(layout.hasShiyu).toBe(true);
    expect(layout.height).toBeLessThan(getProfileMainLayout(fixture()).height);
    data.shiyu[1] = normalizeProfileShiyu({ hadal_info_v2: {} }, 2);
    expect(getProfileMainLayout(data).hasShiyu).toBe(false);
  });

  it("keeps unavailable records visible rather than treating them as unplayed", async () => {
    const data = fixture();
    data.deadly = [{ schedule: 1, status: "unavailable", start: "", end: "", extreme: null, trial: null }];
    data.shiyu = [{ schedule: 2, status: "unavailable", start: "", end: "", battle: null }];
    expect(getProfileMainLayout(data).deadly).toHaveLength(1);
    expect(getProfileMainLayout(data).hasShiyu).toBe(true);
    const png = await drawOfficialMainProfile(createTranslator("fr"), "fr", data);
    expect((await loadImage(png)).width).toBe(2400);
  });

  it("still produces a profile if a remote avatar image fails", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    try {
      const data = fixture();
      data.showcase[0].role_square_url = "https://example.invalid/missing.png";
      const png = await drawOfficialMainProfile(createTranslator("en"), "en", data);
      expect((await loadImage(png)).width).toBe(2400);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { fetchMock.mockRestore(); }
  });
});
