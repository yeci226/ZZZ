import {
  createCanvas,
  GlobalFonts,
  Image,
  loadImage,
  SKRSContext2D,
} from "@napi-rs/canvas";
import { join } from "node:path";
import fetch from "node-fetch";
import {
  downloadPaintingCache,
  getLocalWikiPaintings,
  loadWikiIndex,
  paintingIndexForRank,
} from "./autoDownloadIcons.js";
import { getElementIconPath } from "./elements.js";

const W = 1000;
const H = 625;
const PAPER = "#e9e5da";
const PAPER_2 = "#f7f3e8";
const INK = "#0b0c0d";
const INK_2 = "#191c1e";
const DISC_BG = "#24282a";
const DISC_SUB = "#151719";
const MUTED = "#9ea2a3";
const ORANGE = "#ff9b45";

const fontPaths: Array<[string, string]> = [
  ["en-us.ttf", "EN"],
  ["zh-tw.ttf", "TW"],
  ["zh-cn.ttf", "CN"],
  ["vi-vn.ttf", "VI"],
  ["ja-jp.ttf", "JP"],
  ["ko-kr.ttf", "KR"],
  ["fr-fr.ttf", "FR"],
  ["impact.ttf", "Impact"],
  ["Nunito-BlackItalic.ttf", "Nunito"],
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
const NUM_FONT = "Nunito";

const specialCharacters: Record<
  string,
  { title?: "VoidHunter" | "GrandMaster"; element?: string }
> = {
  "1091": { title: "VoidHunter", element: "frost" },
  "1371": { title: "GrandMaster", element: "auricink" },
  "1431": { title: "VoidHunter", element: "honededge" },
};

const professionIcons: Record<number, string> = {
  1: "attack",
  2: "stun",
  3: "anomaly",
  4: "support",
  5: "defense",
  6: "rupture",
};

const propertyIcons: Record<number, string> = {
  1: "hp",
  2: "atk",
  3: "def",
  4: "stun",
  5: "crit",
  6: "critdmg",
  7: "power",
  8: "mystery",
  9: "penratio",
  10: "sprecover",
  11: "penvalue",
  12: "physic",
  13: "fire",
  14: "ice",
  15: "thunder",
  16: "ether",
  19: "perforation",
  20: "energyaccumulation",
  11102: "hp",
  11103: "hp",
  12101: "atk",
  12102: "atk",
  12103: "atk",
  12202: "stun",
  13102: "def",
  13103: "def",
  20103: "crit",
  21103: "critdmg",
  23103: "penratio",
  23203: "penvalue",
  30502: "sprecover",
  31203: "mystery",
  31402: "power",
  31503: "physic",
  31603: "fire",
  31703: "ice",
  31803: "thunder",
  31903: "ether",
};

function safeAccent(raw: unknown, elementType: number): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (/^#[0-9a-f]{6}$/iu.test(value) && value.toLowerCase() !== "#000000") {
    return value;
  }
  return (
    {
      200: "#b6b8bc",
      201: "#bd4f37",
      202: "#05777a",
      203: "#c99821",
      205: "#8d55bb",
    }[elementType] ?? "#05777a"
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function mix(hex: string, target: "white" | "black", amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = target === "white" ? 255 : 0;
  const p = Math.max(0, Math.min(1, amount));
  return `rgb(${Math.round(r + (t - r) * p)},${Math.round(g + (t - g) * p)},${Math.round(b + (t - b) * p)})`;
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

function polygon(
  ctx: SKRSContext2D,
  points: Array<[number, number]>,
  fill: string,
) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokePolygon(
  ctx: SKRSContext2D,
  points: Array<[number, number]>,
  color: string,
  width = 1,
) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function fitText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  initialSize: number,
  minSize: number,
  font: string,
  weight = "bold",
): number {
  let size = initialSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
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

function cleanRichText(value: unknown): string {
  return String(value ?? "")
    .replace(/<color=#[0-9a-f]{6}>/giu, "")
    .replace(/<\/color>/giu, "")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/\\n/gu, "\n")
    .trim();
}

function formatStatValue(value: unknown): string {
  const text = String(value ?? "");
  return /^\d{4,}$/u.test(text) ? Number(text).toLocaleString("en-US") : text;
}

function wrapCharacters(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const char of text) {
    if (char === "\n") {
      lines.push(line);
      line = "";
      if (lines.length >= maxLines) break;
      continue;
    }
    if (ctx.measureText(line + char).width > maxWidth && line) {
      lines.push(line);
      line = char;
      if (lines.length >= maxLines) break;
    } else {
      line += char;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    const sourceLength = lines.join("").length;
    if (sourceLength < text.replace(/\n/gu, "").length) {
      let last = lines[maxLines - 1] ?? "";
      while (last && ctx.measureText(`${last}…`).width > maxWidth)
        last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

function drawSectionMark(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  label: string,
  color: string,
  font: string,
  darkText = false,
) {
  polygon(
    ctx,
    [
      [x, y - 13],
      [x + 8, y - 13],
      [x + 4, y + 3],
      [x - 4, y + 3],
    ],
    color,
  );
  ctx.font = `bold 14px ${font}`;
  ctx.fillStyle = darkText ? INK : PAPER;
  ctx.textAlign = "left";
  ctx.fillText(label, x + 13, y);
}

function drawContain(
  ctx: SKRSContext2D,
  image: Image,
  x: number,
  y: number,
  width: number,
  height: number,
  scale = 1,
) {
  const ratio = Math.min(width / image.width, height / image.height) * scale;
  const drawW = image.width * ratio;
  const drawH = image.height * ratio;
  ctx.drawImage(
    image,
    x + (width - drawW) / 2,
    y + (height - drawH) / 2,
    drawW,
    drawH,
  );
}

function drawCover(
  ctx: SKRSContext2D,
  image: Image,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const ratio = Math.max(width / image.width, height / image.height);
  const drawW = image.width * ratio;
  const drawH = image.height * ratio;
  ctx.drawImage(
    image,
    x + (width - drawW) / 2,
    y + (height - drawH) / 2,
    drawW,
    drawH,
  );
}

function rarityGrade(value: unknown): "S" | "A" | "B" | "C" {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "5" || raw === "S") return "S";
  if (raw === "4" || raw === "A") return "A";
  if (raw === "3" || raw === "B") return "B";
  return "C";
}

function propIconPath(propertyId: unknown): string | null {
  const key = propertyIcons[Number(propertyId)];
  return key ? `./src/assets/images/icons/property/${key}.png` : null;
}

const wikiHeaders = {
  "x-rpc-wiki_app": "zzz",
  "x-rpc-language": "zh-tw",
  Referer: "https://wiki.hoyolab.com/",
  Origin: "https://wiki.hoyolab.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

async function findWikiEntry(keyword: string): Promise<string | null> {
  const clean = keyword.replace(/[「」]/gu, "");
  try {
    const index = loadWikiIndex();
    if (index[clean]) return String(index[clean]);
    const match = Object.entries(index).find(
      ([name]) => name.includes(clean) || clean.includes(name),
    );
    if (match) return String(match[1]);
  } catch {
    // Remote lookup below remains available.
  }
  try {
    const response = await fetch(
      `https://sg-wiki-api.hoyolab.com/hoyowiki/zzz/wapi/search?keyword=${encodeURIComponent(clean)}`,
      { headers: wikiHeaders },
    );
    const body: any = await response.json();
    const list = body?.data?.list ?? [];
    const entry =
      list.find((item: any) => item.name === clean) ??
      list.find((item: any) => item.name?.includes(clean)) ??
      list[0];
    return entry ? String(entry.entry_page_id ?? entry.id) : null;
  } catch {
    return null;
  }
}

async function getWikiPaintings(entryId: string): Promise<string[]> {
  const local = getLocalWikiPaintings(entryId);
  if (local.length > 0) return local;
  try {
    const response = await fetch(
      `https://sg-wiki-api.hoyolab.com/hoyowiki/zzz/wapi/entry_page?entry_page_id=${entryId}&lang=zh-tw`,
      { headers: wikiHeaders },
    );
    const body: any = await response.json();
    const modules: any[] = body?.data?.page?.modules ?? [];
    const paintingModule = modules.find((module) => String(module.id) === "4");
    const raw = paintingModule?.components?.[0]?.data;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return (parsed?.img_list ?? [])
      .map((item: any) => item.icon_url)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function choosePortrait(
  character: any,
  usePainting: boolean,
  rankDependentPainting: boolean,
): Promise<Image | null> {
  let source =
    character.role_vertical_painting_url ||
    `https://act-webstatic.hoyoverse.com/game_record/zzz/role_vertical_painting/role_vertical_painting_${character.id}.png`;

  if (!usePainting) {
    const skin = (character.skin_list ?? []).find(
      (entry: any) => entry.unlocked && !entry.is_original,
    );
    if (skin?.skin_vertical_painting_url)
      source = skin.skin_vertical_painting_url;
  } else {
    const name =
      character.name_mi18n ?? character.full_name_mi18n ?? character.name ?? "";
    try {
      const entryId = name ? await findWikiEntry(name) : null;
      if (entryId) {
        const paths = await getWikiPaintings(entryId);
        const index = rankDependentPainting
          ? paintingIndexForRank(Number(character.rank ?? 0))
          : 0;
        source = paths[index ?? 0] ?? paths[0] ?? source;
      }
    } catch {
      // The official portrait remains the fallback.
    }
  }

  return loadAny(source);
}

async function drawIdentityAndStats(
  ctx: SKRSContext2D,
  character: any,
  portrait: Image | null,
  accent: string,
  accentLight: string,
  font: string,
  tr: (key: string, args?: any) => string,
) {
  const x = 14;
  const y = 14;
  const width = 272;
  const height = 597;
  const artHeight = 284;

  const outer = [
    [x, y],
    [x + width - 16, y],
    [x + width, y + 18],
    [x + width, y + height - 18],
    [x + width - 16, y + height],
    [x, y + height],
  ] as Array<[number, number]>;
  polygon(ctx, outer, PAPER);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (const [px, py] of outer.slice(1)) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, width, artHeight);
  polygon(
    ctx,
    [
      [x + width - 72, y - 8],
      [x + width + 4, y - 8],
      [x + width - 38, y + artHeight - 45],
      [x + width - 110, y + artHeight - 45],
    ],
    "rgba(233,229,218,0.9)",
  );
  if (portrait) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowOffsetX = 7;
    ctx.shadowOffsetY = 9;
    if (portrait.width / portrait.height > 1.1) {
      drawCover(ctx, portrait, x, y, width, artHeight);
    } else {
      drawContain(ctx, portrait, x, y - 10, width, artHeight + 16, 1.04);
    }
    ctx.restore();
  }
  ctx.restore();

  const name =
    character.full_name_mi18n ??
    character.name_mi18n ??
    character.name ??
    "Unknown";
  const rarity = rarityGrade(character.rarity);
  const special = specialCharacters[String(character.id)];
  const specialLabel = special?.title ? tr(special.title) : "";
  const nameSize = fitText(ctx, name, 118, 21, 15, font);
  ctx.font = `bold ${nameSize}px ${font}`;
  const nameWidth = ctx.measureText(name).width;
  const raritySize = 24;
  const gap = 7;
  let rowWidth = nameWidth + gap + raritySize;
  if (specialLabel) {
    ctx.font = `bold 9px ${font}`;
    rowWidth += gap + 20 + 3 + ctx.measureText(specialLabel).width;
  }
  const cover = Math.min(rowWidth + 26, width - 28);
  const overlayTop = y + 210;
  polygon(
    ctx,
    [
      [x, overlayTop],
      [x + Math.max(20, cover - 8), overlayTop],
      [x + width, overlayTop + 33],
      [x + width, y + artHeight],
      [x, y + artHeight],
    ],
    INK,
  );

  const nameX = x + 12;
  const nameY = y + 241;
  ctx.font = `bold ${nameSize}px ${font}`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(name, nameX, nameY);
  let itemX = nameX + nameWidth + gap;
  const rarityImage = await loadAny(
    `./src/assets/images/icons/rank/Rarity_${rarity}.png`,
  );
  if (rarityImage)
    ctx.drawImage(rarityImage, itemX, nameY - 21, raritySize, raritySize);
  itemX += raritySize + gap;

  if (special?.title) {
    const titleFile =
      special.title === "GrandMaster" ? "Grandmaster" : special.title;
    const titleImage = await loadAny(
      `./src/assets/images/icons/other/${titleFile}.png`,
    );
    if (titleImage) ctx.drawImage(titleImage, itemX, nameY - 19, 20, 20);
    itemX += 23;
    ctx.font = `bold 9px ${font}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(specialLabel, itemX, nameY - 5);
  }

  const metaY = y + 266;
  const specialElement = special?.element;
  const elementImage = await loadAny(
    specialElement
      ? `./src/assets/images/icons/element/${specialElement}.webp`
      : getElementIconPath(Number(character.element_type)),
  );
  const professionImage = await loadAny(
    `./src/assets/images/icons/profession/${professionIcons[Number(character.avatar_profession)]}.webp`,
  );
  const groupImage = await loadAny(character.group_icon_path);
  let metaX = nameX;
  for (const [image, size] of [
    [elementImage, 18],
    [professionImage, 18],
    [groupImage, 22],
  ] as Array<[Image | null, number]>) {
    if (image) ctx.drawImage(image, metaX, metaY - size + 2, size, size);
    metaX += size + 4;
  }
  ctx.font = `bold 6.5px ${font}`;
  ctx.fillStyle = "#e8e4da";
  const camp = truncate(ctx, character.camp_name_mi18n ?? "", 66);
  ctx.fillText(camp, metaX, metaY - 4);

  const numberY = y + 255;
  const numberWidth = 38;
  const numberGap = 4;
  const rankX = x + width - 12 - numberWidth;
  const levelX = rankX - numberGap - numberWidth;
  for (const [label, value, bx] of [
    ["等級", character.level ?? "?", levelX],
    ["影畫", character.rank ?? 0, rankX],
  ] as Array<[string, unknown, number]>) {
    ctx.fillStyle = accentLight;
    ctx.fillRect(bx, numberY - 6, 2, 28);
    ctx.font = `bold 7px ${font}`;
    ctx.fillStyle = "#bbb7ae";
    ctx.fillText(label, bx + 6, numberY);
    ctx.font = `900 italic 21px ${NUM_FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(value), bx + 6, numberY + 21);
  }

  const statsX = x + 10;
  const statsY = y + artHeight + 24;
  drawSectionMark(ctx, statsX + 4, statsY + 1, "角色屬性", accent, font, true);
  const preferredPropertyOrder = [1, 2, 3, 4, 5, 6, 8, 7, 9, 10];
  const allProps = [...(character.properties ?? [])];
  const props = [
    ...preferredPropertyOrder
      .map((propertyId) =>
        allProps.find((prop: any) => Number(prop.property_id) === propertyId),
      )
      .filter(Boolean),
    ...allProps.filter(
      (prop: any) => !preferredPropertyOrder.includes(Number(prop.property_id)),
    ),
  ].slice(0, 10);
  const gridY = statsY + 17;
  const colGap = 10;
  const colWidth = (width - 20 - colGap) / 2;
  const rowHeight = 53;
  const highlightIds = new Set([2, 5, 6, 9]);
  for (let index = 0; index < 10; index += 1) {
    const prop = props[index];
    if (!prop) continue;
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cellX = statsX + col * (colWidth + colGap);
    const cellY = gridY + row * rowHeight;
    ctx.strokeStyle = "#c5c0b5";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cellX, cellY + rowHeight - 5);
    ctx.lineTo(cellX + colWidth, cellY + rowHeight - 5);
    ctx.stroke();
    const icon = await loadAny(propIconPath(prop.property_id));
    if (icon) {
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.drawImage(icon, cellX, cellY + 5, 14, 14);
      ctx.restore();
    }
    ctx.font = `bold 9px ${font}`;
    ctx.fillStyle = "#505356";
    ctx.fillText(prop.property_name ?? "", cellX + 18, cellY + 16);
    ctx.font = `900 italic 15px ${NUM_FONT}`;
    ctx.fillStyle = highlightIds.has(Number(prop.property_id)) ? accent : INK;
    ctx.fillText(
      formatStatValue(prop.final ?? prop.base ?? ""),
      cellX,
      cellY + 36,
    );
  }
}

async function drawSkills(
  ctx: SKRSContext2D,
  character: any,
  accent: string,
  accentLight: string,
  font: string,
) {
  const x = 304;
  const y = 14;
  const width = 682;
  const height = 78;
  const shape = [
    [x, y],
    [x + width - 18, y],
    [x + width, y + 18],
    [x + width, y + height],
    [x + 10, y + height],
    [x, y + height - 10],
  ] as Array<[number, number]>;
  polygon(ctx, shape, INK_2);
  strokePolygon(ctx, shape, PAPER, 2);
  ctx.fillStyle = accent;
  ctx.fillRect(x + 12, y + 7, 4, 15);
  ctx.font = `bold 13px ${font}`;
  ctx.fillStyle = PAPER;
  ctx.fillText("技能", x + 22, y + 20);

  const order = [0, 2, 5, 1, 3, 4];
  const labels = ["普通攻擊", "特殊技", "閃避", "連攜技", "支援技", "核心技"];
  const coreMap: Record<number, string> = {
    1: "X",
    2: "A",
    3: "B",
    4: "C",
    5: "D",
    6: "E",
    7: "F",
  };
  const skills = character.skills ?? [];
  const startX = x + 10;
  const itemY = y + 29;
  const itemWidth = (width - 20) / 6;
  const maxLevel =
    12 +
    (Number(character.rank ?? 0) >= 3 ? 2 : 0) +
    (Number(character.rank ?? 0) >= 5 ? 2 : 0);
  for (let index = 0; index < 6; index += 1) {
    const sourceIndex = order[index]!;
    const skill = skills[sourceIndex];
    const itemX = startX + itemWidth * index;
    if (index > 0) {
      ctx.fillStyle = "#34383a";
      ctx.fillRect(itemX, itemY - 1, 1, 40);
    }
    const icon = await loadAny(
      `./src/assets/images/icons/skills/${skill?.skill_type ?? sourceIndex}.png`,
    );
    if (icon) ctx.drawImage(icon, itemX + 6, itemY + 4, 27, 27);
    const isCore = index === 5;
    const levelText = isCore
      ? (coreMap[Number(skill?.level)] ?? String(skill?.level ?? "?"))
      : String(skill?.level ?? "?");
    const isMax = isCore
      ? levelText === "F"
      : Number(skill?.level ?? 0) >= maxLevel;
    ctx.font = `bold 7px ${font}`;
    ctx.fillStyle = "#aeb2b2";
    ctx.fillText(labels[index]!, itemX + 39, itemY + 13);
    ctx.font = `900 italic 15px ${NUM_FONT}`;
    ctx.fillStyle = isMax ? accentLight : "#ffffff";
    ctx.fillText(levelText, itemX + 39, itemY + 31);
  }
}

async function drawWeapon(
  ctx: SKRSContext2D,
  character: any,
  accent: string,
  font: string,
) {
  const x = 304;
  const y = 100;
  const width = 682;
  const height = 140;
  const shape = [
    [x, y],
    [x + width - 12, y],
    [x + width, y + 14],
    [x + width, y + height],
    [x + 12, y + height],
    [x, y + height - 12],
  ] as Array<[number, number]>;
  polygon(ctx, shape, PAPER);
  strokePolygon(ctx, shape, INK, 2);
  drawSectionMark(ctx, x + 16, y + 24, "音擎", accent, font, true);

  const weapon = character.weapon;
  if (!weapon) {
    ctx.font = `bold 24px ${font}`;
    ctx.fillStyle = "#8a877f";
    ctx.textAlign = "center";
    ctx.fillText("未裝備音擎", x + width / 2, y + 86);
    return;
  }

  const iconX = x + 18;
  const iconY = y + 45;
  const weaponImage = await loadAny(weapon.icon);
  ctx.fillStyle = mix(accent, "white", 0.5);
  ctx.fillRect(iconX, iconY, 64, 64);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(iconX, iconY, 64, 64);
  if (weaponImage) drawContain(ctx, weaponImage, iconX, iconY, 64, 64, 0.95);
  const refine = Math.max(1, Math.min(5, Number(weapon.star ?? 1)));
  const refineImage = await loadAny(
    `./src/assets/images/icons/weapon/role-star-${refine}.png`,
  );
  if (refineImage) drawContain(ctx, refineImage, iconX, iconY + 63, 64, 20, 1);

  const infoX = x + 100;
  const infoWidth = 238;
  const name = String(weapon.name ?? "");
  const nameSize = fitText(ctx, name, infoWidth - 34, 17, 12, font);
  ctx.font = `bold ${nameSize}px ${font}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.fillText(name, infoX, y + 62);
  const nameWidth = ctx.measureText(name).width;
  const rarity = await loadAny(
    `./src/assets/images/icons/rank/Rarity_${rarityGrade(weapon.rarity)}.png`,
  );
  if (rarity) ctx.drawImage(rarity, infoX + nameWidth + 7, y + 46, 18, 18);

  const detailY = y + 76;
  const detailH = 45;
  ctx.fillStyle = INK;
  ctx.fillRect(infoX + 62, detailY, 2, detailH);
  ctx.font = `bold 7px ${font}`;
  ctx.fillStyle = "#606365";
  ctx.fillText("等級", infoX, detailY + 10);
  ctx.font = `900 italic 25px ${NUM_FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText(String(weapon.level ?? "?"), infoX, detailY + 35);

  const weaponProps = [
    ...(weapon.main_properties ?? []),
    ...(weapon.properties ?? []),
  ].slice(0, 2);
  const propStartX = infoX + 73;
  const propWidth = (infoWidth - 73) / 2;
  for (let index = 0; index < 2; index += 1) {
    const prop = weaponProps[index];
    if (!prop) continue;
    const px = propStartX + index * propWidth;
    if (index > 0) {
      ctx.fillStyle = "#aaa59b";
      ctx.fillRect(px, detailY + 4, 1, detailH - 8);
    }
    const propImage = await loadAny(propIconPath(prop.property_id));
    if (propImage) {
      ctx.fillStyle = INK;
      ctx.fillRect(px + 6, detailY + 4, 18, 18);
      ctx.drawImage(propImage, px + 8, detailY + 6, 14, 14);
    }
    ctx.font = `bold 7px ${font}`;
    ctx.fillStyle = "#606365";
    ctx.fillText(
      truncate(ctx, prop.property_name ?? "", propWidth - 34),
      px + 28,
      detailY + 16,
    );
    ctx.font = `900 italic 12px ${NUM_FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(String(prop.base ?? prop.final ?? ""), px + 28, detailY + 34);
  }

  const effectX = x + 350;
  ctx.fillStyle = INK;
  ctx.fillRect(effectX, y + 44, 2, 88);
  ctx.font = `bold 14px ${font}`;
  ctx.fillStyle = accent;
  ctx.fillText(String(weapon.talent_title ?? ""), effectX + 13, y + 68);
  ctx.font = `bold 9.5px ${font}`;
  ctx.fillStyle = "#343638";
  const lines = wrapCharacters(
    ctx,
    cleanRichText(weapon.talent_content),
    width - (effectX - x) - 30,
    4,
  );
  lines.forEach((line, index) => {
    ctx.fillText(line, effectX + 13, y + 86 + index * 13);
  });
}

function validRolls(disc: any): number {
  return (disc?.properties ?? []).reduce(
    (total: number, prop: any) =>
      total + (prop.valid ? 1 + Number(prop.add ?? 0) : 0),
    0,
  );
}

async function drawDisc(
  ctx: SKRSContext2D,
  disc: any,
  slot: number,
  x: number,
  y: number,
  width: number,
  height: number,
  accent: string,
  accentLight: string,
  font: string,
) {
  ctx.fillStyle = DISC_BG;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#414749";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  if (!disc?.id) {
    ctx.font = `bold 11px ${font}`;
    ctx.fillStyle = "#777c7e";
    ctx.textAlign = "center";
    ctx.fillText(`槽位 ${slot}・未裝備`, x + width / 2, y + height / 2 + 4);
    return;
  }

  const discImage = await loadAny(
    `./src/assets/images/icons/diskdrives/${String(disc.id).slice(0, 3)}_${disc.rarity}.webp`,
  );
  if (discImage) ctx.drawImage(discImage, x + 7, y + 5, 36, 36);
  ctx.font = `bold 9px ${font}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "#b9bdbd";
  ctx.fillText(`⓪①②③④⑤⑥`[slot] ?? String(slot), x + width - 7, y + 15);
  ctx.font = `900 italic 9px ${NUM_FONT}`;
  ctx.fillText(`+${disc.level ?? 0}`, x + width - 7, y + 25);
  ctx.font = `bold 7px ${font}`;
  ctx.fillStyle = accentLight;
  ctx.fillText(`有效詞條 ${validRolls(disc)}`, x + width - 7, y + 36);

  const main = disc.main_properties?.[0];
  if (main) {
    const icon = await loadAny(propIconPath(main.property_id));
    if (icon) ctx.drawImage(icon, x + 48, y + 12, 14, 14);
    ctx.font = `bold 13px ${font}`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    const mainText = `${main.property_name ?? ""} ${main.base ?? ""}`;
    ctx.fillText(truncate(ctx, mainText, width - 107), x + 65, y + 25);
  }

  const subProps = (disc.properties ?? []).slice(0, 4);
  const subY = y + 52;
  const subGapX = 5;
  const subGapY = 4;
  const subWidth = (width - 14 - subGapX) / 2;
  const subHeight = 20;
  for (let index = 0; index < 4; index += 1) {
    const prop = subProps[index];
    if (!prop) continue;
    const col = index % 2;
    const row = Math.floor(index / 2);
    const sx = x + 7 + col * (subWidth + subGapX);
    const sy = subY + row * (subHeight + subGapY);
    ctx.fillStyle = DISC_SUB;
    ctx.fillRect(sx, sy, subWidth, subHeight);
    if (prop.valid) {
      ctx.fillStyle = accent;
      ctx.fillRect(sx, sy, 2, subHeight);
    }
    const icon = await loadAny(propIconPath(prop.property_id));
    if (icon) ctx.drawImage(icon, sx + 3, sy + 4, 11, 11);
    const add = Number(prop.add ?? 0);
    const addText = add > 0 ? `+${add}` : "";
    ctx.font = `bold 7.5px ${font}`;
    const addWidth = addText ? ctx.measureText(addText).width + 5 : 0;
    ctx.fillStyle = prop.valid ? accentLight : MUTED;
    ctx.textAlign = "left";
    const text = `${prop.property_name ?? ""} ${prop.base ?? ""}`;
    ctx.fillText(
      truncate(ctx, text, subWidth - 20 - addWidth),
      sx + 16,
      sy + 13,
    );
    if (addText) {
      ctx.fillStyle = "#3b2b20";
      ctx.fillRect(sx + subWidth - addWidth, sy + 3, addWidth, 14);
      ctx.font = `900 italic 7px ${NUM_FONT}`;
      ctx.fillStyle = ORANGE;
      ctx.fillText(addText, sx + subWidth - addWidth + 2, sy + 13);
    }
  }
}

type DiscSet = {
  count: number;
  name: string;
  desc1: string;
  desc2: string;
  iconSource: string;
};

function collectSets(discs: any[]): DiscSet[] {
  const sets = new Map<string, DiscSet>();
  for (const disc of discs) {
    if (!disc?.id) continue;
    const key = String(disc.equip_suit?.suit_id ?? String(disc.id).slice(0, 3));
    const current = sets.get(key) ?? {
      count: 0,
      name: String(disc.equip_suit?.name ?? disc.name ?? ""),
      desc1: String(disc.equip_suit?.desc1 ?? ""),
      desc2: String(disc.equip_suit?.desc2 ?? ""),
      iconSource: `./src/assets/images/icons/diskdrives/${String(disc.id).slice(0, 3)}_${disc.rarity}.webp`,
    };
    current.count += 1;
    sets.set(key, current);
  }
  return [...sets.values()].filter((set) => set.count >= 2);
}

async function drawSetCard(
  ctx: SKRSContext2D,
  set: DiscSet,
  x: number,
  y: number,
  width: number,
  height: number,
  accent: string,
  font: string,
) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 4, height);
  const icon = await loadAny(set.iconSource);
  ctx.fillStyle = INK;
  ctx.fillRect(x + 10, y + 12, 44, 44);
  if (icon) ctx.drawImage(icon, x + 11, y + 13, 42, 42);
  ctx.font = `bold 12px ${font}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.fillText(truncate(ctx, set.name, width - 72), x + 62, y + 24);
  ctx.font = `bold 7.5px ${font}`;
  const descX = x + 62;
  const maxWidth = width - 72;
  const line1 = `二件套：${cleanRichText(set.desc1)}`;
  const lines1 = wrapCharacters(ctx, line1, maxWidth, set.count >= 4 ? 1 : 3);
  ctx.fillStyle = "#3e4142";
  lines1.forEach((line, index) =>
    ctx.fillText(line, descX, y + 38 + index * 9),
  );
  if (set.count >= 4) {
    const line2 = `四件套：${cleanRichText(set.desc2)}`;
    const lines2 = wrapCharacters(ctx, line2, maxWidth, 3);
    lines2.forEach((line, index) =>
      ctx.fillText(line, descX, y + 48 + index * 9),
    );
  }
}

async function drawDiscs(
  ctx: SKRSContext2D,
  character: any,
  accent: string,
  accentLight: string,
  font: string,
) {
  const x = 304;
  const y = 248;
  const width = 682;
  const height = 363;
  const shape = [
    [x, y + 13],
    [x + 13, y],
    [x + width, y],
    [x + width, y + height - 10],
    [x + width - 12, y + height],
    [x, y + height],
  ] as Array<[number, number]>;
  polygon(ctx, shape, INK_2);
  strokePolygon(ctx, shape, PAPER, 2);
  drawSectionMark(ctx, x + 16, y + 30, "驅動盤", accent, font);

  const discs = [...(character.equip ?? [])].sort(
    (a: any, b: any) => Number(a.equipment_type) - Number(b.equipment_type),
  );
  const slots = Array.from({ length: 6 }, (_, index) =>
    discs.find((disc: any) => Number(disc.equipment_type) === index + 1),
  );
  const total = slots.reduce((sum, disc) => sum + validRolls(disc), 0);
  ctx.font = `bold 8px ${font}`;
  ctx.fillStyle = "#b9bdbd";
  ctx.textAlign = "right";
  ctx.fillText("總有效詞條數", x + width - 42, y + 29);
  ctx.font = `900 italic 21px ${NUM_FONT}`;
  ctx.fillStyle = accentLight;
  ctx.fillText(String(total), x + width - 12, y + 31);

  const gridX = x + 12;
  const gridY = y + 42;
  const gap = 6;
  const cellWidth = (width - 24 - gap * 2) / 3;
  const cellHeight = 104;
  for (let index = 0; index < 6; index += 1) {
    const col = index % 3;
    const row = Math.floor(index / 3);
    await drawDisc(
      ctx,
      slots[index],
      index + 1,
      gridX + col * (cellWidth + gap),
      gridY + row * (cellHeight + gap),
      cellWidth,
      cellHeight,
      accent,
      accentLight,
      font,
    );
  }

  const setY = gridY + cellHeight * 2 + gap + 7;
  const setHeight = y + height - 17 - setY;
  const sets = collectSets(slots);
  if (sets.length === 0) return;
  if (sets.length === 2 && sets.some((set) => set.count >= 4)) {
    const four = sets.find((set) => set.count >= 4)!;
    const two = sets.find((set) => set !== four)!;
    const wide = (width - 24 - gap) * (2 / 3);
    await drawSetCard(ctx, four, gridX, setY, wide, setHeight, accent, font);
    await drawSetCard(
      ctx,
      two,
      gridX + wide + gap,
      setY,
      width - 24 - gap - wide,
      setHeight,
      accent,
      font,
    );
    return;
  }
  const cardWidth = (width - 24 - gap * (sets.length - 1)) / sets.length;
  for (let index = 0; index < sets.length; index += 1) {
    await drawSetCard(
      ctx,
      sets[index]!,
      gridX + index * (cardWidth + gap),
      setY,
      cardWidth,
      setHeight,
      accent,
      font,
    );
  }
}

export async function drawOfficialCharacterProfile(
  tr: (key: string, args?: any) => string,
  userLocale: string,
  uid: string,
  characterDataInput: any,
  usePainting = false,
  rankDependentPainting = false,
): Promise<Buffer | null> {
  try {
    const character = Array.isArray(characterDataInput)
      ? characterDataInput[0]
      : characterDataInput;
    if (!character) return null;
    const font = fonts[userLocale] ?? fonts.default;
    const accent = safeAccent(
      character.vertical_painting_color,
      Number(character.element_type),
    );
    const accentLight = mix(accent, "white", 0.52);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#111416";
    ctx.fillRect(0, 0, W, H);
    const background = await loadAny("./src/assets/images/profileBgDark.png");
    if (background) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      drawCover(ctx, background, 0, 0, W, H);
      ctx.restore();
    }

    const portrait = await choosePortrait(
      character,
      usePainting,
      rankDependentPainting,
    );
    await drawIdentityAndStats(
      ctx,
      character,
      portrait,
      accent,
      accentLight,
      font,
      tr,
    );

    ctx.save();
    ctx.globalAlpha = 0.2;
    for (let y = 0; y < H; y += 12) {
      for (let x = 281 + (Math.floor(y / 12) % 2) * 5; x < 291; x += 10) {
        ctx.fillStyle =
          (Math.floor(y / 12) + Math.floor(x / 10)) % 2 ? PAPER : INK;
        ctx.fillRect(x, y, 5, 6);
      }
    }
    ctx.restore();

    await drawSkills(ctx, character, accent, accentLight, font);
    await drawWeapon(ctx, character, accent, font);
    await drawDiscs(ctx, character, accent, accentLight, font);

    ctx.font = `900 italic 8px ${NUM_FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.textAlign = "right";
    ctx.fillText(`UID ${uid}`, W - 17, H - 4);
    return canvas.toBuffer("image/png");
  } catch (error) {
    console.error("Error generating official character profile:", error);
    return null;
  }
}
