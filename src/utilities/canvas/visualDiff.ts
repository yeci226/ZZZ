import { createCanvas, loadImage } from "@napi-rs/canvas";

export interface VisualMask { x: number; y: number; width: number; height: number }

export async function pixelDifferenceRatio(
  actual: Buffer,
  baseline: Buffer,
  options: { masks?: VisualMask[]; channelTolerance?: number } = {},
): Promise<number> {
  const [actualImage, baselineImage] = await Promise.all([loadImage(actual), loadImage(baseline)]);
  if (actualImage.width !== baselineImage.width || actualImage.height !== baselineImage.height) return 1;
  const canvas = createCanvas(actualImage.width, actualImage.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(actualImage, 0, 0);
  const actualPixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baselineImage, 0, 0);
  const baselinePixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const masks = options.masks ?? [];
  const tolerance = options.channelTolerance ?? 8;
  let compared = 0;
  let changed = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (masks.some((mask) => x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height)) continue;
      const offset = (y * canvas.width + x) * 4;
      compared++;
      if (
        Math.abs(actualPixels[offset]! - baselinePixels[offset]!) > tolerance
        || Math.abs(actualPixels[offset + 1]! - baselinePixels[offset + 1]!) > tolerance
        || Math.abs(actualPixels[offset + 2]! - baselinePixels[offset + 2]!) > tolerance
        || Math.abs(actualPixels[offset + 3]! - baselinePixels[offset + 3]!) > tolerance
      ) changed++;
    }
  }
  return compared ? changed / compared : 0;
}
