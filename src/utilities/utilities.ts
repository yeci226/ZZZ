import { client } from "../index.js";
import axios from "axios";
import emoji from "../assets/emoji.js";
import {
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from "discord.js";
import Logger from "./core/logger.js";
import {
  ZenlessZoneZero,
  LanguageEnum,
  HoyoAPIError,
  Hoyolab,
} from "@yeci226/hoyoapi";
import { loadImage } from "@napi-rs/canvas";
// Use client.db directly in functions to avoid static capture issues
const BASE_URL = "https://bbs-api-os.hoyolab.com/community/post/wapi/";

declare global {
  var replyOrfollowUp: (
    interaction: ChatInputCommandInteraction,
    ...args: any[]
  ) => Promise<any>;
}

const zzzStaticUrl = "https://act-webstatic.hoyoverse.com/game_record/zzz";
const zzzStaticUrl2 = "https://act-webstatic.hoyoverse.com/game_record/nap";
const zzzStaticUrl3 = "https://act-webstatic.hoyoverse.com/game_record/zzzv2";
const squareUrl = `${zzzStaticUrl}/role_square_avatar/role_square_avatar_`;
const squareUrl2 = `${zzzStaticUrl2}/role_square_avatar/role_square_avatar_`;
const squareUrl3 = `${zzzStaticUrl3}/role_square_avatar/role_square_avatar_`;

export async function getAvatarUrl(agentId: string) {
  let url = squareUrl3 + `${agentId}.png`;
  try {
    await loadImage(url);
    return url;
  } catch {
    try {
      url = squareUrl2 + `${agentId}.png`;
      await loadImage(url);
      return url;
    } catch {
      return squareUrl + `${agentId}.png`;
    }
  }
}

export async function getNewsList(lang: string, type: number) {
  return await axios({
    headers: {
      "x-rpc-app_version": "2.43.0",
      "x-rpc-client_type": 4,
      "X-Rpc-Language": lang,
    },
    method: "get",
    url: BASE_URL + "getNewsList",
    params: { gids: 8, page_size: 25, type: type },
  }).then((response) => response.data);
}

export async function getPostFull(lang: string, postId: string) {
  return await axios({
    headers: {
      "x-rpc-app_version": "2.43.0",
      "x-rpc-client_type": 4,
      "X-Rpc-Language": lang,
    },
    method: "get",
    url: BASE_URL + "getPostFull",
    params: { gids: 8, post_id: postId },
  }).then((response) => response.data.data);
}

export async function parsePostContent(content: string) {
  content = content.replace(/<br\s*\/?>/g, "\n");
  content = content.replace(/<\p[^>]*>/g, "\n");
  content = content.replace(/<\/p>/g, "");
  content = content.replace(/<\/?strong[^>]*>/g, "**");
  content = content.replace(/<\/?em[^>]*>/g, "*");
  content = content.replace(/<\/?span[^>]*>/g, "");
  content = content.replace(/<\/?div[^>]*>/g, "");
  content = content.replace(/<\/?img[^>]*>/g, "");
  content = content.replace(/<h4[^>]*>/g, "\n### ");
  content = content.replace(/<\/h4>/g, "");
  content = content.replace(/<h3[^>]*>/g, "\n## ");
  content = content.replace(/<\/h3>/g, "");
  content = content.replace(/&gt;/g, ">");
  content = content.replace(/&lt;/g, "<");
  content = content.replace(/&nbsp;/g, " ");

  content = content.replace(
    /<([a-z]+)\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/\1>/gi,
    (match, tag, href, text) =>
      href == text ? `${emoji.link}${href}` : `${emoji.link}[${text}](${href})`,
  );

  content = content.replace(
    /<iframe[^>]*src="([^"]*)"[^>]*><\/iframe>/gi,
    (match, p1) => `### ${emoji.link}[影片](${p1})`,
  );

  content = content.replace(/\s*class="[^"]*"/g, "");
  // content = content.replace(/\n\s*\n/g, "\n");

  return content;
}

