import {
  createZzzClient,
  getZzzClientLanguage,
} from "../src/utilities/zzz/clientFactory.js";

describe("ZZZ client factory", () => {
  it("建立 client 時不會先呼叫 daily info", () => {
    const dailyInfo = jest.fn(() => {
      throw new Error(
        "daily info should not be called while constructing a client",
      );
    });
    class FakeZzzClient {
      daily = { info: dailyInfo };
      constructor(public options: unknown) {}
    }

    const client = createZzzClient(
      { cookie: "masked", uid: 123456 },
      FakeZzzClient as any,
    ) as unknown as FakeZzzClient;

    expect(client).toBeInstanceOf(FakeZzzClient);
    expect(dailyInfo).not.toHaveBeenCalled();
  });

  it("normalizes stored locale codes and Discord locale codes for the ZZZ API", () => {
    expect(getZzzClientLanguage("tw")).toBe("zh-tw");
    expect(getZzzClientLanguage("zh-TW")).toBe("zh-tw");
    expect(getZzzClientLanguage("cn")).toBe("zh-cn");
    expect(getZzzClientLanguage("ja")).toBe("ja-jp");
    expect(getZzzClientLanguage("unknown")).toBe("en-us");
  });
});
