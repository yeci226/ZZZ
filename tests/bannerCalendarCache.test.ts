import { cachePublicBannerCalendar, getPublicBannerCalendar } from "../src/utilities/zzz/bannerCalendarCache.js";
import { __bannerRendererInternals } from "../src/utilities/zzz/bannerRenderer.js";
import { bannerCalendar, bannerDb, BANNER_NOW as NOW } from "./fixtures/bannerCalendar.js";

describe("shared public banner calendar", () => {
  it("persists only public metadata and never mutates the account response", async () => {
    const db = bannerDb();
    const calendar = bannerCalendar();
    await cachePublicBannerCalendar(db, calendar, { region: "prod_gf_jp", lang: "zh-tw", now: NOW });
    const cached = await getPublicBannerCalendar(db, { lang: "zh-tw", now: NOW });
    expect(cached?.calendar.avatar_gacha_schedule_list[0]).toMatchObject({
      gacha_type: "GACHA_TYPE_CHARACTER_RETURN", version: "3.1",
      avatar_list: [{ id: "1091", name: "雅", rarity: "S", element_type: 202, sub_element_type: 201, profession: 3 }],
    });
    const stored = JSON.stringify(db.state);
    for (const privateValue of ["130000001", "98765", "tickets", "sup_lock_show", "more_s_need_cnt", "is_owned", '"rank"']) {
      expect(stored).not.toContain(privateValue);
    }
    expect(calendar.avatar_gacha_schedule_list[0].sup_lock_show).toBe(false);
    expect(calendar.tickets[0].ticket_cnt).toBe(98765);
  });

  it("ages relative countdowns, opens upcoming banners, and removes expired ones", async () => {
    const db = bannerDb();
    await cachePublicBannerCalendar(db, bannerCalendar({
      start_ts: undefined, end_ts: undefined, left_start_ts: 3600, left_end_ts: 10800,
      gacha_state: "GACHA_STATE_NOT_START",
    }), { region: "prod_gf_jp", lang: "zh-tw", now: NOW });
    const later = NOW + 7_200_000;
    const cached = await getPublicBannerCalendar(db, { lang: "zh-tw", now: later });
    const schedule = cached!.calendar.avatar_gacha_schedule_list[0];
    expect(schedule).not.toHaveProperty("left_start_ts");
    expect(schedule).not.toHaveProperty("left_end_ts");
    expect(__bannerRendererInternals.scheduleState(schedule, later)).toBe("active");
    expect(schedule.end_ts).toBe(later + 3_600_000);
    expect(await getPublicBannerCalendar(db, { lang: "zh-tw", now: NOW + 10_800_000 })).toBeNull();
  });

  it("keeps regional snapshots separate, prefers the requested language and falls back when needed", async () => {
    const db = bannerDb();
    await cachePublicBannerCalendar(db, bannerCalendar(), { region: "prod_gf_jp", lang: "zh-tw", now: NOW });
    await cachePublicBannerCalendar(db, bannerCalendar(), { region: "prod_gf_us", lang: "en-us", now: NOW + 1000 });
    expect((await getPublicBannerCalendar(db, { lang: "zh-tw", now: NOW + 2000 }))?.region).toBe("prod_gf_jp");
    expect((await getPublicBannerCalendar(db, { lang: "ja-jp", now: NOW + 2000 }))?.region).toBe("prod_gf_us");
    expect((await getPublicBannerCalendar(db, { lang: "zh-tw", region: "prod_gf_us", now: NOW + 2000 }))?.lang).toBe("en-us");
    expect(await getPublicBannerCalendar(db, { lang: "zh-tw", region: "prod_gf_eu", now: NOW })).toBeNull();
  });

  it("does not overwrite usable data with empty, malformed, completed or undated responses", async () => {
    const db = bannerDb();
    const options = { region: "prod_gf_jp", lang: "zh-tw", now: NOW };
    await cachePublicBannerCalendar(db, bannerCalendar(), options);
    for (const calendar of [null, {}, { avatar_gacha_schedule_list: {} },
      bannerCalendar({ gacha_state: "GACHA_STATE_COMPLETED" }),
      bannerCalendar({ end_ts: null, left_end_ts: null }),
    ]) await cachePublicBannerCalendar(db, calendar, options);
    expect(db.set).toHaveBeenCalledTimes(1);
    expect(await getPublicBannerCalendar(db, { lang: "zh-tw", now: NOW })).not.toBeNull();
  });

  it("ignores malformed stored entries", async () => {
    const db = bannerDb();
    db.state.zzzPublicBannerCalendars = { prod_gf_jp: { "zh-tw": { schemaVersion: 1, updatedAt: "bad" }, bad: null } };
    expect(await getPublicBannerCalendar(db, { lang: "zh-tw", now: NOW })).toBeNull();
  });
});
