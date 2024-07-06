import { client } from "../index.js";
import axios from "axios";
import emoji from "../assets/emoji.js";
import { EmbedBuilder } from "discord.js";
import { ZenlessZoneZero, LanguageEnum, HoyoAPIError } from "hoyoapi";
import { load } from "cheerio";
const db = client.db;
const BASE_URL = "https://bbs-api-os.hoyolab.com/community/post/wapi/";

const codeRewardIcon = [
  {
    name: "polychromes",
    url: "https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4c/Item_Polychrome.png",
  },
  {
    name: "dennies",
    url: "https://static.wikia.nocookie.net/zenless-zone-zero/images/a/a2/Item_Denny.png",
  },
];

export async function getNewsList(lang, type) {
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

export async function getPostFull(lang, postId) {
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

export async function parsePostContent(content) {
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
  const res = await axios.get("https://www.prydwen.gg/zenless/", {
    responseType: "text",
  });

  const codes = [];
  const $ = load(res.data);
  const $codes = $(".codes .box");

  $codes.each((index, element) => {
    codes.push($(element).text().trim());
  });

  for (let i = 0; i < $codes.length; i++) {
    const $code = $($codes[i]);
    const code = $code
      .find(".code")
      .text()
      .replace(" NEW!", "")
      .split("/")[0]
      .replace(" ", "");
    const rewardsText = $code.find(".rewards").text();

    const rewards = rewardsText.split("+").map((reward) => {
      const parts = reward.trim().split(" ");
      let count = null;
      let rewardName = null;

      if (parts.length == 1) {
        rewardName = parts[0].toLowerCase();
      } else {
        count = parseInt(parts[0], 10);
        rewardName = parts.slice(1).join(" ").toLowerCase();
      }

      rewardName = rewardName.replace(" ", "");
      const picture = codeRewardIcon.find((pic) =>
        rewardName.includes(pic.name)
      );
      return {
        reward: rewardName,
        icon: picture ? picture.url : null,
        count: isNaN(count) ? null : count,
      };
    });

    codes.push({ code, rewards });
  }

  const filteredCodes = codes.filter((item) => typeof item === "object");
  return filteredCodes;
}

export function secondsToHms(d, tr) {
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

export async function getUserUid(userId, index = 0) {
  const accountKey = `${userId}.account`;

  const account = await db.get(accountKey);
  return account?.[index]?.uid || null;
}

export async function getUserCookie(userId, index = 0) {
  const accountKey = `${userId}.account`;

  const account = await db.get(accountKey);
  return account?.[index]?.cookie || null;
}

export async function getUserLang(userId) {
  const langKey = `${userId}.locale`;

  const lang = await db.get(langKey);
  return lang || null;
}

export function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) color += letters[Math.floor(Math.random() * 16)];

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

export function getStaminaColor(stamina) {
  let selectedColor = null;

  for (const key in color)
    if (stamina >= parseInt(key)) selectedColor = color[key];

  return selectedColor;
}

export async function failedReply(interaction, title = "", description = "") {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor("#E76161")
    .setThumbnail(
      "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png"
    );

  if (description) embed.setDescription(description);

  replyOrfollowUp(interaction, {
    embeds: [embed],
    ephemeral: true,
    fetchReply: true,
  });
}

export async function getUserZZZData(interaction, tr, userId) {
  const [cookie, userLang, uid] = await Promise.all([
    getUserCookie(userId),
    getUserLang(userId),
    getUserUid(userId),
  ]);

  const lang =
    userLang === "tw" || interaction.locale === "zh-TW"
      ? LanguageEnum.TRADIIONAL_CHINESE
      : LanguageEnum.ENGLISH;

  try {
    const zzz = new ZenlessZoneZero({ cookie, lang, uid });
    await zzz.daily.info();

    return zzz;
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

export function checkAccount(interaction, tr, userId, data) {
  if (data.ErrorCode == 10035) {
    replyOrfollowUp(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("#FFE9D0")
          .setTitle("請先通過 Geetest 來繼續使用指令！")
          .setURL(`http://yeci.rocks:3000/geetest/${userId}`),
      ],
      ephemeral: true,
    });
  } else if (interaction.user.id == userId) {
    const accountStats = data;
    replyOrfollowUp(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("#E76161")
          .setThumbnail(
            "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png/revision/latest?cb=20220617042016"
          )
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
      ephemeral: true,
    });
  } else {
    replyOrfollowUp(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("#E76161")
          .setThumbnail(
            "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png"
          )
          .setTitle(tr("NoSetAccount")),
      ],
      ephemeral: true,
    });
  }
}

global.replyOrfollowUp = async function (interaction, ...args) {
  if (interaction.replied) return interaction.editReply(...args);
  if (interaction.deferred) return await interaction.followUp(...args);
  return await interaction.reply(...args);
};
