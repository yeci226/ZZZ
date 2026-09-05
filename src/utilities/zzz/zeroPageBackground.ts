import { loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { join } from "node:path";

const ASSET_DIR = join(".", "src", "assets", "images", "zzz", "official-record");
const SOURCE_WIDTH = 1920;
const SOURCE_TOP_HEIGHT = 324;
const SOURCE_BOTTOM_HEIGHT = 80;

export const ZERO_PAGE_BACKGROUND_FILES = {
  top: "zero-bg-top--pc.2d9b3a73.png",
  middle: "zero-bg-middle--pc.63932c7e.png",
  bottom: "zero-bg-bottom--pc.6e73fe00.png",
} as const;

export interface ZeroPageBackgroundAssets {
  top: Image | null;
  middle: Image | null;
  bottom: Image | null;
}

export interface ZeroPageBackgroundLayout {
  topHeight: number;
  middleY: number;
  middleHeight: number;
  bottomY: number;
  bottomHeight: number;
}

export async function loadZeroPageBackground(): Promise<ZeroPageBackgroundAssets> {
  const safeLoad = async (filename: string): Promise<Image | null> => {
    try {
      return await loadImage(join(ASSET_DIR, filename));
    } catch {
      return null;
    }
  };
  const [top, middle, bottom] = await Promise.all([
    safeLoad(ZERO_PAGE_BACKGROUND_FILES.top),
    safeLoad(ZERO_PAGE_BACKGROUND_FILES.middle),
    safeLoad(ZERO_PAGE_BACKGROUND_FILES.bottom),
  ]);
  return { top, middle, bottom };
}

export function zeroPageBackgroundLayout(
  width: number,
  height: number,
): ZeroPageBackgroundLayout {
  const scale = width / SOURCE_WIDTH;
  const topHeight = Math.round(SOURCE_TOP_HEIGHT * scale);
  const bottomHeight = Math.round(SOURCE_BOTTOM_HEIGHT * scale);
  return {
    topHeight,
    middleY: topHeight,
    middleHeight: Math.max(2, height - topHeight - bottomHeight),
    bottomY: height - bottomHeight,
    bottomHeight,
  };
}

export function drawZeroPageBackground(
  ctx: SKRSContext2D,
  width: number,
  height: number,
  assets: ZeroPageBackgroundAssets,
): void {
  const layout = zeroPageBackgroundLayout(width, height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  if (assets.middle) {
    ctx.drawImage(
      assets.middle,
      0,
      layout.middleY,
      width,
      layout.middleHeight,
    );
  }
  if (assets.top) ctx.drawImage(assets.top, 0, 0, width, layout.topHeight);
  if (assets.bottom) {
    ctx.drawImage(
      assets.bottom,
      0,
      layout.bottomY,
      width,
      layout.bottomHeight,
    );
  }
}
