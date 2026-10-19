jest.mock("../src/utilities/accountStore.js", () => ({ getLegacyAccountAtIndex: jest.fn() }));
jest.mock("../src/utilities/core/config.js", () => ({ getConfig: jest.fn(() => ({ WEB_LOGIN_URL: "https://login.example.test/" })) }));
jest.mock("../src/utilities/webhookLogin.js", () => ({ drainPendingLogins: jest.fn().mockResolvedValue([]) }));

import { getLegacyAccountAtIndex } from "../src/utilities/accountStore.js";
import { getConfig } from "../src/utilities/core/config.js";
import { drainPendingLogins } from "../src/utilities/webhookLogin.js";
import { accountLoginUrl, blockExpiredAccount, getInteractiveAccountAccess, inspectAccountAccess, notifyExpiredAccount } from "../src/utilities/accountAccess.js";

const healthy = { uid: "130000001", cookie: "private-cookie" };
const expired = { ...healthy, invalid: true };
const options = { ownerId: "owner", accountIndex: 0 };
const state: Record<string, unknown> = {};
const db = { get: jest.fn(async (key: string) => state[key]), set: jest.fn(), delete: jest.fn(), has: jest.fn() };
function interaction(overrides: Record<string, unknown> = {}): any {
  const i: any = { user: { id: "owner" }, locale: "zh-TW", deferred: false, replied: false, ephemeral: false,
    reply: jest.fn(), editReply: jest.fn(), followUp: jest.fn(async () => { i.replied = true; }), deleteReply: jest.fn(), ...overrides };
  return i;
}
beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(state)) delete state[key];
  jest.mocked(getLegacyAccountAtIndex).mockResolvedValue(expired);
  jest.mocked(getConfig).mockReturnValue({ WEB_LOGIN_URL: "https://login.example.test/" } as any);
  jest.mocked(drainPendingLogins).mockResolvedValue([]);
});

it("checks only the selected account and distinguishes missing, expired and ready", async () => {
  expect((await inspectAccountAccess(db as any, options)).status).toBe("expired");
  expect(getLegacyAccountAtIndex).toHaveBeenCalledWith(db, "owner", 0);
  jest.mocked(getLegacyAccountAtIndex).mockResolvedValueOnce(healthy).mockResolvedValueOnce(null);
  expect((await inspectAccountAccess(db as any, { ...options, accountIndex: 1 })).status).toBe("ready");
  expect((await inspectAccountAccess(db as any, { ...options, accountIndex: 2 })).status).toBe("missing");
  expect(db.set).not.toHaveBeenCalled();
});

it("keeps general and redeem invalidity separate", async () => {
  state[`${healthy.uid}.redeemStateMigrated`] = true;
  expect((await inspectAccountAccess(db as any, { ...options, scope: "redeem", account: expired })).status).toBe("ready");
  state[`${healthy.uid}.redeemInvalid`] = true;
  expect((await inspectAccountAccess(db as any, { ...options, scope: "redeem", account: healthy })).status).toBe("expired");
  expect((await inspectAccountAccess(db as any, { ...options, account: healthy })).status).toBe("ready");
  state[`${healthy.uid}.redeemInvalid`] = false;
  state[`${healthy.uid}.redeemNeedsCookieUpdate`] = true;
  expect((await inspectAccountAccess(db as any, { ...options, scope: "redeem", account: healthy })).status).toBe("expired");
});

it("honors legacy redemption evidence only until its existing migration is complete", async () => {
  state[`${healthy.uid}.cookieExpired`] = true;
  expect((await inspectAccountAccess(db as any, { ...options, scope: "redeem", account: healthy })).status).toBe("expired");
  state[`${healthy.uid}.redeemStateMigrated`] = true;
  expect((await inspectAccountAccess(db as any, { ...options, scope: "redeem", account: healthy })).status).toBe("ready");
});

it("sends one private notice with a login link and no credentials", async () => {
  const i = interaction();
  await Promise.all([notifyExpiredAccount(i, options), notifyExpiredAccount(i, options)]);
  expect(i.reply).toHaveBeenCalledTimes(1);
  const payload = i.reply.mock.calls[0][0];
  expect(payload.flags).toBe(64);
  expect(payload.embeds[0].data.description).toContain("#0");
  expect(payload.components[0].components[0].data.url).toBe("https://login.example.test/login?botId=zzz&lang=zh-TW");
  expect(JSON.stringify(payload)).not.toMatch(/private-cookie|130000001/);
});

