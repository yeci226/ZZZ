import { client } from "../index.js";
import axios from "axios";
import emoji from "../assets/emoji.js";
const db = client.db;
const BASE_URL = "https://bbs-api-os.hoyolab.com/community/post/wapi/";

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

global.replyOrfollowUp = async function (interaction, ...args) {
  if (interaction.replied) return interaction.editReply(...args);
  if (interaction.deferred) return await interaction.followUp(...args);
  return await interaction.reply(...args);
};
