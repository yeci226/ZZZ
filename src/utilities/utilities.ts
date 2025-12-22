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
const db = client.db;
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
      href == text ? `${emoji.link}${href}` : `${emoji.link}[${text}](${href})`
  );

  content = content.replace(
    /<iframe[^>]*src="([^"]*)"[^>]*><\/iframe>/gi,
    (match, p1) => `### ${emoji.link}[影片](${p1})`
  );

  content = content.replace(/\s*class="[^"]*"/g, "");
  // content = content.replace(/\n\s*\n/g, "\n");

  return content;
}

export async function getRedeemCodes() {
  const res = await axios
    .get("https://hoyo-codes.seria.moe/codes?game=nap")
    .then((response) => response.data);

  return res.codes;
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

  const account = await db.get(accountKey);
  return account?.[accountIndex]?.uid || null;
}

export async function getUserCookie(userId: string, accountIndex: number) {
  const accountKey = `${userId}.account`;

  const account = await db.get(accountKey);
  return account?.[accountIndex]?.cookie || null;
}

export async function getUserLang(userId: string) {
  const langKey = `${userId}.locale`;

  const lang = await db.get(langKey);
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
  title = ""
) {
  interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setThumbnail(
          "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif"
        ),
    ] as any,
    fetchReply: true,
  } as any);
}

export async function failedReply(
  interaction: ChatInputCommandInteraction,
  title = "",
  description = ""
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
    await db.set(`${userId}.locale`, langCode);
}

export async function getUserHoyolabData(
  interaction: ChatInputCommandInteraction,
  tr: (key: string, args?: any) => string,
  userId: string,
  userLang?: string,
  accountIndex = 0
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
      (item: any) => item.game_id === 8
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
          }
    );
    return null;
  }
}

export async function getBangbooData(bangbooId: string) {
  try {
    const apiUrl = `https://api.hakush.in/zzz/data/zh/bangboo/${bangbooId}.json`;
    const response = await axios.get(apiUrl).then((response) => response.data);
    const dataFormat = {
      id: bangbooId,
      iconUrl: `https://api.hakush.in/zzz/UI/${response.Icon.split("/").pop().split(".")[0]}.webp`,
    };
    return dataFormat;
  } catch (error) {
    console.log(error);
    return null;
  }
}

export async function getWeaponData(weaponId: string) {
  try {
    const apiUrl = `https://api.hakush.in/zzz/data/en/weapon/${weaponId}.json`;
    const response = await axios.get(apiUrl).then((response) => response.data);
    const dataFormat = {
      id: response.Id,
      iconUrl: `https://api.hakush.in/zzz/UI/${response.Icon.split("/").pop().split(".")[0]}.webp`,
    };
    return dataFormat;
  } catch (error) {
    console.log(error);
    return null;
  }
}

export async function getCharacterData(characterId: string | number) {
  const id = String(characterId || "");
  if (!id) throw new Error("Character ID is required");
  try {
    const apiUrl = `https://api.hakush.in/zzz/data/en/character/${characterId}.json`;
    const response = await axios.get(apiUrl).then((response) => response.data);
    const partnerInfo = response.PartnerInfo;
    if (!partnerInfo || Object.keys(partnerInfo).length == 0) return null;

    const dataFormat = {
      id: response.Id,
      name: response.Name,
      fullName: partnerInfo.FullName,
      gender: partnerInfo.Gender,
      birthday: partnerInfo.Birthday,
      camp: partnerInfo.Race,
      icon: partnerInfo.Icon,
      skin: response.Skin,
      iconUrl: `https://api.hakush.in/zzz/UI/${partnerInfo.RoleIcon.split("/").pop()}.webp`,
    };

    return dataFormat;
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
  accountIndex = 0
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
            })
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
          }
    );
    return null;
  }
}

