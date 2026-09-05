import {
  formatZzzLiveScheduleChoice,
  getZzzHistoryEntry,
  getZzzScheduleAutocompleteChoices,
  saveDeadlyHistory,
  saveShiyuHistory,
} from "../src/utilities/zzz/recordCache.js";

class MemoryDb {
  private readonly values = new Map<string, unknown>();

  async get(key: string) {
    return this.values.get(key);
  }

  async set(key: string, value: unknown) {
    this.values.set(key, value);
    return value;
  }
}

const deadly = (zoneId: number, score: number) => ({
  has_data: true,
  zone_id: zoneId,
  start_time: { year: 2026, month: 8, day: zoneId },
  end_time: { year: 2026, month: 8, day: zoneId + 7 },
  total_score: score,
  total_star: 9,
  nick_name: "不應被保存的測試暱稱之外的欄位",
  secret_field: "must not be persisted",
  list: [
    {
      score: score - 100,
      star: 3,
      boss: [{ name: "Boss", icon: "https://example.invalid/boss.png" }],
      avatar_list: [
        {
          id: 1581,
          level: 60,
          rank: 2,
          rarity: "S",
          element_type: 300,
          role_square_url: "https://example.invalid/avatar.png",
          secret_avatar_field: "must not be persisted",
        },
      ],
      buffer: [{ name: "增益", desc: "效果", icon: "https://example.invalid/buff.png" }],
      challenge_time: { year: 2026, month: 8, day: zoneId, hour: 1, minute: 2, second: 3 },
    },
  ],
  has_hard: true,
  hard_list: [{ score: score + 100, star: 3 }],
});

describe("ZZZ record history cache", () => {
  it("stores only renderer fields and returns newest periods first", async () => {
    const db = new MemoryDb();
    await saveDeadlyHistory(db, "user", 0, 1, deadly(47, 120000));
    await saveDeadlyHistory(db, "user", 0, 1, deadly(48, 130000));

    const choices = await getZzzScheduleAutocompleteChoices(
      db,
      "deadly",
      "user",
      0,
      "tw",
    );

    expect(choices[0]?.value).toBe("1");
    expect(choices.every((choice) => choice.name.length <= 100 && choice.value.length <= 100)).toBe(true);
    expect(choices.some((choice) => choice.name.includes("48期"))).toBe(true);
    expect(choices.some((choice) => choice.name.includes("47期"))).toBe(true);

    const current = choices.find((choice) => choice.name.includes("48期"));
    expect(current).toBeDefined();
    const entry = await getZzzHistoryEntry(
      db,
      "deadly",
      "user",
      0,
      current!.value,
    );
    expect(entry?.data.secret_field).toBeUndefined();
    expect(entry?.data.list[0].avatar_list[0].secret_avatar_field).toBeUndefined();
    expect(entry?.data.list[0].avatar_list[0].role_square_url).toContain("avatar.png");
  });

  it("keeps the Shiyu payload sufficient for the existing data adapter", async () => {
    const db = new MemoryDb();
    const hadalData = {
      hadal_info_v2: {
        zone_id: 48,
        hadal_begin_time: { year: 2026, month: 8, day: 1 },
        hadal_end_time: { year: 2026, month: 8, day: 15 },
        brief: { score: 999, rank_percent: "1234", rating: "S+" },
        fourth_layer_detail: {
          rating: "S",
          buffer: { title: "增益", text: "效果", icon: "https://example.invalid/buff.png" },
          layer_challenge_info_list: [
            {
              layer_id: 1,
              score: 500,
              battle_time: 30,
              avatar_list: [{ id: 1581, element_type: 300, role_square_url: "https://example.invalid/a.png" }],
              buddy: { id: 1, level: 60 },
            },
          ],
        },
      },
    };

    await saveShiyuHistory(db, "user", 1, 2, hadalData);
    const choices = await getZzzScheduleAutocompleteChoices(db, "shiyu", "user", 1, "tw");
    const historyChoice = choices.find((choice) => choice.value.startsWith("history:shiyu:"));
    expect(historyChoice).toBeDefined();

    const entry = await getZzzHistoryEntry(db, "shiyu", "user", 1, historyChoice!.value);
    expect(entry?.data.hadal_info_v2.fourth_layer_detail.layer_challenge_info_list).toHaveLength(1);
    expect(entry?.data.hadal_info_v2.fourth_layer_detail.layer_challenge_info_list[0].node_id).toBe("1");
    expect(entry?.data.hadal_info_v2.fourth_layer_detail.layer_challenge_info_list[0].buddy.id).toBe(1);
  });

  it("formats live period choices with optional score fragments", () => {
    const choice = formatZzzLiveScheduleChoice("deadly", 1, "tw", {
      schedule_id: 48,
      begin_time: { year: 2026, month: 8, day: 1 },
      end_time: { year: 2026, month: 8, day: 15 },
      total_score: 123456,
      total_star: 9,
      hard_list: [{ score: 654321, star: 3 }],
    });
    expect(choice.value).toBe("1");
    expect(choice.name).toContain("本期");
    expect(choice.name).toContain("48期");
    expect(choice.name).toContain("絕境654321分3星");
    expect(choice.name).toContain("試煉123456分9星");
    expect(choice.name.length).toBeLessThanOrEqual(100);
  });
});
