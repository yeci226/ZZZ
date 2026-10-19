const mockDailyInfo = jest.fn();
const mockGameRecordCard = jest.fn();

jest.mock("@yeci226/hoyoapi", () => ({
  ...jest.requireActual("@yeci226/hoyoapi"),
  Hoyolab: jest.fn(() => ({ gameRecordCard: mockGameRecordCard })),
}));
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
  getConfig: jest.fn(() => ({ WEB_LOGIN_URL: "https://login.example.test" })),
  getVerifyBaseUrl: jest.fn(() => "https://example.invalid"),
}));

jest.mock("../src/utilities/zzz/clientFactory.js", () => ({
  createZzzClient: mockCreateZzzClient,
  getZzzClientLanguage: jest.fn(() => "en-us"),
}));

import { getUserZZZData, getUserHoyolabData } from "../src/utilities/utilities.js";

describe("getUserZZZData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("selects the requested game UID instead of the first ZZZ record card", async () => {
    mockGameRecordCard.mockResolvedValueOnce([
      { game_id: 8, game_role_id: "999999999", nickname: "Other server" },
      { game_id: 8, game_role_id: "123456789", nickname: "Selected server" },
    ]);
    const result = await getUserHoyolabData({ locale: "en-US" } as any, (key) => key, "discord-user", "en", 2);
    expect(result?.nickname).toBe("Selected server");
    expect(mockGetLegacyAccountAtIndex).toHaveBeenCalledWith({}, "discord-user", 2);
  });

  it("does not substitute another account when the selected UID is absent", async () => {
    mockGameRecordCard.mockResolvedValueOnce([{ game_id: 8, game_role_id: "999999999" }]);
    expect(await getUserHoyolabData({ locale: "en-US" } as any, (key) => key, "discord-user", "en", 2)).toBeNull();
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

    expect(mockGetLegacyAccountAtIndex).toHaveBeenCalledTimes(1);
    expect(mockCreateZzzClient).toHaveBeenCalledWith(
      expect.objectContaining({
        cookie: "masked-cookie",
        uid: 123456789,
      }),
    );
    expect(zzz).toBeDefined();
    expect(mockDailyInfo).not.toHaveBeenCalled();
  });

  it.each([getUserZZZData, getUserHoyolabData])("blocks expired credentials before constructing an API client", async resolve => {
    mockGetLegacyAccountAtIndex.mockResolvedValueOnce({ cookie: "masked-cookie", uid: "123456789", invalid: true } as any);
    const i = { user: { id: "discord-user" }, locale: "zh-TW", reply: jest.fn() };
    await resolve(i as any, key => key, "discord-user", "tw", 0);
    expect(mockCreateZzzClient).not.toHaveBeenCalled();
    expect(mockGameRecordCard).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
  });

  it("silently skips an expired account for optional public or offline data", async () => {
    mockGetLegacyAccountAtIndex.mockResolvedValueOnce({ cookie: "masked-cookie", uid: "123456789", invalid: true } as any);
    const i = { user: { id: "discord-user" }, locale: "zh-TW", reply: jest.fn(), followUp: jest.fn() };
    expect(await getUserZZZData(i as any, key => key, "discord-user", "tw", 0, { authMode: "optional" })).toBeUndefined();
    expect(mockCreateZzzClient).not.toHaveBeenCalled();
    expect(i.reply).not.toHaveBeenCalled();
    expect(i.followUp).not.toHaveBeenCalled();
  });
});