export function checkAccount(
  interaction: ChatInputCommandInteraction,
  tr: (key: string, args?: any) => string,
  userId: string,
  data: any
) {
  if (data.ErrorCode == 10035) {
    replyOrfollowUp(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("#FFE9D0")
          .setTitle("請先通過 Geetest 來繼續使用指令！")
          .setURL(`http://yeci.rocks:3000/geetest/${userId}`),
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
              "`"
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

export async function updateCookie(
  userId: string,
  accountIndex: number,
  cookieObj: string
) {
  const webAPI =
    "https://webapi-os.account.hoyoverse.com/Api/fetch_cookie_accountinfo";
  const parsedCookie = Object.fromEntries(
    cookieObj
      .split("; ")
      .filter(Boolean)
      .map((cookie) => cookie.split("="))
  );

  const cookie = [
    `cookie_token_v2=${parsedCookie.cookie_token_v2}`,
    `account_id_v2=${parsedCookie.ltuid_v2}`,
  ].join("; ");

  const response = await fetch(webAPI, {
    method: "GET",
    headers: {
      Cookie: cookie,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const responseData = await response.json();
  if (responseData?.code !== 200)
    return {
      error: true,
      message: `Error: ${responseData.message || "Unknown error"}`,
    };

  const newCookieToken = responseData.data.cookie_info.cookie_token;
  const accountKey = `${userId}.account`;
  const account = await db.get(accountKey);

  let originalCookie = account[accountIndex].cookie.split("; ").filter(Boolean);

  let cookieTokenV2Exists = false;

  const updatedCookie = originalCookie.map((item: string) => {
    if (item.startsWith("cookie_token_v2=")) {
      cookieTokenV2Exists = true;
      return `cookie_token_v2=${newCookieToken}`;
    }
    return item;
  });

  if (!cookieTokenV2Exists) {
    const finalCookie = [];
    let inserted = false;

    for (const item of updatedCookie) {
      finalCookie.push(item);
      if (!inserted && item.startsWith("ltuid_v2=")) {
        finalCookie.push(`cookie_token_v2=${newCookieToken}`);
        inserted = true;
      }
    }

    account[accountIndex].cookie = finalCookie.join("; ");
  } else {
    account[accountIndex].cookie = updatedCookie.join("; ");
  }

  await db.set(accountKey, account);
}

global.replyOrfollowUp = async function (
  interaction: ChatInputCommandInteraction,
  ...args: any[]
) {
  if (interaction.replied) return interaction.editReply(args[0]);
  if (interaction.deferred) return await interaction.followUp(args[0]);
  return await interaction.reply(args[0]);
};

export async function getUserGameUid(
  cookie: string,
  gameName = "Zenless Zone Zero"
) {
  const hoyolab = new Hoyolab({
    cookie: cookie,
  } as any);

  const gameRecord = await hoyolab.gameRecordCard();
  const filteredData = (gameRecord as any).filter(
    (item: any) => item.game_name === gameName
  );

  return {
    uid: filteredData[0].game_role_id,
    nickname: filteredData[0].nickname,
  };
}

export async function updateAccountInfo(userId: string, newAccountInfo: any) {
  const accountKey = `${userId}.account`;
  let accounts = (await db.get(accountKey)) || [];

  // 檢查是否存在相同 UID 的帳號
  const existingIndex = accounts.findIndex(
    (acc: any) => acc.uid === newAccountInfo.uid
  );

  if (existingIndex !== -1) {
    // 更新現有帳號資訊
    accounts[existingIndex] = {
      ...accounts[existingIndex],
      cookie: newAccountInfo.cookie,
      nickname: newAccountInfo.nickname,
      lastUpdate: new Date().toISOString(),
    };

    new Logger("Utilities").info(
      `[用戶 ${userId}] 更新現有帳號 [UID: ${newAccountInfo.uid}]`
    );
  } else {
    // 添加新帳號
    accounts.push({
      uid: newAccountInfo.uid,
      cookie: newAccountInfo.cookie,
      nickname: newAccountInfo.nickname,
      lastUpdate: new Date().toISOString(),
    });

    new Logger("Utilities").info(
      `[用戶 ${userId}] 添加新帳號 [UID: ${newAccountInfo.uid}]`
    );
  }

  // 保存更新後的帳號列表
  await db.set(accountKey, accounts);

  return {
    isNewAccount: existingIndex === -1,
    accountIndex: existingIndex !== -1 ? existingIndex : accounts.length - 1,
  };
}
