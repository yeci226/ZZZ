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
  outlineColor = "black"
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
  radius: number
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
  scaleFactor = 1.2
) {
  ctx.save();

  const centerX = x + size / 2;
  const centerY = y + size / 2;

  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2, true);
  ctx.closePath();

  ctx.clip();

  const scale = Math.min(size / img.width, size / img.height) * scaleFactor;

  const scaledWidth = img.width * scale;
  const scaledHeight = img.height * scale;

  const imgX = centerX - scaledWidth / 2;
  const imgY = centerY - scaledHeight / 2;

  ctx.drawImage(img, imgX, imgY, scaledWidth, scaledHeight);
  ctx.restore();
}

export function estimateTextHeight(
  ctx: any,
  text: string,
  maxWidth: number,
  fontFamily: string
) {
  const originalFont = ctx.font;
  ctx.font = `18px ${fontFamily}`;
  const lineHeight = 18;

  text = text.replace(/\\n/g, "\n");
  let plainText = text.replace(/<color=#[A-Fa-f0-9]+>|<\/color>/g, "");

  const lines = plainText.split("\n");
  let totalLines = 0;

  for (const line of lines) {
    const chars = Array.from(line);
    let currentLine = "";

    for (const char of chars) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      const isPunctuation = /[。，、,.!?：；;:！?]/.test(char);
      const isLastChar =
        currentLine.length + chars.slice(chars.indexOf(char) + 1).length ===
        plainText.length; // Approximate check?
      // Better: check if we are at the very end of the string loop.
      // But we are looping `chars` of `line`. `lines` splits by newline.
      // So checking if it is the last char of `line` (paragraph segment).

      const isLastOfSegment = chars.indexOf(char) === chars.length - 1;

      if (metrics.width > maxWidth && !isPunctuation && !isLastOfSegment) {
        currentLine = char;
        totalLines++;
      } else {
        currentLine = testLine;
      }
    }
    totalLines++;
  }

  ctx.font = originalFont;
  // Match drawBuffText lineHeight = 23
  const drawLineHeight = 23;
  // Height = (lines - 1) * drawLineHeight + fontSize (18)
  return totalLines > 0 ? (totalLines - 1) * drawLineHeight + 18 : 0;
}

export function drawBuffText(
  ctx: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontFamily: string
) {
  text = text.replace(/\\n/g, "\n");

  const originalFillStyle = ctx.fillStyle;
  const originalFont = ctx.font;

  ctx.font = `18px ${fontFamily}`;
  ctx.fillStyle = "#E3E3E3";
  const lineHeight = 23;

  const lines = text.split("\n");
  let currentY = y;

  function drawColoredLine(
    ctx: any,
    line: string,
    lineX: number,
    lineY: number,
    colorSegments: any[],
    startIndex: number
  ) {
    let currentX = lineX;
    const chars = Array.from(line);

    for (let i = 0; i < chars.length; i++) {
      const charIndex = startIndex + i;
      const char = chars[i];

      let charColor = "#E3E3E3";
      for (const segment of colorSegments) {
        if (charIndex >= segment.start && charIndex < segment.end) {
          charColor = segment.color;
          break;
        }
      }

      ctx.fillStyle = charColor;
      ctx.fillText(char, currentX, lineY);
      currentX += ctx.measureText(char).width;
    }
    ctx.fillStyle = "#E3E3E3";
  }

  for (const line of lines) {
    const colorSegments = [];
    let plainText = "";
    let remainingText = line;
    let offset = 0;

    while (remainingText.length > 0) {
      const colorTagMatch = remainingText.match(/<color=#([A-Fa-f0-9]+)>/);

      if (!colorTagMatch) {
        plainText += remainingText;
        break;
      }

      const beforeColorText = remainingText.substring(0, colorTagMatch.index);
      plainText += beforeColorText;
      offset += beforeColorText.length;

      const endTagIndex = remainingText.indexOf(
        "</color>",
        colorTagMatch.index!
      );
      if (endTagIndex === -1) {
        plainText += remainingText.substring(
          colorTagMatch.index! + colorTagMatch[0].length
        );
        break;
      }

      const coloredText = remainingText.substring(
        colorTagMatch.index! + colorTagMatch[0].length,
        endTagIndex
      );
      plainText += coloredText;

      colorSegments.push({
        start: offset,
        end: offset + coloredText.length,
        color: `#${colorTagMatch[1]}`,
      });

      offset += coloredText.length;
      remainingText = remainingText.substring(endTagIndex + 8);
    }

    const chars = Array.from(plainText);
    let currentLine = "";
    let currentX = x;
    let currentCharIndex = 0;

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      const isPunctuation = /[。，、,.!?：；;:！?]/.test(char);
      const isLastOfSegment = i === chars.length - 1;

      if (
        currentX + metrics.width > x + maxWidth &&
        !isPunctuation &&
        !isLastOfSegment
      ) {
        drawColoredLine(
          ctx,
          currentLine,
          currentX - ctx.measureText(currentLine).width,
          currentY,
          colorSegments,
          currentCharIndex - currentLine.length
        );

        currentLine = char;
        currentX = x + ctx.measureText(char).width;
        currentY += lineHeight;
        currentCharIndex = i;
      } else {
        currentLine += char;
        currentX = x + metrics.width;
        currentCharIndex++;
      }
    }

    if (currentLine) {
      drawColoredLine(
        ctx,
        currentLine,
        x,
        currentY,
        colorSegments,
        currentCharIndex - currentLine.length
      );
    }

    currentY += lineHeight;
  }

  ctx.fillStyle = originalFillStyle;
  ctx.font = originalFont;

  return currentY;
}
