import {
  createCanvas,
  GlobalFonts,
  Image,
  loadImage,
  SKRSContext2D,
} from "@napi-rs/canvas";
import { join } from "path";
import { ELEMENT_TYPES, getElementIconPath } from "./elements.js";
import { getDeadlyModeLabels, hasDeadlyExtremeMode } from "./deadlyMode.js";
import {
  formatBattleRecordDate,
  formatBattleRecordTime,
} from "./recordDisplay.js";

const WIDTH = 1200;
const HEIGHT = 1440;

const FONT_PATHS: Array<[string, string]> = [
  ["en-us.ttf", "EN"],
  ["zh-tw.ttf", "TW"],
  ["zh-cn.ttf", "CN"],
  ["vi-vn.ttf", "VI"],
  ["ja-jp.ttf", "JP"],
  ["ko-kr.ttf", "KR"],
  ["fr-fr.ttf", "FR"],
  ["Nunito-BlackItalic.ttf", "Nunito"],
];
for (const [file, family] of FONT_PATHS) {
  GlobalFonts.registerFromPath(join(".", "src", "assets", file), family);
}

const CJK_FALLBACK_PATHS = [
  join(".", "src", "assets", "fonts", "NotoSansCJKtc-Regular.otf"),
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/System/Library/Fonts/STHeiti Light.ttc",
  "/System/Library/Fonts/Hiragino Sans GB.ttc",
];
for (const fallbackPath of CJK_FALLBACK_PATHS) {
  try {
    if (GlobalFonts.registerFromPath(fallbackPath, "CJKFallback")) break;
  } catch {}
}

const FONTS: Record<string, string> = {
  tw: "TW",
  "zh-tw": "TW",
  cn: "CN",
  "zh-cn": "CN",
  vi: "VI",
  jp: "JP",
  kr: "KR",
  fr: "FR",
  en: "EN",
};

type LocalText = {
  normal: string;
  extreme: string;
  noNormal: string;
  noExtreme: string;
  score: string;
  stars: string;
  clearTime: string;
  team: string;
  bangboo: string;
  weakness: string;
  buff: string;
  totalScore: string;
  level: (value: unknown) => string;
};

function localText(locale: string): LocalText {
  const labels = getDeadlyModeLabels(locale);
  const normalized = locale.toLowerCase();
  if (normalized === "tw" || normalized === "zh-tw") {
    return {
      ...labels,
      normal: "試煉模式",
      noNormal: "尚無試煉模式紀錄",
      noExtreme: "尚無絕境模式紀錄",
      totalScore: "總得分",
      level: (value) => `等級 ${value}`,
    };
  }
  if (normalized === "cn" || normalized === "zh-cn") {
    return {
      ...labels,
      normal: "试炼模式",
      noNormal: "暂无试炼模式记录",
      noExtreme: "暂无绝境模式记录",
      totalScore: "总得分",
      level: (value) => `等级 ${value}`,
    };
  }
  if (normalized === "jp" || normalized === "ja" || normalized === "ja-jp") {
    return {
      ...labels,
      normal: "試練モード",
      noNormal: "試練モードの記録なし",
      noExtreme: "極限モードの記録なし",
      totalScore: "合計スコア",
      level: (value) => `レベル ${value}`,
    };
  }
  if (normalized === "kr" || normalized === "ko" || normalized === "ko-kr") {
    return {
      ...labels,
      normal: "시련 모드",
      noNormal: "시련 모드 기록 없음",
      noExtreme: "극한 모드 기록 없음",
      totalScore: "총 점수",
      level: (value) => `레벨 ${value}`,
    };
  }
  if (normalized === "fr" || normalized === "fr-fr") {
    return {
      ...labels,
      normal: "Mode d’essai",
      noNormal: "Aucun record du mode d’essai",
      noExtreme: "Aucun record du mode extrême",
      totalScore: "Score total",
      level: (value) => `Niv. ${value}`,
    };
  }
  if (normalized === "vi" || normalized === "vi-vn") {
    return {
      ...labels,
      normal: "Chế độ thử thách",
      noNormal: "Chưa có dữ liệu chế độ thử thách",
      noExtreme: "Chưa có dữ liệu chế độ cực hạn",
      totalScore: "Tổng điểm",
      level: (value) => `Cấp ${value}`,
    };
  }
  return {
    ...labels,
    normal: "Trial Mode",
    noNormal: "No Trial Mode record",
    noExtreme: "No Extreme Mode record",
    totalScore: "Total Score",
    level: (value) => `Lv. ${value}`,
  };
}

