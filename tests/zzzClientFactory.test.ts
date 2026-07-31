import { createZzzClient } from "../src/utilities/zzz/clientFactory.js";

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
});
