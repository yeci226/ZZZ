export const BANNER_NOW = Date.UTC(2026, 8, 27);

export function bannerCalendar(overrides: Record<string, unknown> = {}) {
  return {
    uid: "130000001",
    tickets: [{ ticket_cnt: 98765 }],
    avatar_gacha_schedule_list: [{
      gacha_type: "GACHA_TYPE_CHARACTER_RETURN",
      gacha_state: "GACHA_STATE_IN_PROGRESS",
      version: "3.1",
      start_ts: (BANNER_NOW - 86_400_000) / 1000,
      end_ts: (BANNER_NOW + 345_600_000) / 1000,
      left_end_ts: 345600,
      sup_lock_show: false,
      more_s_need_cnt: 7,
      avatar_list: [{
        avatar_id: 1091, avatar_name: "雅", full_name: "星見雅", rarity: "S",
        icon: "https://example.invalid/miyabi.png",
        avatar_element_type: 202, avatar_sub_element_type: 201, avatar_profession: 3,
        is_owned: true, rank: 6,
      }],
      ...overrides,
    }],
    weapon_gacha_schedule_list: [],
  };
}

export function bannerDb() {
  const state: Record<string, any> = {};
  return {
    state,
    get: jest.fn(async (key: string) => key.split(".").reduce((value, part) => value?.[part], state)),
    set: jest.fn(async (key: string, value: unknown) => {
      const parts = key.split(".");
      const last = parts.pop()!;
      let parent = state;
      for (const part of parts) parent = parent[part] ??= {};
      parent[last] = JSON.parse(JSON.stringify(value));
    }),
  };
}
