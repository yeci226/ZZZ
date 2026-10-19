import { createFakeDb } from "./helpers/fakeDb";
import { loadAccounts, upsertHoyolab, upsertCharacter, getLegacyAccounts } from "../src/utilities/accountStore";

it("keeps two server roles under one Hoyolab and exposes both to account consumers", async () => {
 const db = createFakeDb();
 await upsertHoyolab(db, "user", {ltuid_v2: "123", cookie: "ltuid_v2=123; ltoken_v2=old"});
 for (const [uid, region] of [["800000001", "asia"], ["900000001", "taiwan"]]) {
   await upsertCharacter(db, "user", "123", {uid: uid!, nickname: region!, region: region!, invalid: false, lastUpdate: "2026-09-16"});
 }
 await upsertHoyolab(db, "user", {ltuid_v2: "123", cookie: "ltuid_v2=123; ltoken_v2=new"});
 await upsertCharacter(db, "user", "123", {uid:"900000001", nickname:"Updated TW", region:"taiwan", invalid:false, lastUpdate:"2026-09-17"});
 const store = await loadAccounts(db, "user");
 expect(store.hoyolabs).toHaveLength(1);
 expect(store.hoyolabs[0]!.characters).toEqual([
   expect.objectContaining({uid:"800000001", nickname:"asia", region:"asia"}),
   expect.objectContaining({uid:"900000001", nickname:"Updated TW", region:"taiwan"}),
 ]);
 const accounts = await getLegacyAccounts(db, "user");
 expect(accounts.map(role => role.uid)).toEqual(["800000001","900000001"]);
 expect(accounts.every(role => role.cookie.includes("ltoken_v2=new"))).toBe(true);
});
