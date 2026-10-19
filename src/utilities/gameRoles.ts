import { Hoyolab } from "@yeci226/hoyoapi";

/** Record cards expose a selected role, not every server on the account. */
export async function getAccountGameRoles(cookie: string, gameId: number) {
  const gameBiz = ({ 8: "nap_global", 6: "hkrpg_global" } as Record<number, string>)[gameId];
  if (!gameBiz) throw new Error(`Unsupported game ID: ${gameId}`);
  const roles = await new Hoyolab({ cookie }).gamesList();
  const seen = new Set<string>();
  return roles.filter(role => {
    if (role.game_biz !== gameBiz || !role.game_uid) return false;
    const uid = String(role.game_uid);
    if (seen.has(uid)) return false;
    seen.add(uid);
    return true;
  }).map(role => ({
    uid: String(role.game_uid), nickname: role.nickname, level: role.level,
    region: role.region, region_name: role.region_name, gameId,
  }));
}

/** A requested UID must never fall back to another server's first role. */
export async function getAccountGameRole(cookie: string, gameId: number, uid?: string) {
  const roles = await getAccountGameRoles(cookie, gameId);
  const role = uid === undefined ? roles[0] : roles.find(role => role.uid === String(uid));
  if (!role) throw new Error("找不到對應伺服器的角色資料");
  return role;
}
