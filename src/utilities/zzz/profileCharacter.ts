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
  getFacePos,
  getLocalWikiPaintings,
  loadWikiIndex,
} from "./autoDownloadIcons.js";
import { getElementIconPath } from "./elements.js";
import { resolveProfileFont } from "./profileLocale.js";
import {
  getMindscapeComposition,
  getPaintingSelectionRank,
} from "./mindscapeComposition.js";
import {
  countEffectiveRolls,
  getCharacterEffectiveSystemIds,
  isCharacterEffectiveProperty,
  isEffectiveProperty,
} from "./profileRolls.js";
import { getPaperAccent } from "./profileColors.js";
import { getFlatSuitIcon } from "./profileSuitIcons.js";

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

const NUM_FONT = "Nunito";

type CharacterText = {
  level: string;
  cinema: string;
  agentStats: string;
  skills: string;
  skillLabels: [string, string, string, string, string, string];
  wEngine: string;
  noWEngine: string;
  slotUnequipped: (slot: number) => string;
  validRolls: string;
  twoPiece: string;
  fourPiece: string;
  driveDiscs: string;
  totalValidRolls: string;
};

function getCharacterText(
  tr: (key: string, args?: any) => string,
): CharacterText {
  return {
    level: tr("profileCharacter_Level") || "Level",
    cinema: tr("profileCharacter_Cinema") || "Cinema",
    agentStats: tr("profileCharacter_AgentStats") || "Agent Stats",
    skills: tr("profileCharacter_Skills") || "Skills",
    skillLabels: [
      tr("profileCharacter_BasicAttack") || "Basic Attack",
      tr("profileCharacter_SpecialAttack") || "Special Attack",
      tr("profileCharacter_Dodge") || "Dodge",
      tr("profileCharacter_ChainAttack") || "Chain Attack",
      tr("profileCharacter_Assist") || "Assist",
      tr("profileCharacter_CoreSkill") || "Core Skill",
    ],
    wEngine: tr("profileCharacter_WEngine") || "W-Engine",
    noWEngine: tr("profileCharacter_NoWEngine") || "No W-Engine Equipped",
    slotUnequipped: (slot) =>
      tr("profileCharacter_SlotUnequipped", { slot }) ||
      `Slot ${slot} · Not Equipped`,
    validRolls: tr("profileCharacter_ValidRolls") || "Valid Rolls",
    twoPiece: tr("profileCharacter_TwoPiece") || "2-Pc",
    fourPiece: tr("profileCharacter_FourPiece") || "4-Pc",
    driveDiscs: tr("profileCharacter_DriveDiscs") || "Drive Discs",
    totalValidRolls:
      tr("profileCharacter_TotalValidRolls") || "Total Valid Rolls",
  };
}

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

function truncateToCharacters(value: unknown, maxCharacters: number): string {
  const text = String(value ?? "");
  const characters = Array.from(text);
  return characters.length > maxCharacters
    ? `${characters.slice(0, maxCharacters).join("")}…`
    : text;
}

type RichGlyph = { char: string; color: string };

