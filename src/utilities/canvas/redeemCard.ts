import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import axios from "axios";
import fs from "fs";
import moment from "moment-timezone";
import path from "path";
import { client } from "../../index.js";
import {
  calculateRedeemCardLayout,
  getRedeemStatusPresentation,
  type RedeemResultStatus,
} from "../zzz/redeemLayout.js";
import { getTodayWallpaper } from "../zzz/wallpaperManager.js";

const assetDir = path.join(process.cwd(), "src/assets");
for (const { file, family } of [
  { file: "zh-tw.ttf", family: "ZZZFont" },
  { file: "en-us.ttf", family: "ZZZFontEn" },
]) {
  for (const candidate of [
    path.join(assetDir, file),
    path.join(process.cwd(), "dist/assets", file),
  ]) {
    if (fs.existsSync(candidate)) {
      GlobalFonts.registerFromPath(candidate, family);
      break;
    }
  }
}

export interface ZZZRedeemCodeResult {
  code: string;
  rewards?: string[];
  rewardIcons?: string[];
  status: RedeemResultStatus;
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
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 8000,
    });
    const buffer = Buffer.from(response.data);
    imageCache.set(url, buffer);
    return buffer;
  } catch {
    return null;
  }
}

function roundedRect(
  ctx: any,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
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

function fitFontSize(
  ctx: any,
  text: string,
  maxWidth: number,
  font: string,
  start: number,
  minimum: number,
): number {
  let size = start;
  ctx.font = `bold ${size}px ${font}`;
  while (size > minimum && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `bold ${size}px ${font}`;
  }
  return size;
}

function wrapText(
  ctx: any,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const character of text.trim()) {
    const candidate = line + character;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = character;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1] || "";
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    if (last !== text && !last.endsWith("…")) lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

async function drawBackground(ctx: any, width: number, height: number): Promise<void> {
  const wallpaperUrl = await getTodayWallpaper(client.db).catch(() => null);
  const wallpaperBuffer = wallpaperUrl
    ? await loadImageBuffer(wallpaperUrl)
    : null;
  if (wallpaperBuffer) {
    try {
      const image = await loadImage(wallpaperBuffer);
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
    } catch {
      ctx.fillStyle = "#17130D";
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#11130D");
    gradient.addColorStop(0.55, "#232015");
    gradient.addColorStop(1, "#11100B");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.fillStyle = "rgba(8, 8, 5, 0.78)";
  ctx.fillRect(0, 0, width, height);
  const shade = ctx.createLinearGradient(0, 0, width, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.35)");
  shade.addColorStop(0.5, "rgba(0,0,0,0.06)");
  shade.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
}

function drawAccountHeader(
  ctx: any,
  account: ZZZRedeemAccountResult,
  y: number,
  font: string,
): void {
  ctx.fillStyle = "#F6F1D5";
  fitFontSize(ctx, account.nickname || "Unknown", 360, font, 25, 17);
  ctx.fillText(account.nickname || "Unknown", 52, y + 29);
  ctx.fillStyle = "rgba(255,255,255,0.50)";
  ctx.font = `13px ${font}`;
  ctx.fillText(`UID  ${account.uid}`, 52, y + 53);

  const stats = [
    { status: "success" as const, label: "成功" },
    { status: "already_claimed" as const, label: "已兌換" },
    { status: "invalid" as const, label: "無效" },
    { status: "failed" as const, label: "失敗" },
  ];
  let x = 635;
  for (const stat of stats) {
    const presentation = getRedeemStatusPresentation(stat.status);
    const count = account.codes.filter((code) => code.status === stat.status).length;
    ctx.fillStyle = presentation.color;
    ctx.font = `bold 19px ${font}`;
    ctx.fillText(String(count), x, y + 31);
    ctx.fillStyle = "rgba(255,255,255,0.48)";
    ctx.font = `12px ${font}`;
    ctx.fillText(stat.label, x + 27, y + 29);
    x += 132;
  }
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(52, y + 68, 1176, 1);
}

function drawCodeItem(
  ctx: any,
  result: ZZZRedeemCodeResult,
  x: number,
  y: number,
  width: number,
  height: number,
  font: string,
): void {
  const presentation = getRedeemStatusPresentation(result.status);
  roundedRect(ctx, x, y, width, height, 14);
  ctx.fillStyle = presentation.background;
  ctx.fill();
  ctx.strokeStyle = presentation.border;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.44)";
  ctx.font = `11px ${font}`;
  ctx.fillText("兌換碼", x + 18, y + 24);

  ctx.font = `bold 12px ${font}`;
  const badgeWidth = ctx.measureText(presentation.label).width + 24;
  roundedRect(ctx, x + width - badgeWidth - 14, y + 12, badgeWidth, 25, 13);
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fill();
  ctx.fillStyle = presentation.color;
  ctx.fillText(presentation.label, x + width - badgeWidth - 2, y + 29);

  ctx.fillStyle = "#FFFFFF";
  fitFontSize(ctx, result.code, width - 36, font, 21, 14);
  ctx.fillText(result.code, x + 18, y + 57);

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x + 18, y + 70, width - 36, 1);
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.font = `11px ${font}`;
  ctx.fillText("兌換內容／獎勵", x + 18, y + 91);

  const rewardLabel = result.rewards?.length
    ? result.rewards.join("、")
    : result.status === "success"
      ? "兌換成功，獎勵資訊未提供"
      : "未取得獎勵";
  ctx.fillStyle = result.rewards?.length
    ? "rgba(255,255,255,0.86)"
    : "rgba(255,255,255,0.48)";
  ctx.font = `14px ${font}`;
  const lines = wrapText(ctx, rewardLabel, width - 36, 2);
  lines.forEach((line, index) => {
    ctx.fillText(line, x + 18, y + 115 + index * 20);
  });
}

export async function buildZZZRedeemCard(
  payload: ZZZRedeemCardPayload,
): Promise<Buffer> {
  const accounts = payload.accounts || [];
  const layout = calculateRedeemCardLayout(
    accounts.map((account) => account.codes.length),
  );
  const canvas = createCanvas(layout.width, layout.canvasHeight);
  const ctx = canvas.getContext("2d") as any;
  const font = '"ZZZFont", "ZZZFontEn", sans-serif';

  await drawBackground(ctx, layout.width, layout.canvasHeight);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 30px ${font}`;
  ctx.fillText("自動兌換結果", 52, 51);
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `14px ${font}`;
  ctx.fillText(
    `兌換明細 · ${accounts.length} 個帳號 · ${accounts.reduce((sum, account) => sum + account.codes.length, 0)} 個兌換碼`,
    52,
    76,
  );

  const contentWidth = layout.width - 104;
  const tileWidth = Math.floor(
    (contentWidth - layout.tileGap * (layout.tilesPerRow - 1)) /
      layout.tilesPerRow,
  );
  let accountY = 98;
  accounts.forEach((account, accountIndex) => {
    drawAccountHeader(ctx, account, accountY, font);
    const gridY = accountY + layout.accountHeaderHeight;
    if (account.codes.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.48)";
      ctx.font = `15px ${font}`;
      ctx.fillText("本次沒有需要顯示的兌換結果", 52, gridY + 45);
    }
    account.codes.forEach((result, index) => {
      const column = index % layout.tilesPerRow;
      const row = Math.floor(index / layout.tilesPerRow);
      const x = 52 + column * (tileWidth + layout.tileGap);
      const y = gridY + row * (layout.tileHeight + layout.tileGap);
      drawCodeItem(
        ctx,
        result,
        x,
        y,
        tileWidth,
        layout.tileHeight,
        font,
      );
    });
    accountY += layout.accountHeights[accountIndex] + layout.accountGap;
  });

  const timestamp = `${moment().tz("Asia/Taipei").format("YYYY/MM/DD · HH:mm")} CST`;
  ctx.fillStyle = "rgba(255,255,255,0.30)";
  ctx.font = `12px ${font}`;
  const timestampWidth = ctx.measureText(timestamp).width;
  ctx.fillText(
    timestamp,
    layout.width - 52 - timestampWidth,
    layout.canvasHeight - 26,
  );

  return canvas.toBuffer("image/png");
}
