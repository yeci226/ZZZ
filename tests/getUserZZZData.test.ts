const mockDailyInfo = jest.fn();
const mockCreateZzzClient = jest.fn(() => ({
  daily: { info: mockDailyInfo },
}));
const mockGetLegacyAccountAtIndex = jest.fn(async () => ({
  cookie: "masked-cookie",
  uid: "123456789",
}));

jest.mock("../src/index.js", () => ({
  client: { db: {} },
}));

jest.mock("../src/utilities/accountStore.js", () => ({
  upsertHoyolab: jest.fn(),
  upsertCharacter: jest.fn(),
  extractLtuidFromCookie: jest.fn(),
  fallbackBucketKey: jest.fn(),
  getLegacyAccountAtIndex: mockGetLegacyAccountAtIndex,
  updateLegacyAccountAtIndex: jest.fn(),
}));

jest.mock("../src/utilities/core/config.js", () => ({
  loadConfig: jest.fn(() => ({})),
  getVerifyBaseUrl: jest.fn(() => "https://example.invalid"),
}));

jest.mock("../src/utilities/zzz/clientFactory.js", () => ({
  createZzzClient: mockCreateZzzClient,
}));

import { getUserZZZData } from "../src/utilities/utilities.js";

describe("getUserZZZData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("建立共用 client 時不會呼叫 daily info", async () => {
    const interaction = { locale: "en-US" } as any;
    const tr = (key: string) => key;

    const zzz = await getUserZZZData(
      interaction,
      tr,
      "discord-user",
      "en",
      0,
    );

    expect(mockGetLegacyAccountAtIndex).toHaveBeenCalledTimes(2);
    expect(mockCreateZzzClient).toHaveBeenCalledWith(
      expect.objectContaining({
        cookie: "masked-cookie",
        uid: 123456789,
      }),
    );
    expect(zzz).toBeDefined();
    expect(mockDailyInfo).not.toHaveBeenCalled();
  });
});
