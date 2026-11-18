// Hand-written samples shaped like the verified HoYoLAB nap_gacha_record responses.
const record = (itemId: string, name: string, count: string, sort: string, isUp: boolean, recordTime: string, upTag = "UP_TAG_NONE") => ({
  item_id: itemId, name, icon: `https://example.invalid/icon/${itemId}.png`, item_type: "ITEM_TYPE_AVATAR", rarity: "S",
  count, sort, is_up: isUp, up_tag: upTag, record_time: recordTime,
});
const upItem = (itemId: string, name: string, upTag: string) => ({
  item_id: itemId, name, icon: `https://example.invalid/icon/${itemId}.png`, item_type: "ITEM_TYPE_AVATAR", rarity: "S",
  count: "0", sort: "0", is_up: true, up_tag: upTag, record_time: "0",
});

export const rawIndex = {
  cur_ver: "3.3",
  total_gacha_count: "360",
  total_s_count: "5",
  cur_tickets: [
    { ticket_type: "GACHA_TICKET_TYPE_RECHARGE_MONOCHROME", ticket_cnt: "100" },
    { ticket_type: "GACHA_TICKET_TYPE_POLYCHROME", ticket_cnt: "1600" },
    { ticket_type: "GACHA_TICKET_TYPE_ENCRYPTED_MASTER_TAPE", ticket_cnt: "3" },
    { ticket_type: "GACHA_TICKET_TYPE_MASTER_TAPE", ticket_cnt: "0" },
    { ticket_type: "GACHA_TICKET_TYPE_BOOPON", ticket_cnt: "7" },
  ],
  type_stats: [
    { gacha_type: "GACHA_TYPE_CHARACTER_UP", total_count: "300", s_count: "4", up_count: "3", avr_up_count: "100.0",
      next_s_cur_times: 20, new_s_max_times: 70, has_data_vers: ["3.3", "3.2", "3.1"] },
    { gacha_type: "GACHA_TYPE_PERMANENT", total_count: "60", s_count: "1", up_count: "0", avr_up_count: "60.0",
      next_s_cur_times: 10, new_s_max_times: 80, has_data_vers: ["3.1"] },
  ],
};

export const rawCurrentCharacter = {
  cur_ver: "3.3",
  list: [
    { gacha_type: "GACHA_TYPE_CHARACTER_UP", gacha_state: "GACHA_STATE_IN_PROGRESS", version: "3.3",
      start_ts: 1794369600, end_ts: 1796108399, cur_item_list: [upItem("1631", "Sample Agent A", "UP_TAG_NEW")], cur_records: [] },
    { gacha_type: "GACHA_TYPE_CHARACTER_UP", gacha_state: "GACHA_STATE_ENDED", version: "3.3",
      start_ts: 1792544400, end_ts: 1794369599, cur_item_list: [upItem("1641", "Sample Agent B", "UP_TAG_NONE")],
      cur_records: [record("1641", "Sample Agent B", "76", "280", true, "1792553604")] },
  ],
};

export const rawHistoryCharacter = {
  list: [
    { gacha_type: "GACHA_TYPE_CHARACTER_UP", gacha_state: "GACHA_STATE_ENDED", version: "3.1", start_ts: 0, end_ts: 0, cur_item_list: [],
      cur_records: [
        record("1581", "Sample Agent C", "30", "204", true, "1788000300"),
        record("1221", "Sample Agent D", "18", "174", false, "1788000200"),
        record("1581", "Sample Agent C", "76", "156", true, "1788000100"),
      ] },
  ],
};
