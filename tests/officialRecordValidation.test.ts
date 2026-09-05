import { sanitizeOfficialValidationError, validateOfficialRecordPayload } from "../src/utilities/zzz/officialRecordValidation.js";

describe("official ZZZ record payload validation", () => {
  it("accepts empty but structurally valid API payloads", () => {
    expect(validateOfficialRecordPayload("note", { energy: {} })).toEqual([]);
    expect(validateOfficialRecordPayload("gacha_calendar", { avatar_gacha_schedule_list: [], weapon_gacha_schedule_list: [] })).toEqual([]);
    expect(validateOfficialRecordPayload("zenkov_abstract_info", { map_list: [], collection_data: {} })).toEqual([]);
    expect(validateOfficialRecordPayload("zenkov_detail", { record_list: [] })).toEqual([]);
  });

  it("reports incompatible response shapes", () => {
    expect(validateOfficialRecordPayload("note", {})).toContain("note.energy is missing");
    expect(validateOfficialRecordPayload("gacha_record", { gacha_item_list: {} })).not.toEqual([]);
    expect(validateOfficialRecordPayload("zenkov_abstract_info", { map_list: {} })).not.toEqual([]);
  });

  it("redacts credentials from validation errors", () => {
    const text = sanitizeOfficialValidationError(new Error("authkey=secret123; ltoken_v2=token456"));
    expect(text).not.toContain("secret123");
    expect(text).not.toContain("token456");
    expect(text).toContain("[redacted]");
  });
});
