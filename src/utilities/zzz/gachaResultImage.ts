import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import { gachaRanks, type GachaResultItem } from "./gachaAnimationCache.js";

let fontsReady = false;

/** Native 2D composition only; no Blender process, downloads, or bot login. */
export async function renderGachaResult(
  background: string | Buffer,
  items: readonly GachaResultItem[],
): Promise<Buffer> {
  gachaRanks(items);
  if (!fontsReady) {
    GlobalFonts.registerFromPath(path.resolve("src/assets/en-us.ttf"), "GachaResultEN");
    if (!GlobalFonts.registerFromPath(path.resolve("src/assets/zh-tw.ttf"), "GachaResultTW")) throw new Error("Missing Traditional Chinese result font");
    fontsReady = true;
  }
  const [bg, pictures, ranks, surfaceTexture] = await Promise.all([
    loadImage(background),
    Promise.all(items.map(i => loadImage(i.image))),
    Promise.all(["S", "A", "B"].map(r => loadImage(path.resolve(`src/assets/gacha-simulation/ui/rank-${r.toLowerCase()}-${r === "S" ? "gold" : "result"}.png`)))),
    loadImage(path.resolve("src/assets/gacha-simulation/ui/card-surface.png")),
  ]);
  const w = 1280, h = 720;
  if (Math.abs(bg.width / bg.height - w / h) > .001) throw new Error("Result background must be the 16:9 animation final frame");
  const canvas = createCanvas(w, h), ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  // The backdrop still comes from this GIF's final frame. Its screen contents
  // therefore follow the selected center-out ranks, never a baked reference shot.
  ctx.save(); ctx.filter = "brightness(.83) saturate(.78)"; ctx.drawImage(bg, 0, 0, w, h); ctx.restore();
  ctx.save(); ctx.filter = "blur(5px) brightness(.83) saturate(.78)"; ctx.drawImage(bg, 0, 0, w, h); ctx.restore();
  ctx.fillStyle = "rgba(3,4,7,.54)"; ctx.fillRect(0, 0, w, h);
  const vignette = ctx.createRadialGradient(640, 340, 200, 640, 340, 760);
  vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,.24)"); ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
  // Measured from the supplied single-pull screenshot: ~8.08 px horizontal
  // pitch at 720p, slope dx/dy ~1.206. Light and dark bands both matter.
  const stripePitch = 8.08, stripeRun = h * 1.206;
  for (let x = -stripeRun; x < w; x += stripePitch) {
    ctx.strokeStyle = "rgba(149,155,163,.10)"; ctx.lineWidth = 2.0;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + stripeRun, h); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.27)"; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(x + stripePitch / 2, 0); ctx.lineTo(x + stripePitch / 2 + stripeRun, h); ctx.stroke();
  }
  ctx.fillStyle = "rgba(6,5,2,.05)"; ctx.fillRect(0, 0, w, h);
  // Native Traditional Chinese lettering at output resolution, not an upscaled crop.
  // The bundled font's regular face is already heavy; synthetic bold closes counters.
  ctx.save(); ctx.font = "400 64px GachaResultTW"; ctx.textAlign = "center";
  const heading = "調頻結果", metrics = ctx.measureText(heading);
  const titleScaleY = 60 / (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent);
  ctx.translate(644, 164); ctx.transform(310 / metrics.width, 0, -.13 * titleScaleY, titleScaleY, 0, 0);
  const baseline = metrics.actualBoundingBoxAscent;
  ctx.lineJoin = "round"; ctx.lineWidth = 1.3; ctx.strokeStyle = "#292b2f";
  ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 2; ctx.shadowOffsetY = 3;
  ctx.strokeText(heading, 0, baseline); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  const titleFill = ctx.createLinearGradient(0, 0, 0, baseline + metrics.actualBoundingBoxDescent);
  titleFill.addColorStop(0, "#ededeb"); titleFill.addColorStop(.48, "#b3b4b6"); titleFill.addColorStop(1, "#898b8f");
  ctx.fillStyle = titleFill;
  ctx.fillText(heading, 0, baseline); ctx.restore();
  const order = items.map((item, index) => ({ item, index })).sort((a, b) => "SAB".indexOf(a.item.rank) - "SAB".indexOf(b.item.rank));
  // Both new screenshots use the same 149x99 card at their 1118px source width.
  // A single result is one normal-sized card centered lower, not an enlarged card.
  const single = items.length === 1, cardW = 171, cardH = 114;
  const gap = 10, columns = single ? 1 : 5, startX = (w - (cardW * columns + gap * (columns - 1))) / 2, startY = single ? 314 : 269;
  for (let p = 0; p < order.length; p++) {
    const { item, index } = order[p], x = startX + p % columns * (cardW + gap), y = startY + Math.floor(p / columns) * (cardH + gap);
    ctx.save(); ctx.shadowColor = item.rank === "S" ? "#ffbe26" : item.rank === "A" ? "#663ab0" : "#000"; ctx.shadowBlur = item.rank === "S" ? 13 : item.rank === "A" ? 4 : 3;
    ctx.fillStyle = "#070a11"; ctx.beginPath(); ctx.roundRect(x - 2, y - 2, cardW + 4, cardH + 4, 9); ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, cardW, cardH, 8); ctx.clip();
    const gradient = ctx.createLinearGradient(x, y, x + cardW * .35, y + cardH);
    gradient.addColorStop(0, item.rank === "S" ? "#70664e" : item.rank === "A" ? "#625095" : "#414e65");
    gradient.addColorStop(.53, item.rank === "S" ? "#483d2c" : item.rank === "A" ? "#382b53" : "#292d40");
    gradient.addColorStop(1, item.rank === "S" ? "#76602d" : item.rank === "A" ? "#48277d" : "#283662");
    ctx.fillStyle = gradient; ctx.fillRect(x, y, cardW, cardH);
    ctx.save(); ctx.globalAlpha = item.rank === "A" ? .52 : .30;
    ctx.drawImage(surfaceTexture, x, y, cardW, cardH); ctx.restore();
    if (item.rank !== "S") {
      const edgeLight = ctx.createRadialGradient(x + cardW * .15, y + cardH * .86, 0, x + cardW * .15, y + cardH * .86, cardW * .65);
      edgeLight.addColorStop(0, item.rank === "A" ? "rgba(117,50,235,.29)" : "rgba(42,79,161,.24)");
      edgeLight.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = edgeLight; ctx.fillRect(x, y, cardW, cardH);
    }
    const im = pictures[index];
    if (item.crop) {
      const [sx, sy, sw, sh] = item.crop;
      ctx.drawImage(im, sx * im.width, sy * im.height, sw * im.width, sh * im.height, x, y, cardW, cardH);
    } else {
      // Fit from the supplied yellow W-Engine card: the top/right are intentionally clipped.
      const size = cardH * 1.17;
      ctx.drawImage(im, x + cardW - size * .95, y - cardH * .095, size, size);
    }
    const shade = ctx.createLinearGradient(x, y, x + cardW * .55, y);
    shade.addColorStop(0, "rgba(0,0,0,.15)"); shade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shade; ctx.fillRect(x, y, cardW, cardH);
    if (item.rank === "S") {
      ctx.fillStyle = "rgba(255,177,53,.025)"; ctx.fillRect(x, y, cardW, cardH);
      const glow = ctx.createRadialGradient(x + cardW * .10, y + cardH * .75, 0, x + cardW * .10, y + cardH * .75, cardW * .6);
      glow.addColorStop(0, "rgba(255,167,20,.28)"); glow.addColorStop(1, "rgba(255,167,20,0)"); ctx.fillStyle = glow; ctx.fillRect(x, y, cardW, cardH);
    }
    const gloss = ctx.createLinearGradient(x, y, x + cardW, y + cardH);
    gloss.addColorStop(0, "rgba(255,255,255,.14)"); gloss.addColorStop(.12, "rgba(255,255,255,0)"); gloss.addColorStop(.75, "rgba(255,255,255,0)"); gloss.addColorStop(1, "rgba(255,255,255,.06)");
    ctx.fillStyle = gloss; ctx.fillRect(x, y, cardW, cardH); ctx.restore();
    ctx.save();
    const border = ctx.createLinearGradient(x, y, x, y + cardH);
    border.addColorStop(0, item.rank === "S" ? "#fff8cb" : item.rank === "A" ? "#a489dd" : "#5c7392");
    border.addColorStop(.4, item.rank === "S" ? "#f7d35e" : item.rank === "A" ? "#563381" : "#1d2a42");
    border.addColorStop(1, item.rank === "S" ? "#ffe064" : item.rank === "A" ? "#8960c3" : "#31476e");
    ctx.strokeStyle = border; ctx.lineWidth = item.rank === "S" ? 2.5 : 1.6;
    ctx.beginPath(); ctx.roundRect(x, y, cardW, cardH, 8); ctx.stroke();
    if (item.rank === "A") {
      ctx.strokeStyle = "rgba(166,113,241,.14)"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(x + 2.2, y + 2.2, cardW - 4.4, cardH - 4.4, 6); ctx.stroke();
    }
    if (item.rank === "S") { ctx.shadowColor = "#ffbd05"; ctx.shadowBlur = 9; }
    const rankSize = cardH * .405;
    ctx.drawImage(ranks["SAB".indexOf(item.rank)], x + cardW * .025, y + cardH - rankSize - cardH * .04, rankSize, rankSize); ctx.restore();
    if (item.rank === "S") {
      // Deterministic frozen glints, like a held result frame; no random speckles.
      for (const [sx, sy, radius] of [[x + cardW * .59, y + cardH - 9, 8], [x + cardW * .55, y - 2, 5], [x + 9, y + cardH * .38, 4]]) {
        ctx.save(); ctx.shadowColor = "#ffd35b"; ctx.shadowBlur = 12; ctx.fillStyle = "#fff8bf";
        ctx.beginPath(); ctx.moveTo(sx - radius, sy); ctx.lineTo(sx - 1.5, sy - 1.5); ctx.lineTo(sx, sy - radius); ctx.lineTo(sx + 1.5, sy - 1.5); ctx.lineTo(sx + radius, sy); ctx.lineTo(sx + 1.5, sy + 1.5); ctx.lineTo(sx, sy + radius); ctx.lineTo(sx - 1.5, sy + 1.5); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
    if (item.isNew) {
      // Native text, without a rectangular backing or a screenshot sprite.
      ctx.save(); ctx.font = "italic 400 15px GachaResultTW";
      ctx.lineJoin = "round"; ctx.lineWidth = 1.6; ctx.strokeStyle = "#172006";
      ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 1.4; ctx.shadowOffsetY = .8;
      ctx.strokeText("新！", x, y + 7);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.fillStyle = "#edff42";
      ctx.fillText("新！", x, y + 7); ctx.restore();
    }
  }
  // The fixture label belongs to the message/page, not the game's result artwork.
  return canvas.toBuffer("image/png");
}
