import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import axios from "axios";
import fs from "fs";
import path from "path";
import {
  calculateRedeemCardLayout,
  getFirstRedeemRewardIcon,
  getRedeemStatusPresentation,
  normalizeRedeemRewards,
  type RedeemResultStatus,
} from "../zzz/redeemLayout.js";

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
  rewards?: string[] | string;
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

export const ZZZ_REDEEM_BACKGROUND = path.join(
  assetDir,
  "images",
  "profileBgDark.png",
);

const imageCache = new Map<string, Buffer>();

async function loadImageBuffer(source: string): Promise<Buffer | null> {
  if (!source) return null;
  const cached = imageCache.get(source);
  if (cached) return cached;
  try {
    const buffer = /^https?:\/\//i.test(source)
      ? Buffer.from(
          (
            await axios.get<ArrayBuffer>(source, {
              responseType: "arraybuffer",
              timeout: 8000,
            })
          ).data,
        )
      : fs.readFileSync(source);
    imageCache.set(source, buffer);
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

function fitText(
  ctx: any,
  text: string,
  maxWidth: number,
  font: string,
  startSize: number,
  minSize: number,
  weight = "bold",
): void {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth || size <= minSize) return;
    size -= 1;
  } while (size >= minSize);
}

function ellipsize(ctx: any, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
}

function drawCover(
  ctx: any,
  image: any,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
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

async function drawBackground(ctx: any, width: number, height: number): Promise<void> {
  const backgroundBuffer = await loadImageBuffer(ZZZ_REDEEM_BACKGROUND);
  if (backgroundBuffer) {
    try {
      const background = await loadImage(backgroundBuffer);
      drawCover(ctx, background, 0, 0, width, height);
      ctx.fillStyle = "rgba(5, 7, 4, 0.34)";
      ctx.fillRect(0, 0, width, height);
      return;
    } catch {
      // Fall back to the branded dark surface below.
    }
  }

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#15170F");
  gradient.addColorStop(0.55, "#222217");
  gradient.addColorStop(1, "#10120D");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

async function drawCodeRow(
  ctx: any,
  result: ZZZRedeemCodeResult,
  x: number,
  y: number,
  width: number,
  height: number,
  font: string,
): Promise<void> {
  const presentation = getRedeemStatusPresentation(result.status);
  roundedRect(ctx, x, y, width, height, 12);
  ctx.fillStyle = "rgba(8, 9, 6, 0.58)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = presentation.color;
  ctx.fillRect(x, y + 12, 3, height - 24);

  const iconSource = getFirstRedeemRewardIcon(result);
  const iconBuffer = iconSource ? await loadImageBuffer(iconSource) : null;
  let textX = x + 22;
  if (iconBuffer) {
    try {
      const icon = await loadImage(iconBuffer);
      const iconSize = 58;
      const iconX = x + 15;
      const iconY = y + (height - iconSize) / 2;
      roundedRect(ctx, iconX, iconY, iconSize, iconSize, 10);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fill();
      const scale = Math.min((iconSize - 8) / icon.width, (iconSize - 8) / icon.height);
      const drawWidth = icon.width * scale;
      const drawHeight = icon.height * scale;
      ctx.drawImage(
        icon,
        iconX + (iconSize - drawWidth) / 2,
        iconY + (iconSize - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
      textX = iconX + iconSize + 16;
    } catch {
      // Keep the compact text-only row when the optional icon cannot be decoded.
    }
  }

  const statusWidth = 125;
  ctx.fillStyle = "#FFFFFF";
  fitText(ctx, result.code, width - (textX - x) - statusWidth - 25, font, 22, 16);
  ctx.fillText(result.code, textX, y + 34);

  ctx.font = `15px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.64)";
  const rewardText = normalizeRedeemRewards(result.rewards, result.status);
  ctx.fillText(
    ellipsize(ctx, rewardText, width - (textX - x) - 25),
    textX,
    y + 62,
  );

  ctx.textAlign = "right";
  ctx.font = `bold 14px ${font}`;
  ctx.fillStyle = presentation.color;
  ctx.fillText(presentation.label, x + width - 18, y + 33);
  ctx.textAlign = "left";
}

export async function renderZZZRedeemCard(
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
  ctx.fillStyle = "#E8FF70";
  ctx.fillRect(34, 29, 5, 31);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 27px ${font}`;
  ctx.fillText("自動兌換", 53, 54);

  let accountY = 82;
  for (let accountIndex = 0; accountIndex < accounts.length; accountIndex += 1) {
    const account = accounts[accountIndex]!;
    ctx.fillStyle = "#F7F3DD";
    fitText(ctx, account.nickname || "未命名帳號", 520, font, 23, 17);
    ctx.fillText(account.nickname || "未命名帳號", 34, accountY + 27);
    ctx.fillStyle = "rgba(255,255,255,0.48)";
    ctx.font = `16px ${font}`;
    ctx.fillText(`UID ${account.uid}`, 34, accountY + 52);

    const rowsY = accountY + layout.accountHeaderHeight;
    if (account.codes.length === 0) {
      await drawCodeRow(
        ctx,
        { code: "沒有新的兌換碼", status: "already_claimed" },
        34,
        rowsY,
        layout.width - 68,
        layout.rowHeight,
        font,
      );
    } else {
      for (let index = 0; index < account.codes.length; index += 1) {
        await drawCodeRow(
          ctx,
          account.codes[index]!,
          34,
          rowsY + index * (layout.rowHeight + layout.rowGap),
          layout.width - 68,
          layout.rowHeight,
          font,
        );
      }
    }
    accountY += layout.accountHeights[accountIndex]! + layout.accountGap;
  }

  return canvas.toBuffer("image/png");
}

export async function buildZZZRedeemCard(
  payload: ZZZRedeemCardPayload,
): Promise<Buffer> {
  return renderZZZRedeemCard(payload);
}
