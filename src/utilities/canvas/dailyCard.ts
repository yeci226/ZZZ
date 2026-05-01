import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import axios from "axios";
import moment from "moment-timezone";
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

function roundedRect(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export async function buildZZZDailyCard(
  payload: ZZZDailyCardPayload,
): Promise<Buffer> {
  const W = 900;
  const H = 340;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const font = '"ZZZFont", "ZZZFontEn", sans-serif';

  // Background gradient — ZZZ dark gold/yellow theme
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1a1209");
  bg.addColorStop(0.5, "#1f1a0e");
  bg.addColorStop(1, "#2a1f10");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Outer panel
  const px = 28, py = 24, pw = W - 56, ph = H - 48;
  roundedRect(ctx, px, py, pw, ph, 20);
  ctx.fillStyle = "rgba(10, 8, 4, 0.62)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 195, 50, 0.28)";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Accent bar left
  ctx.fillStyle = "#FFB830";
  roundedRect(ctx, px, py + 20, 4, ph - 40, 2);
  ctx.fill();

  // ── LEFT: Nickname + UID ──
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 36px ${font}`;
  ctx.fillText(payload.nickname, px + 24, py + 56);

  ctx.fillStyle = "#c4a96a";
  ctx.font = `22px ${font}`;
  ctx.fillText(`UID ${payload.uid}`, px + 24, py + 88);

  // Status badge
  const signed = payload.status === "success";
  const badgeText = signed ? "✔ 簽到成功" : "✔ 已簽到";
  const badgeColor = signed ? "#FFB830" : "#a0b8d0";
  roundedRect(ctx, px + 24, py + 104, 150, 36, 10);
  ctx.fillStyle = signed
    ? "rgba(255, 184, 48, 0.18)"
    : "rgba(160, 184, 208, 0.15)";
  ctx.fill();
  ctx.strokeStyle = signed
    ? "rgba(255, 184, 48, 0.55)"
    : "rgba(160, 184, 208, 0.38)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = badgeColor;
  ctx.font = `bold 20px ${font}`;
  ctx.fillText(badgeText, px + 36, py + 128);

  // ── CENTER: Reward icon ──
  const iconSize = 128;
  const iconX = Math.floor(W / 2) - 64;
  const iconY = py + 40;

  roundedRect(ctx, iconX - 8, iconY - 8, iconSize + 16, iconSize + 16, 16);
  ctx.fillStyle = "rgba(255, 184, 48, 0.10)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 184, 48, 0.30)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const iconBuffer = payload.rewardIcon
    ? await loadImageBuffer(payload.rewardIcon)
    : null;
  if (iconBuffer) {
    try {
      const img = await loadImage(iconBuffer);
      const ratio = Math.min(iconSize / img.width, iconSize / img.height);
      const dw = img.width * ratio;
      const dh = img.height * ratio;
      ctx.drawImage(
        img,
        iconX + (iconSize - dw) / 2,
        iconY + (iconSize - dh) / 2,
        dw,
        dh,
      );
    } catch {
      // fallback: draw reward name initials
      ctx.fillStyle = "rgba(255, 195, 80, 0.3)";
      ctx.font = `bold 28px ${font}`;
      const initials = (payload.rewardName || "?").slice(0, 2);
      const tw = ctx.measureText(initials).width;
      ctx.fillText(initials, iconX + (iconSize - tw) / 2, iconY + iconSize / 2 + 10);
    }
  } else {
    ctx.fillStyle = "rgba(255, 195, 80, 0.3)";
    ctx.font = `bold 28px ${font}`;
    const initials = (payload.rewardName || "?").slice(0, 2);
    const tw = ctx.measureText(initials).width;
    ctx.fillText(initials, iconX + (iconSize - tw) / 2, iconY + iconSize / 2 + 10);
  }

  // Reward name + count below icon
  ctx.fillStyle = "#f5e0a0";
  ctx.font = `bold 22px ${font}`;
  const rewardLabel = `${payload.rewardName} ×${payload.rewardCount}`;
  const labelW = ctx.measureText(rewardLabel).width;
  ctx.fillText(rewardLabel, iconX + (iconSize - labelW) / 2 + 8, iconY + iconSize + 30);

  // "今日獎勵" label above
  ctx.fillStyle = "#a08050";
  ctx.font = `18px ${font}`;
  const topLabel = "今日獎勵";
  const topLabelW = ctx.measureText(topLabel).width;
  ctx.fillText(topLabel, iconX + (iconSize - topLabelW) / 2 + 8, iconY - 14);

  // ── RIGHT: Stats ──
  const rightX = W - px - 240;
  const statsStartY = py + 56;
  const lineH = 52;

  const stats: [string, string][] = [
    ["累計簽到", `${payload.totalDays} 天`],
  ];
  if (payload.shortSignDay !== undefined) {
    stats.push(["本月簽到", `${payload.shortSignDay} 天`]);
  }
  if (payload.signCntMissed !== undefined) {
    stats.push(["本月漏簽", `${payload.signCntMissed} 天`]);
  }

  for (let i = 0; i < stats.length; i++) {
    const [label, value] = stats[i];
    const sy = statsStartY + i * lineH;

    ctx.fillStyle = "#8a7a5a";
    ctx.font = `19px ${font}`;
    ctx.fillText(label, rightX, sy);

    ctx.fillStyle = "#FFD97A";
    ctx.font = `bold 30px ${font}`;
    ctx.fillText(value, rightX, sy + 30);
  }

  // Timestamp bottom right
  const ts = moment().tz("Asia/Taipei").format("YYYY/MM/DD HH:mm");
  ctx.fillStyle = "#5a4a2a";
  ctx.font = `16px ${font}`;
  const tsW = ctx.measureText(ts).width;
  ctx.fillText(ts, W - px - tsW - 8, H - py - 8);

  return canvas.toBuffer("image/png");
}
