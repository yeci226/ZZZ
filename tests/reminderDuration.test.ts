import {
  formatReminderDuration,
  parseReminderDuration,
} from "../src/utilities/zzz/reminderDuration";

describe("reminder duration presentation", () => {
  it("parses plain values using the field's original unit", () => {
    expect(parseReminderDuration("30", "minutes", 15, 720)).toBe(30);
    expect(parseReminderDuration("1.5", "hours", 60, 720)).toBe(90);
    expect(parseReminderDuration("1,5", "hours", 60, 720)).toBe(90);
  });

  it("parses localized and compound duration input", () => {
    expect(parseReminderDuration("15分鐘", "minutes", 15, 720)).toBe(15);
    expect(parseReminderDuration("1小時30分鐘", "minutes", 15, 720)).toBe(90);
    expect(parseReminderDuration("1小时", "minutes", 15, 720)).toBe(60);
    expect(parseReminderDuration("1時間", "minutes", 15, 720)).toBe(60);
    expect(parseReminderDuration("1시간", "minutes", 15, 720)).toBe(60);
    expect(parseReminderDuration("1 heure 30 minutes", "minutes", 15, 720)).toBe(90);
    expect(parseReminderDuration("1 giờ", "minutes", 15, 720)).toBe(60);
    expect(parseReminderDuration("2 days", "hours", 60, 10_080)).toBe(2880);
  });

  it("rejects invalid, out-of-range, and sub-minute values", () => {
    expect(parseReminderDuration("soon", "minutes", 15, 720)).toBeNull();
    expect(parseReminderDuration("14分鐘", "minutes", 15, 720)).toBeNull();
    expect(parseReminderDuration("30分鐘", "hours", 60, 720)).toBeNull();
    expect(parseReminderDuration("12小時1分鐘", "hours", 60, 720)).toBeNull();
    expect(parseReminderDuration("0.5分鐘", "minutes", 0, 720)).toBeNull();
  });

  it("formats readable values in all seven locales", () => {
    expect(formatReminderDuration(30, "tw")).toBe("30 分鐘");
    expect(formatReminderDuration(60, "cn")).toBe("1 小时");
    expect(formatReminderDuration(90, "en")).toBe("1 hour 30 minutes");
    expect(formatReminderDuration(1440, "jp")).toBe("1日");
    expect(formatReminderDuration(2880, "kr")).toBe("2일");
    expect(formatReminderDuration(120, "fr")).toBe("2 heures");
    expect(formatReminderDuration(10080, "vi")).toBe("7 ngày");
  });
});
