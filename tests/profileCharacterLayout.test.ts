import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  identifyFormalArt,
  layoutForFaceX,
  resolveFormalCharacterLayout,
} from "../src/utilities/zzz/profileCharacterLayout.js";

it.each([
  [0.25, "right"],
  [0.5, "right"],
  [0.73, "left"],
] as const)("places information opposite face %s", (x, side) => {
  expect(layoutForFaceX(x).infoSide).toBe(side);
});
it("uses final canvas coordinates including the negative art offset", () => {
  expect(layoutForFaceX(0.64)).toMatchObject({
    faceCanvasX: 611.2,
    infoSide: "right",
  });
  expect(layoutForFaceX(0.66).infoSide).toBe("left");
});
it.each([NaN, Infinity])(
  "falls back to center for invalid coordinates",
  (x) => {
    expect(layoutForFaceX(x).faceX).toBe(0.5);
  },
);
it("binds Liuyin calibration to the actual Wiki M6 asset", async () => {
  const source = "src/assets/images/zzz/wiki_paintings/932/2.png";
  const img = createCanvas(160, 67);
  const layout = resolveFormalCharacterLayout(
    { id: 1481 },
    img,
    identifyFormalArt(source, "wiki"),
  );
  expect(layout).toMatchObject({
    source: "reviewed-asset",
    infoSide: "left",
    moduleX: 15,
  });
  // A known ID cannot reuse that coordinate on another painting or fallback portrait.
  for (const art of [
    identifyFormalArt(source.replace("/2.png", "/0.png"), "wiki"),
    identifyFormalArt(
      "src/assets/images/zzz/paintings/role_vertical_painting_1481.png",
      "portrait",
    ),
  ]) {
    expect(resolveFormalCharacterLayout({ id: 1481 }, img, art).source).toBe(
      "alpha-heuristic",
    );
  }
  expect(
    resolveFormalCharacterLayout(
      { id: 9999 },
      img,
      identifyFormalArt(source, "wiki"),
    ).source,
  ).toBe("alpha-heuristic");
});
it.each([
  [1251, "right"],
  [1121, "right"],
  [1311, "right"],
  [1421, "left"],
  [1331, "right"],
  [1061, "right"],
  [1141, "left"],
  [1181, "left"],
  [1191, "left"],
  [1381, "left"],
] as const)("uses reviewed local art for %s", async (id, expected) => {
  const source = `src/assets/images/icons/mindscape/${id}.png`;
  const img = await loadImage(source);
  expect(
    resolveFormalCharacterLayout(
      { id },
      img,
      identifyFormalArt(source, "local-m6"),
    ),
  ).toMatchObject({ source: "reviewed-asset", infoSide: expected });
});
it("keeps unreviewed art usable and ignores ambiguous payload face metadata", () => {
  const img = createCanvas(160, 67);
  const ctx = img.getContext("2d");
  ctx.fillStyle = "#f0b090";
  ctx.fillRect(125, 5, 20, 25);
  const result = resolveFormalCharacterLayout(
    { id: 9999, faceX: null } as any,
    img,
    { kind: "portrait", key: "unknown.png" },
  );
  expect(result).toMatchObject({ source: "alpha-heuristic", infoSide: "left" });
});
it("defaults a transparent image to center", () => {
  expect(
    resolveFormalCharacterLayout({ id: 9999 }, createCanvas(160, 67), {
      kind: "portrait",
      key: "missing-face.png",
    }),
  ).toMatchObject({ faceX: 0.5, infoSide: "right" });
});