function parseRichGlyphs(
  value: unknown,
  defaultColor: string,
  resolveColor: (color: string) => string,
): RichGlyph[] {
  const source = String(value ?? "")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/\\n/gu, "\n");
  const colors = [defaultColor];
  const glyphs: RichGlyph[] = [];
  const tokens = source.match(
    /<color=(#[0-9a-f]{6})>|<span\s+style=["'][^"']*color:\s*(#[0-9a-f]{3,6})[^"']*["']>|<\/color>|<\/span>|<[^>]*>|[^<]+/giu,
  );
  for (const token of tokens ?? []) {
    const colorOpen = token.match(/^<color=(#[0-9a-f]{6})>$/iu);
    const spanOpen = token.match(
      /^<span\s+style=["'][^"']*color:\s*(#[0-9a-f]{3,6})[^"']*["']>$/iu,
    );
    const rawColor = colorOpen?.[1] ?? spanOpen?.[1];
    if (rawColor) {
      colors.push(resolveColor(rawColor));
      continue;
    }
    if (/^<\/(?:color|span)>$/iu.test(token)) {
      if (colors.length > 1) colors.pop();
      continue;
    }
    if (/^<[^>]*>$/u.test(token)) continue;
    for (const char of token) {
      glyphs.push({ char, color: colors.at(-1) ?? defaultColor });
    }
  }
  return glyphs;
}

function drawRichTextBlock(
  ctx: SKRSContext2D,
  value: unknown,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  lineHeight: number,
  defaultColor: string,
  resolveColor: (color: string) => string,
): number {
  const glyphs = parseRichGlyphs(value, defaultColor, resolveColor);
  const lines: RichGlyph[][] = [[]];
  const widths = [0];
  let truncated = false;
  for (let index = 0; index < glyphs.length; index += 1) {
    const glyph = glyphs[index]!;
    if (glyph.char === "\n") {
      if (lines.length >= maxLines) {
        truncated = index < glyphs.length - 1;
        break;
      }
      lines.push([]);
      widths.push(0);
      continue;
    }
    const charWidth = ctx.measureText(glyph.char).width;
    const lineIndex = lines.length - 1;
    if (
      (widths[lineIndex] ?? 0) + charWidth > maxWidth &&
      lines[lineIndex]!.length
    ) {
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
      lines.push([]);
      widths.push(0);
    }
    const target = lines.length - 1;
    lines[target]!.push(glyph);
    widths[target] = (widths[target] ?? 0) + charWidth;
  }
  if (truncated) {
    const last = lines.at(-1)!;
    const lastIndex = lines.length - 1;
    const ellipsisWidth = ctx.measureText("…").width;
    while (last.length && (widths[lastIndex] ?? 0) + ellipsisWidth > maxWidth) {
      const removed = last.pop()!;
      widths[lastIndex] =
        (widths[lastIndex] ?? 0) - ctx.measureText(removed.char).width;
    }
    last.push({ char: "…", color: defaultColor });
  }
  lines.forEach((line, lineIndex) => {
    let cursorX = x;
    let run = "";
    let runColor = line[0]?.color ?? defaultColor;
    const flush = () => {
      if (!run) return;
      ctx.fillStyle = runColor;
      ctx.fillText(run, cursorX, y + lineIndex * lineHeight);
      cursorX += ctx.measureText(run).width;
      run = "";
    };
    for (const glyph of line) {
      if (glyph.color !== runColor) {
        flush();
        runColor = glyph.color;
      }
      run += glyph.char;
    }
    flush();
  });
  return lines.length;
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

function isPeloyisCharacter(character: any): boolean {
  const id = Number(character?.id ?? character?.avatar_id ?? character?.agent_id);
  if (id === 1551) return true;
  return [
    character?.name,
    character?.name_mi18n,
    character?.name_cn,
    character?.name_tw,
    character?.name_en,
  ]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase()
    .includes("peloyis") || [
      character?.name,
      character?.name_mi18n,
      character?.name_cn,
      character?.name_tw,
      character?.name_en,
    ]
      .filter((value) => typeof value === "string")
      .join(" ")
      .includes("佩洛伊斯");
}

async function loadCharacterRarityIcon(character: any): Promise<Image | null> {
  const rarity = rarityGrade(character?.rarity);
  if (rarity === "S") {
    return loadAny("./src/assets/images/icons/rank/rarity-s-rank.png");
  }
  if (rarity === "A") {
    return loadAny(
      isPeloyisCharacter(character)
        ? "./src/assets/images/icons/rank/rarity-a-peloyis-special.png"
        : "./src/assets/images/icons/rank/rarity-a-peloyis.png",
    );
  }
  return null;
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

async function composeRankDependentPainting(
  entryId: string,
  paths: string[],
  rank: number,
  fallbackSource: string,
): Promise<any | null> {
  const [img0, rawImg1, rawImg2, fallback] = await Promise.all([
    paths[0] ? loadAny(paths[0]) : null,
    paths[1] ? loadAny(paths[1]) : null,
    paths[2] ? loadAny(paths[2]) : null,
    loadAny(fallbackSource),
  ]);
  const base0 = img0 ?? fallback;
  const base1 = rawImg1 ?? base0;
  const base2 = rawImg2 ?? base1;
  const images = [base0, base1, base2] as const;
  const reference = base0 ?? base1 ?? base2;
  if (!reference) return null;

  const width = reference.width;
  const height = reference.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const composition = getMindscapeComposition(rank);
  const base = images[composition.baseIndex] ?? reference;
  const overlay =
    composition.overlayIndex === undefined
      ? null
      : images[composition.overlayIndex];

  const drawCoverImage = (image: Image) => {
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.drawImage(
      image,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  };

  drawCoverImage(base);
  if (!overlay || !composition.clip) return canvas;

  const scale = Math.max(width / reference.width, height / reference.height);
  const drawWidth = reference.width * scale;
  const drawHeight = reference.height * scale;
  const sourceX = (width - drawWidth) / 2;
  const sourceY = (height - drawHeight) / 2;
  const { faceX, faceY } = getFacePos(entryId);
  const faceCanvasX = sourceX + faceX * drawWidth;
  const faceCanvasY = sourceY + faceY * drawHeight;

  const rotate = (vx: number, vy: number, angle: number) => ({
    x: vx * Math.cos(angle) - vy * Math.sin(angle),
    y: vx * Math.sin(angle) + vy * Math.cos(angle),
  });
  const edgePointFromFace = (dx: number, dy: number) => {
    const candidates: number[] = [];
    if (dx > 0) candidates.push((width - faceCanvasX) / dx);
    if (dx < 0) candidates.push((0 - faceCanvasX) / dx);
    if (dy > 0) candidates.push((height - faceCanvasY) / dy);
    if (dy < 0) candidates.push((0 - faceCanvasY) / dy);
    const distance = Math.min(...candidates.filter((value) => value > 0));
    return {
      x: faceCanvasX + dx * distance,
      y: faceCanvasY + dy * distance,
    };
  };
  const getFanGeometry = (halfAngleDeg: number, mouthWidth: number) => {
    let awayX = width / 2 - faceCanvasX;
    let awayY = height / 2 - faceCanvasY;
    let awayLength = Math.sqrt(awayX * awayX + awayY * awayY);
    if (awayLength < 1) {
      awayX = 1;
      awayY = 0;
      awayLength = 1;
    }
    const edgeCenter = edgePointFromFace(
      awayX / awayLength,
      awayY / awayLength,
    );
    const axisX = faceCanvasX - edgeCenter.x;
    const axisY = faceCanvasY - edgeCenter.y;
    const axisLength = Math.sqrt(axisX * axisX + axisY * axisY) || 1;
    const directionX = axisX / axisLength;
    const directionY = axisY / axisLength;
    const distance = Math.sqrt(width * width + height * height) * 2;
    const halfAngle = (halfAngleDeg * Math.PI) / 180;
    const normalX = -directionY;
    const normalY = directionX;
    const edgeDirectionA = rotate(directionX, directionY, halfAngle);
    const edgeDirectionB = rotate(directionX, directionY, -halfAngle);
    const halfMouth = mouthWidth / 2;
    const mouthCenter = {
      x: edgeCenter.x - directionX * Math.max(60, mouthWidth * 2),
      y: edgeCenter.y - directionY * Math.max(60, mouthWidth * 2),
    };
    const edgeA = {
      start: {
        x: mouthCenter.x + normalX * halfMouth,
        y: mouthCenter.y + normalY * halfMouth,
      },
      end: {
        x: edgeCenter.x + edgeDirectionA.x * distance,
        y: edgeCenter.y + edgeDirectionA.y * distance,
      },
    };
    const edgeB = {
      start: {
        x: mouthCenter.x - normalX * halfMouth,
        y: mouthCenter.y - normalY * halfMouth,
      },
      end: {
        x: edgeCenter.x + edgeDirectionB.x * distance,
        y: edgeCenter.y + edgeDirectionB.y * distance,
      },
    };
    const upperEdge =
      (edgeA.start.y + edgeA.end.y) / 2 <= (edgeB.start.y + edgeB.end.y) / 2
        ? edgeA
        : edgeB;
    return {
      edgeA,
      edgeB,
      upperEdge,
      lowerEdge: upperEdge === edgeA ? edgeB : edgeA,
    };
  };

  ctx.save();
  if (composition.clip === "face-fan") {
    const { edgeA, edgeB } = getFanGeometry(12, 28);
    ctx.beginPath();
    ctx.moveTo(edgeA.start.x, edgeA.start.y);
    ctx.lineTo(edgeA.end.x, edgeA.end.y);
    ctx.lineTo(edgeB.end.x, edgeB.end.y);
    ctx.lineTo(edgeB.start.x, edgeB.start.y);
    ctx.closePath();
    ctx.clip();
  } else {
    const { upperEdge, lowerEdge } = getFanGeometry(12, 28);
    const side = faceCanvasY < height / 2 ? "bottom" : "top";
    const boundary = side === "bottom" ? upperEdge : lowerEdge;
    const edgeX = boundary.end.x - boundary.start.x;
    const edgeY = boundary.end.y - boundary.start.y;
    const edgeLength = Math.sqrt(edgeX * edgeX + edgeY * edgeY) || 1;
    const normalX = -edgeY / edgeLength;
    const normalY = edgeX / edgeLength;
    const midpoint = {
      x: (boundary.start.x + boundary.end.x) / 2,
      y: (boundary.start.y + boundary.end.y) / 2,
    };
    const targetY = side === "bottom" ? height : 0;
    const sign =
      (width / 2 - midpoint.x) * normalX + (targetY - midpoint.y) * normalY >= 0
        ? 1
        : -1;
    const offset = Math.sqrt(width * width + height * height) * 2 * sign;
    ctx.beginPath();
    ctx.moveTo(boundary.start.x, boundary.start.y);
    ctx.lineTo(boundary.end.x, boundary.end.y);
    ctx.lineTo(
      boundary.end.x + normalX * offset,
      boundary.end.y + normalY * offset,
    );
    ctx.lineTo(
      boundary.start.x + normalX * offset,
      boundary.start.y + normalY * offset,
    );
    ctx.closePath();
    ctx.clip();
  }
  drawCoverImage(overlay);
  ctx.restore();
  return canvas;
}

async function choosePortrait(
  character: any,
  usePainting: boolean,
  rankDependentPainting: boolean,
): Promise<any | null> {
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
        if (paths.length > 0) {
          const paintingRank = getPaintingSelectionRank(
            character.rank,
            rankDependentPainting,
          );
          const composed = await composeRankDependentPainting(
            entryId,
            paths,
            paintingRank,
            source,
          );
          if (composed) return composed;
        }
        const fallbackRank = getPaintingSelectionRank(
          character.rank,
          rankDependentPainting,
        );
        const fallbackIndex = getMindscapeComposition(fallbackRank).baseIndex;
        source = paths[fallbackIndex] ?? paths[0] ?? source;
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
  paperAccent: string,
  accentLight: string,
  font: string,
  tr: (key: string, args?: any) => string,
  T: CharacterText,
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

  const rawName =
    character.full_name_mi18n ??
    character.name_mi18n ??
    character.name ??
    "Unknown";
  const special = specialCharacters[String(character.id)];
  const specialLabel = special?.title ? tr(special.title) : "";
  const nameSize = fitText(ctx, rawName, 118, 21, 13, font, "500");
  ctx.font = `500 ${nameSize}px ${font}`;
  const name = truncate(ctx, rawName, 118);
  const nameWidth = ctx.measureText(name).width;
  const raritySize = 20;
  const gap = 7;
  let rowWidth = nameWidth + gap + raritySize;
  if (specialLabel) {
    ctx.font = `500 9px ${font}`;
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
  ctx.font = `500 ${nameSize}px ${font}`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(name, nameX, nameY);
  let itemX = nameX + nameWidth + gap;
  const rarityImage = await loadCharacterRarityIcon(character);
  if (rarityImage)
    ctx.drawImage(rarityImage, itemX, nameY - raritySize + 1, raritySize, raritySize);
  itemX += raritySize + gap;

  if (special?.title) {
    const titleFile =
      special.title === "GrandMaster" ? "Grandmaster" : special.title;
    const titleImage = await loadAny(
      `./src/assets/images/icons/other/${titleFile}.png`,
    );
    if (titleImage) ctx.drawImage(titleImage, itemX, nameY - 19, 20, 20);
    itemX += 23;
    ctx.font = `500 9px ${font}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(specialLabel, itemX, nameY - 5);
  }

  const numberY = y + 255;
  const numberWidth = 38;
  const numberGap = 4;
  const rankX = x + width - 12 - numberWidth;
  const levelX = rankX - numberGap - numberWidth;
  const metaY = numberY + 14;
  const iconMetaY = metaY + 6;
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
    [elementImage, 26],
    [professionImage, 26],
    [groupImage, 26],
  ] as Array<[Image | null, number]>) {
    if (image) ctx.drawImage(image, metaX, iconMetaY - size + 2, size, size);
    metaX += size + 4;
  }
  ctx.font = `500 12px ${font}`;
  ctx.fillStyle = "#e8e4da";
  const campText = String(character.camp_name_mi18n ?? "");
  const campWidth = Math.max(42, levelX - metaX - 4);
  const campSize = fitText(ctx, campText, campWidth, 12, 10, font, "500");
  ctx.font = `500 ${campSize}px ${font}`;
  const campLines = wrapCharacters(ctx, campText, campWidth, 2);
  campLines.forEach((line, index) =>
    ctx.fillText(line, metaX, metaY - 4 + index * 12),
  );

  for (const [label, value, bx] of [
    [T.level, character.level ?? "?", levelX],
    [T.cinema, character.rank ?? 0, rankX],
  ] as Array<[string, unknown, number]>) {
    ctx.fillStyle = accentLight;
    ctx.fillRect(bx, numberY - 6, 2, 28);
    ctx.font = `500 7px ${font}`;
    ctx.fillStyle = "#bbb7ae";
    ctx.fillText(label, bx + 6, numberY);
    ctx.font = `900 italic 21px ${NUM_FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(value), bx + 6, numberY + 21);
  }

  const statsX = x + 10;
  const statsY = y + artHeight + 24;
  drawSectionMark(
    ctx,
    statsX + 4,
    statsY + 1,
    T.agentStats,
    paperAccent,
    font,
    true,
  );
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
      ctx.filter = "brightness(0)";
      ctx.drawImage(icon, cellX, cellY + 5, 14, 14);
      ctx.restore();
    }
    ctx.font = `500 12px ${font}`;
    ctx.fillStyle = "#505356";
    ctx.fillText(
      truncate(ctx, String(prop.property_name ?? ""), colWidth - 20),
      cellX + 18,
      cellY + 17,
    );
    ctx.font = `900 italic 15px ${NUM_FONT}`;
    ctx.fillStyle = isCharacterEffectiveProperty(character, prop)
      ? paperAccent
      : INK;
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
  T: CharacterText,
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
  ctx.font = `bold 15px ${font}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(T.skills, x + 22, y + 20);

  const order = [0, 2, 5, 1, 3, 4];
  const labels = T.skillLabels;
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
    ctx.font = `500 10px ${font}`;
    ctx.fillStyle = "#aeb2b2";
    ctx.fillText(labels[index]!, itemX + 39, itemY + 13);
    ctx.font = `900 italic 18px ${NUM_FONT}`;
    ctx.fillStyle = isMax ? accentLight : "#ffffff";
    ctx.fillText(levelText, itemX + 39, itemY + 31);
  }
}

async function drawWeapon(
  ctx: SKRSContext2D,
  character: any,
  paperAccent: string,
  font: string,
  T: CharacterText,
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
  drawSectionMark(ctx, x + 16, y + 24, T.wEngine, paperAccent, font, true);

  const weapon = character.weapon;
  if (!weapon?.id) {
    const placeholderX = x + 22;
    const placeholderY = y + 45;
    ctx.save();
    ctx.fillStyle = "#d8d3c7";
    ctx.fillRect(placeholderX, placeholderY, 64, 64);
    ctx.strokeStyle = "#77746c";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(placeholderX + 1, placeholderY + 1, 62, 62);
    ctx.beginPath();
    ctx.arc(placeholderX + 32, placeholderY + 32, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(placeholderX + 20, placeholderY + 44);
    ctx.lineTo(placeholderX + 44, placeholderY + 20);
    ctx.stroke();
    ctx.restore();
    ctx.font = `bold 20px ${font}`;
    ctx.fillStyle = "#66635d";
    ctx.textAlign = "left";
    ctx.fillText(T.noWEngine, x + 108, y + 83);
    return;
  }

  const iconX = x + 18;
  const iconY = y + 45;
  const weaponImage = await loadAny(weapon.icon);
  ctx.fillStyle = mix(paperAccent, "white", 0.5);
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
  const rawName = String(weapon.name ?? "");
  const nameSize = fitText(ctx, rawName, infoWidth - 40, 17, 12, font);
  ctx.font = `bold ${nameSize}px ${font}`;
  const name = truncate(ctx, rawName, infoWidth - 40);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.fillText(name, infoX, y + 62);
  const nameWidth = ctx.measureText(name).width;
  const rarity = await loadCharacterRarityIcon(weapon);
  if (rarity) ctx.drawImage(rarity, infoX + nameWidth + 7, y + 45, 20, 20);

  const detailY = y + 76;
  const detailH = 45;
  const levelDividerX = infoX + 42;
  const effectDividerX = x + 340;
  ctx.fillStyle = INK;
  ctx.fillRect(levelDividerX, detailY, 2, detailH);
  ctx.font = `500 10px ${font}`;
  ctx.fillStyle = "#606365";
  ctx.fillText(T.level, infoX, detailY + 11);
  ctx.font = `900 italic 27px ${NUM_FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText(String(weapon.level ?? "?"), infoX, detailY + 37);

  const weaponProps = [
    ...(weapon.main_properties ?? []),
    ...(weapon.properties ?? []),
  ].slice(0, 2);
  const middleDividerX =
    levelDividerX + (effectDividerX - levelDividerX) / 2 - 8;
  const propertyStartX = [levelDividerX, middleDividerX];
  const propertyEndX = [middleDividerX, effectDividerX];
  for (let index = 0; index < 2; index += 1) {
    const prop = weaponProps[index];
    if (!prop) continue;
    const px = propertyStartX[index]!;
    if (index > 0) {
      ctx.fillStyle = "#aaa59b";
      ctx.fillRect(middleDividerX, detailY + 4, 1, detailH - 8);
    }
    const propertyDividerX = px;
    const propertyDividerWidth = index === 0 ? 2 : 1;
    const propertyContentStartX = propertyDividerX + propertyDividerWidth;
    const firstEffectShiftX = index === 0 ? 5 : 0;
    const propertyTextX = propertyContentStartX + 20 + firstEffectShiftX;
    const propertyIconX = propertyContentStartX + 3 + firstEffectShiftX;
    const propImage = await loadAny(propIconPath(prop.property_id));
    if (propImage) {
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.filter = "brightness(0)";
      ctx.drawImage(propImage, propertyIconX, detailY + 5, 14, 14);
      ctx.restore();
    }
    const propertyMaxWidth = Math.max(
      20,
      propertyEndX[index]! - propertyTextX - 2,
    );
    const propertyText = String(prop.property_name ?? "");
    const propertyFontSize = fitText(
      ctx,
      propertyText,
      propertyMaxWidth,
      11,
      10,
      font,
      "500",
    );
    ctx.font = `500 ${propertyFontSize}px ${font}`;
    ctx.fillStyle = "#505356";
    ctx.fillText(propertyText, propertyTextX, detailY + 16);
    ctx.font = `900 italic 15px ${NUM_FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(String(prop.base ?? prop.final ?? ""), propertyTextX, detailY + 36);
  }

  const effectX = effectDividerX;
  ctx.fillStyle = INK;
  ctx.fillRect(effectX, y + 44, 2, 88);
  const effectLeft = effectX + 13;
  ctx.font = `bold 14px ${font}`;
  ctx.fillStyle = paperAccent;
  ctx.fillText(String(weapon.talent_title ?? ""), effectLeft, y + 68);
  ctx.font = `500 10.5px ${font}`;
  ctx.textAlign = "left";
  const effectTextColor = "#343638";
  drawRichTextBlock(
    ctx,
    weapon.talent_content,
    effectLeft,
    y + 86,
    width - (effectX - x) - 30,
    4,
    14.5,
    effectTextColor,
    (color) => {
      const normalized = color.toLowerCase();
      if (normalized === "#fff" || normalized === "#ffffff") return INK;
      if (normalized === "#2bad00" || normalized === "#98eff0") return paperAccent;
      return color;
    },
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
  effectiveSystemIds: ReadonlySet<number>,
  T: CharacterText,
) {
  ctx.fillStyle = DISC_BG;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#414749";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  if (!disc?.id) {
    ctx.save();
    ctx.strokeStyle = "#5d6466";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x + 8, y + 8, width - 16, height - 16);
    ctx.beginPath();
    ctx.arc(x + 34, y + height / 2, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 23, y + height / 2 + 11);
    ctx.lineTo(x + 45, y + height / 2 - 11);
    ctx.stroke();
    ctx.restore();
    ctx.font = `500 11px ${font}`;
    ctx.fillStyle = "#8b9192";
    ctx.textAlign = "right";
    ctx.fillText(`⓪①②③④⑤⑥`[slot] ?? String(slot), x + width - 13, y + 23);
    const placeholderText = T.slotUnequipped(slot);
    const placeholderSize = fitText(
      ctx,
      placeholderText,
      width - 82,
      13,
      10,
      font,
    );
    ctx.font = `500 ${placeholderSize}px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText(
      truncate(ctx, placeholderText, width - 82),
      x + 62,
      y + height / 2 + 5,
    );
    return;
  }

  const flatSuitSource = await getFlatSuitIcon(disc.equip_suit?.suit_id);
  const discImage = flatSuitSource ? await loadAny(flatSuitSource) : null;
  if (discImage) {
    ctx.drawImage(discImage, x + 7, y + 5, 36, 36);
  } else {
    ctx.save();
    ctx.strokeStyle = accentLight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 25, y + 23, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 25, y + 23, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const slotLabel = `⓪①②③④⑤⑥`[slot] ?? String(slot);
  const enhancement = Number(disc.level ?? 0);
  const enhancementText = enhancement > 0 ? `+${enhancement}` : "";
  ctx.font = `500 13px ${font}`;
  const slotWidth = ctx.measureText(slotLabel).width;
  const enhancementWidth = enhancementText
    ? ctx.measureText(enhancementText).width
    : 0;
  const separatorGap = enhancementText ? 8 : 0;
  const enhancementRight = x + width - 13;
  const topX =
    enhancementRight - slotWidth - separatorGap - enhancementWidth;
  ctx.textAlign = "left";
  ctx.fillStyle = "#b9bdbd";
  ctx.fillText(slotLabel, topX, y + 16);
  if (enhancementText) {
    const separatorX = topX + slotWidth + 3;
    ctx.fillStyle = "#8f8174";
    ctx.fillRect(separatorX, y + 5, 1, 12);
    ctx.fillStyle = ORANGE;
    ctx.fillText(enhancementText, separatorX + 5, y + 16);
  }

  const validCount = String(countEffectiveRolls(disc, effectiveSystemIds));
  ctx.font = `900 italic 21px ${NUM_FONT}`;
  const validCountWidth = ctx.measureText(validCount).width;
  ctx.font = `500 9px ${font}`;
  const validRight = x + width - 7;
  ctx.textAlign = "right";
  ctx.fillStyle = "#b9bdbd";
  ctx.fillText(
    T.validRolls,
    validRight - validCountWidth - 5,
    y + 38,
  );
  ctx.font = `900 italic 21px ${NUM_FONT}`;
  ctx.fillStyle = accentLight;
  ctx.fillText(validCount, validRight, y + 40);

  const main = disc.main_properties?.[0];
  if (main) {
    const icon = await loadAny(propIconPath(main.property_id));
    if (icon) ctx.drawImage(icon, x + 48, y + 12, 14, 14);
    ctx.font = `500 13px ${font}`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    const mainText = `${main.property_name ?? ""} ${main.base ?? ""}`;
    ctx.fillText(truncate(ctx, mainText, width - 107), x + 65, y + 25);
  }

  const subProps = (disc.properties ?? []).slice(0, 4);
  const subY = y + 46;
  const subGapX = 5;
  const subGapY = 3;
  const subWidth = (width - 14 - subGapX) / 2;
  const subHeight = 16;
  for (let index = 0; index < 4; index += 1) {
    const prop = subProps[index];
    if (!prop) continue;
    const col = index % 2;
    const row = Math.floor(index / 2);
    const sx = x + 7 + col * (subWidth + subGapX);
    const sy = subY + row * (subHeight + subGapY);
    const effective = isEffectiveProperty(prop, effectiveSystemIds);
    ctx.fillStyle = DISC_SUB;
    ctx.fillRect(sx, sy, subWidth, subHeight);
    if (effective) {
      ctx.fillStyle = accent;
      ctx.fillRect(sx, sy, 2, subHeight);
    }
    const icon = await loadAny(propIconPath(prop.property_id));
    if (icon) ctx.drawImage(icon, sx + 3, sy + 4, 11, 11);
    const add = Number(prop.add ?? 0);
    const addText = add > 0 ? `+${add}` : "";
    ctx.font = `900 italic 10px ${NUM_FONT}`;
    const addWidth = addText ? ctx.measureText(addText).width + 7 : 0;
    const text = `${prop.property_name ?? ""} ${prop.base ?? ""}`;
    const textRight = sx + subWidth - addWidth;
    const textWidth = Math.max(28, textRight - (sx + 16) - 2);
    const textSize = fitText(ctx, text, textWidth, 10, 7, font, "500");
    ctx.font = `500 ${textSize}px ${font}`;
    ctx.fillStyle = effective ? accentLight : MUTED;
    ctx.textAlign = "left";
    const displayText =
      ctx.measureText(text).width <= textWidth
        ? text
        : truncate(ctx, text, textWidth);
    ctx.fillText(displayText, sx + 16, sy + 13);
    if (addText) {
      const separatorX = sx + subWidth - addWidth;
      ctx.fillStyle = "#8f8174";
      ctx.fillRect(separatorX, sy + 3, 1, 10);
      ctx.font = `900 italic 10px ${NUM_FONT}`;
      ctx.fillStyle = ORANGE;
      ctx.fillText(addText, separatorX + 4, sy + 12);
    }
  }
}

type DiscSet = {
  count: number;
  name: string;
  desc1: string;
  desc2: string;
  suitId: string;
};

function collectSets(discs: any[]): DiscSet[] {
  const sets = new Map<string, DiscSet>();
  for (const disc of discs) {
    if (!disc?.id) continue;
    const key = String(disc.equip_suit?.suit_id ?? "");
    if (!key) continue;
    const current = sets.get(key) ?? {
      count: 0,
      name: String(disc.equip_suit?.name ?? disc.name ?? ""),
      desc1: String(disc.equip_suit?.desc1 ?? ""),
      desc2: String(disc.equip_suit?.desc2 ?? ""),
      suitId: key,
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
  paperAccent: string,
  font: string,
  T: CharacterText,
) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = paperAccent;
  ctx.fillRect(x, y, 4, height);
  const iconSource = await getFlatSuitIcon(set.suitId);
  const icon = iconSource ? await loadAny(iconSource) : null;
  if (icon) {
    // Set-effect icons are transparent assets; keep the paper card visible
    // instead of painting a black square behind the icon.
    ctx.drawImage(icon, x + 10, y + 12, 44, 44);
  } else {
    ctx.strokeStyle = paperAccent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 32, y + 34, 17, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.font = `bold 12px ${font}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.fillText(truncate(ctx, set.name, width - 72), x + 62, y + 24);
  ctx.font = `500 10.5px ${font}`;
  const descX = x + 62;
  const maxWidth = width - 72;
  const drawSetEffect = (
    label: string,
    description: string,
    baselineY: number,
    maxLines: number,
  ) => {
    const labelText = `${label}: `;
    ctx.font = `bold 10.5px ${font}`;
    const labelWidth = ctx.measureText(labelText).width;
    ctx.fillStyle = paperAccent;
    ctx.fillText(labelText, descX, baselineY);
    ctx.font = `500 10.5px ${font}`;
    return drawRichTextBlock(
      ctx,
      description,
      descX + labelWidth,
      baselineY,
      Math.max(20, maxWidth - labelWidth),
      maxLines,
      12.5,
      "#3e4142",
      (color) => {
        const normalized = color.toLowerCase();
        if (normalized === "#fff" || normalized === "#ffffff") return INK;
        if (normalized === "#2bad00" || normalized === "#98eff0") return paperAccent;
        return color;
      },
    );
  };
  if (set.count >= 4) {
    const firstLines = drawSetEffect(T.twoPiece, set.desc1, y + 42, 2);
    drawSetEffect(
      T.fourPiece,
      set.desc2,
      y + 42 + firstLines * 12.5 + 4,
      4,
    );
  } else {
    drawSetEffect(T.twoPiece, set.desc1, y + 42, 6);
  }
}

async function drawDiscs(
  ctx: SKRSContext2D,
  character: any,
  accent: string,
  paperAccent: string,
  accentLight: string,
  font: string,
  T: CharacterText,
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
  drawSectionMark(ctx, x + 16, y + 30, T.driveDiscs, accent, font);

  const discs = [...(character.equip ?? [])].sort(
    (a: any, b: any) => Number(a.equipment_type) - Number(b.equipment_type),
  );
  const slots = Array.from({ length: 6 }, (_, index) =>
    discs.find((disc: any) => Number(disc.equipment_type) === index + 1),
  );
  const effectiveSystemIds = getCharacterEffectiveSystemIds(character, slots);
  const total = slots.reduce(
    (sum, disc) => sum + countEffectiveRolls(disc, effectiveSystemIds),
    0,
  );
  ctx.font = `500 9px ${font}`;
  ctx.fillStyle = "#b9bdbd";
  ctx.textAlign = "right";
  ctx.fillText(T.totalValidRolls, x + width - 42, y + 29);
  ctx.font = `900 italic 21px ${NUM_FONT}`;
  ctx.fillStyle = accentLight;
  ctx.fillText(String(total), x + width - 12, y + 31);

  const gridX = x + 12;
  const gridY = y + 42;
  const gap = 6;
  const cellWidth = (width - 24 - gap * 2) / 3;
  const cellHeight = 84;
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
      effectiveSystemIds,
      T,
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
    await drawSetCard(
      ctx,
      four,
      gridX,
      setY,
      wide,
      setHeight,
      paperAccent,
      font,
      T,
    );
    await drawSetCard(
      ctx,
      two,
      gridX + wide + gap,
      setY,
      width - 24 - gap - wide,
      setHeight,
      paperAccent,
      font,
      T,
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
      paperAccent,
      font,
      T,
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
    const font = resolveProfileFont(userLocale);
    const T = getCharacterText(tr);
    const rawAccent = safeAccent(
      character.vertical_painting_color,
      Number(character.element_type),
    );
    const accent = getPaperAccent(rawAccent);
    const paperAccent = accent;
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
      paperAccent,
      accentLight,
      font,
      tr,
      T,
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

    await drawSkills(ctx, character, accent, accentLight, font, T);
    await drawWeapon(ctx, character, paperAccent, font, T);
    await drawDiscs(
      ctx,
      character,
      accent,
      paperAccent,
      accentLight,
      font,
      T,
    );

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
