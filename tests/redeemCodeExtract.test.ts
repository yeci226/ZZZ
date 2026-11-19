import { extractRedeemCodes, findRedeemCodes } from "../src/utilities/zzz/redeemCodeExtract.js";

const find = (content: string, embeds: any[] = []) => findRedeemCodes({ content, embeds });

describe("redeem code extraction", () => {
  test("finds codes that stand alone, are labelled, or mix letters and digits", () => {
    expect(find("ZENLESSGIFT\n- `GOWITHYOU`\n**ZZZOFFICIAL**")).toEqual(["ZENLESSGIFT", "GOWITHYOU", "ZZZOFFICIAL"]);
    expect(find("Use code: ZENLESSGIFT today")).toEqual(["ZENLESSGIFT"]);
    expect(find("兌換碼：ZENLESSGIFT ABCDEFGH")).toEqual(["ZENLESSGIFT", "ABCDEFGH"]);
    expect(find("新碼 7E0QPNQT5A76 快去領")).toEqual(["7E0QPNQT5A76"]);
    expect(find("||ZENLESSGIFT||\n[GOWITHYOU](https://example.com/x)")).toEqual(["ZENLESSGIFT", "GOWITHYOU"]);
  });

  test("rejects plain words, digits, snowflakes, short or lowercase tokens and URL fragments", () => {
    expect(find("ANNOUNCEMENT\nEVERYONE please read the REMINDER")).toEqual([]);
    expect(find("1234567890123456789 and 12345678 and <@123456789012345678>")).toEqual([]);
    expect(find("zenlessgift gowithyou ABCDEF")).toEqual([]);
    expect(find("This MAINTENANCEWINDOW is long")).toEqual([]);
    expect(find("see https://example.com/ABCD1234EFGH5678/page and <:emoji:123456789012345678>")).toEqual([]);
    expect(find("TheQUICKBROWN1234 xZENLESSGIFT9")).toEqual([]);
    expect(find("")).toEqual([]);
  });

  test("reads codes from official redemption URLs in any case and ignores other games and hosts", () => {
    expect(find("https://zenless.hoyoverse.com/redemption?code=zenlessgift")).toEqual(["ZENLESSGIFT"]);
    expect(find("claim: [here](https://zenless.hoyoverse.com/gift?code=ABC123XY).")).toEqual(["ABC123XY"]);
    expect(find("https://hsr.hoyoverse.com/gift?code=STARRAIL1234")).toEqual([]);
    expect(find("https://evil.example.com/gift?code=ZENLESSGIFT")).toEqual([]);
    expect(find("https://zenless.hoyoverse.com/redemption?code=123456789")).toEqual([]);
  });

  test("looks through embed title, description, fields and url", () => {
    const embeds = [{
      title: "Code: TITLECODE1", description: "DESCCODE\nplain text",
      url: "https://zenless.hoyoverse.com/redemption?code=URLCODE99",
      fields: [{ name: "Code", value: "FIELDCODE" }, { name: "x", value: "`MIXED2025AB`" }],
    }];
    expect(find("hello", embeds)).toEqual(["TITLECODE1", "DESCCODE", "URLCODE99", "FIELDCODE", "MIXED2025AB"]);
  });

  test("dedupes across content and embeds, case-insensitively for URLs, and caps at five", () => {
    expect(find("ZENLESSGIFT\nZENLESSGIFT\nhttps://zenless.hoyoverse.com/gift?code=zenlessgift", [{ description: "ZENLESSGIFT" }])).toEqual(["ZENLESSGIFT"]);
    const many = ["AAAAAAAA", "BBBBBBBB", "CCCCCCCC", "DDDDDDDD", "EEEEEEEE", "FFFFFFFF", "GGGGGGGG"].join("\n");
    expect(extractRedeemCodes({ content: many })).toEqual({
      codes: ["AAAAAAAA", "BBBBBBBB", "CCCCCCCC", "DDDDDDDD", "EEEEEEEE"], truncated: true,
    });
    expect(extractRedeemCodes({ content: "AAAAAAAA" })).toEqual({ codes: ["AAAAAAAA"], truncated: false });
  });
});
