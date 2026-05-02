import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import axios from "axios";
import moment from "moment-timezone";
import { getTodayWallpaper } from "../zzz/wallpaperManager.js";
import { client } from "../../index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Register fonts
const assetDir = path.join(__dirname, "../../assets");
const fontCandidates = [
  { file: "zh-tw.ttf", family: "ZZZFont" },
  { file: "en-us.ttf", family: "ZZZFontEn" },
];
for (const { file, family } of fontCandidates) {
  const candidates = [
    path.join(assetDir, file),
    path.join(process.cwd(), "src/assets", file),
    path.join(process.cwd(), "dist/assets", file),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      GlobalFonts.registerFromPath(p, family);
      break;
    }
  }
}

export interface ZZZDailyCardPayload {
  nickname: string;
  uid: string;
  status: "success" | "already_signed";
  rewardName: string;
  rewardIcon?: string;
  rewardCount: number;
  totalDays: number;
  shortSignDay?: number;
  signCntMissed?: number;
  tomorrowRewardName?: string;
  tomorrowRewardIcon?: string;
  tomorrowRewardCount?: number;
  // i18n labels (pre-translated by caller)
  labelTodayReward?: string;
  labelTomorrowReward?: string;
  labelMonthSignIn?: string;
  labelMonthMissed?: string;
}

const imageCache = new Map<string, Buffer>();

async function loadImageBuffer(url: string): Promise<Buffer | null> {
  if (!url) return null;
  const cached = imageCache.get(url);
  if (cached) return cached;
  try {
    const res = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 8000,
    });
    const buf = Buffer.from(res.data);
    imageCache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

function applyTextShadow(ctx: any, color = "rgba(0,0,0,0.9)", blur = 8) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function drawTextWithStroke(
  ctx: any,
  text: string,
  x: number,
  y: number,
  strokeWidth = 4,
  strokeColor = "rgba(0,0,0,0.95)",
  fillColor = "#FFFFFF",
) {
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
}

function clearShadow(ctx: any) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

function drawFallbackBg(ctx: any, W: number, H: number) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1a1209");
  bg.addColorStop(0.5, "#1f1a0e");
  bg.addColorStop(1, "#2a1f10");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
}