export async function getRedeemCodes() {
  const sources = ["https://api.ennead.cc/mihoyo/zenless/codes"];

  const allCodes = new Set<string>();
  const results: any[] = [];

  for (const url of sources) {
    try {
      const res = await axios
        .get(url, { timeout: 5000 })
        .then((response) => response.data);
      if (url.includes("seria.moe")) {
        res.codes?.forEach((c: any) => {
          if (!allCodes.has(c.code)) {
            allCodes.add(c.code);
            results.push(c);
          }
        });
      } else if (url.includes("ennead.cc")) {
        res.active?.forEach((c: any) => {
          if (!allCodes.has(c.code)) {
            allCodes.add(c.code);
            results.push({
              code: c.code,
              rewards: c.rewards,
              source: "ennead",
            });
          }
        });
      }
    } catch (error) {
      new Logger("Utilities").error(
        `獲取禮包碼失敗 (${url}): ${(error as any).message}`,
      );
    }
  }

  return results;
}

export function secondsToHms(d: number | string, tr: (key: string) => string) {
  d = Number(d);
  var h = Math.floor(d / 3600);
  var m = Math.floor((d % 3600) / 60);
  var s = Math.floor((d % 3600) % 60);

  var hDisplay = h > 0 ? h.toString().padStart(2, "0") + tr("Hour") : "";
  var mDisplay = m > 0 ? m.toString().padStart(2, "0") + tr("Minute") : "";
  var sDisplay = s > 0 ? s.toString().padStart(2, "0") + tr("Second") : "";

  if (!hDisplay && !mDisplay && !sDisplay) {
    sDisplay = "已完成";
  }

  return hDisplay + mDisplay + sDisplay;
}

export async function getUserUid(userId: string, accountIndex: number) {
  const accountKey = `${userId}.account`;

  const account = await client.db.get(accountKey);
  return account?.[accountIndex]?.uid || null;
}

export async function getUserCookie(userId: string, accountIndex: number) {
  const accountKey = `${userId}.account`;

  const account = await client.db.get(accountKey);
  return account?.[accountIndex]?.cookie || null;
}

export async function getUserLang(userId: string) {
  const langKey = `${userId}.locale`;

  const lang = await client.db.get(langKey);
  return lang || null;
}

export function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    const index = Math.floor(Math.random() * letters.length) % letters.length;
    color += letters[index];
  }

  const isValidHex = /^#[0-9A-F]{6}$/i.test(color);
  if (!isValidHex) return "#000000";

  return color;
}

const color = {
  0: "#AAC8A7",
  60: "#C3EDC0",
  100: "#FDFFAE",
  140: "#FFCF96",
  180: "#FF8080",
  220: "#BB2525",
};

export function getStaminaColor(stamina: number) {
  let selectedColor = null;

  for (const key of Object.keys(color)) {
    const numKey = parseInt(key);
    if (stamina >= numKey) selectedColor = color[numKey as keyof typeof color];
  }

  return selectedColor;
}

export async function drawInQueueReply(
  interaction: ChatInputCommandInteraction,
  title = "",
) {
  interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setThumbnail(
          "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif",
        ),
    ] as any,
    fetchReply: true,
  } as any);
}

export async function failedReply(
  interaction: ChatInputCommandInteraction,
  title = "",
  description = "",
) {
  const embed = new EmbedBuilder().setTitle(title).setConfig("#E76161", "sob");

  if (description) embed.setDescription(description);

  replyOrfollowUp(interaction, {
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
    fetchReply: true,
  } as any);
}

// const dotggCharacterUrl =
//   "https://api.dotgg.gg/cgfw/getgacha?game=zenless&type=characters";

// export async function getCharacterData(characterId) {
//   const response = await axios.get(dotggCharacterUrl);
//   const character = response.data.find(
//     (character) => character.id == characterId
//   );

