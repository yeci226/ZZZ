import {
  createCanvas,
  GlobalFonts,
  Image,
  loadImage,
  SKRSContext2D,
} from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import {
  downloadPaintingCache,
  getWikiM6Painting,
} from "./autoDownloadIcons.js";
import { getFlatSuitIcon } from "./profileSuitIcons.js";
import { ensureZzzCanvasFonts, getZzzCanvasFont } from "./canvasFonts.js";
import { getPaperAccent } from "./profileColors.js";
import { formatDriveDiscEnhancement } from "./profileRolls.js";

const W = 1000;
const H = 625;
const RIGHT_FACE_THRESHOLD = 0.62;
const LEFT_FACE_THRESHOLD = 0.38;
const ASSET_ROOT = path.resolve("src", "assets");
const NUM_FONT = "Nunito";

const C = {
  paper: "#f4eee7",
  paperBright: "#fbf7f0",
  ink: "#171719",
  accent: "#de493e",
  muted: "#817a75",
};
const DRIVE_DISC_ENHANCEMENT = "#f08a34";

const PROPERTY_ICON: Record<number, string> = {
  1: "hp",
  2: "atk",
  3: "def",
  4: "stun",
  5: "crit",
  6: "critdmg",
  7: "power",
  8: "mystery",
  9: "penratio",
  10: "sprecover",
  11: "sprecover",
  232: "penvalue",
  12: "physic",
  19: "perforation",
  20: "energyaccumulation",
  11102: "hp",
  11103: "hp",
  12101: "atk",
  12102: "atk",
  12103: "atk",
  12202: "stun",
  13102: "def",
  13103: "def",
  20103: "crit",
  21103: "critdmg",
  23103: "penratio",
  23203: "penvalue",
  30502: "sprecover",
  31203: "mystery",
  31402: "power",
  31503: "physic",
  31603: "fire",
  31703: "ice",
  31803: "thunder",
  31903: "ether",
  315: "physic",
  316: "fire",
  317: "ice",
  318: "thunder",
  319: "ether",
};

const GENERAL_SYSTEM_ID: Record<number, number> = {
  1: 111,
  2: 121,
  3: 131,
  4: 122,
  5: 201,
  6: 211,
  7: 314,
  8: 312,
  9: 231,
  10: 305,
  11: 232,
  12: 315,
};

/** The six QA renders were reviewed with these fixed face positions. */
const REVIEWED_FACE_X: Record<string, number> = {
  "1251": 0.5,
  "1121": 0.42,
  "1311": 0.47,
  "1421": 0.7,
  "1331": 0.33,
  "1061": 0.65,
};

let numericFontRegistered = false;
function ensureFormalFonts(): void {
  ensureZzzCanvasFonts();
  if (numericFontRegistered) return;
  try {
    GlobalFonts.registerFromPath(
      path.join(ASSET_ROOT, "Nunito-BlackItalic.ttf"),
      NUM_FONT,
    );
  } catch {
    // The regular project font registration already handles this path.
  }
  numericFontRegistered = true;
}

function cjkFont(userLocale: string, size: number, weight = 400): string {
  return `${weight} ${size}px ${getZzzCanvasFont(userLocale)}`;
}

function numericFont(size: number, weight = 900): string {
  return `${weight} italic ${size}px ${NUM_FONT}`;
}

function numericText(
  ctx: SKRSContext2D,
  value: unknown,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "left",
  weight = 900,
): void {
  ctx.font = numericFont(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(value ?? ""), x, y);
}

function text(
  ctx: SKRSContext2D,
  value: unknown,
  x: number,
  y: number,
  size: number,
  color: string,
  family: string,
  weight = 400,
  align: CanvasTextAlign = "left",
): void {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(value ?? ""), x, y);
}

