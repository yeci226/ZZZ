import { handleRedeemContext, REDEEM_CONTEXT_GAP_MS, type RedeemContextDeps } from "../src/utilities/zzz/redeemContext.js";

const tr = (key: string) => ({
  redeem_Success: "OK", redeem_Already: "ALREADY", redeem_Invalid: "INVALID", redeem_Failed: "FAILED",
  redeem_CookieTokenInvalid: "COOKIE",
} as Record<string, string>)[key];

function interaction(content: string, extra: any = {}): any {
  return {
    user: { id: "u1" }, locale: "en-US", deferred: false, replied: false, ephemeral: true,
    targetMessage: { content, embeds: [] },
    deferReply: jest.fn(async function (this: any) { this.deferred = true; }),
    editReply: jest.fn(), ...extra,
  };
}

function deps(over: Partial<RedeemContextDeps> = {}): RedeemContextDeps {
  return {
    db: {},
    getAccount: jest.fn(async () => ({ uid: "1300000001", cookie: "c", region: "prod_gf_us" })),
    blockExpired: jest.fn(async () => false),
    recordedCodes: jest.fn(async () => []),
    redeem: jest.fn(async () => ({ retcode: 0, message: "OK" })),
    record: jest.fn(),
    classify: jest.fn(async (_code, reply) => ({ status: reply.retcode === 0 ? "success" : reply.retcode === -2017 ? "already" : "failed", message: String(reply.retcode) })),
    refreshCookie: jest.fn(async () => undefined),
    getLocale: jest.fn(async (_u, fallback) => fallback),
    sleep: jest.fn(async () => undefined),
    ...over,
  };
}
const last = (i: any) => i.editReply.mock.calls.at(-1)[0];

test("defers ephemerally before any other work, then reports no codes", async () => {
  const i = interaction("hello there");
  const d = deps();
  await handleRedeemContext(i, tr, d);
  expect(i.deferReply).toHaveBeenCalledWith({ flags: 64 });
  expect(last(i).content).toMatch(/No Zenless/);
  expect(d.getAccount).not.toHaveBeenCalled();
  expect(d.redeem).not.toHaveBeenCalled();
});

test("without a bound account it shows the account guidance and redeems nothing", async () => {
  const i = interaction("ZENLESSGIFT");
  const d = deps({ getAccount: jest.fn(async () => null) });
  await handleRedeemContext(i, (k: string) => k === "error_NoAccount" ? "NO ACCOUNT" : undefined, d);
  expect(last(i).embeds[0].data.title).toBe("NO ACCOUNT");
  expect(last(i).embeds[0].data.description).toMatch(/\/account/);
  expect(d.redeem).not.toHaveBeenCalled();
});

test("an expired account is handled by the shared block and nothing is sent", async () => {
  const d = deps({ blockExpired: jest.fn(async () => true) });
  const i = interaction("ZENLESSGIFT");
  await handleRedeemContext(i, tr, d);
  expect(d.redeem).not.toHaveBeenCalled();
  expect(i.editReply).not.toHaveBeenCalled();
});

test("redeems with the first account, spaces requests, records each result and names the UID", async () => {
  const i = interaction("ZENLESSGIFT\nGOWITHYOU\nOFFICIAL8");
  const d = deps({
    redeem: jest.fn(async (_u, _c, code) => ({ retcode: code === "GOWITHYOU" ? -2017 : 0 })),
  });
  await handleRedeemContext(i, tr, d);
  expect(d.getAccount).toHaveBeenCalledWith("u1", 0);
  expect(d.redeem).toHaveBeenCalledTimes(3);
  expect((d.redeem as jest.Mock).mock.calls[0]).toEqual(["1300000001", "c", "ZENLESSGIFT", "prod_gf_us"]);
  expect(d.sleep).toHaveBeenCalledTimes(2);
  expect(d.sleep).toHaveBeenCalledWith(REDEEM_CONTEXT_GAP_MS);
  expect(d.record).toHaveBeenCalledTimes(3);
  expect(d.refreshCookie).toHaveBeenCalledWith("u1", 0);
  const embed = last(i).embeds[0].data;
  expect(embed.description).toContain("ZENLESSGIFT");
  expect(embed.description).toContain("✅");
  expect(embed.description).toContain("ℹ️");
  expect(embed.footer.text).toContain("1300000001");
});

test("codes already on record are not sent again", async () => {
  const d = deps({ recordedCodes: jest.fn(async () => ["ZENLESSGIFT"]) });
  const i = interaction("ZENLESSGIFT");
  await handleRedeemContext(i, tr, d);
  expect(d.redeem).not.toHaveBeenCalled();
  expect(last(i).embeds[0].data.description).toContain("ALREADY");
});

test("an invalid login stops further requests; thrown errors become failed rows", async () => {
  const d = deps({
    redeem: jest.fn(async () => ({ retcode: -100 })),
    classify: jest.fn(async () => { throw new Error("COOKIE"); }),
  });
  const i = interaction("AAAAAAAA\nBBBBBBBB");
  await handleRedeemContext(i, tr, d);
  expect(d.redeem).toHaveBeenCalledTimes(1);
  const text = last(i).embeds[0].data.description;
  expect(text.match(/❌/g)).toHaveLength(2);
  expect(d.refreshCookie).not.toHaveBeenCalled();
});

test("caps at five codes and says so; a second run for the same UID in parallel is refused", async () => {
  const content = "AAAAAAAA BBBBBBBB CCCCCCCC DDDDDDDD EEEEEEEE FFFFFFFF".split(" ").join("\n");
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const d = deps({ sleep: jest.fn(() => gate) });
  const first = interaction(content);
  const running = handleRedeemContext(first, tr, d);
  await new Promise(resolve => setImmediate(resolve));
  const second = interaction("ZENLESSGIFT");
  await handleRedeemContext(second, tr, d);
  expect(last(second).content).toMatch(/already redeeming/);
  release();
  await running;
  expect(d.redeem).toHaveBeenCalledTimes(5);
  expect(last(first).embeds[0].data.footer.text).toMatch(/first 5/);
});