//   return {
//     id: character.id,
//     name: character.name,
//     fullName: character.fullName,
//     iconUrl: `https://static.dotgg.gg/zenless/${character.icon}`,
//     faction: character.faction,
//   };
// }

const languageMapping = {
  tw: LanguageEnum.TRADIIONAL_CHINESE,
  cn: LanguageEnum.SIMPLIFIED_CHINESE,
  vi: LanguageEnum.VIETNAMESE,
  jp: LanguageEnum.JAPANESE,
  kr: LanguageEnum.KOREAN,
  fr: LanguageEnum.FRENCH,
  default: LanguageEnum.ENGLISH,
};

export async function setupDefaultLang(userId: string, userSystemLang: string) {
  const langMap = {
    "zh-TW": "tw",
    "zh-CN": "cn",
    ja: "jp",
    ko: "kr",
  } as Record<string, string>;

  const langCode = langMap[userSystemLang] || userSystemLang;

  if (languageMapping[langCode as keyof typeof languageMapping])
    await client.db.set(`${userId}.locale`, langCode);
}

export async function getUserHoyolabData(
  interaction: ChatInputCommandInteraction,
  tr: (key: string, args?: any) => string,
  userId: string,
  userLang?: string,
  accountIndex = 0,
) {
  const [cookie, uid] = await Promise.all([
    getUserCookie(userId, accountIndex),
    getUserUid(userId, accountIndex),
  ]);
  if (!userLang) userLang = await getUserLang(userId);

  const getLanguage = (locale: any) =>
    languageMapping[locale as keyof typeof languageMapping] ||
    languageMapping.default;
  const lang = userLang
    ? getLanguage(userLang)
    : getLanguage(interaction.locale);

  try {
    const hoyolab = new Hoyolab({ cookie, lang, uid } as any);
    const gameRecord = await hoyolab.gameRecordCard();
    const filteredData = (gameRecord as any).filter(
      (item: any) => item.game_id === 8,
    );

    return filteredData[0];
  } catch (error) {
    const isHoyoAPIError = error instanceof HoyoAPIError;
    const errorCode = isHoyoAPIError ? error.code : error;

    checkAccount(
      interaction,
      tr,
      userId,
      isHoyoAPIError && error.code == 10035
        ? {
            ErrorCode: error.code,
          }
        : {
            hasCookie: cookie != null,
            Lang: lang,
            hasUid: uid != null,
            ErrorCode: errorCode,
          },
    );
    return null;
  }
}

export async function getBangbooData(bangbooId: string) {
  try {
    // Fallback to official CDN directly for bangboo as wiki mapping is less common
    const iconUrl = `https://act-webstatic.hoyoverse.com/game_record/zzz/bangboo_square_avatar/bangboo_square_avatar_${bangbooId}.png`;
    return {
      id: bangbooId,
      iconUrl: iconUrl,
    };
  } catch (error) {
    console.log(error);
    return null;
  }
}

export async function getWeaponData(weaponId: string) {
  try {
    // Fallback to official CDN for weapon
    const iconUrl = `https://act-webstatic.hoyoverse.com/game_record/zzz/weapon_square_avatar/weapon_square_avatar_${weaponId}.png`;
    return {
      id: weaponId,
      iconUrl: iconUrl,
    };
  } catch (error) {
    console.log(error);
    return null;
  }
}

const wikiSearchCache: Record<string, string> = {};

