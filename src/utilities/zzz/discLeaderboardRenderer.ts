import {
  createCanvas,
  loadImage,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import { ensureZzzCanvasFonts, getZzzCanvasFont } from "./canvasFonts.js";
import { drawGradeBadge } from "./discScorePresentation.js";
import { grade } from "./combat/scoring.js";
import { discText } from "./discLeaderboardCopy.js";

/** Display data only; rendering never enrolls a player or updates a score. */
export interface DiscLeaderboardEntry {
  rank: number;
  playerName: string;
  nickname?: string;
  uid?: string;
  avatarSource?: string;
  portraitSource: string | null;
  skinName: string | null;
  total: number;
  effectiveRolls?: number | null;
  accent?: string;
  grade?: string;
  updatedLabel: string;
  isViewer?: boolean;
}
export interface DiscLeaderboardPage {
  locale?: string;
  characterName: string;
  characterId: string;
  portraitSource: string | null;
  accent: string;
  scopeLabel: string;
  page: number;
  pageCount: number;
  participantCount: number;
  participating?: boolean;
  entries: DiscLeaderboardEntry[];
  viewer?: DiscLeaderboardEntry;
  /** Preview rows are explicitly marked, including their fictional ranks. */
  preview?: boolean;
  updatedLabel: string;
}

const WIDTH = 1000,
  HEADER = 224,
  ROW = 132,
  GAP = 10,
  FOOTER = 240;
const INK = "#15151b",
  PAPER = "#f5f0e8",
  MUTED = "#736c74";
const artCache = new Map<
  string,
  { at: number; image: Promise<Image | null> }
>();
function loadArt(source: string): Promise<Image | null> {
  const cached = artCache.get(source);
  if (cached && Date.now() - cached.at < 20 * 60_000) return cached.image;
  const image = (async () => {
    try {
      if (!source.startsWith("https://")) return await loadImage(source);
      const response = await fetch(source, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok || !response.body) return null;
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 8_000_000) return null;
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
      }
      return await loadImage(Buffer.concat(chunks));
    } catch {
      return null;
    }
  })();
  if (artCache.size >= 100) artCache.delete(artCache.keys().next().value!);
  artCache.set(source, { at: Date.now(), image });
  return image;
}

function roundBox(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  radius = 12,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}

/** Preserve aspect ratio; crop the sides of the API bust art to a tall frame. */
function portrait(
  ctx: SKRSContext2D,
  img: Image | null,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, w, h);
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, "#ffffff77");
  gradient.addColorStop(1, "#16141e44");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
  if (img) {
    const scale = Math.max(w / img.width, h / img.height);
    const drawnW = img.width * scale,
      drawnH = img.height * scale;
    ctx.drawImage(img, x + (w - drawnW) / 2, y, drawnW, drawnH);
  }
  ctx.restore();
}

function ellipsis(ctx: SKRSContext2D, value: string, width: number): string {
  if (ctx.measureText(value).width <= width) return value;
  const chars = Array.from(value);
  while (chars.length && ctx.measureText(chars.join("") + "…").width > width)
    chars.pop();
  return chars.join("") + "…";
}

