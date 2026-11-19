import { loadImage } from "@napi-rs/canvas";

export async function loadImageAsync(url: string, fallbackUrl?: string) {
  try {
    return await loadImage(url);
  } catch {
    try {
      if (fallbackUrl) return await loadImage(fallbackUrl);
      return await loadImage("./src/assets/images/None.png");
    } catch {
      return await loadImage("./src/assets/images/None.png");
    }
  }
}

export function drawRoundedRect(
  ctx: any,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
  outlineWidth = 0,
  outlineColor = "black",
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  if (outlineWidth > 0) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth;
    ctx.stroke();
  }
}

export function drawRoundedRectPath(
  ctx: any,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export function drawCircleImage(
  ctx: any,
  img: any,
  x: number,
  y: number,
  size: number,
  scaleFactor = 1.2,
) {
  ctx.save();

  const radius = Math.max(8, Math.round(size * 0.16));
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, radius);
  ctx.clip();

  const scale = Math.min(size / img.width, size / img.height) * scaleFactor;
  const scaledWidth = img.width * scale;
  const scaledHeight = img.height * scale;
  const imgX = x + size / 2 - scaledWidth / 2;
  const imgY = y + size / 2 - scaledHeight / 2;
  ctx.drawImage(img, imgX, imgY, scaledWidth, scaledHeight);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, radius);
  ctx.stroke();
  ctx.restore();
}

const BUFF_FONT_SIZE = 18;
const BUFF_LINE_HEIGHT = 23;
const BUFF_TEXT_COLOR = "#E3E3E3";

// Keep colors attached to code points so wrapping cannot shift color ranges.
function layoutBuffText(ctx: any, text: string, maxWidth: number) {
  const glyphs: { char: string; color: string; x: number; line: number }[] = [];
  const colors = [BUFF_TEXT_COLOR];
  let line = 0;
  let x = 0;
  const tokens =
    text
      .replace(/\\n/g, "\n")
      .match(/<color=#[a-f0-9]+>|<\/color>|[^<]+|</gi) || [];

  for (const token of tokens) {
    const opening = token.match(/^<color=(#[a-f0-9]+)>$/i);
    if (opening) {
      colors.push(opening[1]);
      continue;
    }
    if (token.toLowerCase() === "</color>") {
      if (colors.length > 1) colors.pop();
      continue;
    }
    for (const char of token) {
      if (char === "\n") {
        line++;
        x = 0;
        continue;
      }
      const width = ctx.measureText(char).width;
      if (x > 0 && x + width > maxWidth) {
        line++;
        x = 0;
      }
      glyphs.push({ char, color: colors[colors.length - 1], x, line });
      x += width;
    }
  }
  return { glyphs, lineCount: line + 1 };
}

export function estimateTextHeight(
  ctx: any,
  text: string,
  maxWidth: number,
  fontFamily: string,
) {
  const originalFont = ctx.font;
  ctx.font = `${BUFF_FONT_SIZE}px ${fontFamily}`;
  const { lineCount } = layoutBuffText(ctx, text, maxWidth);
  ctx.font = originalFont;
  return (lineCount - 1) * BUFF_LINE_HEIGHT + BUFF_FONT_SIZE;
}

export function drawBuffText(
  ctx: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontFamily: string,
) {
  const originalFillStyle = ctx.fillStyle;
  ctx.save();
  ctx.font = `${BUFF_FONT_SIZE}px ${fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const { glyphs, lineCount } = layoutBuffText(ctx, text, maxWidth);
  for (const glyph of glyphs) {
    ctx.fillStyle = glyph.color;
    ctx.fillText(glyph.char, x + glyph.x, y + glyph.line * BUFF_LINE_HEIGHT);
  }
  ctx.restore();
  ctx.fillStyle = originalFillStyle;
  return y + lineCount * BUFF_LINE_HEIGHT;
}