export async function searchWikiEntry(keyword: string) {
  const cleanKeyword = keyword.replace(/[「」]/g, "");
  if (wikiSearchCache[cleanKeyword]) return wikiSearchCache[cleanKeyword];

  try {
    const response = await axios
      .get(
        `https://sg-wiki-api.hoyolab.com/hoyowiki/zzz/wapi/search?keyword=${encodeURIComponent(cleanKeyword)}`,
        {
          headers: {
            "x-rpc-wiki_app": "zzz",
            "x-rpc-language": "zh-tw",
            Referer: "https://wiki.hoyolab.com/",
            Origin: "https://wiki.hoyolab.com",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        },
      )
      .then((res) => res.data);

    if (response.retcode === 0 && response.data?.list) {
      const list = response.data.list;
      // Find the best match:
      // 1. Exact name match
      // 2. Name that contains the keyword
      // 3. First item in the list
      const entry =
        list.find((e: any) => e.name === cleanKeyword) ||
        list.find((e: any) => e.name.includes(cleanKeyword)) ||
        list[0];
      if (entry) {
        const id = String(entry.entry_page_id || entry.id);
        wikiSearchCache[cleanKeyword] = id;
        return id;
      }
    }
  } catch (error) {
    console.error(`[Wiki] Search failed for ${keyword}:`, error);
  }
  return null;
}

export async function getCharacterData(characterId: string | number) {
  const id = String(characterId || "");
  if (!id) throw new Error("Character ID is required");

  try {
    return {
      id: id,
      iconUrl: `https://act-webstatic.hoyoverse.com/game_record/zzz/role_square_avatar/role_square_avatar_${id}.png`,
      portraitUrl: `https://act-webstatic.hoyoverse.com/game_record/zzz/role_vertical_painting/role_vertical_painting_${id}.png`,
      header_img_url: undefined,
      mindscapes: [] as string[],
      paintings: [] as Array<{ key: string; img: string }>,
    };
  } catch (error) {
    console.log(error);
    return null;
  }
}

export async function getUserZZZData(
  interaction: ChatInputCommandInteraction,
  tr: (key: string, args?: any) => string,
  userId: string,
  userLang?: string,
  accountIndex = 0,
) {
  const [cookie, uid] = await Promise.all([
    getUserCookie(userId, accountIndex),
    getUserUid(userId, accountIndex),
  ]);
  if (!cookie || !uid) {
    replyOrfollowUp(interaction, {
      embeds: [
        new EmbedBuilder()
          .setConfig("#E76161", "sob")
          .setTitle(tr("AccountNotFound"))
          .setDescription(
            tr("AccountNotFoundDesc", {
              hasCookie: tr(cookie ? "isSet" : "isNotSet"),
              hasUid: tr(uid ? "isSet" : "isNotSet"),
            }),
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!userLang) userLang = await getUserLang(userId);

  const getLanguage = (locale: string) =>
    languageMapping[locale as keyof typeof languageMapping] ||
    languageMapping.default;
  const lang = userLang
    ? getLanguage(userLang)
    : getLanguage(interaction.locale);

  try {
    const zzz = new ZenlessZoneZero({ cookie, lang, uid });
    await zzz.daily.info();

    return zzz;
  } catch (error) {
    const isHoyoAPIError = error instanceof HoyoAPIError;
    const errorCode = isHoyoAPIError ? error.code : error;
    console.log(error);

    checkAccount(
      interaction,
      tr,
      userId,
      isHoyoAPIError && error.code == 10035
        ? {
            ErrorCode: error.code,
          }
        : {
            hasCookie: cookie != null,
            Lang: lang,
            hasUid: uid != null,
            ErrorCode: errorCode,
          },
    );
    return null;
  }
}

import { loadConfig } from "./core/config.js";
const config = loadConfig();

export function checkAccount(
  interaction: ChatInputCommandInteraction,
  tr: (key: string, args?: any) => string,
  userId: string,
  data: any,
) {
  if (data.ErrorCode == 10035) {
    replyOrfollowUp(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("#FFE9D0")
          .setTitle("請先通過 Geetest 來繼續使用指令！")
          .setURL(
            `${(config as any).VERIFY_PUBLIC_URL || "https://verify.yeci.lol/zzz"}/verify?session=${Math.random().toString(36).substring(2, 12)}&userid=${userId}`,
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  } else if (interaction.user.id == userId) {
    const accountStats = data;
    replyOrfollowUp(interaction, {
      embeds: [
        new EmbedBuilder()
          .setConfig("#E76161", "sob")
          .setTitle(tr("AccountNotFound"))
          .setDescription(
            tr("AccountNotFoundDesc", {
              hasCookie: tr(accountStats.hasCookie ? "isSet" : "isNotSet"),
              hasUid: tr(accountStats.hasUid ? "isSet" : "isNotSet"),
            }) +
              "\n\n" +
              "`" +
              accountStats.ErrorCode +
              "`",
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  } else {
    replyOrfollowUp(interaction, {
      embeds: [
        new EmbedBuilder()
          .setConfig("#E76161", "sob")
          .setTitle(tr("NoSetAccount")),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * 從 Cookie 字串中提取指定的欄位
 * @param {string} cookie Cookie 字串
 * @param {object} options 選項，支援 whitelist (白名單) 或 blacklist (黑名單)
 * @returns {string} 處理後的 Cookie 字串
 */
export function parseCookie(
  cookie: string,
  options: {
    whitelist?: string[];
    blacklist?: string[];
    separator?: string;
  } = {},
) {
  const { whitelist = [], blacklist = [], separator = ";" } = options;

  if (!cookie) return "";

  const cookiesArray = cookie.split(separator).map((c) => c.trim());
  const cookieMap = Object.fromEntries(
    cookiesArray.map((c) => {
      const [key, ...valueParts] = c.split("=");
      return [key, valueParts.join("=")];
    }),
  );

  if (whitelist.length !== 0) {
    const filteredCookiesArray = Object.keys(cookieMap)
      .filter((key) => whitelist.includes(key) && cookieMap[key] !== undefined)
      .map((key) => `${key}=${cookieMap[key]}`);

    return filteredCookiesArray.join(`${separator} `);
  }
  if (blacklist.length !== 0) {
    const filteredCookiesArray = Object.keys(cookieMap)
      .filter((key) => !blacklist.includes(key))
      .map((key) => `${key}=${cookieMap[key]}`);

    return filteredCookiesArray.join(`${separator} `);
  }

  return cookie;
}

export async function updateCookie(
  userId: string,
  accountIndex: number,
  cookieObj: string,
) {
  const accountKey = `${userId}.account`;
  const accounts = await client.db.get(accountKey);
  if (!accounts || !accounts[accountIndex]) {
    throw new Error("Account not found");
  }

  const webAPI =
    "https://webapi-os.account.hoyoverse.com/Api/fetch_cookie_accountinfo";

  const cookieForRefresh = parseCookie(cookieObj, {
    whitelist: ["cookie_token_v2", "account_id_v2", "ltuid_v2", "ltoken_v2"],
  });

  // 檢查是否有必要欄位進行刷新 (必須有 token 加上任一 ID)
  const hasToken = cookieForRefresh.includes("cookie_token_v2=");
  const hasID =
    cookieForRefresh.includes("ltuid_v2=") ||
    cookieForRefresh.includes("account_id_v2=");

  if (!hasToken || !hasID) {
    accounts[accountIndex].invalid = true;
    await client.db.set(accountKey, accounts);
    return {
      error: true,
      message: "Cookie 資訊不完整（缺少 token 或 ID），已自動標記為跳過更新",
    };
  }

  // 如果原始 Cookie 中有 ltuid_v2 但沒有 account_id_v2，Hoyoverse API 有時會需要對應
  let finalCookieForRefresh = cookieForRefresh;
  const ltuidMatch = cookieForRefresh.match(/ltuid_v2=([^;]+)/);
  const accountIdMatch = cookieForRefresh.match(/account_id_v2=([^;]+)/);

  if (!accountIdMatch && ltuidMatch) {
    finalCookieForRefresh = `${cookieForRefresh}; account_id_v2=${ltuidMatch[1]}`;
  } else if (!ltuidMatch && accountIdMatch) {
    finalCookieForRefresh = `${cookieForRefresh}; ltuid_v2=${accountIdMatch[1]}`;
  }

  try {
    const response = await fetch(webAPI, {
      method: "GET",
      headers: {
        Cookie: finalCookieForRefresh,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();
    if (responseData?.code !== 200) {
      return {
        error: true,
        message: `Error: ${responseData.message || "Unknown error"}`,
      };
    }

    const newCookieToken = responseData.data.cookie_info.cookie_token;
    const accountId = responseData.data.cookie_info.account_id;

    // 保留原始 Cookie 中除了 token 和 id 以外的部分
    const baseCookie = parseCookie(cookieObj, {
      blacklist: [
        "cookie_token_v2",
        "account_id_v2",
        "cookie_token",
        "account_id",
      ],
    });

    // 重新組合 Cookie，優先使用 v2 版本
    // 有些情況下需要保留基本的 login 資訊
    const newCookie = `${baseCookie}; cookie_token_v2=${newCookieToken}; account_id_v2=${accountId}`;

    // 清理可能重複的欄位
    const finalCleanCookie = parseCookie(newCookie, {
      blacklist: [], // 這裡主要用來確保格式統一
    });

    accounts[accountIndex].cookie = finalCleanCookie;
    accounts[accountIndex].invalid = false; // 成功更新，確保無效標記被清除
    accounts[accountIndex].lastUpdate = new Date().toISOString();

    await client.db.set(accountKey, accounts);

    return { success: true, cookie: finalCleanCookie };
  } catch (error: any) {
    // 這裡若是 403 / 401 或特定的 status 錯誤，代表 Cookie 可能真的掛了
    accounts[accountIndex].invalid = true;
    await client.db.set(accountKey, accounts);

    new Logger("Utilities").error(
      `[用戶 ${userId}] Cookie 刷新失敗並已標記為無效: ${error.message}`,
    );
    throw error;
  }
}

global.replyOrfollowUp = async function (
  interaction: ChatInputCommandInteraction,
  ...args: any[]
) {
  if (interaction.replied) return interaction.editReply(args[0]);
  if (interaction.deferred) return await interaction.followUp(args[0]);
  return await interaction.reply(args[0]);
};

export async function getAllGameRoles(cookie: string) {
  const hoyolab = new Hoyolab({
    cookie: cookie,
  } as any);

  const gameRecord = await hoyolab.gameRecordCard();
  if (!gameRecord || !Array.isArray(gameRecord)) {
    throw new Error("無法獲取遊戲紀錄卡或資料格式不正確");
  }

  // 過濾出有角色的遊戲
  return (gameRecord as any[])
    .filter((item: any) => item.has_role)
    .map((item: any) => ({
      uid: item.game_role_id,
      nickname: item.nickname,
      gameName: item.game_name,
      gameId: item.game_id,
      region: item.region,
      level: item.level,
    }));
}

export async function getUserGameUid(cookie: string, game_id = 8) {
  const roles = await getAllGameRoles(cookie);

  const filteredData = roles.filter((item: any) => item.gameId === game_id);

  if (filteredData.length === 0) {
    throw new Error(`在此 Hoyolab 帳號中找不到 ${game_id} 角色資料`);
  }

  return {
    uid: filteredData[0].uid,
    nickname: filteredData[0].nickname,
  };
}

export async function autoRefreshCookie(
  userId: string,
  accountIndex: number,
  cookie: string,
) {
  try {
    const logger = new Logger("AutoRefreshCookie");
    const accountKey = `${userId}.account`;
    const accounts = await client.db.get(accountKey);
    const uid = accounts?.[accountIndex]?.uid;

    // 先向官方驗證端點確認 Cookie 是否仍有效
    const verifyUrl =
      "https://passport-api-sg.hoyoverse.com/account/ma-passport/token/verifyCookieToken";

    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        accept: "*/*",
        "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6",
        "content-type": "application/json",
        origin: "https://zenless.hoyoverse.com",
        referer: "https://zenless.hoyoverse.com/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        cookie,
        "x-rpc-app_id": "dny1be34nvnk",
        "x-rpc-client_type": "4",
        "x-rpc-game_biz": "nap_global",
      },
      body: JSON.stringify({}),
    });

    const result = (await response.json()) as any;

    if (result?.code === 200 || result?.retcode === 0) {
      logger.success(
        `[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 驗證成功，仍然有效`,
      );

      if (accounts?.[accountIndex]) {
        accounts[accountIndex].invalid = false;
        await client.db.set(accountKey, accounts);
      }

      if (uid) {
        await client.db.delete(`${uid}.cookieExpired`);
        await client.db.delete(`${uid}.needsCookieUpdate`);
        await client.db.delete(`${uid}.lastCookieRefreshAttempt`);
      }

      return { success: true, message: "Cookie 驗證成功" };
    }

    logger.warn(
      `[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 已過期，嘗試自動刷新...`,
    );

    const refreshResult = await updateCookie(userId, accountIndex, cookie);

    if ((refreshResult as any)?.success) {
      logger.success(
        `[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 刷新成功`,
      );
      if (uid) {
        await client.db.delete(`${uid}.cookieExpired`);
        await client.db.delete(`${uid}.needsCookieUpdate`);
        await client.db.delete(`${uid}.lastCookieRefreshAttempt`);
      }

      return {
        success: true,
        message: "Cookie 已自動刷新",
        newCookie: (refreshResult as any).cookie,
      };
    }

    logger.error(
      `[用戶 ${userId}] [帳號 #${accountIndex}] Cookie 無法刷新: ${(refreshResult as any)?.message || "Unknown error"}`,
    );
    if (uid) {
      await client.db.set(`${uid}.needsCookieUpdate`, true);
    }

    return {
      success: false,
      message: (refreshResult as any)?.message || "Cookie 刷新失敗",
    };
  } catch (error: any) {
    const logger = new Logger("AutoRefreshCookie");
    logger.error(
      `[用戶 ${userId}] [帳號 #${accountIndex}] 自動刷新 Cookie 失敗: ${error.message}`,
    );

    const accounts = await client.db.get(`${userId}.account`);
    const uid = accounts?.[accountIndex]?.uid;
    if (uid) {
      await client.db.set(`${uid}.needsCookieUpdate`, true);
    }

    return {
      success: false,
      message: error.message,
    };
  }
}

export async function updateAccountInfo(userId: string, newAccountInfo: any) {
  const accountKey = `${userId}.account`;
  let accounts = (await client.db.get(accountKey)) || [];

  // 檢查是否存在相同 UID 的帳號
  const existingIndex = accounts.findIndex(
    (acc: any) => acc.uid === newAccountInfo.uid,
  );

  if (existingIndex !== -1) {
    // 更新現有帳號資訊，同時清除無效標記
    accounts[existingIndex] = {
      ...accounts[existingIndex],
      cookie: newAccountInfo.cookie,
      nickname: newAccountInfo.nickname,
      lastUpdate: new Date().toISOString(),
      invalid: false,
    };

    new Logger("Utilities").info(
      `[用戶 ${userId}] 更新現有帳號 [UID: ${newAccountInfo.uid}]`,
    );
  } else {
    // 添加新帳號
    accounts.push({
      uid: newAccountInfo.uid,
      cookie: newAccountInfo.cookie,
      nickname: newAccountInfo.nickname,
      lastUpdate: new Date().toISOString(),
      invalid: false,
    });

    new Logger("Utilities").info(
      `[用戶 ${userId}] 添加新帳號 [UID: ${newAccountInfo.uid}]`,
    );
  }

  // 保存更新後的帳號列表
  await client.db.set(accountKey, accounts);

  // 清除過期標記與快取的更新時間，確保新 Cookie 能立即被自動化系統認可
  await client.db.delete(`${newAccountInfo.uid}.cookieExpired`);
  await client.db.delete(`${newAccountInfo.uid}.lastCookieRefresh`);

  return {
    isNewAccount: existingIndex === -1,
    accountIndex: existingIndex !== -1 ? existingIndex : accounts.length - 1,
  };
}
