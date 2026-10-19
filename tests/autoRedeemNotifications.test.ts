let mockAdapter: any;
const mockDb = { get: jest.fn(), set: jest.fn() };
const mockPost = jest.fn(),
  mockCreateDM = jest.fn();
const mockCards = jest.fn();
jest.mock("../src/index.js", () => ({
  client: {
    db: mockDb,
    users: { createDM: mockCreateDM },
    rest: { post: mockPost },
  },
}));
jest.mock("../src/utilities/utilities.js", () => ({
  getRedeemCodes: jest.fn(),
  autoRefreshCookie: jest.fn(),
  getUserLang: async () => "tw",
}));
jest.mock("../src/utilities/accountStore.js", () => ({
  getLegacyAccounts: jest.fn(),
}));
jest.mock("../src/utilities/core/redeemEngine.js", () => ({
  RedeemEngine: jest.fn().mockImplementation((adapter) => {
    mockAdapter = adapter;
    return { tick: jest.fn() };
  }),
}));
jest.mock("../src/utilities/canvas/redeemCard.js", () => ({
  buildZZZRedeemCards: (...args: any[]) => mockCards(...args),
  redeemSummaryText: () => "result",
}));
jest.mock("../src/utilities/core/logger.js", () => ({
  __esModule: true,
  default: class {
    info() {}
    warn() {}
    error() {}
  },
}));
import autoRedeem from "../src/utilities/zzz/autoRedeem.js";

const notify = (config: any) =>
  mockAdapter.notify(
    "owner",
    { uid: "123", nickname: "test" },
    config,
    [{ code: "TEST", rewards: [] }],
    "unique-notification",
  );
beforeEach(async () => {
  jest.clearAllMocks();
  mockCreateDM.mockResolvedValue({ id: "dm-channel" });
  mockPost.mockResolvedValue({});
  mockCards.mockResolvedValue([Buffer.from("card")]);
  await autoRedeem();
});
test("DM result delivery needs no guild/channel setting and never mentions by default", async () => {
  expect(
    await notify({
      enabled: true,
      notifyType: "dm",
      notificationEnabled: true,
      tag: "false",
    }),
  ).toBe("sent");
  expect(mockCreateDM).toHaveBeenCalledWith("owner");
  expect(mockPost).toHaveBeenCalledWith(
    "/channels/dm-channel/messages",
    expect.objectContaining({
      body: expect.objectContaining({
        allowed_mentions: { parse: [], users: [] },
        enforce_nonce: true,
      }),
      files: expect.any(Array),
    }),
  );
  expect(mockPost.mock.calls[0][1].body.content).toBeUndefined();
});
test("legacy channel destinations and explicit mention preferences still work", async () => {
  expect(await notify({ channelId: "old-channel", tag: true })).toBe("sent");
  expect(mockCreateDM).not.toHaveBeenCalled();
  expect(mockPost.mock.calls[0]).toEqual([
    "/channels/old-channel/messages",
    expect.objectContaining({
      body: expect.objectContaining({
        content: "<@owner>",
        allowed_mentions: { parse: [], users: ["owner"] },
      }),
    }),
  ]);
});
test("notification off does no delivery work", async () => {
  expect(await notify({ notifyType: "dm", notificationEnabled: false })).toBe(
    "disabled",
  );
  expect(mockCreateDM).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
});
test.each(["create", "send"])(
  "permanent DM failure during %s disables only notifications without channel fallback",
  async (stage) => {
    const error = Object.assign(
      new Error("Cannot send messages to this user"),
      { code: 50007 },
    );
    (stage === "create" ? mockCreateDM : mockPost).mockRejectedValueOnce(error);
    const config = {
      enabled: true,
      notifyType: "dm",
      notificationEnabled: true,
      channelId: "stale",
      guildId: "stale",
    };
    expect(await notify(config)).toBe("disabled");
    expect(mockDb.set).toHaveBeenCalledWith(
      "autoRedeem.owner",
      expect.objectContaining({
        enabled: true,
        notificationEnabled: false,
        notificationInvalidReason: "cannot_dm",
      }),
    );
    expect(config).not.toHaveProperty("channelId");
    expect(config).not.toHaveProperty("guildId");
    expect(
      mockPost.mock.calls.every(
        ([route]) => route === "/channels/dm-channel/messages",
      ),
    ).toBe(true);
  },
);
test("transient delivery failure is retried with the same nonce without disabling automation", async () => {
  mockPost.mockRejectedValueOnce(new Error("temporary network failure"));
  const config = { enabled: true, notifyType: "dm", notificationEnabled: true };
  await expect(notify(config)).rejects.toThrow("temporary");
  expect(await notify(config)).toBe("sent");
  expect(mockDb.set).not.toHaveBeenCalled();
  expect(mockPost.mock.calls[0][1].body.nonce).toBe(
    mockPost.mock.calls[1][1].body.nonce,
  );
});
test("each automatic result page gets its own message, with stable retry nonces and one mention", async () => {
  const pages = [Buffer.from("one"), Buffer.from("two"), Buffer.from("three")];
  mockCards.mockResolvedValue(pages);
  mockPost.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("temporary"));
  const config = { enabled: true, notifyType: "dm", notificationEnabled: true, tag: true };
  await expect(notify(config)).rejects.toThrow("temporary");
  expect(await notify(config)).toBe("sent");
  const attempts = mockPost.mock.calls.map(([, message]) => message);
  expect(attempts).toHaveLength(5);
  const retry = attempts.slice(2);
  retry.forEach((message, index) => {
    expect(message.files).toEqual([{ data: pages[index], name: `redeem-zzz-${index + 1}.png` }]);
    expect(message.body.allowed_mentions.users).toEqual(index === 0 ? ["owner"] : []);
    expect(message.body.content).toBe(index === 0 ? "<@owner>" : undefined);
    expect(message.body.enforce_nonce).toBe(true);
  });
  expect(new Set(retry.map(m => m.body.nonce)).size).toBe(3);
  expect(attempts[0].body.nonce).toBe(retry[0].body.nonce);
  expect(attempts[1].body.nonce).toBe(retry[1].body.nonce);
  expect(mockDb.set).not.toHaveBeenCalled();
});
test("render failure keeps the text fallback as a single message", async () => {
  mockCards.mockRejectedValueOnce(new Error("render failed"));
  expect(await notify({ notifyType: "dm" })).toBe("sent");
  expect(mockPost).toHaveBeenCalledTimes(1);
  expect(mockPost.mock.calls[0][1].files).toEqual([{ data: Buffer.from("result"), name: "redeem-results.txt" }]);
});
