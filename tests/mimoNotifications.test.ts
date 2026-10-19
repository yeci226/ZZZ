let mockAdapter: any;
const mockCards = jest.fn(), mockPost = jest.fn(), mockCreateDM = jest.fn();
const mockStore = { state: jest.fn() };
const mockExchange = jest.fn(async (..._args: any[]) => ({ retcode: 0 }));
jest.mock("../src/utilities/utilities.js", () => ({
  autoRefreshCookie: jest.fn(), getUserLang: async () => "tw",
}));
jest.mock("../src/utilities/accountStore.js", () => ({
  getHoyolabs: jest.fn(), getLegacyAccounts: jest.fn(),
}));
jest.mock("../src/utilities/core/redeemEngine.js", () => ({
  ...jest.requireActual("../src/utilities/core/redeemEngine.js"),
  exchangeCode: (...args: any[]) => mockExchange(...args),
  redeemStore: () => ({ cooldown: jest.fn() }), reserveRedeemSlot: () => true,
}));
jest.mock("../src/utilities/mimo/store.js", () => ({
  MimoStore: jest.fn().mockImplementation(() => mockStore),
}));
jest.mock("../src/utilities/mimo/engine.js", () => ({
  MimoEngine: jest.fn().mockImplementation((_store, adapter) => {
    mockAdapter = adapter;
    return { tick: jest.fn() };
  }),
}));
jest.mock("../src/utilities/canvas/redeemCard.js", () => ({
  buildZZZRedeemCards: (...args: any[]) => mockCards(...args),
  redeemSummaryText: () => "result",
}));
import { runAutoMimo } from "../src/utilities/mimo/runtime.js";
import { getHoyolabs } from "../src/utilities/accountStore.js";

const result = {
  id: "result-id", payload: { accounts: [{ uid: "123", nickname: "Proxy", codes: [{ code: "private", status: "success" }] }] },
};
beforeEach(async () => {
  jest.clearAllMocks();
  mockCards.mockReset().mockResolvedValue([Buffer.from("one"), Buffer.from("two")]);
  mockPost.mockReset().mockResolvedValue({});
  mockCreateDM.mockResolvedValue({ id: "dm-channel" });
  await runAutoMimo({ users: { createDM: mockCreateDM }, rest: { post: mockPost } } as any, { driver: { database: {} } });
});
test.each(["dm", "channel"])("Mimo %s notifications send each page separately and mention only once", async notifyType => {
  const config = { owner: "owner", ltuid: "hoyo", notifyType, channelId: "channel", tag: true };
  await mockAdapter.notify(config, result);
  expect(mockPost).toHaveBeenCalledTimes(2);
  for (const [index, [route, message]] of mockPost.mock.calls.entries()) {
    expect(route).toBe(`/channels/${notifyType === "dm" ? "dm-channel" : "channel"}/messages`);
    expect(message.files).toHaveLength(1);
    expect(message.files[0]).toEqual({ data: Buffer.from(index ? "two" : "one"), name: `mimo-${index + 1}.png` });
    expect(message.body.allowed_mentions).toEqual({ parse: [], users: index ? [] : ["owner"] });
    expect(message.body.enforce_nonce).toBe(true);
  }
  const nonces = mockPost.mock.calls.map(([, message]) => message.body.nonce);
  expect(new Set(nonces).size).toBe(2);
  await mockAdapter.notify(config, result);
  expect(mockPost.mock.calls.slice(2).map(([, message]) => message.body.nonce)).toEqual(nonces);
});
test("Mimo render failure sends one text attachment without mentioning by default", async () => {
  mockCards.mockRejectedValueOnce(new Error("render failed"));
  await mockAdapter.notify({ owner: "owner", ltuid: "hoyo", notifyType: "dm", tag: false }, result);
  expect(mockPost).toHaveBeenCalledTimes(1);
  expect(mockPost.mock.calls[0][1].files).toEqual([{ data: Buffer.from("result"), name: "mimo-results.txt" }]);
  expect(mockPost.mock.calls[0][1].body.allowed_mentions).toEqual({ parse: [], users: [] });
});

test.each([
  ["100000001", "prod_gf_us"], ["150000001", "prod_gf_eu"],
  ["130000001", "prod_gf_jp"], ["170000001", "prod_gf_sg"],
])("Mimo redemption resolves legacy UID %s to %s", async (uid, region) => {
  jest.mocked(getHoyolabs).mockResolvedValueOnce([{ ltuid_v2: "hoyo", cookie: "test-cookie", characters: [{ uid }] }] as any);
  expect(await mockAdapter.redeem({ owner: "owner", ltuid: "hoyo", uid }, "PRIVATE")).toBe("success");
  expect(JSON.parse(String(mockExchange.mock.calls[0][1].body))).toMatchObject({ uid, region });
});
