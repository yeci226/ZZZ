jest.mock("../src/utilities/utilities.js", () => ({ getUserLang: jest.fn().mockResolvedValue("tw") }));
jest.mock("../src/utilities/accountStore.js", () => ({ getLegacyAccounts: jest.fn(), getLegacyAccountAtIndex: jest.fn() }));
jest.mock("../src/utilities/zzz/clientFactory.js", () => ({
  createZzzClient: jest.fn(), getZzzClientLanguage: () => "zh-tw",
}));
jest.mock("../src/utilities/zzz/officialRecordApi.js", () => ({ requestZzzRecordApi: jest.fn() }));
jest.mock("../src/utilities/zzz/bannerRenderer.js", () => ({ renderOfficialBanner: jest.fn().mockResolvedValue(Buffer.from("banner")) }));
jest.mock("../src/utilities/zzz/gachaSync.js", () => ({ calendarBannerMetadata: () => [] }));
jest.mock("../src/utilities/zzz/gachaSimulationCatalog.js", () => ({ cacheSimulationCalendar: jest.fn() }));

import banner from "../src/commands/slash/zzz/banner.js";
import { getLegacyAccounts, getLegacyAccountAtIndex } from "../src/utilities/accountStore.js";
import { createZzzClient } from "../src/utilities/zzz/clientFactory.js";
import { requestZzzRecordApi } from "../src/utilities/zzz/officialRecordApi.js";
import { renderOfficialBanner } from "../src/utilities/zzz/bannerRenderer.js";
import { cachePublicBannerCalendar } from "../src/utilities/zzz/bannerCalendarCache.js";
import { bannerCalendar, bannerDb, BANNER_NOW as NOW } from "./fixtures/bannerCalendar.js";

const ownerAccount = { uid: "130000001", cookie: "owner-cookie" };
const client = { uid: ownerAccount.uid, region: "prod_gf_jp" };
const details = { tickets: [{ ticket_type: "GACHA_TICKET_TYPE_POLYCHROME", ticket_cnt: 98765 }] };

function interaction(user = "guest", target?: string, account?: string) {
  return {
    user: { id: user }, deferred: false, replied: false,
    options: { getUser: () => target ? { id: target } : null, getString: () => account ?? null },
    deferReply: jest.fn(), editReply: jest.fn(),
  };
}
async function seed(db: ReturnType<typeof bannerDb>) {
  await cachePublicBannerCalendar(db, bannerCalendar(), { region: client.region, lang: "zh-tw", now: NOW });
}
async function run(i: ReturnType<typeof interaction>, db = bannerDb()) {
  await banner.execute({} as any, i as any, [], (key: string) => key, db as any);
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.mocked(getLegacyAccounts).mockImplementation(async (_db, id) => id === "owner" ? [ownerAccount] : []);
  jest.mocked(getLegacyAccountAtIndex).mockResolvedValue(ownerAccount);
  jest.mocked(createZzzClient).mockReturnValue(client as any);
  jest.mocked(requestZzzRecordApi).mockImplementation(async (_zzz, endpoint) =>
    endpoint === "cur_gacha_detail" ? details : bannerCalendar());
});
afterEach(() => jest.useRealTimers());

it("lets an anonymous viewer reuse a logged-in query without any personal fields or record button", async () => {
  const db = bannerDb();
  await run(interaction("owner"), db);
  expect(requestZzzRecordApi).toHaveBeenCalledWith(client, "cur_gacha_detail");
  expect(renderOfficialBanner).toHaveBeenLastCalledWith(expect.objectContaining({ uid: ownerAccount.uid, details, showPrivate: true }));
  jest.clearAllMocks();

  const guest = interaction();
  await run(guest, db);
  expect(createZzzClient).not.toHaveBeenCalled();
  expect(requestZzzRecordApi).not.toHaveBeenCalled();
  expect(renderOfficialBanner).toHaveBeenCalledWith(expect.objectContaining({ uid: undefined, details: undefined, showPrivate: false }));
  const rendered = jest.mocked(renderOfficialBanner).mock.calls[0][0];
  expect(JSON.stringify(rendered)).not.toMatch(/130000001|98765|sup_lock_show|more_s_need_cnt|is_owned/);
  const reply = guest.editReply.mock.calls[0][0];
  expect(reply.components).toEqual([]);
  expect(reply.files[0].name).toBe("zzz-banner.png");
  expect(reply.content).toContain("亞洲伺服器");
});

