import { createCanvas } from "@napi-rs/canvas";
import path from "node:path";

export const FORMAL_ART_PLACEMENT = {
  x: -80,
  width: 1080,
  canvasWidth: 1000,
} as const;
export const FORMAL_FACE_THRESHOLDS = { left: 0.38, right: 0.62 } as const;
export interface FormalArtIdentity {
  kind: "local-m6" | "wiki" | "portrait";
  key: string;
}

/** Keys describe the actual loaded asset, including the Wiki painting stage. */
export function identifyFormalArt(
  source: string,
  kind: FormalArtIdentity["kind"],
): FormalArtIdentity {
  return {
    kind,
    key: /^https?:/.test(source)
      ? source
      : path
          .relative(path.resolve("src/assets"), path.resolve(source))
          .split(path.sep)
          .join("/"),
  };
}

const REVIEWED_FACE_X: Record<string, Record<string, number>> = {
  "1251": { "images/icons/mindscape/1251.png": 0.5 },
  "1121": { "images/icons/mindscape/1121.png": 0.42 },
  "1311": { "images/icons/mindscape/1311.png": 0.47 },
  "1421": { "images/icons/mindscape/1421.png": 0.7 },
  "1331": { "images/icons/mindscape/1331.png": 0.33 },
  "1061": { "images/icons/mindscape/1061.png": 0.43 },
  "1141": {
    "images/icons/mindscape/1141.png": 0.77,
    "images/zzz/wiki_paintings/28/2.png": 0.77,
  },
  "1181": {
    "images/icons/mindscape/1181.png": 0.7,
    "images/zzz/wiki_paintings/27/2.png": 0.7,
  },
  "1191": {
    "images/icons/mindscape/1191.png": 0.66,
    "images/zzz/wiki_paintings/29/2.png": 0.66,
  },
  "1221": { "images/zzz/wiki_paintings/529/2.png": 0.7 },
  "1261": { "images/zzz/wiki_paintings/368/2.png": 0.68 },
  "1381": {
    "images/icons/mindscape/1381.png": 0.72,
    "images/zzz/wiki_paintings/618/2.png": 0.72,
  },
  "1541": { "images/zzz/wiki_paintings/1072/2.png": 0.75 },
  "1051": { "images/zzz/wiki_paintings/909/2.png": 0.74 },
  "1481": { "images/zzz/wiki_paintings/932/2.png": 0.73 },
};

export function estimateFaceXFromImage(image: any): number {
  const sampleWidth = 160;
  const sampleHeight = 67;
  const sample = createCanvas(sampleWidth, sampleHeight);
  const sampleContext = sample.getContext("2d");
  sampleContext.clearRect(0, 0, sampleWidth, sampleHeight);
  sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleContext.getImageData(
    0,
    0,
    sampleWidth,
    sampleHeight,
  ).data;
  let weightedX = 0;
  let weightTotal = 0;

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const index = (y * sampleWidth + x) * 4;
      const alpha = pixels[index + 3]! / 255;
      if (alpha < 0.35) continue;
      const red = pixels[index]!;
      const green = pixels[index + 1]!;
      const blue = pixels[index + 2]!;
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const saturation = maximum ? (maximum - minimum) / maximum : 0;
      const luminance = (red + green + blue) / 3;
      const warmSkin = red > green * 1.02 && green > blue * 0.98 && red > 70;
      const paleSkin = luminance > 178 && saturation < 0.2;
      let weight = warmSkin ? 1.2 : paleSkin ? 0.12 : 0;
      if (y > sampleHeight * 0.75) weight *= 0.35;
      if (x < sampleWidth * 0.04 || x > sampleWidth * 0.96) weight *= 0.5;
      weight *= alpha;
      weightedX += x * weight;
      weightTotal += weight;
    }
  }

  if (weightTotal < 4) return 0.5;
  return Math.max(0, Math.min(1, weightedX / weightTotal / sampleWidth));
}

/** Resolve source-image coordinates before choosing a side on the final canvas. */
export function resolveFormalCharacterLayout(
  character: { id?: unknown },
  image: any,
  art: FormalArtIdentity,
) {
  const reviewed =
    art.kind === "portrait"
      ? undefined
      : REVIEWED_FACE_X[String(character.id)]?.[art.key];
  const faceX = reviewed ?? estimateFaceXFromImage(image);
  return {
    ...layoutForFaceX(faceX),
    source: reviewed === undefined ? "alpha-heuristic" : "reviewed-asset",
    art,
  };
}

export function layoutForFaceX(faceX: number) {
  const normalizedX = Number.isFinite(faceX)
    ? Math.max(0, Math.min(1, faceX))
    : 0.5;
  const faceCanvasX =
    FORMAL_ART_PLACEMENT.x + normalizedX * FORMAL_ART_PLACEMENT.width;
  const canvasRatio = faceCanvasX / FORMAL_ART_PLACEMENT.canvasWidth;
  const faceSide =
    canvasRatio > FORMAL_FACE_THRESHOLDS.right
      ? "right"
      : canvasRatio < FORMAL_FACE_THRESHOLDS.left
        ? "left"
        : "center";
  const infoSide = faceSide === "right" ? "left" : "right";
  return {
    faceX: normalizedX,
    faceCanvasX,
    faceSide,
    infoSide,
    moduleX: infoSide === "left" ? 15 : 690,
  } as const;
}