function outlinedText(
  ctx: SKRSContext2D,
  value: unknown,
  x: number,
  y: number,
  size: number,
  color: string,
  family: string,
  align: CanvasTextAlign = "left",
  stroke = C.paperBright,
  lineWidth = 4,
  numeric = false,
): void {
  ctx.font = numeric ? numericFont(size) : `${400} ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.strokeText(String(value ?? ""), x, y);
  ctx.fillStyle = color;
  ctx.fillText(String(value ?? ""), x, y);
}

function line(
  ctx: SKRSContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function polygon(
  ctx: SKRSContext2D,
  points: Array<[number, number]>,
  color: string,
): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function roundedPanel(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 14,
  fill = "rgba(251,247,240,0.82)",
  stroke = "rgba(23,23,25,0.20)",
): void {
  const r = Math.min(radius, width / 2, height / 2);
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
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function fit(
  ctx: SKRSContext2D,
  image: any,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (!image) return;
  const scale = Math.min(width / image.width, height / image.height);
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

function drawIcon(
  ctx: SKRSContext2D,
  image: any,
  x: number,
  y: number,
  size: number,
): void {
  fit(ctx, image, x, y, size, size);
}

function solidIcon(image: any, color: string): any | null {
  if (!image) return null;
  const output = createCanvas(image.width, image.height);
  const outputContext = output.getContext("2d");
  outputContext.drawImage(image, 0, 0);
  outputContext.globalCompositeOperation = "source-in";
  outputContext.fillStyle = color;
  outputContext.fillRect(0, 0, image.width, image.height);
  return output;
}

function rgbaFromHex(hex: string, alpha: number, factor = 0.55): string {
  const match = String(hex).match(/^#?([0-9a-f]{6})$/i);
  if (!match) return `rgba(84,27,22,${alpha})`;
  const number = Number.parseInt(match[1]!, 16);
  const red = Math.round(((number >> 16) & 255) * factor);
  const green = Math.round(((number >> 8) & 255) * factor);
  const blue = Math.round((number & 255) * factor);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function safeAccent(raw: unknown, elementType: number): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (/^#[0-9a-f]{6}$/iu.test(value) && value.toLowerCase() !== "#000000") {
    return value;
  }
  return (
    {
      200: "#b6b8bc",
      201: "#bd4f37",
      202: "#05777a",
      203: "#c99821",
      204: "#177f91",
      205: "#8d55bb",
    } as Record<number, string>
  )[elementType] ?? C.accent;
}

function normalizePropertyName(value: unknown): string {
  return String(value ?? "")
    .replace(/百分比/g, "")
    .replace(/[%％]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function getPlanProperties(character: any): any[] {
  const info = character?.equip_plan_info;
  const planned = info?.plan_effective_property_list;
  if (Array.isArray(planned) && planned.length > 0) return planned;
  const defaults = info?.game_default?.property_list;
  return Array.isArray(defaults) ? defaults : [];
}

function canonicalSystemId(value: unknown): number | null {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return GENERAL_SYSTEM_ID[id] || id;
}

function effectivePropertyNames(character: any): ReadonlySet<string> {
  const names = new Set<string>();
  for (const property of getPlanProperties(character)) {
    for (const name of [property?.name, property?.full_name]) {
      const normalized = normalizePropertyName(name);
      if (normalized) names.add(normalized);
    }
  }
  return names;
}

function effectiveSystemIds(character: any): ReadonlySet<number> {
  const planIds = new Set<number>();
  for (const property of getPlanProperties(character)) {
    const id = canonicalSystemId(property?.system_id);
    if (id !== null) planIds.add(id);
  }
  if (planIds.size > 0) return planIds;

  const ids = new Set<number>();
  for (const disc of character?.equip ?? []) {
    for (const property of disc?.properties ?? []) {
      const id = canonicalSystemId(property?.system_id);
      if (property?.valid && id !== null) ids.add(id);
    }
  }
  return ids;
}

function isGeneralEffective(
  property: any,
  names: ReadonlySet<string>,
  ids: ReadonlySet<number>,
): boolean {
  const name = normalizePropertyName(property?.property_name);
  if (name) return names.has(name);
  const generalId = canonicalSystemId(
    GENERAL_SYSTEM_ID[Number(property?.property_id)],
  );
  return generalId !== null && ids.has(generalId);
}

function isSubEffective(
  property: any,
  ids: ReadonlySet<number>,
): boolean {
  const systemId = canonicalSystemId(property?.system_id);
  return systemId !== null && ids.has(systemId);
}

function valueOf(property: any): string {
  return String(property?.final ?? property?.base ?? "");
}

function sideForFaceX(faceX: number): "left" | "center" | "right" {
  if (faceX > RIGHT_FACE_THRESHOLD) return "right";
  if (faceX < LEFT_FACE_THRESHOLD) return "left";
  return "center";
}

function estimateFaceXFromImage(image: any): number {
  const sampleWidth = 160;
  const sampleHeight = 67;
  const sample = createCanvas(sampleWidth, sampleHeight);
  const sampleContext = sample.getContext("2d");
  sampleContext.clearRect(0, 0, sampleWidth, sampleHeight);
  sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
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

function resolveFacePosition(
  character: any,
  image: any,
): { faceX: number; side: "left" | "center" | "right"; source: string } {
  const id = String(character?.id ?? "");
  const payloadX = Number(
    character?.faceX ??
      character?.face_x ??
      character?.face_position?.x ??
      REVIEWED_FACE_X[id],
  );
  const faceX = Number.isFinite(payloadX)
    ? Math.max(0, Math.min(1, payloadX))
    : estimateFaceXFromImage(image);
  return {
    faceX,
    side: sideForFaceX(faceX),
    source: REVIEWED_FACE_X[id] !== undefined ? "reviewed-m6" : "alpha-heuristic",
  };
}

async function loadAny(source?: string | null): Promise<any | null> {
  if (!source) return null;
  try {
    if (
      source.startsWith("./") ||
      source.startsWith("/") ||
      source.startsWith("file:")
    ) {
      return await loadImage(source);
    }
    return await loadImage(await downloadPaintingCache(source));
  } catch {
    try {
      return await loadImage(source);
    } catch {
      return null;
    }
  }
}

function localAsset(...parts: string[]): string {
  return path.join(ASSET_ROOT, ...parts);
}

function formalCharacterArtCandidates(character: any): string[] {
  const id = String(character?.id ?? "").trim();
  if (!id) return [];

  const preferred = localAsset("images", "icons", "mindscape", `${id}.png`);
  const candidates = [preferred];
  const paintingDirectory = localAsset("images", "zzz", "paintings");
  const prefix = `role_vertical_painting_${id}`;

  try {
    const localPaintings = fs
      .readdirSync(paintingDirectory)
      .filter(
        (file) =>
          file === `${prefix}.png` ||
          (file.startsWith(`${prefix}_`) && file.endsWith(".png")),
      )
      .sort((left, right) => {
        const leftExact = left === `${prefix}.png` ? 0 : 1;
        const rightExact = right === `${prefix}.png` ? 0 : 1;
        return leftExact - rightExact || left.localeCompare(right);
      });
    candidates.push(
      ...localPaintings.map((file) => path.join(paintingDirectory, file)),
    );
  } catch {
    // The local cache is optional; API assets below remain available.
  }

  for (const remote of [
    character?.role_vertical_painting_url,
    character?.role_square_url,
  ]) {
    if (typeof remote === "string" && remote.trim()) candidates.push(remote);
  }

  return [...new Set(candidates)];
}

async function loadFormalCharacterArt(character: any): Promise<{
  image: any | null;
  source: string | null;
  preferred: string | null;
}> {
  const candidates = formalCharacterArtCandidates(character);
  const preferred = candidates[0] ?? null;
  // The fixed local M6 asset always wins when it exists.
  for (const source of candidates.slice(0, 1)) {
    if (source.startsWith("/") && !fs.existsSync(source)) continue;
    const image = await loadAny(source);
    if (image) return { image, source, preferred };
  }

  // A missing hand-reviewed cutout must fall back to the official Wiki M6
  // painting, not directly to the character's ordinary vertical portrait.
  const wikiM6 = await getWikiM6Painting(character);
  if (wikiM6) {
    const image = await loadAny(wikiM6);
    if (image) return { image, source: wikiM6, preferred };
  }

  // Keep the portrait only as an emergency availability fallback when an
  // official M6 source is unavailable or temporarily unreachable.
  for (const source of candidates.slice(1)) {
    if (source.startsWith("/") && !fs.existsSync(source)) continue;
    const image = await loadAny(source);
    if (image) return { image, source, preferred };
  }
  return { image: null, source: null, preferred };
}

function discSlotData(character: any): any[] {
  const discs = Array.isArray(character?.equip)
    ? [...character.equip].sort(
        (left, right) =>
          Number(left?.equipment_type ?? 0) - Number(right?.equipment_type ?? 0),
      )
    : [];
  const typed = discs.some((disc) => Number(disc?.equipment_type) > 0);
  return Array.from({ length: 6 }, (_, index) => {
    if (!typed) return discs[index] ?? null;
    return (
      discs.find((disc) => Number(disc?.equipment_type) === index + 1) ?? null
    );
  });
}

async function loadDiscImage(disc: any): Promise<any | null> {
  if (!disc?.id) return null;
  const code = String(disc.id).slice(0, 3);
  const rarity = String(disc.rarity ?? "S");
  const local = localAsset("images", "icons", "diskdrives", `${code}_${rarity}.webp`);
  if (fs.existsSync(local)) return loadAny(local);
  const suitId = disc.equip_suit?.suit_id;
  if (suitId) {
    const suitPath = await getFlatSuitIcon(suitId);
    if (suitPath) return loadAny(suitPath);
  }
  return null;
}

function propertyIconName(property: any): string {
  const propertyId = Number(property?.property_id);
  const systemId = Number(property?.system_id);
  const name = String(property?.property_name ?? "").toLowerCase();
  if (name.includes("能量自動回復") || name.includes("能量恢复")) {
    return "sprecover";
  }
  if (name.includes("穿透值")) {
    return "penvalue";
  }
  return (
    PROPERTY_ICON[propertyId] ??
    PROPERTY_ICON[systemId] ??
    "atk"
  );
}

export async function drawFormalCharacterProfile(
  tr: (key: string, args?: any) => string,
  userLocale: string,
  _uid: string,
  characterDataInput: any,
): Promise<Buffer | null> {
  try {
    ensureFormalFonts();
    const character = Array.isArray(characterDataInput)
      ? characterDataInput[0]
      : characterDataInput;
    if (!character) return null;

    const characterArt = await loadFormalCharacterArt(character);
    const cutout = characterArt.image;
    if (!cutout) {
      console.error(
        `[formal profile] missing character art for character ${String(character.id)}`,
      );
      return null;
    }
    if (characterArt.source !== characterArt.preferred) {
      console.warn(
        `[formal profile] fixed M6 asset unavailable for character ${String(character.id)}; using fallback art: ${characterArt.source}`,
      );
    }

    const rawAccent = safeAccent(
      character.vertical_painting_color,
      Number(character.element_type),
    );
    const accent = rawAccent;
    const paperAccent = getPaperAccent(rawAccent);
    const face = resolveFacePosition(character, cutout);
    const mirrored = face.side === "right";
    const names = effectivePropertyNames(character);
    const ids = effectiveSystemIds(character);
    const font = getZzzCanvasFont(userLocale);
    const readable = (color: string) =>
      color === C.ink ? C.ink : getPaperAccent(color);

    const weapon = character.weapon;
    const weaponImage = weapon?.id ? await loadAny(weapon.icon) : null;
    const emptyPlaceholder = await loadAny(
      localAsset("images", "icons", "other", "empty.png"),
    );
    const weaponPlaceholder = solidIcon(emptyPlaceholder, "#77716a");
    const discPlaceholder = solidIcon(emptyPlaceholder, "#aaa39b");
    const weaponStar =
      weapon?.star !== undefined
        ? await loadAny(
            localAsset(
              "images",
              "icons",
              "weapon",
              `role-star-${Number(weapon.star)}.png`,
            ),
          )
        : null;
    const discs = discSlotData(character);
    const discImages = await Promise.all(discs.map((disc) => loadDiscImage(disc)));
    const skillData = Array.isArray(character.skills)
      ? [...character.skills].sort(
          (left, right) => Number(left?.skill_type ?? 0) - Number(right?.skill_type ?? 0),
        )
      : [];
    const skillImages = await Promise.all(
      skillData.map((skill) =>
        loadAny(
          localAsset(
            "images",
            "icons",
            "skills",
            `${String(skill?.skill_type ?? "")}.png`,
          ),
        ),
      ),
    );

    const attrs = Array.isArray(character.properties)
      ? character.properties
      : [];
    const propertyRowHeight = 29;
    const basePropertyRows = 5;
    const propertyRows = Math.max(
      basePropertyRows,
      Math.ceil(attrs.length / 2),
    );
    const extraPropertyRows = propertyRows - basePropertyRows;
    const lowerShift = extraPropertyRows * propertyRowHeight;
    const metadataStageBottom = 451 + lowerShift;
    const artDrawWidth = 1080;
    const artDrawHeight =
      artDrawWidth * (Number(cutout.height) / Math.max(1, Number(cutout.width)));
    // Wiki paintings are usually taller than the reviewed 2080×870 cutouts.
    // Keep their aspect ratio and let the art continue behind the Disc row.
    // The Disc paper stays at its original boundary and is drawn afterward.
    const driveDiscBackgroundTop = metadataStageBottom;
    const stageBottom = driveDiscBackgroundTop;
    const canvasHeight = Math.max(
      H + lowerShift,
      Math.ceil(artDrawHeight),
    );
    const attrPanelY = 16;
    const attrPanelHeight = 174 + lowerShift;
    const moduleGap = 10;
    const skillPanelY = attrPanelY + attrPanelHeight + moduleGap;
    const skillPanelHeight = 97;
    const skillContentY = skillPanelY + 32;
    const slotY = skillPanelY + skillPanelHeight + moduleGap;

    const propertyCache = new Map<string, any | null>();
    const propertyIcon = async (property: any, color: string) => {
      const iconName = propertyIconName(property);
      const iconColor = readable(color);
      const key = `${iconName}:${iconColor}`;
      if (!propertyCache.has(key)) {
        const source = await loadAny(
          localAsset("images", "icons", "property", `${iconName}.png`),
        );
        propertyCache.set(key, solidIcon(source, iconColor));
      }
      return propertyCache.get(key) ?? null;
    };

    const canvas = createCanvas(W, canvasHeight);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, canvasHeight);

    polygon(ctx, [[0, 0], [690, 0], [610, stageBottom], [0, stageBottom]], accent);
    polygon(
      ctx,
      [[0, 0], [690, 0], [640, 54], [0, 175]],
      "rgba(251,247,240,0.16)",
    );
    polygon(
      ctx,
      [[0, 350], [610, 290], [575, stageBottom], [0, stageBottom]],
      rgbaFromHex(accent, 0.34),
    );
    line(ctx, 620, 0, 574, stageBottom, "rgba(23,23,25,0.25)", 1);

    ctx.save();
    ctx.shadowColor = "rgba(23,23,25,0.22)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.drawImage(
      cutout,
      0,
      0,
      cutout.width,
      cutout.height,
      -80,
      0,
      artDrawWidth,
      artDrawHeight,
    );
    ctx.restore();

    const moduleX = mirrored ? 15 : 690;
    const moduleW = 295;
    const moduleInnerX = moduleX + 14;
    const colX = [moduleInnerX, moduleInnerX + 150];
    const attrY = 30;
    roundedPanel(ctx, moduleX, attrPanelY, moduleW, attrPanelHeight, 15);
    for (let index = 0; index < attrs.length; index += 1) {
      const property = attrs[index];
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = colX[column]!;
      const y = attrY + row * propertyRowHeight;
      const active = isGeneralEffective(property, names, ids);
      drawIcon(
        ctx,
        await propertyIcon(property, active ? paperAccent : C.ink),
        x,
        y,
        21,
      );
      numericText(
        ctx,
        valueOf(property),
        x + 30,
        y + 19,
        20,
        readable(active ? paperAccent : C.ink),
      );
      if (row < Math.ceil(attrs.length / 2) - 1) {
        line(ctx, x, y + 27, x + 128, y + 27, "rgba(23,23,25,0.16)", 1);
      }
    }

    roundedPanel(ctx, moduleX, skillPanelY, moduleW, skillPanelHeight, 15);
    const skillIconSize = 28;
    const skillSideMargin = 14;
    const skillX = moduleX + skillSideMargin;
    const skillY = skillContentY;
    const skillCount = skillData.length;
    const skillGap =
      skillCount > 1
        ? Math.max(
            0,
            (moduleW - skillSideMargin * 2 - skillIconSize * skillCount) /
              (skillCount - 1),
          )
        : 0;
    for (let index = 0; index < skillCount; index += 1) {
      const x = skillX + index * (skillIconSize + skillGap);
      drawIcon(ctx, skillImages[index], x, skillY, skillIconSize);
      const level = skillData[index]?.level;
      if (level !== undefined && level !== null) {
        numericText(
          ctx,
          level,
          x + skillIconSize / 2,
          skillY + 50,
          16,
          readable(Number(level) >= 12 ? paperAccent : C.ink),
          "center",
        );
      }
    }

    const weaponEffects = weapon
      ? [...(weapon.main_properties ?? []), ...(weapon.properties ?? [])].slice(0, 2)
      : [];
    const slotX = moduleX;
    const slotW = moduleW;
    const slotH = 92;
    roundedPanel(ctx, slotX, slotY, slotW, slotH, 15);
    const weaponIconSize = weaponImage ? 78 : 56;
    const weaponIconOffset = (78 - weaponIconSize) / 2;
    drawIcon(
      ctx,
      weaponImage || weaponPlaceholder,
      moduleInnerX + weaponIconOffset,
      slotY + 7 + weaponIconOffset,
      weaponIconSize,
    );
    const weaponTextX = moduleInnerX + 93;
    const weaponName = weapon?.name ? String(weapon.name) : "";
    ctx.font = cjkFont(userLocale, 20, 400);
    const weaponNameWidth = ctx.measureText(weaponName).width;
    if (weaponName) text(ctx, weaponName, weaponTextX, slotY + 32, 20, C.ink, font);
    if (weapon?.level !== undefined && weapon?.level !== null) {
      numericText(
        ctx,
        `Lv.${weapon.level}`,
        weaponTextX,
        slotY + 54,
        14,
        readable(paperAccent),
      );
    }
    if (!weaponImage && !weaponName && weapon?.level == null) {
      text(
        ctx,
        tr("profileCharacter_NoWEngine") || "未裝備",
        weaponTextX,
        slotY + 48,
        19,
        C.muted,
        font,
      );
    }
    if (weaponStar && weaponName) {
      fit(ctx, weaponStar, weaponTextX + weaponNameWidth + 8, slotY + 15, 46, 17);
    }
    const effectY = slotY + 62;
    const effectAreaW = slotW - (weaponTextX - slotX) - 14;
    const effectColW = effectAreaW / 2;
    for (let index = 0; index < weaponEffects.length; index += 1) {
      const effect = weaponEffects[index];
      const active = isGeneralEffective(effect, names, ids);
      const effectX = weaponTextX + index * effectColW;
      drawIcon(
        ctx,
        await propertyIcon(effect, active ? paperAccent : C.ink),
        effectX,
        effectY,
        18,
      );
      numericText(
        ctx,
        valueOf(effect),
        effectX + 22,
        effectY + 15,
        14.5,
        readable(active ? paperAccent : C.ink),
      );
    }

    polygon(
      ctx,
      [
        [0, driveDiscBackgroundTop],
        [W, driveDiscBackgroundTop],
        [W, canvasHeight],
        [0, canvasHeight],
      ],
      C.paperBright,
    );
    line(
      ctx,
      0,
      driveDiscBackgroundTop,
      W,
      driveDiscBackgroundTop,
      "rgba(23,23,25,0.28)",
      3,
    );

    const characterName = String(
      character.name_mi18n ?? character.full_name_mi18n ?? "",
    );
    const metaY = metadataStageBottom - 22;
    const metaSize = 48;
    const metaGap = 18;
    ctx.font = cjkFont(userLocale, metaSize, 400);
    const characterNameWidth = ctx.measureText(characterName).width;
    const levelText =
      character.level === undefined || character.level === null
        ? ""
        : `Lv.${character.level}`;
    const rankText =
      character.rank === undefined || character.rank === null
        ? ""
        : `M${character.rank}`;
    ctx.font = numericFont(metaSize);
    const levelWidth = levelText ? ctx.measureText(levelText).width : 0;
    const rankWidth = rankText ? ctx.measureText(rankText).width : 0;
    const totalMetaWidth =
      characterNameWidth +
      (levelText ? metaGap + levelWidth : 0) +
      (rankText ? metaGap + rankWidth : 0);
    let metaX = mirrored ? W - 14 - totalMetaWidth : 14;
    outlinedText(
      ctx,
      characterName,
      metaX,
      metaY,
      metaSize,
      readable(C.ink),
      font,
    );
    metaX += characterNameWidth;
    if (levelText) {
      metaX += metaGap;
      outlinedText(
        ctx,
        levelText,
        metaX,
        metaY,
        metaSize,
        readable(C.ink),
        font,
        "left",
        C.paperBright,
        4,
        true,
      );
      metaX += levelWidth;
    }
    if (rankText) {
      metaX += metaGap;
      outlinedText(
        ctx,
        rankText,
        metaX,
        metaY,
        metaSize,
        readable(paperAccent),
        font,
        "left",
        C.paperBright,
        4,
        true,
      );
    }

    const cellW = 150;
    const gap = 10;
    const x0 = 25;
    const discY = 474 + lowerShift;
    for (let index = 0; index < discs.length; index += 1) {
      const disc = discs[index];
      const x = x0 + index * (cellW + gap);
      const firstDiscTopShift = index === 0 ? -10 : 0;
      const hasDiscImage = Boolean(discImages[index]);
      const discSize = hasDiscImage ? 62 : 48;
      const discOffset = (62 - discSize) / 2;
      if (hasDiscImage) {
        drawIcon(
          ctx,
          discImages[index],
          x + 1 + firstDiscTopShift + discOffset,
          discY + discOffset,
          discSize,
        );
      } else {
        drawIcon(
          ctx,
          discPlaceholder,
          x + (cellW - discSize) / 2,
          discY + discOffset,
          discSize,
        );
      }

      if (disc) {
        const main = disc.main_properties?.[0];
        if (main) {
          const active = isGeneralEffective(main, names, ids);
          drawIcon(
            ctx,
            await propertyIcon(main, active ? paperAccent : C.ink),
            x + 70 + firstDiscTopShift,
            discY + 19,
            28,
          );
          numericText(
            ctx,
            main.base ?? "",
            x + 101 + firstDiscTopShift,
            discY + 38,
            21,
            readable(active ? paperAccent : C.ink),
          );
        }
        const subs = (disc.properties ?? []).slice(0, 4);
        for (let subIndex = 0; subIndex < 4; subIndex += 1) {
          const property = subs[subIndex];
          if (!property) continue;
          const active = isSubEffective(property, ids);
          const column = subIndex % 2;
          const row = Math.floor(subIndex / 2);
          const subShift = index >= 1 ? 8 : 0;
          const sx = x + column * 75 + subShift;
          const sy = discY + 82 + row * 28;
          drawIcon(
            ctx,
            await propertyIcon(property, active ? paperAccent : C.ink),
            sx + 1,
            sy,
            18,
          );
          const baseText = String(property.base ?? "");
          const enhancementText = formatDriveDiscEnhancement(property.add);
          const cellRight = sx + 73;
          const enhancementWidth = enhancementText
            ? (() => {
                ctx.font = numericFont(10);
                return ctx.measureText(enhancementText).width;
              })()
            : 0;
          const baseRight = enhancementText
            ? cellRight - enhancementWidth - 6
            : cellRight;
          const baseMaxWidth = Math.max(18, baseRight - (sx + 24));
          let baseFontSize = 14.5;
          while (baseFontSize > 9) {
            ctx.font = numericFont(baseFontSize);
            if (ctx.measureText(baseText).width <= baseMaxWidth) break;
            baseFontSize -= 0.5;
          }
          numericText(
            ctx,
            baseText,
            sx + 24,
            sy + 15,
            baseFontSize,
            readable(active ? paperAccent : C.ink),
          );
          if (enhancementText) {
            const separatorX = baseRight + 2;
            line(
              ctx,
              separatorX,
              sy + 4,
              separatorX,
              sy + 16,
              "rgba(23,23,25,0.28)",
              1,
            );
            numericText(
              ctx,
              enhancementText,
              cellRight,
              sy + 14,
              10,
              DRIVE_DISC_ENHANCEMENT,
              "right",
            );
          }
        }
      } else {
        text(
          ctx,
          tr("profileCharacter_SlotUnequipped", { slot: index + 1 }) || "未裝備",
          x + cellW / 2,
          discY + 105,
          11,
          C.muted,
          font,
          400,
          "center",
        );
      }
      if (index < discs.length - 1) {
        line(
          ctx,
          x + cellW + 5,
          discY - 6,
          x + cellW + 5,
          canvasHeight - 9,
          "rgba(23,23,25,0.13)",
          1,
        );
      }
    }

    return canvas.toBuffer("image/png");
  } catch (error) {
    console.error("Error generating formal character profile:", error);
    return null;
  }
}

export const FORMAL_PROFILE_DIMENSIONS = { width: W, height: H } as const;
export const FORMAL_PROFILE_FACE_THRESHOLDS = {
  left: LEFT_FACE_THRESHOLD,
  right: RIGHT_FACE_THRESHOLD,
} as const;