export async function renderDiscLeaderboard(
  page: DiscLeaderboardPage,
): Promise<Buffer> {
  ensureZzzCanvasFonts();
  const font = getZzzCanvasFont(page.locale ?? "tw");
  const t = (
    key: Parameters<typeof discText>[1],
    values?: Record<string, string | number>,
  ) => discText(page.locale ?? "tw", key, values);
  const rows = page.entries.slice(0, 10);
  const height = HEADER + Math.max(1, rows.length) * (ROW + GAP) + FOOTER;
  const canvas = createCanvas(WIDTH, height),
    ctx = canvas.getContext("2d");
  const images = new Map<string, Image | null>();
  const sources = new Set(
    [
      page.portraitSource,
      page.viewer?.portraitSource,
      page.viewer?.avatarSource,
      ...rows.flatMap((row) => [row.portraitSource, row.avatarSource]),
    ].filter((source): source is string => Boolean(source)),
  );
  await Promise.all(
    [...sources].map(async (source) => {
      images.set(source, await loadArt(source));
    }),
  );
  const getImage = (source: string | null | undefined) =>
    source ? (images.get(source) ?? null) : null;
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color = INK,
    weight = 600,
    align: CanvasTextAlign = "left",
    maxWidth?: number,
  ) => {
    ctx.textAlign = align;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y, maxWidth);
  };
  const avatar = (entry: DiscLeaderboardEntry, x: number, y: number, size: number) => {
    ctx.save();
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "#566989"; ctx.fillRect(x, y, size, size);
    const image = getImage(entry.avatarSource);
    if (image) ctx.drawImage(image, x, y, size, size);
    else text(Array.from(entry.playerName)[0] ?? "?", x + size / 2, y + size * 0.7, size / 2, "#fff", 800, "center");
    ctx.restore();
  };
  const nickname = (entry: DiscLeaderboardEntry) => entry.nickname || entry.playerName;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, WIDTH, height);
  // A quiet grid gives the image the same printed-game-panel feel as character cards.
  ctx.strokeStyle = "#ffffff05";
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  portrait(ctx, getImage(page.portraitSource), 786, 19, 180, 178, page.accent);
  roundBox(ctx, 32, 28, 5, 146, page.accent, 2);
  text(t("title"), 54, 54, 19, "#cbc5ce", 600, "left", 680);
  text(page.characterName, 51, 106, 41, PAPER, 800, "left", 700);
  ctx.font = `800 15px ${font}`;
  const scopeWidth = Math.max(92, ctx.measureText(page.scopeLabel).width + 26);
  roundBox(ctx, 54, 126, scopeWidth, 30, page.accent, 15);
  text(page.scopeLabel, 54 + scopeWidth / 2, 147, 15, INK, 800, "center");
  text(
    t("players", { n: page.participantCount.toLocaleString() }),
    68 + scopeWidth,
    147,
    16,
    "#c7c1cb",
    600,
    "left",
    690 - scopeWidth,
  );
  if (page.preview)
    text(t("preview"), 54, 186, 14, "#d8c9af", 600, "left", 700);
  else
    text(
      `${t("updated")} ${page.updatedLabel} (UTC+8)`,
      54,
      186,
      14,
      "#aaa4b0",
    );
  text(t("rank"), 78, 216, 12, "#aaa4b0", 600, "center", 70);
  text(t("player"), 128, 216, 12, "#aaa4b0");
  text(`${t("total")} / 600`, 953, 216, 12, "#aaa4b0", 600, "right");

  rows.forEach((entry, index) => {
    const y = HEADER + index * (ROW + GAP);
    const accent = entry.accent ?? page.accent;
    roundBox(ctx, 30, y, 940, ROW, entry.isViewer ? "#fff9ed" : PAPER);
    if (entry.isViewer) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(31.5, y + 1.5, 937, ROW - 3, 11);
      ctx.stroke();
      roundBox(ctx, 30, y + 18, 5, ROW - 36, accent, 2);
    }
    const rankColor =
      ["#9c681c", "#5f6979", "#8d5143"][entry.rank - 1] ?? MUTED;
    ctx.font = "900 32px Nunito";
    ctx.fillStyle = rankColor;
    ctx.textAlign = "center";
    ctx.fillText(String(entry.rank).padStart(2, "0"), 78, y + 77);
    portrait(
      ctx,
      getImage(entry.portraitSource),
      122,
      y + 5,
      112,
      ROW - 10,
      accent,
    );

    ctx.font = `800 24px ${font}`;
    const name = ellipsis(ctx, nickname(entry), entry.isViewer ? 320 : 380);
    text(name, 255, y + 36, 24, INK, 800);
    if (entry.isViewer) {
      const nameWidth = ctx.measureText(name).width;
      ctx.font = `600 13px ${font}`;
      const tagWidth = ctx.measureText(t("you")).width + 14;
      roundBox(ctx, 266 + nameWidth, y + 16, tagWidth, 23, INK, 5);
      text(
        t("you"),
        266 + nameWidth + tagWidth / 2,
        y + 33,
        13,
        PAPER,
        600,
        "center",
      );
    }
    avatar(entry, 255, y + 44, 22);
    ctx.font = `500 14px ${font}`;
    text(ellipsis(ctx, entry.playerName, 366), 285, y + 62, 14, MUTED, 500);
    const uid = `UID ${entry.uid || "—"}`;
    text(uid, 255, y + 85, 14, "#514957", 600, "left", 210);
    const skinX = 255 + Math.min(ctx.measureText(uid).width, 210) + 18;
    ctx.font = `500 13px ${font}`;
    const skinName =
      entry.skinName?.split("·").slice(1).join("·") || entry.skinName;
    if (skinName)
      text(ellipsis(ctx, skinName, Math.max(60, 650 - skinX)), skinX, y + 85, 13, MUTED, 500);
    text(`${t("updated")} ${entry.updatedLabel}`, 255, y + 111, 12, MUTED, 500);

    text(t("effectiveRolls"), 733, y + 49, 11, MUTED, 500, "center", 140);
    ctx.fillStyle = INK;
    ctx.font = "800 29px Nunito";
    ctx.textAlign = "center";
    ctx.fillText(
      entry.effectiveRolls == null ? "—" : String(entry.effectiveRolls),
      733,
      y + 91,
    );

    ctx.fillStyle = INK;
    ctx.font = "900 42px Nunito";
    ctx.textAlign = "right";
    ctx.fillText(entry.total.toFixed(1), 942, y + 64);
    ctx.font = "800 14px EN";
    const gradeText = entry.grade ?? grade(entry.total / 6),
      gradeWidth = Math.ceil(ctx.measureText(gradeText).width) + 14;
    drawGradeBadge(ctx, gradeText, 942 - gradeWidth, y + 101, 14);
    text("/600", 929 - gradeWidth, y + 102, 14, MUTED, 500, "right");
  });
  if (!rows.length)
    text(t("empty"), 500, HEADER + 75, 22, PAPER, 600, "center", 890);

  const footerY = height - FOOTER + 16;
  const accent = page.viewer?.accent ?? page.accent;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(30, footerY, 940, 172, 16); ctx.clip();
  ctx.fillStyle = "#262730"; ctx.fillRect(30, footerY, 940, 172);
  const glow = ctx.createLinearGradient(30, footerY, 970, footerY + 172);
  glow.addColorStop(0, accent); glow.addColorStop(1, "#262730");
  ctx.globalAlpha = 0.25; ctx.fillStyle = glow; ctx.fillRect(30, footerY, 940, 172);
  ctx.globalAlpha = 1;
  ctx.fillStyle = accent; ctx.fillRect(30, footerY, 940, 3);
  ctx.restore();
  roundBox(ctx, 46, footerY + 46, 126, 108, "#ffffff09", 10);
  text(t("mine"), 56, footerY + 30, 16, "#e3dfeb", 700, "left", 125);
  ctx.font = "900 48px Nunito"; ctx.fillStyle = PAPER; ctx.textAlign = "center";
  ctx.fillText(page.viewer ? `#${page.viewer.rank}` : "—", 109, footerY + 105, 108);
  text(page.scopeLabel, 109, footerY + 135, 12, "#c2c5ce", 600, "center", 112);
  if (page.viewer) {
    const viewer = page.viewer;
    portrait(ctx, getImage(viewer.portraitSource), 190, footerY + 44, 84, 112, accent);
    ctx.font = `800 23px ${font}`;
    text(ellipsis(ctx, nickname(viewer), 334), 292, footerY + 70, 23, PAPER, 800);
    avatar(viewer, 292, footerY + 82, 22);
    ctx.font = `500 13px ${font}`;
    text(ellipsis(ctx, viewer.playerName, 296), 322, footerY + 99, 13, "#c2c5ce", 500);
    text(`UID ${viewer.uid || "—"}`, 292, footerY + 125, 15, "#ecedf0", 600, "left", 326);
    text(`${t("updated")} ${viewer.updatedLabel}`, 292, footerY + 148, 12, "#aaaebc", 500, "left", 326);
    roundBox(ctx, 650, footerY + 42, 1, 106, "#ffffff18", 0);
    text(t("effectiveRolls"), 730, footerY + 59, 11, "#b6bbc8", 500, "center", 132);
    ctx.font = "800 30px Nunito"; ctx.fillStyle = PAPER; ctx.textAlign = "center";
    ctx.fillText(viewer.effectiveRolls == null ? "—" : String(viewer.effectiveRolls), 730, footerY + 107);
    text(t("total"), 942, footerY + 42, 12, "#b6bbc8", 500, "right", 126);
    ctx.font = "900 46px Nunito"; ctx.fillStyle = PAPER; ctx.textAlign = "right";
    ctx.fillText(viewer.total.toFixed(1), 942, footerY + 96);
    ctx.font = "800 14px EN";
    const gradeText = viewer.grade ?? grade(viewer.total / 6);
    const badgeWidth = Math.ceil(ctx.measureText(gradeText).width) + 14;
    drawGradeBadge(ctx, gradeText, 942 - badgeWidth, footerY + 130, 14);
    text("/600", 929 - badgeWidth, footerY + 131, 14, "#b6bbc8", 500, "right");
  } else {
    roundBox(ctx, 199, footerY + 79, 13, 44, "#ffffff16", 3);
    roundBox(ctx, 219, footerY + 60, 13, 63, "#ffffff36", 3);
    roundBox(ctx, 239, footerY + 92, 13, 31, "#ffffff16", 3);
    text(t(page.participating === false ? "left" : "unranked"), 284, footerY + 82, 25, PAPER, 700, "left", 638);
    text(t(page.participating === false ? "rejoinPrompt" : "rankPrompt"), 284, footerY + 115, 15, "#b6bbc8", 500, "left", 638);
  }
  text(
    `${page.page} / ${page.pageCount}`,
    967,
    height - 24,
    16,
    PAPER,
    700,
    "right",
  );
  return canvas.toBuffer("image/png");
}
