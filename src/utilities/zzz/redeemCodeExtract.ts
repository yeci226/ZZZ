/**
 * Finds Zenless Zone Zero redemption codes in a Discord message.
 *
 * Rule (documented because it is a heuristic, not a format guarantee):
 *  - A code is an UPPERCASE alphanumeric token of 8-16 characters that is not
 *    glued to other letters/digits, is not purely digits (Discord IDs, dates,
 *    phone numbers) and is not a well-known plain word.
 *  - A bare token is only trusted when it has letters AND digits, stands alone
 *    on its line (markdown wrappers such as `code`, **bold**, ||spoiler||,
 *    bullets and [text](url) are ignored), or directly follows a "code" label.
 *  - Official redemption URLs (?code=XXXX on a HoYoverse/HoYoLAB/miHoYo host,
 *    except hosts that name another game) are accepted in any letter case.
 *  - Text comes from the message content and every embed's title, description,
 *    fields and url. Results are de-duplicated and capped at MAX_REDEEM_CODES.
 */
export const MAX_REDEEM_CODES = 5;

export interface CodeSourceMessage {
  content?: string | null;
  embeds?: ReadonlyArray<{
    title?: string | null;
    description?: string | null;
    url?: string | null;
    fields?: ReadonlyArray<{ name?: string | null; value?: string | null }> | null;
  }> | null;
}

const TOKEN = /(?<![A-Za-z0-9_])[A-Z0-9]{8,16}(?![A-Za-z0-9_])/g;
const URL_RE = /https?:\/\/[^\s<>()[\]|]+/gi;
const OFFICIAL_HOST = /(^|\.)(hoyoverse|hoyolab|mihoyo)\.com$/i;
const OTHER_GAME_LABEL = /^(hsr|sr|genshin|ys|hk4e|bh3|honkai|tot|hkrpg|starrail|act-webstatic)$/i;
const LABEL = "(?:code|codes|cdkey|redeem|redemption|gift|兌換|兑换|禮包|礼包|コード|シリアル|코드|쿠폰|mã)";
const AFTER_LABEL = new RegExp(`${LABEL}(?:[^A-Za-z0-9]|\\b[A-Z0-9]{8,16}\\b)*$`, "i");
const STOP_WORDS = new Set([
  "ANNOUNCEMENT", "ANNOUNCEMENTS", "EVERYONE", "REMINDER", "REDEEM", "REDEMPTION", "REDEEMING",
  "GIFTCODE", "GIFTCODES", "ZENLESSZONEZERO", "HOYOVERSE", "ZENLESSZONE", "MAINTENANCE",
  "DOWNLOAD", "REWARDS", "PROMOCODE", "PROMOCODES", "UPDATES", "LIVESTREAM", "PRIMOGEMS",
]);

function urlCodes(text: string): string[] {
  const found: string[] = [];
  for (const raw of text.match(URL_RE) ?? []) {
    try {
      const url = new URL(raw.replace(/[.,;!?]+$/, ""));
      if (!OFFICIAL_HOST.test(url.hostname)) continue;
      if (OTHER_GAME_LABEL.test(url.hostname.split(".")[0])) continue;
      const code = url.searchParams.get("code");
      if (code && /^[A-Za-z0-9]{5,30}$/.test(code) && !/^\d+$/.test(code)) found.push(code.toUpperCase());
    } catch { /* not a URL */ }
  }
  return found;
}

/** The line without list prefixes and markdown wrappers, to see whether a token stands alone. */
function bareLine(line: string): string {
  return line
    .replace(/^\s*(?:(?:[-*•·>]+|\d{1,2}[.)])\s+)*/, "")
    .replace(/^[\s`*_~|[\]():：]+/, "")
    .replace(/[\s`*_~|[\]():：.,;!]+$/, "");
}

function lineCodes(line: string): string[] {
  const found: string[] = [];
  const alone = bareLine(line);
  for (const match of line.matchAll(TOKEN)) {
    const token = match[0];
    if (/^\d+$/.test(token) || STOP_WORDS.has(token)) continue;
    const mixed = /[A-Z]/.test(token) && /\d/.test(token);
    if (mixed || alone === token || AFTER_LABEL.test(line.slice(0, match.index))) found.push(token);
  }
  return found;
}

export function codesFromText(text: string): string[] {
  const found = urlCodes(text);
  const cleaned = text
    .replace(URL_RE, " ")
    .replace(/<a?:\w+:\d+>|<[@#!&]+\d+>|<t:\d+(?::\w)?>/g, " ");
  for (const line of cleaned.split(/\r?\n/)) found.push(...lineCodes(line));
  return found;
}

export function messageTexts(message: CodeSourceMessage): string[] {
  const texts = [message.content ?? ""];
  for (const embed of message.embeds ?? []) {
    texts.push(embed.title ?? "", embed.description ?? "", embed.url ?? "");
    for (const field of embed.fields ?? []) texts.push(field.name ?? "", field.value ?? "");
  }
  return texts.filter(Boolean);
}

/** Every distinct code found, in reading order and uppercased. */
export function findRedeemCodes(message: CodeSourceMessage): string[] {
  const seen = new Set<string>();
  for (const text of messageTexts(message)) for (const code of codesFromText(text)) seen.add(code);
  return [...seen];
}

/** At most MAX_REDEEM_CODES codes; `truncated` tells whether more were found. */
export function extractRedeemCodes(message: CodeSourceMessage, limit = MAX_REDEEM_CODES) {
  const all = findRedeemCodes(message);
  return { codes: all.slice(0, limit), truncated: all.length > limit };
}