async function loadSafe(
  source: unknown,
  fallback?: string,
): Promise<Image | null> {
  const candidates = [source, fallback, "./src/assets/images/None.png"].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  for (const candidate of candidates) {
    try {
      return await loadImage(candidate);
    } catch {
      // Try the next local/remote fallback.
    }
  }
  return null;
}

function roundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string | CanvasGradient,
  stroke?: string,
  lineWidth = 1,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function clipRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
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
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  ctx.drawImage(
    image,
    (image.width - sourceWidth) / 2,
    (image.height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
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

function fitText(
  ctx: SKRSContext2D,
  text: unknown,
  x: number,
  y: number,
  maxWidth: number,
  initialSize: number,
  font: string,
  align: CanvasTextAlign = "left",
) {
  const value = String(text || "");
  let size = initialSize;
  ctx.textAlign = align;
  ctx.font = `bold ${size}px ${font}`;
  while (size > 12 && ctx.measureText(value).width > maxWidth) {
    size -= 1;
    ctx.font = `bold ${size}px ${font}`;
  }
  ctx.fillText(value, x, y);
}

type RichTextToken = { char: string; color: string };

function parseRichText(text: unknown, defaultColor: string): RichTextToken[] {
  const source = String(text || "").replace(/\\n/g, "\n");
  const tokens: RichTextToken[] = [];
  const colorStack: string[] = [];
  const tagPattern = /<color=(#[A-Fa-f0-9]{6,8})>|<\/color>/gi;
  let activeColor = defaultColor;
  let cursor = 0;
  let match: RegExpExecArray | null;

  const append = (value: string) => {
    for (const char of value) {
      if (char !== "\r") tokens.push({ char, color: activeColor });
    }
  };

  while ((match = tagPattern.exec(source))) {
    append(source.slice(cursor, match.index));
    if (match[1]) {
      colorStack.push(activeColor);
      activeColor = match[1];
    } else {
      activeColor = colorStack.pop() || defaultColor;
    }
    cursor = tagPattern.lastIndex;
  }
  append(source.slice(cursor));
  return tokens;
}

function truncateText(
  ctx: SKRSContext2D,
  text: unknown,
  maxWidth: number,
): string {
  const raw = String(text || "");
  if (ctx.measureText(raw).width <= maxWidth) return raw;
  let result = raw;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function normalizedPercent(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 100 ? value / 100 : value;
}

function rankPercentOf(data: any, fallback?: unknown): number | null {
  const candidates = [
    data?.rank_percent,
    data?.brief?.rank_percent,
    data?.hard_rank_percent,
    fallback,
  ];
  for (const value of candidates) {
    const percent = normalizedPercent(value);
    if (percent !== null) return percent;
  }
  return null;
}

export function getDeadlyRankFromAbstract(
  abstractInfo: any,
  mode: "normal" | "extreme",
): unknown {
  const entries = Array.isArray(abstractInfo?.list) ? abstractInfo.list : [];
  const accepted =
    mode === "normal"
      ? new Set(["general", "normal", "trial", "1"])
      : new Set(["extreme", "hard", "2"]);
  return entries.find((entry: any) =>
    accepted.has(String(entry?.nest_type || "").toLowerCase()),
  )?.rank;
}

async function drawRankRibbon(
  ctx: SKRSContext2D,
  rawPercent: unknown,
  x: number,
  y: number,
  width: number,
  height: number,
  font: string,
) {
  const percent = normalizedPercent(rawPercent);
  if (percent === null) return;
  const tier =
    percent >= 20
      ? 5
      : percent >= 5
        ? 4
        : percent >= 2
          ? 3
          : percent >= 1
            ? 2
            : 1;
  const ribbon = await loadSafe(
    `./src/assets/images/icons/deadly/rankbg-${tier}.png`,
  );
  ctx.save();
  if (ribbon) ctx.drawImage(ribbon, x, y, width, height);
  ctx.fillStyle = "#17131A";
  ctx.font = `bold ${Math.max(18, Math.round(height * 0.64))}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${percent.toFixed(2)}%`, x + width * 0.43, y + height / 2 - 1);
  ctx.restore();
}

function groupRichTextTokens(tokens: RichTextToken[]): RichTextToken[][] {
  const units: RichTextToken[][] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.char === "\n") {
      units.push([token]);
      index += 1;
      continue;
    }

    if (/[+\-0-9０-９]/.test(token.char)) {
      let end = index;
      let hasDigit = false;
      while (
        end < tokens.length &&
        /[+\-0-9０-９.,，．]/.test(tokens[end].char)
      ) {
        if (/[0-9０-９]/.test(tokens[end].char)) hasDigit = true;
        end += 1;
      }
      if (hasDigit && end < tokens.length && /[%％]/.test(tokens[end].char)) {
        units.push(tokens.slice(index, end + 1));
        index = end + 1;
        continue;
      }
    }

    units.push([token]);
    index += 1;
  }
  return units;
}

export function layoutRichTextLines(
  ctx: SKRSContext2D,
  text: unknown,
  maxWidth: number,
  maxLines: number,
  defaultColor: string,
): RichTextToken[][] {
  const units = groupRichTextTokens(parseRichText(text, defaultColor));
  const lines: RichTextToken[][] = [];
  let line: RichTextToken[] = [];
  let lineWidth = 0;
  let cursor = 0;

  while (cursor < units.length) {
    const unit = units[cursor];
    if (unit.length === 1 && unit[0].char === "\n") {
      lines.push(line);
      line = [];
      lineWidth = 0;
      cursor += 1;
      if (lines.length === maxLines) break;
      continue;
    }
    const unitWidth = unit.reduce(
      (total, token) => total + ctx.measureText(token.char).width,
      0,
    );
    if (line.length > 0 && lineWidth + unitWidth > maxWidth) {
      lines.push(line);
      line = [];
      lineWidth = 0;
      if (lines.length === maxLines) break;
      continue;
    }
    line.push(...unit);
    lineWidth += unitWidth;
    cursor += 1;
  }
  if (line.length > 0 && lines.length < maxLines) lines.push(line);

  if (cursor < units.length && lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    const ellipsisWidth = ctx.measureText("…").width;
    let width = lastLine.reduce(
      (total, token) => total + ctx.measureText(token.char).width,
      0,
    );
    while (lastLine.length > 0 && width + ellipsisWidth > maxWidth) {
      width -= ctx.measureText(lastLine.pop()!.char).width;
    }
    lastLine.push({ char: "…", color: defaultColor });
  }
  return lines;
}

function drawRichTextLines(
  ctx: SKRSContext2D,
  lines: RichTextToken[][],
  x: number,
  firstBaseline: number,
  lineHeight: number,
) {
  ctx.save();
  ctx.textAlign = "left";
  lines.forEach((lineTokens, lineIndex) => {
    let currentX = x;
    for (const token of lineTokens) {
      ctx.fillStyle = token.color;
      ctx.fillText(
        token.char,
        currentX,
        firstBaseline + lineIndex * lineHeight,
      );
      currentX += ctx.measureText(token.char).width;
    }
  });
  ctx.restore();
}

function drawBuffTextBlock(
  ctx: SKRSContext2D,
  name: unknown,
  description: unknown,
  x: number,
  y: number,
  width: number,
  height: number,
  font: string,
  titleColor: string,
  defaultColor: string,
  descriptionSize: number,
  lineHeight: number,
  maxLines: number,
) {
  const horizontalPadding = 16;
  const contentWidth = width - horizontalPadding * 2;
  const titleSize = 20;
  const titleLineHeight = 27;
  const blockGap = 7;

  ctx.save();
  ctx.textAlign = "left";
  ctx.font = `${descriptionSize}px ${font}`;
  const lines = layoutRichTextLines(
    ctx,
    description || "—",
    contentWidth,
    maxLines,
    defaultColor,
  );
  const descriptionHeight = Math.max(lineHeight, lines.length * lineHeight);
  const blockHeight = titleLineHeight + blockGap + descriptionHeight;
  const blockTop = y + Math.max(10, (height - blockHeight) / 2);

  ctx.fillStyle = titleColor;
  ctx.font = `bold ${titleSize}px ${font}`;
  ctx.fillText(
    truncateText(ctx, name || "—", contentWidth),
    x + horizontalPadding,
    blockTop + titleSize,
  );

  ctx.font = `${descriptionSize}px ${font}`;
  drawRichTextLines(
    ctx,
    lines,
    x + horizontalPadding,
    blockTop + titleLineHeight + blockGap + descriptionSize,
    lineHeight,
  );
  ctx.restore();
}

function drawCircleImage(
  ctx: SKRSContext2D,
  image: Image,
  x: number,
  y: number,
  size: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  drawCover(ctx, image, x, y, size, size);
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBuffIcon(
  ctx: SKRSContext2D,
  image: Image | null,
  x: number,
  y: number,
  size: number,
  accent: string,
) {
  if (!image) return;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  ctx.save();
  ctx.fillStyle = "rgba(14,13,17,0.96)";
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.clip();
  drawContain(ctx, image, x + 4, y + 4, size - 8, size - 8);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(12,11,15,0.92)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

async function drawStars(
  ctx: SKRSContext2D,
  count: unknown,
  x: number,
  y: number,
  size: number,
  overlapRatio = 0.28,
  mode: "normal" | "hard" = "normal",
) {
  const [star, dark] = await Promise.all([
    loadSafe(
      mode === "hard"
        ? "./src/assets/images/icons/deadly/star_hard.png"
        : "./src/assets/images/icons/deadly/star.png",
    ),
    loadSafe("./src/assets/images/icons/deadly/star_dark.png"),
  ]);
  const value = Math.max(0, Math.min(3, Number(count || 0)));
  const step = size * (1 - overlapRatio);
  for (let index = 0; index < 3; index += 1) {
    const image = index < value ? star : dark;
    if (image) ctx.drawImage(image, x + index * step, y, size, size);
  }
}

async function drawStarCount(
  ctx: SKRSContext2D,
  count: unknown,
  x: number,
  y: number,
  size: number,
  font: string,
  mode: "normal" | "hard" = "normal",
  textColor = mode === "hard" ? "#FF625A" : "#FFD31A",
) {
  const star = await loadSafe(
    mode === "hard"
      ? "./src/assets/images/icons/deadly/star_hard.png"
      : "./src/assets/images/icons/deadly/star.png",
  );
  if (star) ctx.drawImage(star, x, y, size, size);
  ctx.save();
  ctx.fillStyle = textColor;
  ctx.font = `bold ${Math.round(size * 0.82)}px ${font}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(
    `×${Math.max(0, Number(count || 0))}`,
    x + size + 8,
    y + size / 2 + 1,
  );
  ctx.restore();
}

async function drawTeamRow(
  ctx: SKRSContext2D,
  battle: any,
  x: number,
  y: number,
  avatarSize: number,
  gap: number,
  font: string,
  maxAvatars = 3,
) {
  const avatars = Array.isArray(battle?.avatar_list)
    ? battle.avatar_list.slice(0, maxAvatars)
    : [];
  let currentX = x;
  for (const avatar of avatars) {
    const image = await loadSafe(
      avatar?.role_square_url,
      `./src/assets/images/agents/${avatar?.id}.webp`,
    );
    if (image) drawCircleImage(ctx, image, currentX, y, avatarSize);

    const rarity = String(avatar?.rarity || "").toUpperCase();
    const rarityCorner =
      rarity === "S" || rarity === "A"
        ? await loadSafe(
            `./src/assets/images/icons/shiyu/rating-corner-${rarity.toLowerCase()}.png`,
          )
        : null;
    if (rarityCorner) {
      const cornerSize = Math.round(avatarSize * 0.43);
      ctx.drawImage(rarityCorner, currentX - 2, y - 2, cornerSize, cornerSize);
    }

    const cinema = Number(avatar?.rank || 0);
    if (cinema > 0) {
      ctx.save();
      const badgeSize = Math.max(18, Math.round(avatarSize * 0.31));
      roundedRect(
        ctx,
        currentX + avatarSize - badgeSize + 2,
        y - 2,
        badgeSize,
        badgeSize,
        6,
        "rgba(12,12,15,0.92)",
        "rgba(255,255,255,0.52)",
      );
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold ${Math.max(12, Math.round(badgeSize * 0.62))}px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        String(cinema),
        currentX + avatarSize - badgeSize / 2 + 2,
        y - 2 + badgeSize / 2,
      );
      ctx.restore();
    }
    currentX += avatarSize + gap;
  }

  if (battle?.buddy?.id || battle?.buddy?.bangboo_rectangle_url) {
    const buddy = await loadSafe(
      battle.buddy.bangboo_rectangle_url,
      `./src/assets/images/bangboos/${battle.buddy.id}.png`,
    );
    if (buddy) {
      const buddySize = avatarSize;
      const buddyX = currentX + 1;
      drawCircleImage(ctx, buddy, buddyX, y, buddySize);

      const buddyStar = Number(battle.buddy?.star || 0);
      if (buddyStar > 1) {
        const badgeSize = Math.max(18, Math.round(buddySize * 0.31));
        roundedRect(
          ctx,
          buddyX + buddySize - badgeSize + 2,
          y - 2,
          badgeSize,
          badgeSize,
          6,
          "rgba(206,35,40,0.96)",
          "rgba(255,255,255,0.52)",
        );
        ctx.save();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold ${Math.max(12, Math.round(badgeSize * 0.62))}px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          String(buddyStar),
          buddyX + buddySize - badgeSize / 2 + 2,
          y - 2 + badgeSize / 2,
        );
        ctx.restore();
      }
    }
  }
}

function getWeaknesses(battle: any): Array<number | string> {
  const boss = Array.isArray(battle?.boss) ? battle.boss[0] : undefined;
  const raw =
    boss?.weak_element_type ||
    boss?.weakness_list ||
    boss?.weakness ||
    battle?.weakness_list ||
    battle?.weakness ||
    [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((item: any) =>
      typeof item === "object"
        ? (item?.element_type ?? item?.id ?? item?.name ?? item?.label)
        : item,
    )
    .filter(
      (item: unknown) => item !== undefined && item !== null && item !== "",
    );
}

async function drawWeaknesses(
  ctx: SKRSContext2D,
  battle: any,
  x: number,
  y: number,
  font: string,
  labels: LocalText,
) {
  const weaknesses = getWeaknesses(battle).slice(0, 6);
  if (weaknesses.length === 0) return;
  ctx.fillStyle = "#FFCF70";
  ctx.font = `bold 17px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(`${labels.weakness}：`, x, y + 25);
  let currentX = x + ctx.measureText(`${labels.weakness}：`).width + 10;
  for (const weakness of weaknesses) {
    const numeric = Number(weakness);
    if (ELEMENT_TYPES.includes(numeric)) {
      const image = await loadSafe(getElementIconPath(numeric));
      if (image) ctx.drawImage(image, currentX, y, 32, 32);
      currentX += 40;
    } else {
      const text = String(weakness);
      ctx.fillStyle = "#F2EAF4";
      ctx.font = `16px ${font}`;
      ctx.fillText(text, currentX, y + 24);
      currentX += ctx.measureText(text).width + 16;
    }
  }
}

async function drawTrialRow(
  ctx: SKRSContext2D,
  battle: any,
  x: number,
  y: number,
  width: number,
  height: number,
  font: string,
  locale: string,
  labels: LocalText,
) {
  const boss = Array.isArray(battle?.boss) ? battle.boss[0] : undefined;
  const firstBuff = Array.isArray(battle?.buffer)
    ? battle.buffer[0]
    : undefined;
  const [bossBackground, bossImage, buffIcon] = await Promise.all([
    loadSafe(boss?.bg_icon),
    loadSafe(boss?.icon),
    loadSafe(firstBuff?.icon),
  ]);
  const artSource = bossImage || bossBackground;
  const artRatio = artSource ? artSource.width / artSource.height : 0.725;
  const artWidth = Math.max(160, Math.min(200, Math.round(height * artRatio)));
  const infoX = x + artWidth + 30;
  const buffX = x + 640;
  const buffWidth = width - 665;

  roundedRect(ctx, x, y, width, height, 12, "#202A31", "#4C7185", 2);

  ctx.save();
  clipRoundedRect(ctx, x, y, artWidth, height, 11);
  if (bossBackground) drawCover(ctx, bossBackground, x, y, artWidth, height);
  if (bossImage) drawContain(ctx, bossImage, x, y, artWidth, height);
  const overlay = ctx.createLinearGradient(x, y + height * 0.45, x, y + height);
  overlay.addColorStop(0, "rgba(11,18,23,0)");
  overlay.addColorStop(1, "rgba(11,18,23,0.96)");
  ctx.fillStyle = overlay;
  ctx.fillRect(x, y, artWidth, height);
  ctx.restore();
  roundedRect(
    ctx,
    x,
    y,
    artWidth,
    height,
    11,
    "rgba(0,0,0,0)",
    "rgba(168,223,255,0.72)",
    2,
  );

  ctx.fillStyle = "#A8DFFF";
  ctx.fillRect(x, y, 8, height);
  ctx.fillStyle = "#FFFFFF";
  fitText(
    ctx,
    boss?.name || labels.noNormal,
    x + artWidth / 2,
    y + height - 19,
    artWidth - 28,
    21,
    font,
    "center",
  );
  drawBuffIcon(ctx, buffIcon, x + artWidth - 44, y + 2, 42, "#A8DFFF");

  ctx.fillStyle = "rgba(168,223,255,0.26)";
  ctx.fillRect(x + artWidth, y + 16, 2, height - 32);

  ctx.fillStyle = "#AFC0CB";
  ctx.font = `16px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(labels.score, infoX, y + 30);
  const scoreText = String(battle?.score ?? 0);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 38px Nunito";
  ctx.fillText(scoreText, infoX, y + 72);
  const scoreWidth = ctx.measureText(scoreText).width;
  await drawStars(ctx, battle?.star, infoX + scoreWidth + 16, y + 35, 38, 0.3);

  await drawWeaknesses(ctx, battle, infoX, y + 82, font, labels);

  ctx.fillStyle = "#D8E5EC";
  ctx.font = `bold 16px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(labels.team, infoX, y + 135);
  await drawTeamRow(ctx, battle, infoX, y + 145, 74, 10, font, 3);

  roundedRect(
    ctx,
    buffX,
    y + 14,
    buffWidth,
    180,
    8,
    "rgba(14,25,32,0.82)",
    "rgba(168,223,255,0.42)",
  );
  drawBuffTextBlock(
    ctx,
    firstBuff?.name || labels.buff,
    firstBuff?.desc || firstBuff?.text || "—",
    buffX,
    y + 14,
    buffWidth,
    180,
    font,
    "#A8DFFF",
    "#E1E7EB",
    17,
    22,
    7,
  );

  const clearTime = formatBattleRecordTime(
    battle?.challenge_time,
    battle?.battle_time,
    locale,
  );
  if (clearTime) {
    ctx.fillStyle = "#BCC9D0";
    ctx.font = `16px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText(
      `${labels.clearTime}：${clearTime}`,
      buffX + 4,
      y + height - 12,
    );
  }
}

async function drawExtremeSection(
  ctx: SKRSContext2D,
  battle: any,
  x: number,
  y: number,
  width: number,
  height: number,
  font: string,
  locale: string,
  labels: LocalText,
  fallbackRankPercent: unknown,
) {
  const boss = Array.isArray(battle?.boss) ? battle.boss[0] : undefined;
  const firstBuff = Array.isArray(battle?.buffer)
    ? battle.buffer[0]
    : undefined;
  const [bossBackground, bossImage, buffIcon] = await Promise.all([
    loadSafe(boss?.bg_icon),
    loadSafe(boss?.icon),
    loadSafe(firstBuff?.icon),
  ]);
  const artSource = bossImage || bossBackground;
  const artHeight = height - 24;
  const artRatio = artSource ? artSource.width / artSource.height : 0.725;
  const artWidth = Math.max(
    280,
    Math.min(305, Math.round(artHeight * artRatio)),
  );
  const artX = x + width - artWidth - 12;
  const artY = y + 12;
  const buffX = x + 430;
  const buffWidth = artX - buffX - 14;

  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, "#322332");
  gradient.addColorStop(0.56, "#251C29");
  gradient.addColorStop(1, "#4A1D2B");
  roundedRect(ctx, x, y, width, height, 14, gradient, "#A34F6B", 2);

  ctx.save();
  clipRoundedRect(ctx, artX, artY, artWidth, artHeight, 10);
  if (bossBackground)
    drawCover(ctx, bossBackground, artX, artY, artWidth, artHeight);
  if (bossImage) drawContain(ctx, bossImage, artX, artY, artWidth, artHeight);
  const artOverlay = ctx.createLinearGradient(
    artX,
    artY + artHeight * 0.62,
    artX,
    artY + artHeight,
  );
  artOverlay.addColorStop(0, "rgba(24,14,22,0)");
  artOverlay.addColorStop(1, "rgba(24,14,22,0.94)");
  ctx.fillStyle = artOverlay;
  ctx.fillRect(artX, artY, artWidth, artHeight);
  ctx.restore();
  roundedRect(
    ctx,
    artX,
    artY,
    artWidth,
    artHeight,
    10,
    "rgba(0,0,0,0)",
    "rgba(255,98,139,0.78)",
    2,
  );
  ctx.fillStyle = "#FFFFFF";
  fitText(
    ctx,
    boss?.name || labels.noExtreme,
    artX + artWidth / 2,
    artY + artHeight - 20,
    artWidth - 28,
    22,
    font,
    "center",
  );
  drawBuffIcon(ctx, buffIcon, artX + artWidth - 54, artY + 2, 52, "#FF628B");

  ctx.fillStyle = "#FF628B";
  ctx.fillRect(x, y, 9, height);

  ctx.fillStyle = "#B8AFBD";
  ctx.font = `16px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(labels.score, x + 30, y + 45);
  const scoreText = String(battle?.score ?? 0);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 51px Nunito";
  ctx.fillText(scoreText, x + 30, y + 99);
  const scoreWidth = ctx.measureText(scoreText).width;
  const hardRankX = x + 30 + scoreWidth + 16;
  await drawRankRibbon(
    ctx,
    rankPercentOf(battle, fallbackRankPercent),
    hardRankX,
    y + 68,
    112,
    33,
    font,
  );
  await drawStars(ctx, battle?.star, hardRankX + 122, y + 63, 42, 0.3, "hard");

  const clearTime = formatBattleRecordTime(
    battle?.challenge_time,
    battle?.battle_time,
    locale,
  );
  if (clearTime) {
    ctx.fillStyle = "#D8D0DB";
    ctx.font = `17px ${font}`;
    ctx.fillText(`${labels.clearTime}：${clearTime}`, x + 32, y + 151);
  }

  await drawWeaknesses(ctx, battle, x + 32, y + 166, font, labels);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 17px ${font}`;
  ctx.fillText(labels.team, x + 32, y + 240);
  await drawTeamRow(ctx, battle, x + 32, y + 258, 82, 12, font, 3);

  if (firstBuff) {
    roundedRect(
      ctx,
      buffX,
      y + 18,
      buffWidth,
      height - 36,
      8,
      "rgba(22,18,25,0.88)",
      "rgba(255,207,112,0.45)",
    );
    drawBuffTextBlock(
      ctx,
      firstBuff?.name || labels.buff,
      firstBuff?.desc || firstBuff?.text || "—",
      buffX,
      y + 18,
      buffWidth,
      height - 36,
      font,
      "#FFCF70",
      "#E8E1EA",
      18,
      25,
      12,
    );
  }
}

function drawEmptySection(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  font: string,
  color: string,
) {
  roundedRect(ctx, x, y, width, height, 14, "rgba(31,29,34,0.9)", color, 2);
  ctx.fillStyle = "#A8A2AB";
  ctx.font = `bold 25px ${font}`;
  ctx.textAlign = "center";
  ctx.fillText(text, x + width / 2, y + height / 2 + 8);
}

export async function drawDeadlyCombinedImage(
  tr: (key: string, args?: any) => string,
  userLocale: string,
  deadlyData: any,
): Promise<Buffer> {
  const font = `${FONTS[userLocale.toLowerCase()] || "EN"}, CJKFallback`;
  const labels = localText(userLocale);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const extremeBattle = hasDeadlyExtremeMode(deadlyData)
    ? deadlyData.hard_list[0]
    : null;
  const backgroundColor = extremeBattle ? "#151217" : "#101A21";
  const backgroundAccent = extremeBattle ? "#FF628B" : "#A8DFFF";

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = backgroundAccent;
  for (let x = -500; x < WIDTH + 400; x += 170) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 240, 0);
    ctx.lineTo(x - 360, HEIGHT);
    ctx.lineTo(x - 600, HEIGHT);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 42px ${font}`;
  ctx.textAlign = "left";
  const period = Number(deadlyData?.zone_id || 0) % 100;
  const title =
    tr("DeadlyAssault_Period", { period }) ||
    tr("DeadlyAssault") ||
    "Deadly Assault";
  fitText(ctx, title, 60, 58, 980, 42, font);

  if (deadlyData?.start_time && deadlyData?.end_time) {
    ctx.fillStyle = "#AAA4AD";
    ctx.font = `18px ${font}`;
    ctx.fillText(
      `${formatBattleRecordDate(deadlyData.start_time, userLocale)}－${formatBattleRecordDate(deadlyData.end_time, userLocale)}`,
      62,
      91,
    );
  }

  ctx.fillStyle = "#FF91AE";
  ctx.font = `bold 22px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(labels.extreme, 60, 147);
  ctx.fillStyle = "rgba(255,98,139,0.75)";
  ctx.fillRect(60, 160, 1080, 3);

  if (extremeBattle) {
    await drawExtremeSection(
      ctx,
      extremeBattle,
      60,
      180,
      1080,
      420,
      font,
      userLocale,
      labels,
      getDeadlyRankFromAbstract(deadlyData?.abstract_info, "extreme") ??
        deadlyData?.hard_rank_percent,
    );
  } else {
    drawEmptySection(
      ctx,
      60,
      180,
      1080,
      420,
      labels.noExtreme,
      font,
      "#81465C",
    );
  }

  ctx.fillStyle = "#A8DFFF";
  ctx.font = `bold 22px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(labels.normal, 60, 668);
  ctx.fillStyle = "#AFC0CB";
  ctx.font = `15px ${font}`;
  ctx.fillText(labels.totalScore, 300, 641);
  const totalScoreText = String(deadlyData?.total_score ?? 0);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 34px Nunito";
  ctx.fillText(totalScoreText, 300, 676);
  const totalScoreWidth = ctx.measureText(totalScoreText).width;
  const totalRankX = 300 + totalScoreWidth + 18;
  await drawRankRibbon(
    ctx,
    getDeadlyRankFromAbstract(deadlyData?.abstract_info, "normal") ??
      rankPercentOf(deadlyData),
    totalRankX,
    642,
    126,
    33,
    font,
  );
  await drawStarCount(
    ctx,
    deadlyData?.total_star,
    totalRankX + 136,
    640,
    38,
    font,
    "normal",
    "#FFFFFF",
  );
  ctx.fillStyle = "rgba(168,223,255,0.7)";
  ctx.fillRect(60, 688, 1080, 3);

  const normalBattles = Array.isArray(deadlyData?.list)
    ? deadlyData.list.slice(0, 3)
    : [];
  const rowY = 700;
  const rowHeight = 230;
  const rowGap = 15;
  for (let index = 0; index < 3; index += 1) {
    const battle = normalBattles[index];
    const y = rowY + index * (rowHeight + rowGap);
    if (battle) {
      await drawTrialRow(
        ctx,
        battle,
        60,
        y,
        1080,
        rowHeight,
        font,
        userLocale,
        labels,
      );
    } else {
      drawEmptySection(
        ctx,
        60,
        y,
        1080,
        rowHeight,
        labels.noNormal,
        font,
        "#4C7185",
      );
    }
  }

  return canvas.toBuffer("image/png");
}

export const DEADLY_COMBINED_SIZE = { width: WIDTH, height: HEIGHT } as const;
