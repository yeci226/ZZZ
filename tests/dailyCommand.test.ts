jest.mock("../src/utilities/core/config.js", () => ({
  getConfig: () => ({ WEB_LOGIN_URL: "https://login.example.test" }),
}));
const mockAccounts = jest.fn();
const mockMarkInvalid = jest.fn();
const mockRestore = jest.fn();
const mockInfo = jest.fn();
const mockClaim = jest.fn();
const mockRewards = jest.fn();
const mockFactory = jest.fn(() => ({
  daily: { info: mockInfo, claim: mockClaim, rewards: mockRewards },
}));
const mockCard = jest.fn();
jest.mock("../src/utilities/utilities.js", () => ({
  getUserLang: jest.fn().mockResolvedValue("tw"),
  getRandomColor: () => "#000000",
}));
jest.mock("../src/utilities/accountStore.js", () => ({
  getLegacyAccounts: (...args: unknown[]) => mockAccounts(...args),
  markGeneralInvalid: (...args: unknown[]) => mockMarkInvalid(...args),
  restoreGeneralValidity: (...args: unknown[]) => mockRestore(...args),
}));
jest.mock("../src/utilities/zzz/clientFactory.js", () => ({
  createZzzDailyClient: (...args: unknown[]) => (mockFactory as any)(...args),
  getZzzClientLanguage: () => "zh-tw",
}));
jest.mock("../src/utilities/canvas/dailyCard.js", () => ({
  buildZZZDailyCard: (...args: unknown[]) => mockCard(...args),
}));
import { EmbedBuilder } from "discord.js";
import daily from "../src/commands/slash/zzz/daily.js";

const db = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
const targetAccounts = [
  { uid: "801422231", cookie: "first-cookie", nickname: "First" },
  { uid: "416561269", cookie: "second-cookie", nickname: "Second" },
];
function interaction(account: string | null = null) {
  return {
    user: { id: "invoker" },
    locale: "zh-TW",
    deferred: false,
    ephemeral: true,
    options: {
      getUser: () => ({ id: "target" }),
      getString: (name: string) => (name === "account" ? account : null),
    },
    deferReply: jest.fn(async function (this: any) {
      this.deferred = true;
    }),
    editReply: jest.fn(),
  };
}
async function run(i = interaction()) {
  await daily.execute(
    {} as any,
    i as any,
    [],
    (key: string) => key,
    db as any,
    {},
  );
  return i;
}
beforeEach(() => {
  jest.clearAllMocks();
  (EmbedBuilder.prototype as any).setConfig = function (color: string) {
    return this.setColor(color);
  };
  mockAccounts.mockImplementation(async (_db: unknown, id: string) =>
    id === "target" ? targetAccounts : [],
  );
  mockInfo.mockResolvedValue({
    today: "2026-09-22",
    is_sign: false,
    total_sign_day: 0,
  });
  mockRewards.mockResolvedValue({
    month: 9,
    awards: [{ name: "Reward", cnt: 1 }],
  });
  mockClaim.mockResolvedValue({
    code: 0,
    info: { today: "2026-09-22", is_sign: true, total_sign_day: 1 },
  });
  mockCard.mockResolvedValue(Buffer.from("fixture"));
});
it.each([null, "1"])(
  "uses the requested user and account %s for both cookie and card",
  async (selected) => {
    const i = await run(interaction(selected));
    const account = targetAccounts[selected === null ? 0 : 1];
    expect(mockAccounts).toHaveBeenCalledWith(db, "target");
    expect(mockFactory).toHaveBeenCalledWith({
      cookie: account.cookie,
      lang: "zh-tw",
    });
    expect(mockCard).toHaveBeenCalledWith(
      expect.objectContaining({ uid: account.uid, nickname: account.nickname }),
    );
    expect(mockRestore).toHaveBeenCalledWith(db, "target", account.uid);
    expect(i.editReply).toHaveBeenCalledTimes(1);
  },
);
it.each(["-1", "99", "bad", "0.5"])(
  "does not fall back to another account for invalid selection %s",
  async (index) => {
    const i = await run(interaction(index));
    expect(mockFactory).not.toHaveBeenCalled();
    expect(i.editReply.mock.calls[0][0].content).toBeUndefined();
  },
);
it("does not claim again when already signed", async () => {
  mockInfo.mockResolvedValue({
    today: "2026-09-22",
    is_sign: true,
    total_sign_day: 1,
  });
  const i = await run();
  expect(mockClaim).not.toHaveBeenCalled();
  expect(i.editReply.mock.calls[0][0].embeds[0].data.title).toBe(
    "daily_Signed",
  );
});

