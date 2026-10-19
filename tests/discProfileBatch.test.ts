import { createDiscBatchReader, profileRosterPortrait } from "../src/utilities/zzz/discProfileBatch.js";
const client = { uid: 1300007596, region: "prod_gf_jp", lang: "zh-tw", cookie: { cookie_token_v2: "test-cookie", account_id_v2: "1" } };
const square = "https://act-webstatic.hoyoverse.com/game_record/zzzv2/role_square_avatar/role_square_avatar_1581_3115811.png";
const roster = [{ id: 1581, role_square_url: square }];
const response = (data: any, cookies: string[] = [], retcode = 0) => ({ ok: true, json: async () => ({ retcode, data }), headers: { getSetCookie: () => cookies } });
test("one badge session serves multiple batches with actual gear, disc IDs, and the roster's selected skin", async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(response({}, ["e_nap_token=test-badge; HttpOnly", "e_lrsag=test-risk; HttpOnly", "SERVERID=test-server; Path=/"]))
    .mockResolvedValue(response({ list: [{ avatar: { id: 1581, unlock: true, element_type: 300 }, equip: [{ equipment_type: 1 }], user: { uid: "private" }, plan: { equip: ["recommendation"] } }] }));
  const reader = createDiscBatchReader(client, roster, fetcher)!;
  const characters = await reader(["1581"]); await reader(["1581"]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(characters).toEqual([{ id: 1581, role_square_url: square, role_vertical_painting_url: square.replaceAll("role_square_avatar", "role_vertical_painting"), unlock: true, element_type: 300, equip: [{ equipment_type: 1 }] }]);
  const [url, options] = fetcher.mock.calls[1];
  expect(url).toContain("/user/batch_avatar_detail_v2?uid=1300007596&region=prod_gf_jp");
  expect(JSON.parse(options.body)).toEqual({ avatar_list: [{ avatar_id: 1581, is_teaser: false, teaser_need_weapon: false, teaser_sp_skill: false }] });
  expect(options.headers.Cookie).toContain("e_nap_token=test-badge");
  expect(options.headers["x-rpc-device_id"]).toBeUndefined(); expect(options.redirect).toBe("error");
  expect(client.cookie).toEqual({ cookie_token_v2: "test-cookie", account_id_v2: "1" });
});
test("rejects oversized batches before authentication and does not turn missing gear or preview agents into invalid scores", async () => {
  const fetcher = jest.fn().mockResolvedValueOnce(response({})).mockResolvedValue(response({ list: [
    { avatar: { id: 1581, unlock: true } },
    { avatar: { id: 1491, unlock: false }, equip: [] },
    { avatar: { id: 1011, unlock: true }, equip: [] },
  ] }));
  const reader = createDiscBatchReader(client, roster, fetcher)!;
  await expect(reader(Array(11).fill("1581"))).rejects.toThrow("Invalid profile batch");
  expect(fetcher).not.toHaveBeenCalled();
  expect(await reader(["1581", "1491"])).toEqual([]);
});
test("does not expose provider response data or credentials on authentication failure", async () => {
  const fetcher = jest.fn().mockResolvedValue(response({ cookie_token: "secret" }, [], -100));
  await expect(createDiscBatchReader(client, roster, fetcher)!(["1581"])).rejects.toThrow("Profile batch rejected");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test("normalizes the real SDK's camelCase cookie object for badge authentication", async () => {
  const fetcher = jest.fn().mockResolvedValue(response({ list: [] }));
  const cookie = { ltuidV2: 1, ltokenV2: "ltoken", cookieTokenV2: "cookie", accountIdV2: 1, accountMidV2: "mid" };
  await createDiscBatchReader({ ...client, cookie }, roster, fetcher)!(["1581"]);
  const header = fetcher.mock.calls[0][1].headers.Cookie;
  expect(header).toBe("ltuid_v2=1; ltoken_v2=ltoken; cookie_token_v2=cookie; account_id_v2=1; account_mid_v2=mid");
  expect(cookie).toHaveProperty("cookieTokenV2", "cookie");
});
test("preserves an explicit portrait and only derives known official assets for the same character", () => {
  expect(profileRosterPortrait({ id: 1581, role_square_url: square, role_vertical_painting_url: "chosen" })).toBe("chosen");
  expect(profileRosterPortrait({ id: 1491, role_square_url: square })).toBeUndefined();
  expect(profileRosterPortrait({ id: 1581, role_square_url: "https://example.com/role_square_avatar_1581.png" })).toBeUndefined();
  expect(createDiscBatchReader({ uid: 100, ...{ cookie: "x=y" } }, roster)).toBeUndefined();
});
