import { createCanvas } from "@napi-rs/canvas";

import { COLORS, drawAvatar, font } from "./drawing.js";

export const AVATAR_IDS = Array.from({ length: 11 }, (_, i) => i + 1);

const [COLS, CELL, D] = [6, 150, 110];

/** Numbered grid of the selectable Inter-Knot avatars, shown when creating or editing a profile. */
export async function renderAvatarSheet(): Promise<Buffer> {
  const rows = Math.ceil(AVATAR_IDS.length / COLS);
  const canvas = createCanvas(COLS * CELL + 40, rows * (CELL + 30) + 30);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [n, id] of AVATAR_IDS.entries()) {
    const cx = 20 + CELL * (n % COLS) + CELL / 2;
    const cy = 30 + (CELL + 30) * Math.floor(n / COLS) + D / 2;
    await drawAvatar(ctx, id, cx, cy, D);
    ctx.font = font("en", 24);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(id), cx, cy + D / 2 + 26);
  }
  return canvas.toBuffer("image/png");
}