export async function buildZZZDailyCard(
  payload: ZZZDailyCardPayload,
): Promise<Buffer> {
  const W = 1280;
  const H = 720;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const font = '"ZZZFont", "ZZZFontEn", sans-serif';

  // ── BACKGROUND: wallpaper or fallback gradient ──
  const wallpaperUrl = await getTodayWallpaper(client.db).catch(() => null);
  const wallpaperBuf = wallpaperUrl ? await loadImageBuffer(wallpaperUrl) : null;

  if (wallpaperBuf) {
    try {
      const wpImg = await loadImage(wallpaperBuf);
      // Cover-fit: scale so image fills 1280×720, crop center
      const scale = Math.max(W / wpImg.width, H / wpImg.height);
      const dw = wpImg.width * scale;
      const dh = wpImg.height * scale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      ctx.drawImage(wpImg, dx, dy, dw, dh);
    } catch {
      drawFallbackBg(ctx, W, H);
    }
  } else {
    drawFallbackBg(ctx, W, H);
  }

  // Bottom gradient for text legibility
  const grad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── TOP-LEFT: Nickname + UID ──
  ctx.font = `48px ${font}`;
  drawTextWithStroke(ctx, payload.nickname, 48, 80, 6);

  ctx.font = `26px ${font}`;
  drawTextWithStroke(ctx, `UID ${payload.uid}`, 48, 116, 4);

  // ── CENTER: Today's reward ──
  const iconSize = 160;
  const centerX = Math.floor(W / 2);
  const iconY = H - 260;
  const iconX = centerX - iconSize / 2;

  applyTextShadow(ctx, "rgba(0,0,0,0.8)", 10);
  ctx.fillStyle = "#d4b870";
  ctx.font = `22px ${font}`;
  const todayLabel = payload.labelTodayReward ?? "今日獎勵";
  ctx.fillText(todayLabel, centerX - ctx.measureText(todayLabel).width / 2, iconY - 16);
  clearShadow(ctx);

  const iconBuf = payload.rewardIcon ? await loadImageBuffer(payload.rewardIcon) : null;
  if (iconBuf) {
    try {
      const img = await loadImage(iconBuf);
      const ratio = Math.min(iconSize / img.width, iconSize / img.height);
      const dw = img.width * ratio;
      const dh = img.height * ratio;
      ctx.drawImage(img, iconX + (iconSize - dw) / 2, iconY + (iconSize - dh) / 2, dw, dh);
    } catch { /* no icon */ }
  }

  applyTextShadow(ctx, "rgba(0,0,0,0.9)", 10);
  ctx.font = `bold 28px ${font}`;
  const rewardLabel = `${payload.rewardName} ×${payload.rewardCount}`;
  drawTextWithStroke(ctx, rewardLabel, centerX - ctx.measureText(rewardLabel).width / 2, iconY + iconSize + 38, 5);
  clearShadow(ctx);

  // ── RIGHT: Tomorrow's reward + stats ──
  const rightX = W - 340;
  let rightY = H - 280;

  if (payload.tomorrowRewardName) {
    applyTextShadow(ctx, "rgba(0,0,0,0.8)", 8);
    ctx.fillStyle = "#a08858";
    ctx.font = `20px ${font}`;
    ctx.fillText(payload.labelTomorrowReward ?? "明日獎勵", rightX, rightY);
    rightY += 28;
    clearShadow(ctx);

    const tmIconSize = 80;
    const tmIconBuf = payload.tomorrowRewardIcon
      ? await loadImageBuffer(payload.tomorrowRewardIcon)
      : null;
    if (tmIconBuf) {
      try {
        const img = await loadImage(tmIconBuf);
        const ratio = Math.min(tmIconSize / img.width, tmIconSize / img.height);
        const dw = img.width * ratio;
        const dh = img.height * ratio;
        ctx.drawImage(img, rightX + (tmIconSize - dw) / 2, rightY + (tmIconSize - dh) / 2, dw, dh);
      } catch { /* no icon */ }
    }

    const tmrLabel = payload.tomorrowRewardCount
      ? `${payload.tomorrowRewardName} ×${payload.tomorrowRewardCount}`
      : payload.tomorrowRewardName;
    ctx.font = `bold 28px ${font}`;
    drawTextWithStroke(ctx, tmrLabel, rightX + tmIconSize + 10, rightY + 50, 5);
    clearShadow(ctx);
    rightY += tmIconSize + 16;
  }

  // Stats
  const statLines: [string, string][] = [];
  if (payload.shortSignDay !== undefined)
    statLines.push([payload.labelMonthSignIn ?? "本月簽到", `${payload.shortSignDay} 天`]);
  if (payload.signCntMissed !== undefined)
    statLines.push([payload.labelMonthMissed ?? "本月漏簽", `${payload.signCntMissed} 天`]);

  for (const [label, value] of statLines) {
    applyTextShadow(ctx, "rgba(0,0,0,0.8)", 8);
    ctx.fillStyle = "#8a7a5a";
    ctx.font = `20px ${font}`;
    ctx.fillText(label, rightX, rightY + 18);
    ctx.fillStyle = "#FFD97A";
    ctx.font = `bold 30px ${font}`;
    ctx.fillText(value, rightX, rightY + 48);
    clearShadow(ctx);
    rightY += 62;
  }

  // ── BOTTOM-RIGHT: Timestamp ──
  const ts = moment().tz("Asia/Taipei").format("YYYY/MM/DD HH:mm");
  ctx.font = `18px ${font}`;
  const tsW = ctx.measureText(ts).width;
  drawTextWithStroke(ctx, ts, W - 48 - tsW, H - 24, 3);

  return canvas.toBuffer("image/png");
}
