const mockGamesList = jest.fn();
jest.mock("@yeci226/hoyoapi", () => ({ Hoyolab: class { gamesList = mockGamesList; } }));
import { getAccountGameRoles, getAccountGameRole } from "../src/utilities/gameRoles";
it("discovers all servers, filters games and deduplicates UIDs", async () => {
 mockGamesList.mockResolvedValue([
 {game_biz:"nap_global", game_uid:"1", region:"prod_gf_jp", is_chosen:true},
 {game_biz:"nap_global", game_uid:"2", region:"prod_gf_sg", is_chosen:false},
 {game_biz:"nap_global", game_uid:"2"},
 {game_biz:"hkrpg_global", game_uid:"3"},
 ]);
 expect((await getAccountGameRoles("cookie",8)).map(r => r.uid)).toEqual(["1","2"]);
 expect((await getAccountGameRoles("cookie",6)).map(r => r.uid)).toEqual(["3"]);
});
it("does not mask an API error as an empty role list", async () => {
 mockGamesList.mockRejectedValue(new Error("expired"));
 await expect(getAccountGameRoles("cookie",8)).rejects.toThrow("expired");
});

it("selects Taiwan by UID even when Asia is the first role", async () => {
 mockGamesList.mockResolvedValue([
  {game_biz:"hkrpg_global",game_uid:"800000001",nickname:"Asia",region:"prod_official_asia"},
  {game_biz:"hkrpg_global",game_uid:"900000001",nickname:"TW",region:"prod_official_cht"},
 ]);
 await expect(getAccountGameRole("cookie",6,"900000001")).resolves.toMatchObject({uid:"900000001",nickname:"TW",region:"prod_official_cht"});
 await expect(getAccountGameRole("cookie",6,"900000002")).rejects.toThrow("找不到");
});
it("rejects an unsupported game instead of returning HSR roles", async () => {
 await expect(getAccountGameRoles("cookie",3)).rejects.toThrow("Unsupported game");
});
