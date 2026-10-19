import { createCanvas, loadImage } from "@napi-rs/canvas";
import { DISC_SUBSTAT_STYLE } from "./profileDiscEnhancement.js";
import { drawFormalCharacterProfile } from "./profileCharacterFormal.js";
import { discScoringReleased } from "./combat/scoringRelease.js";
import { getScoringStore } from "./combat/scoringStore.js";
import { profileScore } from "./combat/render.js";

const CARD_WIDTH = 1000;
const BASE_CARD_HEIGHT = 625 + DISC_SUBSTAT_STYLE.cardExtraHeight;
const STACK_GAP = 18;
const PAPER = "#f7f1e8";
const SEPARATOR = "rgba(23,23,25,0.24)";

/**
 * Draw formal character cards independently, then stack them vertically.
 * The individual cards keep 1000px width; cards with extra properties may be
 * taller so their additional rows are never clipped.
 */
export async function drawFormalCharacterProfileStack(
  tr: (key: string, args?: any) => string,
  userLocale: string,
  uid: string,
  characters: any[],
): Promise<Buffer | null> {
  const selected = characters.filter(Boolean).slice(0, 3);
  if (selected.length === 0) return null;

  const scoringSnapshot = discScoringReleased() ? getScoringStore().snapshot() : null;
  const cards = await Promise.all(
    selected.map((character) =>
      drawFormalCharacterProfile(tr, userLocale, uid, character,
        scoringSnapshot ? profileScore(character, "auto", scoringSnapshot) : null),
    ),
  );
  if (cards.some((card) => !card)) return null;

  const images = await Promise.all(
    cards.map((card) => (card ? loadImage(card) : null)),
  );
  if (images.some((image) => !image)) return null;

  const height =
    images.reduce((total, image) => total + (image?.height ?? 0), 0) +
    (selected.length - 1) * STACK_GAP;
  const canvas = createCanvas(CARD_WIDTH, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_WIDTH, height);

  let y = 0;
  for (const image of images) {
    if (!image) return null;
    ctx.drawImage(image, 0, y, CARD_WIDTH, image.height);
    y += image.height + STACK_GAP;

    if (y < height) {
      ctx.fillStyle = SEPARATOR;
      ctx.fillRect(0, y - Math.ceil(STACK_GAP / 2), CARD_WIDTH, 1);
    }
  }

  return canvas.toBuffer("image/png");
}

export const FORMAL_PROFILE_CARD_SIZE = {
  width: CARD_WIDTH,
  height: BASE_CARD_HEIGHT,
  gap: STACK_GAP,
} as const;
