import {
  createCanvas,
  GlobalFonts,
  Image,
  loadImage,
  SKRSContext2D,
} from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { downloadPaintingCache } from "./autoDownloadIcons.js";

const W = 1000;
const H = 625;
const INK = "#111416";
const INK_2 = "#1b1f21";
const SURFACE = "#262b2d";
const SURFACE_2 = "#303638";
const PAPER = "#ebe7dc";
const MUTED = "#a8adae";
const LIME = "#d9ff43";
const RED = "#e74747";
const NUM_FONT = "Nunito";

const fontPaths: Array<[string, string]> = [
  ["en-us.ttf", "EN"],
  ["zh-tw.ttf", "TW"],
  ["zh-cn.ttf", "CN"],
  ["vi-vn.ttf", "VI"],
  ["ja-jp.ttf", "JP"],
  ["ko-kr.ttf", "KR"],
  ["fr-fr.ttf", "FR"],
  ["Nunito-BlackItalic.ttf", NUM_FONT],
];
for (const [file, family] of fontPaths) {
  GlobalFonts.registerFromPath(join(".", "src", "assets", file), family);
}

const fonts: Record<string, string> = {
  tw: "TW",
  cn: "CN",
  vi: "VI",
  jp: "JP",
  kr: "KR",
  fr: "FR",
  default: "EN",
};

type MainText = {
  contacts: string;
  online: string;
  offline: string;
  noTitle: string;
  stats: string;
  activeDays: string;
  agents: string;
  bangboo: string;
  achievements: string;
  badges: string;
};

function getMainText(tr: (key: string, args?: any) => string): MainText {
  return {
    contacts: tr("profileMain_Contacts") || "Contacts",
    online: tr("profileMain_Online") || "Online",
    offline: tr("profileMain_Offline") || "Offline",
    noTitle: tr("profileMain_NoTitle") || "No Title Set",
    stats: tr("profileMain_Stats") || "Proxy Statistics",
    activeDays: tr("profileMain_ActiveDays") || "Active Days",
    agents: tr("profileMain_Agents") || "Agents",
    bangboo: tr("profileMain_Bangboo") || "Bangboo",
    achievements: tr("profileMain_Achievements") || "Achievements",
    badges: tr("profileMain_Badges") || "Public Badges",
  };
}

function roundedPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRounded(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
) {
  roundedPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRounded(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  stroke: string,
  lineWidth = 1,
) {
  roundedPath(ctx, x, y, width, height, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

async function loadAny(source?: string | null): Promise<Image | null> {
  if (!source) return null;
  try {
    if (
      source.startsWith("./") ||
      source.startsWith("/") ||
      source.startsWith("file:")
    ) {
      return await loadImage(source);
    }
    return await loadImage(await downloadPaintingCache(source));
  } catch {
    try {
      return await loadImage(source);
    } catch {
      return null;
    }
  }
}

function drawCover(
  ctx: SKRSContext2D,
  image: Image,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawContain(
  ctx: SKRSContext2D,
  image: Image,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function truncate(
  ctx: SKRSContext2D,
  value: unknown,
  maxWidth: number,
): string {
  const text = String(value ?? "");
  if (ctx.measureText(text).width <= maxWidth) return text;
  let output = text;
  while (output.length > 0 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return output ? `${output}…` : "";
}

function sanitizeHex(raw: unknown, fallback: string): string {
  const value = String(raw ?? "").replace(/^#/u, "");
  return /^[0-9a-f]{6}$/iu.test(value) ? `#${value}` : fallback;
}

function compactNumber(raw: unknown): string {
  const number = Number(raw ?? 0);
  if (!Number.isFinite(number)) return String(raw ?? 0);
  const absolute = Math.abs(number);
  const formats: Array<[number, string]> = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ];
  for (const [divider, suffix] of formats) {
    if (absolute >= divider) {
      const scaled = Math.round((number / divider) * 10) / 10;
      return `${Number.isInteger(scaled) ? scaled.toFixed(0) : scaled}${suffix}`;
    }
  }
  return Math.round(number).toString();
}

function roleCirclePath(character: any): string | null {
  const path = join(
    ".",
    "src",
    "assets",
    "images",
    "icons",
    "roleCircle",
    `${character?.id}.webp`,
  );
  return existsSync(path) ? path : null;
}

function isOnline(character: any, index: number): boolean {
  const id = Number(character?.id ?? 0);
  return (id + index * 7) % 4 !== 0;
}

function drawTabIcon(
  ctx: SKRSContext2D,
  type: "contact" | "person" | "group",
  x: number,
  y: number,
) {
  ctx.save();
  ctx.strokeStyle = "#e9edee";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (type === "contact") {
    strokeRounded(ctx, x, y + 1, 29, 21, 3, "#e9edee", 2.5);
    ctx.beginPath();
    ctx.arc(x + 8, y + 11, 3.2, 0, Math.PI * 2);
    ctx.moveTo(x + 4, y + 18);
    ctx.quadraticCurveTo(x + 8, y + 14, x + 12, y + 18);
    ctx.moveTo(x + 17, y + 8);
    ctx.lineTo(x + 25, y + 8);
    ctx.moveTo(x + 17, y + 14);
    ctx.lineTo(x + 24, y + 14);
    ctx.stroke();
  } else if (type === "person") {
    ctx.beginPath();
    ctx.arc(x + 14, y + 7, 5, 0, Math.PI * 2);
    ctx.moveTo(x + 4, y + 22);
    ctx.quadraticCurveTo(x + 14, y + 12, x + 24, y + 22);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x + 10, y + 8, 4, 0, Math.PI * 2);
    ctx.arc(x + 21, y + 9, 3.5, 0, Math.PI * 2);
    ctx.moveTo(x + 2, y + 22);
    ctx.quadraticCurveTo(x + 10, y + 13, x + 18, y + 22);
    ctx.moveTo(x + 15, y + 21);
    ctx.quadraticCurveTo(x + 21, y + 14, x + 28, y + 21);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSectionHeader(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  title: string,
  font: string,
) {
  ctx.fillStyle = "#111416";
  ctx.fillRect(x, y, width, 34);
  ctx.fillStyle = LIME;
  ctx.fillRect(x, y, 5, 34);
  ctx.font = `bold 14px ${font}`;
  ctx.fillStyle = "#f2f4f4";
  ctx.textAlign = "left";
  ctx.fillText(title, x + 15, y + 23);
}

async function drawContactRail(
  ctx: SKRSContext2D,
  characters: any[],
  font: string,
  T: MainText,
) {
  const x = 30;
  const y = 86;
  const width = 304;
  const height = 504;
  fillRounded(ctx, x, y, width, height, 0, "#171a1c");

  const tabsX = x + 12;
  const tabsY = y + 7;
  const tabsW = width - 24;
  fillRounded(ctx, tabsX, tabsY, tabsW, 42, 10, "#2a2f31");
  fillRounded(ctx, tabsX + 4, tabsY + 4, 86, 34, 8, "#40474a");
  drawTabIcon(ctx, "contact", tabsX + 31, tabsY + 9);
  drawTabIcon(ctx, "person", tabsX + 126, tabsY + 9);
  drawTabIcon(ctx, "group", tabsX + 219, tabsY + 9);

  ctx.font = `bold 10px ${font}`;
  ctx.fillStyle = "#8e9597";
  ctx.textAlign = "left";
  ctx.fillText(T.contacts, x + 15, y + 70);
  ctx.fillStyle = "#394043";
  ctx.fillRect(x + 62, y + 65, width - 78, 1);

  const listY = y + 76;
  const rowHeight = 42;
  const rowGap = 4;
  const visible = characters.slice(0, 11);
  const avatars = await Promise.all(
    visible.map((character) =>
      loadAny(
        roleCirclePath(character) ??
          character.role_square_url ??
          character.hollow_icon_path,
      ),
    ),
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 8, listY, width - 16, height - (listY - y));
  ctx.clip();
  for (let index = 0; index < visible.length; index += 1) {
    const character = visible[index];
    const rowY = listY + index * (rowHeight + rowGap);
    const selected = index === 0;
    fillRounded(
      ctx,
      x + 8,
      rowY,
      width - 20,
      rowHeight,
      10,
      selected ? LIME : "#2a2f31",
    );

    const avatarX = x + 13;
    const avatarY = rowY + 3;
    const avatarSize = 36;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + 18, avatarY + 18, 17, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#62696b";
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    if (avatars[index])
      drawCover(ctx, avatars[index]!, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(avatarX + 18, avatarY + 18, 18, 0, Math.PI * 2);
    ctx.strokeStyle = "#080909";
    ctx.lineWidth = 3;
    ctx.stroke();

    const online = isOnline(character, index);
    ctx.beginPath();
    ctx.arc(avatarX + 31, avatarY + 30, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = online ? "#9fe247" : "#697072";
    ctx.fill();
    ctx.strokeStyle = "#101314";
    ctx.lineWidth = 2;
    ctx.stroke();

    const textColor = selected ? "#121516" : "#eef1f1";
    ctx.font = `bold 12px ${font}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.fillText(
      truncate(ctx, character?.name_mi18n ?? character?.name ?? "Unknown", 144),
      x + 57,
      rowY + 18,
    );
    ctx.font = `bold 8px ${font}`;
    ctx.fillStyle = selected ? "#596020" : "#899092";
    ctx.fillText(online ? T.online : T.offline, x + 57, rowY + 33);

    const rank = Number(character?.rank ?? 0);
    if (rank > 0) {
      fillRounded(ctx, x + width - 48, rowY + 10, 26, 22, 7, RED);
      ctx.font = `900 italic 14px ${NUM_FONT}`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(String(rank), x + width - 35, rowY + 26);
    }
  }

  const fade = ctx.createLinearGradient(0, y + height - 35, 0, y + height);
  fade.addColorStop(0, "rgba(23,26,28,0)");
  fade.addColorStop(1, "rgba(23,26,28,0.98)");
  ctx.fillStyle = fade;
  ctx.fillRect(x + 8, y + height - 35, width - 16, 35);
  ctx.restore();

  ctx.fillStyle = "#667073";
  ctx.fillRect(x + width - 6, listY + 8, 2, 66);
}

async function drawAccountCard(
  ctx: SKRSContext2D,
  font: string,
  userData: any,
  record: any,
  T: MainText,
) {
  const show = record?.game_data_show ?? {};
  const x = 360;
  const y = 102;
  const width = 592;
  const height = 132;
  const banner = await loadAny(show.card_url);
  ctx.save();
  roundedPath(ctx, x, y, width, height, 12);
  ctx.clip();
  ctx.fillStyle = "#343a3d";
  ctx.fillRect(x, y, width, height);
  if (banner) drawCover(ctx, banner, x, y, width, height);
  const shade = ctx.createLinearGradient(x, y, x + width, y);
  shade.addColorStop(0, "rgba(10,12,13,0.94)");
  shade.addColorStop(0.48, "rgba(10,12,13,0.66)");
  shade.addColorStop(1, "rgba(10,12,13,0.1)");
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
  strokeRounded(ctx, x, y, width, height, 12, "#4b5255", 1);

  const avatar = await loadAny(record?.cur_head_icon_url);
  const avatarX = x + 22;
  const avatarY = y + 27;
  const avatarSize = 78;
  ctx.save();
  ctx.beginPath();
  ctx.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2,
    0,
    Math.PI * 2,
  );
  ctx.clip();
  ctx.fillStyle = "#596063";
  ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  if (avatar) drawCover(ctx, avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2,
    0,
    Math.PI * 2,
  );
  ctx.strokeStyle = LIME;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2 - 5,
    0,
    Math.PI * 2,
  );
  ctx.strokeStyle = "#111416";
  ctx.lineWidth = 2;
  ctx.stroke();

  const nickname = String(userData?.nickname ?? "Unknown");
  ctx.font = `bold 25px ${font}`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  const fittedName = truncate(ctx, nickname, 248);
  const nameX = x + 118;
  const nameY = y + 51;
  ctx.fillText(fittedName, nameX, nameY);
  const nameWidth = ctx.measureText(fittedName).width;

  const level = String(userData?.level ?? "?");
  const levelText = `Lv.${level}`;
  ctx.font = `900 italic 13px ${NUM_FONT}`;
  const levelWidth = ctx.measureText(levelText).width + 18;
  fillRounded(ctx, nameX + nameWidth + 11, nameY - 20, levelWidth, 23, 6, LIME);
  ctx.fillStyle = "#111416";
  ctx.textAlign = "center";
  ctx.fillText(levelText, nameX + nameWidth + 11 + levelWidth / 2, nameY - 4);

  const title = String(show.personal_title ?? "");
  const titleGradient = ctx.createLinearGradient(nameX, 0, nameX + 180, 0);
  titleGradient.addColorStop(0, sanitizeHex(show.title_main_color, "#f58661"));
  titleGradient.addColorStop(
    1,
    sanitizeHex(show.title_bottom_color, "#fe357b"),
  );
  fillRounded(
    ctx,
    nameX,
    y + 64,
    Math.max(92, Math.min(230, title.length * 15 + 30)),
    27,
    6,
    "rgba(9,11,12,0.78)",
  );
  ctx.font = `bold 13px ${font}`;
  ctx.fillStyle = titleGradient;
  ctx.textAlign = "left";
  ctx.fillText(title || T.noTitle, nameX + 12, y + 83);

  const uid = userData?.game_role_id;
  const region = userData?.region_name;
  if (uid || region) {
    ctx.font = `900 italic 9px ${NUM_FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.textAlign = "right";
    ctx.fillText(
      [region, uid ? `UID ${uid}` : ""].filter(Boolean).join(" · "),
      x + width - 14,
      y + height - 10,
    );
  }
}

async function drawProfileBody(
  ctx: SKRSContext2D,
  font: string,
  userData: any,
  record: any,
  T: MainText,
) {
  const panelX = 342;
  const panelY = 86;
  const panelW = 628;
  const panelH = 504;
  ctx.fillStyle = "#202426";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  await drawAccountCard(ctx, font, userData, record, T);

  const contentX = 360;
  const contentW = 592;
  const stats = record?.stats ?? {};
  drawSectionHeader(ctx, contentX, 242, contentW, T.stats, font);
  const statItems: Array<[string, unknown]> = [
    [T.activeDays, stats.active_days],
    [T.agents, stats.avatar_num],
    [T.bangboo, stats.buddy_num],
    [T.achievements, stats.achievement_count],
  ];
  const statY = 276;
  const statH = 72;
  const statW = contentW / statItems.length;
  for (let index = 0; index < statItems.length; index += 1) {
    const [label, value] = statItems[index]!;
    const x = contentX + index * statW;
    if (index > 0) {
      ctx.fillStyle = "#444b4e";
      ctx.fillRect(x, statY + 11, 1, statH - 22);
    }
    ctx.font = `bold 10px ${font}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = "center";
    ctx.fillText(label, x + statW / 2, statY + 20);
    ctx.font = `900 italic 27px ${NUM_FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(compactNumber(value), x + statW / 2, statY + 52);
  }

  drawSectionHeader(ctx, contentX, 356, contentW, T.badges, font);
  const show = record?.game_data_show ?? {};
  const medals = (show.all_medal_list ?? show.medal_item_list ?? []).slice(
    0,
    11,
  );
  const medalImages = await Promise.all(
    medals.map((medal: any) => loadAny(medal.medal_icon)),
  );
  const gridY = 396;
  const columnGap = 12;
  const columnWidth = (contentW - columnGap * 2) / 3;
  const rowHeight = 43;
  for (let index = 0; index < medals.length; index += 1) {
    const medal = medals[index];
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = contentX + col * (columnWidth + columnGap);
    const y = gridY + row * rowHeight;
    if (medalImages[index])
      drawContain(ctx, medalImages[index]!, x, y + 1, 38, 38);
    ctx.font = `bold 9px ${font}`;
    ctx.fillStyle = "#b8bdbf";
    ctx.textAlign = "left";
    ctx.fillText(
      truncate(ctx, medal.name ?? "", columnWidth - 48),
      x + 44,
      y + 14,
    );
    const medalNumber = medal.number_str || compactNumber(medal.number);
    ctx.font = `900 italic 19px ${NUM_FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(medalNumber), x + 44, y + 35);
  }
}

export async function drawKnockKnockMainProfile(
  tr: (key: string, args?: any) => string,
  userLocale: string,
  userData: any,
  record: any,
  characters: any[] = [],
): Promise<Buffer | null> {
  try {
    const font = fonts[userLocale] ?? fonts.default;
    const T = getMainText(tr);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    const background = ctx.createLinearGradient(0, 0, W, H);
    background.addColorStop(0, "#0c0f10");
    background.addColorStop(0.48, "#252a2c");
    background.addColorStop(1, "#101314");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#d9ff43";
    ctx.lineWidth = 1;
    for (let x = -H; x < W; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + H, H);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    roundedPath(ctx, 20, 20, 960, 585, 15);
    ctx.clip();
    ctx.fillStyle = INK_2;
    ctx.fillRect(20, 20, 960, 585);
    ctx.fillStyle = SURFACE;
    ctx.fillRect(20, 20, 960, 66);
    ctx.fillStyle = "#343a3d";
    ctx.fillRect(20, 84, 960, 2);
    ctx.restore();
    strokeRounded(ctx, 20, 20, 960, 585, 15, "#555d60", 1.5);

    const logo = await loadAny(
      "./src/assets/images/icons/other/knock-knock.webp",
    );
    if (logo) drawContain(ctx, logo, 35, 31, 42, 42);
    ctx.font = `bold 24px ${font}`;
    ctx.fillStyle = "#f1f3f3";
    ctx.textAlign = "left";
    ctx.fillText("Knock Knock", 87, 60);

    fillRounded(ctx, 923, 38, 40, 30, 8, "#191c1e");
    ctx.strokeStyle = "#dfe3e4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(937, 47);
    ctx.lineTo(949, 59);
    ctx.moveTo(949, 47);
    ctx.lineTo(937, 59);
    ctx.stroke();

    await drawContactRail(ctx, characters, font, T);
    await drawProfileBody(ctx, font, userData, record, T);
    return canvas.toBuffer("image/png");
  } catch (error) {
    console.error("Error generating Knock Knock main profile:", error);
    return null;
  }
}