it("blocks an already-invalid selected account before daily API calls", async () => {
  mockAccounts.mockResolvedValue([
    { ...targetAccounts[0], invalid: true },
    targetAccounts[1],
  ]);
  const i = await run(interaction("0"));
  expect(mockFactory).not.toHaveBeenCalled();
  expect(mockInfo).not.toHaveBeenCalled();
  expect(mockClaim).not.toHaveBeenCalled();
  expect(i.editReply.mock.calls[0][0].embeds[0].data.title).toBe(
    "帳號登入已失效",
  );
  expect(i.editReply.mock.calls[0][0].content).toBeUndefined();
  await run(interaction("1"));
  expect(mockFactory).toHaveBeenCalledTimes(1);
});

it("rejects cached automatic options with a settings hint without signing or saving", async () => {
  mockAccounts.mockResolvedValue([{ ...targetAccounts[0], invalid: true }]);
  const i = interaction("0");
  i.options.getString = (name) => (name === "autosign" ? "off" : null);
  await run(i);
  expect(db.delete).not.toHaveBeenCalled();
  expect(db.set).not.toHaveBeenCalled();
  expect(mockFactory).not.toHaveBeenCalled();
  expect(i.editReply.mock.calls[0][0]).toEqual({
    content: expect.stringContaining("/setup"),
  });
});
it("offers only manual account selection and shows the settings hint", async () => {
  expect(daily.data.toJSON().options?.map((o) => o.name)).toEqual(["account"]);
  const i = await run();
  expect(i.editReply.mock.calls[0][0].content).toContain("/setup");
  expect(db.set).not.toHaveBeenCalled();
});
it("handles an already-signed race without a success card", async () => {
  mockClaim.mockResolvedValue({
    code: -5003,
    info: { today: "2026-09-22", is_sign: true, total_sign_day: 1 },
  });
  const i = await run();
  expect(i.editReply.mock.calls[0][0].embeds[0].data.title).toBe(
    "daily_Signed",
  );
  expect(mockCard).not.toHaveBeenCalled();
});
it.each([-100, -1071, 10035, -1])(
  "does not report API failure %s as success",
  async (code) => {
    mockClaim.mockResolvedValue({ code, info: { is_sign: true } });
    const i = await run();
    expect(i.editReply.mock.calls[0][0].embeds[0].data.title).toBe(
      "daily_Failed",
    );
    expect(mockCard).not.toHaveBeenCalled();
    expect(mockRestore).not.toHaveBeenCalled();
    expect(mockMarkInvalid).toHaveBeenCalledTimes(code < -1 ? 1 : 0);
  },
);
it.each(["Request timed out after 15000ms", "10035 Geetest required"])(
  "keeps authentication valid on %s",
  async (message) => {
    mockInfo.mockRejectedValue(new Error(message));
    await run();
    expect(mockMarkInvalid).not.toHaveBeenCalled();
    expect(mockClaim).not.toHaveBeenCalled();
  },
);
it("keeps the selected identity when image rendering fails", async () => {
  mockCard.mockRejectedValue(new Error("render failed"));
  const i = await run(interaction("1"));
  expect(i.editReply.mock.calls[0][0].embeds[0].data.title).toContain(
    "Second (416561269)",
  );
});

it("reward failure keeps success, does not invalidate the account or repeat claim", async () => {
  mockRewards.mockRejectedValue(new Error("unavailable"));
  await run();
  expect(mockCard).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "success",
      rewardName: "",
      rewardCount: undefined,
    }),
  );
  expect(mockMarkInvalid).not.toHaveBeenCalled();
  expect(mockClaim).toHaveBeenCalledTimes(1);
  expect(mockRewards).toHaveBeenCalledTimes(2);
});

it("explains a missing game role without invalidating other account features", async () => {
  mockClaim.mockResolvedValue({
    code: -10002,
    status: "找不到遊戲內已建立的角色",
    info: { is_sign: false },
  });
  const i = await run();
  expect(i.editReply.mock.calls[0][0].embeds[0].data.description).toBe(
    "daily_MissingRoleDesc",
  );
  expect(mockMarkInvalid).not.toHaveBeenCalled();
  expect(mockRestore).not.toHaveBeenCalled();
  expect(mockCard).not.toHaveBeenCalled();
});

it("clears the automatic missing-role cooldown after a successful manual check-in", async () => {
  await run();
  expect(db.delete).toHaveBeenCalledWith(
    "dailyMissingRole:target:uid:801422231",
  );
});
