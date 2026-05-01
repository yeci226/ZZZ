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

export interface ZZZRedeemCodeResult {
  code: string;
  rewards?: string[];
  rewardIcons?: string[]; // optional per-reward icon URLs
  status: "success" | "already_claimed" | "invalid" | "failed";
}

export interface ZZZRedeemAccountResult {
  nickname: string;
  uid: string;
  codes: ZZZRedeemCodeResult[];
}

export interface ZZZRedeemCardPayload {
  accounts: ZZZRedeemAccountResult[];
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

function roundedRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
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

// Draw a single reward tile (like daily card's reward icon block)
async function drawTile(
  ctx: any,
  x: number,
  y: number,
  tileSize: number,
  codeResult: ZZZRedeemCodeResult,
  font: string,
) {
  const isDimmed = codeResult.status !== "success";
  const r = 14;

  // Icon background box
  roundedRect(ctx, x, y, tileSize, tileSize, r);
  ctx.fillStyle = isDimmed ? "rgba(10,8,2,0.70)" : "rgba(15,10,3,0.62)";
  ctx.fill();
  ctx.strokeStyle = isDimmed
    ? "rgba(255,184,48,0.16)"
    : "rgba(255,184,48,0.40)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner glow (success only)
  if (!isDimmed) {
    ctx.save();
    roundedRect(ctx, x, y, tileSize, tileSize, r);
    ctx.clip();
    const glow = ctx.createRadialGradient(
      x + tileSize / 2, y + tileSize / 2, tileSize * 0.1,
      x + tileSize / 2, y + tileSize / 2, tileSize * 0.7,
    );
    glow.addColorStop(0, "rgba(255,184,48,0.06)");
    glow.addColorStop(1, "rgba(255,184,48,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, tileSize, tileSize);
    ctx.restore();
  }

  // Reward icon (first one if available)
  const iconUrl = codeResult.rewardIcons?.[0];
  const iconBuf = iconUrl ? await loadImageBuffer(iconUrl) : null;
  const iconPad = tileSize * 0.18;
  const iconSize = tileSize - iconPad * 2;

  if (iconBuf) {
    try {
      const img = await loadImage(iconBuf);
      const ratio = Math.min(iconSize / img.width, iconSize / img.height);
      const dw = img.width * ratio;
      const dh = img.height * ratio;
      const ix = x + (tileSize - dw) / 2;
      const iy = y + (tileSize - dh) / 2;
      ctx.save();
      if (isDimmed) ctx.globalAlpha = 0.32;
      ctx.drawImage(img, ix, iy, dw, dh);
      ctx.restore();
    } catch { /* skip */ }
  }

  // Below tile: code text
  const codeY = y + tileSize + 10;
  applyTextShadow(ctx, "rgba(0,0,0,1)", 6);
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `${Math.round(tileSize * 0.115)}px ${font}`;
  // truncate code to fit tile width
  let codeText = codeResult.code;
  while (ctx.measureText(codeText).width > tileSize - 4 && codeText.length > 4) {
    codeText = codeText.slice(0, -1);
  }
  if (codeText !== codeResult.code) codeText += "…";
  const codeTextW = ctx.measureText(codeText).width;
  ctx.fillText(codeText, x + (tileSize - codeTextW) / 2, codeY);
  clearShadow(ctx);

  // Reward name(s)
  const rewardFontSize = Math.round(tileSize * 0.135);
  ctx.font = `600 ${rewardFontSize}px ${font}`;
  const rewardY = codeY + rewardFontSize + 4;

  if (codeResult.rewards?.length) {
    // show first reward; if multiple rewards join with ×
    const rewardLine = codeResult.rewards[0];
    applyTextShadow(ctx, "rgba(0,0,0,1)", 8);
    ctx.fillStyle = isDimmed ? "rgba(240,216,152,0.32)" : "#f0d898";
    let displayReward = rewardLine;
    while (ctx.measureText(displayReward).width > tileSize - 4 && displayReward.length > 2) {
      displayReward = displayReward.slice(0, -1);
    }
    if (displayReward !== rewardLine) displayReward += "…";
    const rw = ctx.measureText(displayReward).width;
    ctx.fillText(displayReward, x + (tileSize - rw) / 2, rewardY);

    // second reward on next line if present
    if (codeResult.rewards.length > 1) {
      const reward2 = codeResult.rewards[1];
      ctx.fillStyle = isDimmed ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.42)";
      ctx.font = `${Math.round(tileSize * 0.115)}px ${font}`;
      let d2 = reward2;
      while (ctx.measureText(d2).width > tileSize - 4 && d2.length > 2) {
        d2 = d2.slice(0, -1);
      }
      if (d2 !== reward2) d2 += "…";
      const r2w = ctx.measureText(d2).width;
      ctx.fillText(d2, x + (tileSize - r2w) / 2, rewardY + rewardFontSize + 2);
    }
    clearShadow(ctx);
  } else {
    // status label for non-success
    const statusLabel =
      codeResult.status === "already_claimed" ? "已兌換" :
      codeResult.status === "invalid" ? "無效" : "失敗";
    applyTextShadow(ctx, "rgba(0,0,0,1)", 8);
    ctx.fillStyle = "rgba(240,216,152,0.32)";
    const slw = ctx.measureText(statusLabel).width;
    ctx.fillText(statusLabel, x + (tileSize - slw) / 2, rewardY);
    clearShadow(ctx);
  }
}

export async function buildZZZRedeemCard(
  payload: ZZZRedeemCardPayload,
): Promise<Buffer> {
  const font = '"ZZZFont", "ZZZFontEn", sans-serif';
  const W = 1280;

  // Layout constants (proportional to W)
  const PAD_X = Math.round(W * 0.055);   // 70px
  const PAD_TOP = Math.round(W * 0.038); // 49px
  const META_H = Math.round(W * 0.022);  // 28px  — game logo + timestamp row
  const META_GAP = Math.round(W * 0.018);
  const ACC_LABEL_H = Math.round(W * 0.034); // 44px
  const ACC_LABEL_GAP = Math.round(W * 0.016);
  const TILE_SIZE = Math.round(W * 0.095); // 122px
  const TILE_GAP = Math.round(W * 0.016);
  // tile block height = tileSize + code + 2 reward lines
  const TILE_BLOCK_H = TILE_SIZE + Math.round(TILE_SIZE * 0.115) + 10 + Math.round(TILE_SIZE * 0.135) * 2 + 6;
  const ACC_GAP = Math.round(W * 0.032);
  const FOOTER_H = Math.round(W * 0.05);
  const PAD_BOT = Math.round(W * 0.04);

  // Calculate canvas height
  let contentH = PAD_TOP + META_H + META_GAP;
  for (const acc of payload.accounts) {
    contentH += ACC_LABEL_H + ACC_LABEL_GAP + TILE_BLOCK_H + ACC_GAP;
  }
  contentH += FOOTER_H + PAD_BOT;
  const H = Math.max(Math.round(W * 0.5625), contentH); // min 16:9

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── BACKGROUND ──
  const wallpaperUrl = await getTodayWallpaper(client.db).catch(() => null);
  const wallpaperBuf = wallpaperUrl ? await loadImageBuffer(wallpaperUrl) : null;

  if (wallpaperBuf) {
    try {
      const wpImg = await loadImage(wallpaperBuf);
      const scale = Math.max(W / wpImg.width, H / wpImg.height);
      const dw = wpImg.width * scale;
      const dh = wpImg.height * scale;
      ctx.drawImage(wpImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } catch {
      drawFallbackBg(ctx, W, H);
    }
  } else {
    drawFallbackBg(ctx, W, H);
  }

  // Gradient overlays (same as daily card)
  const gradBottom = ctx.createLinearGradient(0, H * 0.2, 0, H);
  gradBottom.addColorStop(0, "rgba(0,0,0,0)");
  gradBottom.addColorStop(0.35, "rgba(0,0,0,0.15)");
  gradBottom.addColorStop(0.75, "rgba(0,0,0,0.72)");
  gradBottom.addColorStop(1, "rgba(0,0,0,0.88)");
  ctx.fillStyle = gradBottom;
  ctx.fillRect(0, 0, W, H);

  const gradLeft = ctx.createLinearGradient(0, 0, W * 0.5, 0);
  gradLeft.addColorStop(0, "rgba(0,0,0,0.55)");
  gradLeft.addColorStop(0.3, "rgba(0,0,0,0.15)");
  gradLeft.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradLeft;
  ctx.fillRect(0, 0, W, H);

  const gradRight = ctx.createLinearGradient(W, 0, W * 0.55, 0);
  gradRight.addColorStop(0, "rgba(0,0,0,0.50)");
  gradRight.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradRight;
  ctx.fillRect(0, 0, W, H);

  // Top / bottom gold bars
  const barGrad = ctx.createLinearGradient(W * 0.05, 0, W * 0.95, 0);
  barGrad.addColorStop(0, "rgba(255,184,48,0)");
  barGrad.addColorStop(0.3, "rgba(255,184,48,0.5)");
  barGrad.addColorStop(0.7, "rgba(255,184,48,0.5)");
  barGrad.addColorStop(1, "rgba(255,184,48,0)");
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 0, W, 2);

  const barGradBot = ctx.createLinearGradient(W * 0.05, 0, W * 0.95, 0);
  barGradBot.addColorStop(0, "rgba(255,184,48,0)");
  barGradBot.addColorStop(0.3, "rgba(255,184,48,0.30)");
  barGradBot.addColorStop(0.7, "rgba(255,184,48,0.30)");
  barGradBot.addColorStop(1, "rgba(255,184,48,0)");
  ctx.fillStyle = barGradBot;
  ctx.fillRect(0, H - 2, W, 2);

  // ── META ROW: game logo + timestamp ──
  let curY = PAD_TOP;
  const metaFontSize = Math.round(W * 0.011);
  ctx.font = `500 ${metaFontSize}px ${font}`;

  applyTextShadow(ctx, "rgba(0,0,0,1)", 4);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillText("ZENLESS ZONE ZERO", PAD_X, curY + metaFontSize);

  const ts = moment().tz("Asia/Taipei").format("YYYY/MM/DD HH:mm");
  const tsW = ctx.measureText(ts).width;
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillText(ts, W - PAD_X - tsW, curY + metaFontSize);
  clearShadow(ctx);

  curY += META_H + META_GAP;

  // ── ACCOUNTS ──
  for (const acc of payload.accounts) {
    // Nickname + UID
    const nickFontSize = Math.round(W * 0.028);
    const uidFontSize = Math.round(W * 0.013);

    applyTextShadow(ctx, "rgba(0,0,0,0.95)", 12);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${nickFontSize}px ${font}`;
    ctx.fillText(acc.nickname, PAD_X, curY + nickFontSize);

    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.font = `${uidFontSize}px ${font}`;
    const nickW = ctx.measureText(acc.nickname).width;
    ctx.fillText(`UID  ${acc.uid}`, PAD_X + nickW + 14, curY + nickFontSize - 2);
    clearShadow(ctx);

    curY += ACC_LABEL_H + ACC_LABEL_GAP;

    // Tiles
    let tileX = PAD_X;
    const availableW = W - PAD_X * 2;
    const tilesPerRow = Math.floor((availableW + TILE_GAP) / (TILE_SIZE + TILE_GAP));

    for (let i = 0; i < acc.codes.length; i++) {
      const col = i % tilesPerRow;
      const row = Math.floor(i / tilesPerRow);
      const tx = PAD_X + col * (TILE_SIZE + TILE_GAP);
      const ty = curY + row * (TILE_BLOCK_H + TILE_GAP);
      await drawTile(ctx, tx, ty, TILE_SIZE, acc.codes[i], font);
    }

    const rows = Math.ceil(acc.codes.length / tilesPerRow);
    curY += rows * (TILE_BLOCK_H + TILE_GAP) - TILE_GAP + ACC_GAP;
  }

  // ── FOOTER STATS ──
  const allCodes = payload.accounts.flatMap((a) => a.codes);
  const successCount = allCodes.filter((c) => c.status === "success").length;
  const failCount = allCodes.filter((c) => c.status === "failed" || c.status === "invalid").length;

  const statLabelSize = Math.round(W * 0.009);
  const statValueSize = Math.round(W * 0.022);
  const statItems = [
    { label: "成功", value: String(successCount) },
    { label: "失敗", value: String(failCount) },
    { label: "共", value: String(allCodes.length) },
  ];

  let statX = PAD_X;
  const footerY = H - PAD_BOT;

  for (let i = 0; i < statItems.length; i++) {
    const { label, value } = statItems[i];

    applyTextShadow(ctx, "rgba(0,0,0,1)", 4);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.font = `500 ${statLabelSize}px ${font}`;
    ctx.fillText(label.toUpperCase(), statX, footerY - statValueSize - 4);

    ctx.fillStyle = "#FFD97A";
    ctx.font = `700 ${statValueSize}px ${font}`;
    ctx.fillText(value, statX, footerY);
    clearShadow(ctx);

    const blockW = Math.max(
      ctx.measureText(label.toUpperCase()).width,
      ctx.measureText(value).width,
    );
    statX += blockW + Math.round(W * 0.025);

    // Divider between stat items
    if (i < statItems.length - 1) {
      const divX = statX - Math.round(W * 0.012);
      ctx.strokeStyle = "rgba(255,184,48,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(divX, footerY - statValueSize - 4);
      ctx.lineTo(divX, footerY);
      ctx.stroke();
    }
  }

  return canvas.toBuffer("image/png");
}
