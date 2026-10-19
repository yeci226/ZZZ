const mockCards = jest.fn(async () => [Buffer.from("png")]);
const mockOpen = jest.fn();
jest.mock("../src/utilities/utilities.js", () => ({
  getUserLang: jest.fn(async () => "tw"), getRedeemCodes: jest.fn(async () => []),
  getUserUid: jest.fn(async () => "130000001"), getUserCookie: jest.fn(async () => "cookie"),
  updateCookie: jest.fn(), getRandomColor: () => "#ffffff", failedReply: jest.fn(),
}));
jest.mock("../src/utilities/accountStore.js", () => ({ getLegacyAccountAtIndex: jest.fn(async () => ({ uid: "130000001", cookie: "cookie", nickname: "Test" })) }));
jest.mock("../src/utilities/accountAccess.js", () => ({ blockExpiredAccount: jest.fn(async () => false) }));
jest.mock("../src/utilities/core/logger.js", () => ({ __esModule: true, default: class { info() {} error() {} } }));
jest.mock("../src/utilities/core/redeemEngine.js", () => ({ ...jest.requireActual("../src/utilities/core/redeemEngine.js"), recordedRedeemCodes: jest.fn(async () => []), recordManualRedeem: jest.fn() }));
jest.mock("../src/utilities/canvas/redeemCard.js", () => ({ buildZZZRedeemCards: (...args: any[]) => (mockCards as any)(...args), redeemSummaryText: () => "兌換成功" }));
jest.mock("../src/utilities/settings/automation.js", () => ({ openAutomationSettings: (...args: any[]) => mockOpen(...args) }));
import { EmbedBuilder } from "discord.js";
import redeem from "../src/commands/slash/zzz/redeem.js";
import { blockExpiredAccount } from "../src/utilities/accountAccess.js";
import { getRedeemCodes, getUserUid } from "../src/utilities/utilities.js";
import { getLegacyAccountAtIndex } from "../src/utilities/accountStore.js";
import { recordedRedeemCodes } from "../src/utilities/core/redeemEngine.js";
function interaction(subcommand: string): any {
  return { user: { id: "owner" }, locale: "zh-TW", options: { getSubcommand: () => subcommand, getUser: () => null, getString: (key: string) => key === "code" ? "EXAMPLE" : null }, deferReply: jest.fn(), editReply: jest.fn(), followUp: jest.fn() };
}
beforeEach(() => {
  jest.clearAllMocks();
  (EmbedBuilder.prototype as any).setConfig = function(color: string) { return this.setColor(color); };
});
test.each([true, false])("manual code result includes settings hint (image=%s)", async withImage => {
  mockCards.mockResolvedValueOnce(withImage ? [Buffer.from("png")] : []);
  const previous = global.fetch;
  global.fetch = jest.fn(async () => ({ json: async () => ({ retcode: 0, message: "OK" }) })) as any;
  try {
    const i = interaction("redeem");
    await redeem.execute({} as any, i, [], (key: string) => key, {} as any);
    expect(i.editReply.mock.calls.at(-1)[0].content).toContain("/setup");
    expect(i.editReply.mock.calls.at(-1)[0].files).toHaveLength(1);
    expect(mockOpen).not.toHaveBeenCalled();
  } finally { global.fetch = previous; }
});
test("no available codes still shows settings hint", async () => {
  const i = interaction("redeemall");
  await redeem.execute({} as any, i, [], (key: string) => key, {} as any);
  expect(i.editReply.mock.calls[0][0].content).toContain("/setup");
});
test("redeem all reports completion before checking stale auth when all codes are recorded", async () => {
  jest.mocked(getRedeemCodes).mockResolvedValueOnce([{ code: "CLAIMED" }] as any);
  jest.mocked(recordedRedeemCodes).mockResolvedValueOnce(["CLAIMED"]);
  const fetcher = jest.spyOn(global, "fetch");
  try {
    const i = interaction("redeemall");
    await redeem.execute({} as any, i, [], (key: string) => key, {} as any);
    expect(i.editReply.mock.calls[0][0].embeds[0].data.title).toBe("redeem_NoCode");
    expect(blockExpiredAccount).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); }
});
test("redeem all still blocks expired credentials when a code needs redemption", async () => {
  jest.mocked(getRedeemCodes).mockResolvedValueOnce([{ code: "NEW" }] as any);
  jest.mocked(blockExpiredAccount).mockResolvedValueOnce(true);
  const fetcher = jest.spyOn(global, "fetch");
  try {
    await redeem.execute({} as any, interaction("redeemall"), [], (key: string) => key, {} as any);
    expect(blockExpiredAccount).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ scope: "redeem" }));
    expect(fetcher).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); }
});
test("manual results send one image per private message and show the tip only once", async () => {
  const pages = [Buffer.from("one"), Buffer.from("two"), Buffer.from("three")];
  mockCards.mockResolvedValueOnce(pages);
  const previous = global.fetch;
  global.fetch = jest.fn(async () => ({ json: async () => ({ retcode: 0, message: "OK" }) })) as any;
  try {
    const i = interaction("redeem");
    await redeem.execute({} as any, i, [], (key: string) => key, {} as any);
    const first = i.editReply.mock.calls.at(-1)[0];
    expect(first.files).toEqual([{ attachment: pages[0], name: "redeem-zzz-1.png" }]);
    expect(first.content).toContain("/setup");
    expect(i.followUp).toHaveBeenCalledTimes(2);
    for (const [index, [message]] of i.followUp.mock.calls.entries()) {
      expect(message.flags).toBe(64);
      expect(message.files).toEqual([{ attachment: pages[index + 1], name: `redeem-zzz-${index + 2}.png` }]);
      expect(message.content).toBeUndefined();
      expect(message.allowedMentions).toEqual({ parse: [] });
    }
  } finally { global.fetch = previous; }
});
test("removed auto redeem command only returns a hint and is absent from registration", async () => {
  const i = interaction("autoredeem"), db = { set: jest.fn(), delete: jest.fn() };
  await redeem.execute({} as any, i, [], (key: string) => key, db as any);
  expect(mockOpen).not.toHaveBeenCalled();
  expect(i.editReply).toHaveBeenCalledWith({ content: expect.stringContaining("/setup") });
  expect(db.set).not.toHaveBeenCalled(); expect(db.delete).not.toHaveBeenCalled();
  expect(redeem.data.toJSON().options?.map(option => option.name)).toEqual(["list", "redeem", "redeemall"]);
});

test.each(["redeem", "redeemall"])("%s sends a US account to its server and preserves the official failure reason", async subcommand => {
  jest.useFakeTimers();
  jest.mocked(getUserUid).mockResolvedValueOnce("100000001");
  jest.mocked(getLegacyAccountAtIndex).mockResolvedValueOnce({ uid: "100000001", cookie: "cookie", nickname: "US" });
  jest.mocked(getRedeemCodes).mockResolvedValueOnce([{ code: "EXAMPLE" }] as any);
  const fetcher = jest.spyOn(global, "fetch").mockResolvedValue({
    json: async () => ({ retcode: -1073, message: "No character found. cookie_token_v2=secret" }),
  } as Response);
  try {
    const i = interaction(subcommand);
    const work = redeem.execute({} as any, i, [], (key: string) => key, {} as any);
    await jest.advanceTimersByTimeAsync(3000);
    await work;
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("region")).toBe("prod_gf_us");
    expect(i.editReply.mock.calls.at(-1)[0].content).toContain("No character found");
    expect(i.editReply.mock.calls.at(-1)[0].content).toContain("-1073");
    expect(JSON.stringify(i.editReply.mock.calls)).not.toContain("secret");
  } finally { fetcher.mockRestore(); jest.useRealTimers(); }
});