it("does not use someone else's login when an anonymous viewer supplies the user option", async () => {
  const db = bannerDb();
  await seed(db);
  await run(interaction("guest", "owner", "1"), db);
  expect(getLegacyAccountAtIndex).not.toHaveBeenCalled();
  expect(createZzzClient).not.toHaveBeenCalled();
  expect(requestZzzRecordApi).not.toHaveBeenCalled();
  expect(renderOfficialBanner).toHaveBeenCalledWith(expect.objectContaining({ showPrivate: false }));
});

it("explains missing shared data without requiring the viewer to log in", async () => {
  const guest = interaction();
  await run(guest);
  expect(guest.editReply).toHaveBeenCalledTimes(1);
  expect(guest.editReply.mock.calls[0][0].embeds[0].data.title).toBe("卡池資訊尚未更新");
  expect(renderOfficialBanner).not.toHaveBeenCalled();
  expect(requestZzzRecordApi).not.toHaveBeenCalled();
});

it("preserves the selected account and existing record button for logged-in users", async () => {
  jest.mocked(getLegacyAccounts).mockResolvedValue([{ uid: "other", cookie: "other-cookie" }, ownerAccount]);
  const i = interaction("owner", undefined, "1");
  await run(i);
  expect(createZzzClient).toHaveBeenCalledWith({ uid: Number(ownerAccount.uid), cookie: ownerAccount.cookie, lang: "zh-tw" });
  expect(i.editReply.mock.calls[0][0].components[0].components[0].data.custom_id).toBe("signal-open:owner:owner:1:official");
});

it("honors a target user's existing privacy setting", async () => {
  const db = bannerDb();
  await db.set("target.gachaPublic", false);
  await run(interaction("owner", "target", "2"), db);
  expect(getLegacyAccountAtIndex).toHaveBeenCalledWith(db, "target", 2);
  expect(requestZzzRecordApi).toHaveBeenCalledTimes(1);
  expect(renderOfficialBanner).toHaveBeenCalledWith(expect.objectContaining({ showPrivate: false, details: undefined }));
});

it.each([
  { label: "expired login", error: new Error("expired login") },
  { label: "temporary API failure", error: new Error("temporary API failure") },
  { label: "HoYoLAB login error -100", error: Object.assign(new Error("請先登入方能參與活動（-100）"), { code: -100 }) },
])("falls back to public data on $label", async ({ error }) => {
  const db = bannerDb();
  await seed(db);
  jest.mocked(requestZzzRecordApi).mockRejectedValueOnce(error);
  const i = interaction("owner", undefined, "0");
  await run(i, db);
  expect(renderOfficialBanner).toHaveBeenCalledWith(expect.objectContaining({ uid: undefined, showPrivate: false, details: undefined }));
  expect(i.editReply.mock.calls[0][0].components).toEqual([]);
  expect(i.editReply.mock.calls[0][0].embeds).toBeUndefined();
});

it("uses public data for an account already marked invalid", async () => {
  const db = bannerDb();
  await seed(db);
  jest.mocked(getLegacyAccounts).mockResolvedValue([{ ...ownerAccount, invalid: true }]);
  await run(interaction("owner"), db);
  expect(createZzzClient).not.toHaveBeenCalled();
  expect(renderOfficialBanner).toHaveBeenCalledWith(expect.objectContaining({ showPrivate: false }));
});

it("does not defer again after the router acknowledged the command", async () => {
  const i = interaction("owner");
  i.deferred = true;
  await run(i);
  expect(i.deferReply).not.toHaveBeenCalled();
  expect(i.editReply).toHaveBeenCalledTimes(1);
  expect(banner.ephemeral).toBe(false);
});

it("still shares the public calendar when private resources are unavailable", async () => {
  const db = bannerDb();
  jest.mocked(requestZzzRecordApi).mockResolvedValueOnce(bannerCalendar()).mockRejectedValueOnce(new Error("private endpoint unavailable"));
  await run(interaction("owner"), db);
  expect(renderOfficialBanner).toHaveBeenLastCalledWith(expect.objectContaining({ uid: ownerAccount.uid, details: undefined }));
  await run(interaction(), db);
  expect(renderOfficialBanner).toHaveBeenLastCalledWith(expect.objectContaining({ uid: undefined, showPrivate: false }));
});