it("edits an ephemeral deferred command instead of following up", async () => {
  const i = interaction({ deferred: true, ephemeral: true });
  await notifyExpiredAccount(i, options);
  expect(i.editReply).toHaveBeenCalledTimes(1);
  expect(i.followUp).not.toHaveBeenCalled();
  expect(i.deleteReply).not.toHaveBeenCalled();
});

it("privately follows up and removes only a public command's loading placeholder", async () => {
  const i = interaction({ deferred: true });
  await notifyExpiredAccount(i, options);
  expect(i.followUp).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
  expect(i.deleteReply).toHaveBeenCalledTimes(1);
  expect(i.editReply).toHaveBeenCalledWith({ content: "…", embeds: [], components: [], files: [] });
  expect(i.editReply.mock.invocationCallOrder[0]).toBeLessThan(i.followUp.mock.invocationCallOrder[0]);
});

it.each([{ deferred: true, customId: "profile:old" }, { replied: true }])("preserves existing cards for %j", async flags => {
  const i = interaction(flags);
  await notifyExpiredAccount(i, options);
  expect(i.followUp).toHaveBeenCalledTimes(1);
  expect(i.editReply).not.toHaveBeenCalled();
  expect(i.deleteReply).not.toHaveBeenCalled();
});

it("asks the other account owner to relink without a misleading personal link", async () => {
  const i = interaction({ user: { id: "viewer" } });
  await notifyExpiredAccount(i, options);
  expect(i.reply.mock.calls[0][0].components).toEqual([]);
  expect(i.reply.mock.calls[0][0].embeds[0].data.description).toContain("帳號擁有者");
});

it.each([undefined, "not-a-url"])("provides account instructions when the login URL is %s", async url => {
  jest.mocked(getConfig).mockReturnValue({ WEB_LOGIN_URL: url } as any);
  const i = interaction();
  await notifyExpiredAccount(i, options);
  expect(i.reply.mock.calls[0][0].components).toEqual([]);
  expect(i.reply.mock.calls[0][0].embeds[0].data.description).toContain("/account");
});

it.each(["tw", "cn", "en", "jp", "kr", "fr", "vi"])("provides localized copy in %s", async locale => {
  const i = interaction();
  await notifyExpiredAccount(i, { ...options, locale });
  expect(i.reply.mock.calls[0][0].embeds[0].data.title.length).toBeGreaterThan(3);
  expect(i.reply.mock.calls[0][0].components[0].components[0].data.label.length).toBeGreaterThan(3);
});

it("lets a newly relinked account recover when an old component is clicked", async () => {
  jest.mocked(getLegacyAccountAtIndex).mockResolvedValueOnce(expired).mockResolvedValueOnce({ ...healthy, cookie: "new-cookie" });
  const i = interaction({ customId: "profile:old", deferred: true });
  const access = await getInteractiveAccountAccess(i, db as any, options);
  expect(access).toMatchObject({ status: "ready", account: { cookie: "new-cookie" } });
  expect(drainPendingLogins).toHaveBeenCalledWith("owner");
  expect(i.followUp).not.toHaveBeenCalled();
});

it("does not drain someone else's pending login or retry the API for an expired account", async () => {
  const i = interaction({ customId: "profile:old", deferred: true, user: { id: "viewer" } });
  expect(await blockExpiredAccount(i, db as any, options)).toBe(true);
  expect(drainPendingLogins).not.toHaveBeenCalled();
  expect(i.followUp).toHaveBeenCalledTimes(1);
});

it("still shows the notice if a component's pending-login lookup fails", async () => {
  jest.mocked(drainPendingLogins).mockRejectedValueOnce(new Error("offline"));
  const i = interaction({ customId: "profile:old", deferred: true });
  expect(await blockExpiredAccount(i, db as any, options)).toBe(true);
  expect(i.followUp).toHaveBeenCalledTimes(1);
});

it("keeps the existing English web-login route", () => {
  expect(accountLoginUrl("en-US")).toBe("https://login.example.test/login?botId=zzz");
});
