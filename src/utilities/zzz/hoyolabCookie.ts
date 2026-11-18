/** Builds a name -> value cookie table from a raw cookie string or a hoyoapi cookie object. */
export function hoyolabCookieJar(cookie: unknown): Map<string, string> {
  const jar = new Map<string, string>();
  if (typeof cookie === "string") {
    for (const part of cookie.split(";")) {
      const at = part.indexOf("=");
      if (at > 0) jar.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
    }
  } else if (cookie && typeof cookie === "object") {
    // hoyoapi stores these cookie names in camelCase; HTTP requires the original snake_case names.
    const sdkNames = ["cookieToken", "accountId", "cookieTokenV2", "accountIdV2", "accountMidV2", "ltokenV2", "ltuidV2", "ltmidV2"];
    for (const [key, value] of Object.entries(cookie)) if (typeof value === "string" || typeof value === "number") {
      const name = sdkNames.includes(key) ? key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`) : key;
      jar.set(name, String(value));
    }
  }
  return jar;
}
