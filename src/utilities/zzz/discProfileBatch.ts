const HOST = "https://sg-act-public-api.hoyolab.com";
type BatchClient = { uid?: unknown; region?: unknown; lang?: unknown; cookie?: unknown };
export type DiscBatchReader = (ids: readonly string[]) => Promise<any[]>;

/** The basic roster identifies the active skin; preserve that exact ID when resolving its tall art. */
export function profileRosterPortrait(character: any): string | undefined {
  if (character?.role_vertical_painting_url) return character.role_vertical_painting_url;
  const square = String(character?.role_square_url || "");
  const match = /^https:\/\/act-webstatic\.hoyoverse\.com\/game_record\/zzzv2\/role_square_avatar\/role_square_avatar_(\d{4})(_\d+)?\.png$/.exec(square);
  if (!match || match[1] !== String(character?.id)) return undefined;
  return square.replaceAll("role_square_avatar", "role_vertical_painting");
}

/** Cultivate accepts up to 10 current builds per POST; badge/session cookies stay in this job's memory. */
export function createDiscBatchReader(client: BatchClient, roster: readonly { id: string | number }[], fetcher: typeof fetch = fetch): DiscBatchReader | undefined {
  const uid = String(client.uid || ""), region = String(client.region || ""), lang = String(client.lang || "en-us");
  if (!/^\d{10}$/.test(uid) || !/^prod_gf_(us|eu|jp|sg)$/.test(region) || !client.cookie) return undefined;
  const jar = new Map<string, string>();
  if (typeof client.cookie === "string") {
    for (const part of client.cookie.split(";")) {
      const at = part.indexOf("=");
      if (at > 0) jar.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
    }
  } else if (typeof client.cookie === "object") {
    // hoyoapi stores these cookie names in camelCase; HTTP requires the original snake_case names.
    const sdkNames = ["cookieToken", "accountId", "cookieTokenV2", "accountIdV2", "accountMidV2", "ltokenV2", "ltuidV2", "ltmidV2"];
    for (const [key, value] of Object.entries(client.cookie)) if (typeof value === "string" || typeof value === "number") {
      const name = sdkNames.includes(key) ? key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`) : key;
      jar.set(name, String(value));
    }
  }
  if (!jar.size) return undefined;
  let authenticated = false;
  const request = async (path: string, body: unknown) => {
    const response = await fetcher(`${HOST}${path}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(8_000),
      headers: { "Content-Type": "application/json", "x-rpc-lang": lang, "x-rpc-language": lang,
        Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "), Origin: "https://act.hoyolab.com", Referer: "https://act.hoyolab.com/" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Profile batch unavailable");
    const result: any = await response.json();
    if (result?.retcode !== 0) throw new Error("Profile batch rejected");
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0], at = pair.indexOf("=");
      if (at > 0 && ["e_nap_token", "e_lrsag", "SERVERID", "SERVERCORSID"].includes(pair.slice(0, at))) jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return result.data;
  };
  return async ids => {
    if (!ids.length || ids.length > 10 || ids.some(id => !/^\d{4}$/.test(id))) throw new Error("Invalid profile batch");
    if (!authenticated) {
      // No device-id header: this event tool rejects badge sessions minted with one.
      for (const name of ["e_nap_token", "e_lrsag", "SERVERID", "SERVERCORSID"]) jar.delete(name);
      await request("/common/badge/v1/login/account", { game_biz: "nap_global", lang, region, uid });
      authenticated = true;
    }
    const query = new URLSearchParams({ uid, region });
    const data = await request(`/event/nap_cultivate_tool/user/batch_avatar_detail_v2?${query}`, {
      avatar_list: ids.map(id => ({ avatar_id: Number(id), is_teaser: false, teaser_need_weapon: false, teaser_sp_skill: false })),
    });
    if (!Array.isArray(data?.list)) throw new Error("Missing profile batch");
    return data.list.flatMap((item: any) => {
      const id = String(item?.avatar?.id);
      if (!ids.includes(id) || item.avatar.unlock !== true || !Array.isArray(item.equip)) return [];
      const basic = roster.find(c => String(c.id) === id);
      const character = { ...basic, ...item.avatar, equip: item.equip };
      return [{ ...character, role_vertical_painting_url: profileRosterPortrait(character) }];
    });
  };
}
