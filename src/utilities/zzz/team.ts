import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import { ZenlessZoneZero } from "@yeci226/hoyoapi";
import Queue from "queue";
import { downloadPaintingCache } from "./autoDownloadIcons.js";
import { getUserLang, searchWikiEntry, fetchWikiPaintings } from "../utilities.js";
import { getLocalWikiPaintings, paintingIndexForRank } from "./autoDownloadIcons.js";
import { toI18nLang } from "../core/i18n.js";

const drawQueue = new Queue({ autostart: true });

// ── Constants ──────────────────────────────────────────────────────────────
const CARD_W = 480;
const CARD_H = 920;
const PORTRAIT_H = 360;
const PAD = 10;
const INNER_W = CARD_W - PAD * 2;

// Section heights
const STATS_H = 88;   // 2 rows × 4 cols — tall enough for icon+label+value
const WS_H    = 90;   // weapon + skills row
// Disc area fills the rest
const STATS_Y   = PORTRAIT_H + 6;
const WS_Y      = STATS_Y + STATS_H + 5;
const DISC_Y    = WS_Y + WS_H + 5;

const BANGBOO_W = 200;

// ── Colors ─────────────────────────────────────────────────────────────────
const C = {
  bg:        "#0d0e12",
  surface:   "#13151c",
  surface2:  "#1a1d28",
  border:    "#2a2d3e",
  borderBright: "#3d4060",
  fg:        "#e8eaf0",
  muted:     "#6b6f88",
  dim:       "#3d4160",
  gold:      "#f0b84a",
  goldDim:   "rgba(240,184,74,0.15)",
  orange:    "#ff7f32",
  orangeDim: "rgba(255,127,50,0.15)",
  cyan:      "#5ce0d8",
  cyanDim:   "rgba(92,224,216,0.1)",
};

const fonts: Record<string, string> = {
  tw: "TW", cn: "CN", vi: "VI", jp: "JP", kr: "KR", fr: "FR", default: "EN",
};

const elementColors: Record<number, string> = {
  200: "#C8C8D0",
  201: "#f87171",
  202: "#5BC8F5",
  203: "#fbbf24",
  205: "#C77DFF",
};

const elementBg: Record<number, string> = {
  200: "rgba(200,200,208,0.15)",
  201: "rgba(239,68,68,0.2)",
  202: "rgba(91,200,245,0.2)",
  203: "rgba(251,191,36,0.2)",
  205: "rgba(199,125,255,0.2)",
};

const elementLabels: Record<number, string> = {
  200: "物理", 201: "火", 202: "冰", 203: "電", 205: "以太",
};

const propertiesId: Record<number, string> = {
  // Short IDs used in agent.properties
  1: "hp", 2: "atk", 3: "def", 4: "stun",
  5: "crit", 6: "critdmg", 7: "power", 8: "mystery",
  9: "penratio", 10: "sprecover", 11: "penvalue",
  12: "physic", 13: "fire", 14: "ice", 15: "thunder", 16: "ether",
  19: "perforation", 20: "energyaccumulation",
  // Long IDs used in equip main_properties / sub-properties
  11102: "hp",   11103: "hp",
  12101: "atk",  12102: "atk",  12103: "atk",
  12202: "stun",
  13103: "def",  13102: "def",
  20103: "crit", 21103: "critdmg",
  31402: "power", 31203: "mystery",
  30502: "sprecover",
  23103: "penratio", 23203: "penvalue",
  31503: "physic", 31603: "fire", 31703: "ice",
  31803: "thunder", 31903: "ether",
};

// Label for each property_id (for the stats area)
const propLabels: Record<number, string> = {
  // Short IDs
  1: "生命值", 2: "攻擊力", 3: "防禦力", 4: "衝擊力",
  5: "暴擊率", 6: "暴擊傷害", 7: "衝擊力", 8: "異常精通",
  9: "穿透率", 10: "能量回復", 11: "穿透值",
  12: "物理傷害", 13: "火屬傷害", 14: "冰屬傷害", 15: "電屬傷害", 16: "以太傷害",
  19: "貫穿力", 20: "閃能累積",
  // Long IDs
  11102: "生命值", 11103: "生命值",
  12101: "攻擊力", 12102: "攻擊力", 12103: "攻擊力",
  13103: "防禦力", 13102: "防禦力",
  12202: "衝擊力",
  20103: "暴擊率", 21103: "暴擊傷害",
  23103: "穿透率", 23203: "穿透值",
  31203: "異常精通", 31402: "衝擊力",
  30502: "能量回復",
  31503: "物理傷害", 31603: "火屬傷害", 31703: "冰屬傷害",
  31803: "電屬傷害", 31903: "以太傷害",
};

// ── Image loaders ───────────────────────────────────────────────────────────
async function loadImg(url: string) {
  try { return await loadImage(await downloadPaintingCache(url)); } catch {}
  try { return await loadImage(url); } catch {}
  return null;
}
async function loadLocal(path: string) {
  try { return await loadImage(path); } catch { return null; }
}

// ── Draw helpers ────────────────────────────────────────────────────────────
function rr(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  (ctx as any).roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

function rrStroke(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number, color: string, lw = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  (ctx as any).roundRect(x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

function truncate(ctx: SKRSContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// Wrap rich-text segments into lines that fit within maxW.
// Returns array of lines; each line is an array of {text, color} segments.
// Uses greedy word-wrap: tries to break at spaces first, then falls back to char-level for CJK.
function wrapRichSegments(
  ctx: SKRSContext2D,
  segments: { text: string; color: string | null }[],
  maxW: number,
  font: string,
): { text: string; color: string | null }[][] {
  // Flatten all segments into tokens (word/CJK-char level) preserving color
  type Token = { text: string; color: string | null; w: number };
  const tokens: Token[] = [];

  for (const seg of segments) {
    if (!seg.text) continue;
    const isColored = !!seg.color;
    ctx.font = isColored
      ? font.replace(/^(\d+px)/, "bold $1")
      : font;

    // Split into chunks: runs of ASCII words (split by space) vs CJK chars
    const chunks = seg.text.split(/(\s+)/);
    for (const chunk of chunks) {
      if (!chunk) continue;
      const isCJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(chunk);
      if (isCJK) {
        // CJK: each char is its own token
        for (const ch of chunk) {
          tokens.push({ text: ch, color: seg.color, w: ctx.measureText(ch).width });
        }
      } else {
        // ASCII word or whitespace: keep as single token
        tokens.push({ text: chunk, color: seg.color, w: ctx.measureText(chunk).width });
      }
    }
  }

  // Greedy line packing
  const lines: { text: string; color: string | null }[][] = [];
  let currentLine: { text: string; color: string | null; w: number }[] = [];
  let lineW = 0;

  const pushLine = () => {
    if (currentLine.length > 0) {
      // Merge adjacent tokens of same color
      const merged: { text: string; color: string | null }[] = [];
      for (const t of currentLine) {
        if (merged.length > 0 && merged[merged.length - 1].color === t.color) {
          merged[merged.length - 1].text += t.text;
        } else {
          merged.push({ text: t.text, color: t.color });
        }
      }
      lines.push(merged);
    }
    currentLine = [];
    lineW = 0;
  };

  for (const tok of tokens) {
    // Skip leading whitespace at start of a line
    if (lineW === 0 && tok.text.trim() === "") continue;

    if (lineW + tok.w > maxW && currentLine.length > 0) {
      pushLine();
      if (tok.text.trim() === "") continue; // skip space at line start
    }
    currentLine.push(tok);
    lineW += tok.w;
  }
  pushLine();
  return lines;
}

/** Strip Unity rich-text tags like <color=#FFF>text</color>, <size=...>, etc. */
function stripRichText(s: string): string {
  return s.replace(/<\/?[^>]+>/g, "");
}

/** Parse Unity rich-text into segments: [{text, color}] */
function parseRichText(s: string): { text: string; color: string | null }[] {
  const segments: { text: string; color: string | null }[] = [];
  const re = /<color=(#[0-9a-fA-F]{3,8})>([\s\S]*?)<\/color>|([^<]+)|<[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1] && m[2] !== undefined) {
      segments.push({ text: m[2], color: m[1] });
    } else if (m[3]) {
      segments.push({ text: m[3], color: null });
    }
    // skip unrecognised tags (m[0] starts with <)
  }
  return segments;
}

/** Draw rich-text line, returns final X position */
function drawRichLine(
  ctx: SKRSContext2D,
  segments: { text: string; color: string | null }[],
  x: number,
  y: number,
  maxW: number,
  defaultColor: string,
  font: string,
): void {
  ctx.textAlign = "left";
  let curX = x;
  for (const seg of segments) {
    if (!seg.text) continue;
    const isColored = !!seg.color;
    // colored segments use bold weight for legibility
    ctx.font = isColored ? font.replace(/^(\d)/, "bold $1").replace(/^(?!bold)/, "bold ") : font;
    ctx.fillStyle = seg.color ?? defaultColor;
    const available = x + maxW - curX;
    if (available <= 0) break;
    const drawn = truncate(ctx, seg.text, available);
    ctx.fillText(drawn, curX, y);
    curX += ctx.measureText(drawn).width;
    if (drawn !== seg.text) break;
  }
}

// ── Stats grid (2 rows × 4 cols) ────────────────────────────────────────────
async function drawStatsGrid(
  ctx: SKRSContext2D,
  agent: any,
  font: string,
  cx: number,
  cy: number,
  accentColor: string,
) {
  const props = (agent.properties ?? []) as any[];
  const display = props.slice(0, 8);

  const COLS = 4;
  const ROWS = 2;
  const cellW = Math.floor(INNER_W / COLS);
  const cellH = Math.floor(STATS_H / ROWS);  // 44px per row
  const gx = cx + PAD;
  const gy = cy;

  rrStroke(ctx, gx, gy, INNER_W, STATS_H, 4, accentColor + "40");

  for (let i = 0; i < ROWS; i++) {
    for (let j = 0; j < COLS; j++) {
      const idx = i * COLS + j;
      const x = gx + j * cellW;
      const y = gy + i * cellH;

      rr(ctx, x + 1, y + 1, cellW - 2, cellH - 2, 0, C.surface2);

      if (j > 0) {
        ctx.fillStyle = C.border;
        ctx.fillRect(x, gy + 2, 1, STATS_H - 4);
      }
      if (i === 1) {
        ctx.fillStyle = C.border;
        ctx.fillRect(gx + 2, gy + cellH, INNER_W - 4, 1);
      }

      const prop = display[idx];
      if (!prop) continue;

      const label = propLabels[prop.property_id as number] ?? "";
      const val = prop.final !== undefined ? String(prop.final) : String(prop.base ?? "");
      const isSecondary = i === 1;
      const propKey = propertiesId[prop.property_id as number] ?? null;

      // ── Icon + label (top area) ──
      const PICON = 13;
      const pImg = propKey ? await loadLocal(`./src/assets/images/icons/property/${propKey}.png`) : null;

      // measure label with normal weight font
      ctx.font = `11px ${font}`;
      const labelW = ctx.measureText(label).width;
      const rowW = pImg ? PICON + 3 + labelW : labelW;
      const rowStartX = Math.floor(x + (cellW - rowW) / 2);
      const iconY = y + 5;

      // draw icon first
      if (pImg) {
        ctx.globalAlpha = 0.72;
        ctx.drawImage(pImg, rowStartX, iconY, PICON, PICON);
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.muted;
        ctx.textAlign = "left";
        ctx.fillText(label, rowStartX + PICON + 3, iconY + PICON - 1);
      } else {
        ctx.fillStyle = C.muted;
        ctx.textAlign = "center";
        ctx.fillText(label, x + cellW / 2, iconY + PICON - 1);
      }

      // ── Value (bottom area) ──
      ctx.font = `${isSecondary ? 15 : 18}px ${font}`;
      ctx.fillStyle = isSecondary ? "#9ca3c0" : C.fg;
      ctx.textAlign = "center";
      ctx.fillText(val, x + cellW / 2, y + cellH - 5);
    }
  }
}

// ── Weapon + Skills row ──────────────────────────────────────────────────────
async function drawWeaponSkillRow(
  ctx: SKRSContext2D,
  agent: any,
  font: string,
  cx: number,
  cy: number,
  accentColor: string,
) {
  rr(ctx, cx + PAD, cy, INNER_W, WS_H, 6, C.surface2);
  rrStroke(ctx, cx + PAD, cy, INNER_W, WS_H, 6, accentColor + "30");

  const wAreaW = 175;
  const weapon = agent.weapon;

  // ── Weapon left side ──
  if (weapon) {
    const wImg = weapon.icon ? await loadImg(weapon.icon) : null;
    const WICON = 58;
    const wIconX = cx + PAD + 6;
    const wIconY = cy + Math.floor((WS_H - WICON) / 2) - 6;

    if (wImg) ctx.drawImage(wImg, wIconX, wIconY, WICON, WICON);

    // star strip overlaid at bottom of icon
    const wStarImg = await loadLocal(`./src/assets/images/icons/weapon/role-star-${weapon.star ?? 1}.png`);
    if (wStarImg) {
      const aspect = wStarImg.width / wStarImg.height;
      const starW  = WICON;
      const starH  = Math.round(starW / aspect);
      // draw at bottom of icon, overlapping last few px
      ctx.drawImage(wStarImg, wIconX, wIconY + WICON - starH + 2, starW, starH);
    }

    // Text area: left-aligned, bottom-anchored
    const textAreaX = wIconX + WICON + 6;
    const textAreaW = wAreaW - WICON - 14;

    // name — left-aligned, upper portion
    ctx.font = `14px ${font}`;
    ctx.fillStyle = C.fg;
    ctx.textAlign = "left";
    ctx.fillText(truncate(ctx, weapon.name ?? "", textAreaW), textAreaX, cy + WS_H - 48);

    // Lv + 精X on same row, bottom-left
    const lvStr  = `Lv.${weapon.level ?? "?"}`;
    const refStr = weapon.star ? `精${weapon.star}` : "";
    ctx.font = `11px ${font}`;
    const lvW2  = ctx.measureText(lvStr).width;
    const refW  = refStr ? ctx.measureText(refStr).width + 10 : 0;
    const gap   = refStr ? 6 : 0;
    const rowY  = cy + WS_H - 28;

    // Lv text
    ctx.fillStyle = C.muted;
    ctx.textAlign = "left";
    ctx.fillText(lvStr, textAreaX, rowY);

    // 精X badge inline
    if (refStr) {
      const bx2 = textAreaX + lvW2 + gap;
      rr(ctx, bx2, rowY - 13, refW, 15, 2, accentColor + "25");
      rrStroke(ctx, bx2, rowY - 13, refW, 15, 2, accentColor + "60");
      ctx.fillStyle = accentColor;
      ctx.textAlign = "center";
      ctx.fillText(refStr, bx2 + refW / 2, rowY);
      ctx.textAlign = "left";
    }
  } else {
    // No weapon placeholder
    // Placeholder spans the full weapon area
    const phX = cx + PAD + 4;
    const phY = cy + 4;
    const phW = wAreaW - 8;
    const phH = WS_H - 8;
    rr(ctx, phX, phY, phW, phH, 6, C.surface);
    rrStroke(ctx, phX, phY, phW, phH, 6, C.border);
    ctx.font = `20px ${font}`;
    ctx.fillStyle = C.dim;
    ctx.textAlign = "center";
    ctx.fillText("×", phX + phW / 2, phY + phH / 2 + 4);
    ctx.font = `11px ${font}`;
    ctx.fillText("未裝備", phX + phW / 2, phY + phH / 2 + 20);
    ctx.textAlign = "left";
  }

  // ── Vertical divider ──
  ctx.fillStyle = accentColor + "40";
  ctx.fillRect(cx + PAD + wAreaW, cy + 8, 1, WS_H - 16);

  // ── Skills right side as pills ──
  const skills = agent.skills ?? [];
  const customOrder = [0, 2, 5, 1, 3, 4];
  const skillLabels = ["基本", "閃避", "協助", "特殊", "連攜", "核心"];
  const coreRankMap: Record<number, string> = { 1: "X", 2: "A", 3: "B", 4: "C", 5: "D", 6: "E", 7: "F" };

  const PILL_W = Math.floor((INNER_W - wAreaW - 10) / 3) - 3;
  const PILL_H = 34;
  const pillsStartX = cx + PAD + wAreaW + 6;
  const row0Y = cy + 8;
  const row1Y = cy + 8 + PILL_H + 6;

  for (let si = 0; si < 6; si++) {
    const orderIdx = customOrder[si];
    const skill = skills[orderIdx];
    const col = si % 3;
    const row = Math.floor(si / 3);
    const px = pillsStartX + col * (PILL_W + 3);
    const py = row === 0 ? row0Y : row1Y;

    const coreRank = si === 5 ? (coreRankMap[Number(skill?.level)] ?? `${skill?.level ?? "?"}`) : null;
    const lvText = coreRank ?? `${skill?.level ?? "?"}`;
    const isMax = (si !== 5 && Number(skill?.level) >= 12) || coreRank === "F";

    // pill bg: max = accentColor tint, else dark
    rr(ctx, px, py, PILL_W, PILL_H, 3, isMax ? accentColor + "25" : C.bg);
    rrStroke(ctx, px, py, PILL_W, PILL_H, 3, isMax ? accentColor + "70" : C.border);

    // skill icon
    if (skill) {
      const skillType = skill.skill_type ?? orderIdx;
      const img = await loadLocal(`./src/assets/images/icons/skills/${skillType}.png`);
      if (img) ctx.drawImage(img, px + 3, py + 5, 22, 22);
    }

    // label
    ctx.font = `10px ${font}`;
    ctx.fillStyle = isMax ? accentColor : C.muted;
    ctx.textAlign = "left";
    ctx.fillText(skillLabels[si], px + 27, py + 15);

    // level value
    ctx.font = `14px ${font}`;
    ctx.fillStyle = isMax ? accentColor : C.fg;
    ctx.fillText(lvText, px + 27, py + 29);
  }
}

// ── Drive disc cell ──────────────────────────────────────────────────────────
async function drawDiscCell(
  ctx: SKRSContext2D,
  disc: any,
  font: string,
  dx: number,
  dy: number,
  cellW: number,
  cellH: number,
  slotNum: number,
  accentColor: string,
) {
  const cw = cellW - 4;
  const ch = cellH - 4;
  rr(ctx, dx, dy, cw, ch, 6, C.surface2);
  rrStroke(ctx, dx, dy, cw, ch, 6, C.border);

  if (!disc || !disc.id) {
    // Empty slot placeholder
    rr(ctx, dx + 2, dy + 2, cw - 4, ch - 4, 4, C.surface);
    ctx.font = `22px ${font}`;
    ctx.fillStyle = C.dim;
    ctx.textAlign = "center";
    ctx.fillText("×", dx + cw / 2, dy + ch / 2 + 4);
    ctx.font = `10px ${font}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(`槽${slotNum}`, dx + cw / 2, dy + ch / 2 + 18);
    return;
  }

  // ── Layout ──
  // Top half: disc icon (left) + main prop (right)
  // Bottom half: sub-props 2×2
  const DICON  = 46;
  const P      = 5;           // inner padding
  const TOP_H  = Math.floor(ch * 0.52);   // ~52% for top section
  const SUB_H  = ch - TOP_H;              // ~48% for sub-props

  // ── Disc icon ──
  const discIconFile = `./src/assets/images/icons/diskdrives/${disc.id.toString().slice(0, 3)}_${disc.rarity}.webp`;
  const discImg = await loadLocal(discIconFile);
  const iconDrawY = dy + P + Math.floor((TOP_H - P * 2 - DICON) / 2);
  if (discImg) ctx.drawImage(discImg, dx + P, iconDrawY, DICON, DICON);

  // ── +level badge (bottom-right of icon) ──
  ctx.font = `10px ${font}`;
  const lvText = `+${disc.level ?? 0}`;
  const lvW = ctx.measureText(lvText).width + 6;
  const lvX = dx + P + DICON - lvW;
  const lvY = iconDrawY + DICON - 13;
  rr(ctx, lvX, lvY, lvW, 13, 2, "rgba(0,0,0,0.82)");
  rrStroke(ctx, lvX, lvY, lvW, 13, 2, C.orange + "80");
  ctx.fillStyle = C.orange;
  ctx.textAlign = "left";
  ctx.fillText(lvText, lvX + 3, lvY + 10);

  // ── Main property (right of icon) ──
  const mainProp = disc.main_properties?.[0];
  if (mainProp) {
    const propKey  = propertiesId[mainProp.property_id as number] ?? null;
    const mainLabel = propLabels[mainProp.property_id as number] ?? "";
    const mainVal  = String(mainProp.base ?? "");
    const rightX   = dx + P + DICON + 6;
    const rightW   = cw - DICON - P * 2 - 6;

    // value: centered vertically in top section
    const valY = dy + P + Math.floor(TOP_H * 0.44);
    ctx.font = `19px ${font}`;
    ctx.fillStyle = C.gold;
    ctx.textAlign = "left";
    ctx.fillText(truncate(ctx, mainVal, rightW), rightX, valY);

    // icon + label below value
    const MPICON = 12;
    const pImg = propKey ? await loadLocal(`./src/assets/images/icons/property/${propKey}.png`) : null;
    const labelY = valY + 14;
    ctx.font = `10px ${font}`;
    ctx.fillStyle = C.muted;
    if (pImg) {
      ctx.globalAlpha = 0.7;
      ctx.drawImage(pImg, rightX, labelY - 10, MPICON, MPICON);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
      ctx.fillText(mainLabel, rightX + MPICON + 3, labelY);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(mainLabel, rightX, labelY);
    }
  }

  // ── Horizontal divider ──
  const divY = dy + TOP_H;
  ctx.fillStyle = C.border;
  ctx.fillRect(dx + 4, divY, cw - 8, 1);

  // ── Sub-props (2 col × 2 row, each row = label line + value line) ──
  const subProps = (disc.properties ?? []) as any[];
  const subAreaY = divY + 3;
  const colW  = Math.floor(cw / 2);
  const rowH  = Math.floor((SUB_H - 4) / 2);   // height per sub-prop slot
  const SPICON = 11;

  for (let pi = 0; pi < Math.min(subProps.length, 4); pi++) {
    const sp      = subProps[pi];
    const col     = pi % 2;
    const row     = Math.floor(pi / 2);
    const spX     = dx + col * colW + 4;
    const spY     = subAreaY + row * rowH;
    const isValid = !!sp.valid;

    const propKey = propertiesId[sp.property_id as number] ?? null;
    const spLabel = propLabels[sp.property_id as number] ?? "";
    const pImg    = propKey ? await loadLocal(`./src/assets/images/icons/property/${propKey}.png`) : null;
    const valStr  = String(sp.base ?? "");

    // line 1: icon + label (top of row)
    const line1Y = spY + SPICON;   // baseline for 11px icon + 9px text
    if (pImg) {
      ctx.globalAlpha = isValid ? 0.82 : 0.35;
      ctx.drawImage(pImg, spX, spY + 1, SPICON, SPICON);
      ctx.globalAlpha = 1;
    }
    ctx.font = `9px ${font}`;
    ctx.fillStyle = isValid ? accentColor + "aa" : C.muted;
    ctx.textAlign = "left";
    ctx.fillText(spLabel, spX + SPICON + 2, line1Y);

    // line 2: value (bottom of row)
    const line2Y = spY + rowH - 2;
    ctx.font = `12px ${font}`;
    ctx.fillStyle = isValid ? accentColor : "rgba(232,234,240,0.45)";
    ctx.textAlign = "left";
    ctx.fillText(valStr, spX + SPICON + 2, line2Y);
  }
}

// ── Per-agent card ──────────────────────────────────────────────────────────
async function drawAgentCard(
  ctx: SKRSContext2D,
  agent: any,
  font: string,
  cx: number,
  paintingUrl?: string,
) {
  const cy = 0;
  const accentColor = (agent.vertical_painting_color && agent.vertical_painting_color !== "#000000")
    ? agent.vertical_painting_color
    : (elementColors[agent.element_type as number] ?? "#ffffff");
  const elemBg = elementBg[agent.element_type as number] ?? "rgba(255,255,255,0.1)";

  // ── Card background + accent border ──
  rr(ctx, cx, cy, CARD_W, CARD_H, 8, C.surface);
  rrStroke(ctx, cx, cy, CARD_W, CARD_H, 8, accentColor + "50", 1.5);

  // ── Portrait ──
  const portraitUrl =
    paintingUrl ??
    agent.role_vertical_painting_url ??
    `https://act-webstatic.hoyoverse.com/game_record/zzz/role_vertical_painting/role_vertical_painting_${agent.id}.png`;

  const portrait = await loadImg(portraitUrl);
  if (portrait) {
    ctx.save();
    ctx.beginPath();
    (ctx as any).roundRect(cx, cy, CARD_W, PORTRAIT_H, [8, 8, 0, 0]);
    ctx.clip();
    const scaleH = PORTRAIT_H / portrait.height;
    const scaleW = CARD_W / portrait.width;
    const scale = Math.max(scaleH, scaleW);
    const sw = portrait.width * scale;
    const sh = portrait.height * scale;
    ctx.drawImage(portrait, cx + (CARD_W - sw) / 2, cy, sw, sh);
    ctx.restore();
  }

  // Portrait gradient overlay
  const grad = ctx.createLinearGradient(cx, cy + PORTRAIT_H - 160, cx, cy + PORTRAIT_H);
  grad.addColorStop(0, "rgba(13,14,18,0)");
  grad.addColorStop(1, "rgba(13,14,18,0.96)");
  ctx.fillStyle = grad;
  ctx.fillRect(cx, cy + PORTRAIT_H - 160, CARD_W, 160);

  // Accent line
  ctx.fillStyle = accentColor;
  ctx.fillRect(cx, cy + PORTRAIT_H - 3, CARD_W, 3);

  // ── Element + Profession icons (top-right) ──
  const ETAG = 28;  // icon size
  const tagPad = 8;
  const elementIconKey: Record<number, string> = { 200: "physic", 201: "fire", 202: "ice", 203: "thunder", 205: "ether" };
  const professionIconKey: Record<number, string> = { 1: "attack", 2: "stun", 3: "anomaly", 4: "support", 5: "defense", 6: "rupture" };
  const elemKey = elementIconKey[agent.element_type as number];
  const profKey = professionIconKey[agent.avatar_profession as number] ?? professionIconKey[agent.profession as number];
  const elemIco = elemKey ? await loadLocal(`./src/assets/images/icons/element/${elemKey}.webp`) : null;
  const profIco = profKey ? await loadLocal(`./src/assets/images/icons/profession/${profKey}.webp`) : null;

  // draw element icon (top-right corner)
  if (elemIco) {
    const ex = cx + CARD_W - ETAG - tagPad;
    const ey = cy + tagPad;
    // subtle tinted bg circle
    rr(ctx, ex - 3, ey - 3, ETAG + 6, ETAG + 6, ETAG / 2 + 3, elemBg);
    ctx.drawImage(elemIco, ex, ey, ETAG, ETAG);
  }
  // draw profession icon below element
  if (profIco) {
    const px2 = cx + CARD_W - ETAG - tagPad;
    const py2 = cy + tagPad + ETAG + 6;
    rr(ctx, px2 - 3, py2 - 3, ETAG + 6, ETAG + 6, ETAG / 2 + 3, "rgba(255,255,255,0.07)");
    ctx.globalAlpha = 0.85;
    ctx.drawImage(profIco, px2, py2, ETAG, ETAG);
    ctx.globalAlpha = 1;
  }

  // ── Name + Lv + Mindscape (portrait bottom-left) ──
  const agentName = (agent.name_mi18n ?? agent.full_name_mi18n ?? agent.name ?? "");
  // Name: larger, higher up
  ctx.font = `26px ${font}`;
  ctx.fillStyle = C.fg;
  ctx.textAlign = "left";
  ctx.fillText(agentName, cx + PAD, cy + PORTRAIT_H - 38);

  // Lv + M badge row — same baseline, well spaced
  const lvText2 = `Lv.${agent.level ?? "?"}`;
  ctx.font = `13px ${font}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = "left";
  ctx.fillText(lvText2, cx + PAD, cy + PORTRAIT_H - 14);

  // ── Mindscape badge (text) ──
  const rank = agent.rank ?? 0;
  const isM6 = rank >= 6;
  ctx.font = `13px ${font}`;
  const lvMeasure = ctx.measureText(lvText2).width;
  const mbText = `M${rank}`;
  const mbW = ctx.measureText(mbText).width + 14;
  const mbX = cx + PAD + lvMeasure + 8;
  const mbY = cy + PORTRAIT_H - 28;
  rr(ctx, mbX, mbY, mbW, 17, 3, isM6 ? C.goldDim : accentColor + "20");
  rrStroke(ctx, mbX, mbY, mbW, 17, 3, isM6 ? "rgba(240,184,74,0.4)" : accentColor + "60");
  ctx.fillStyle = isM6 ? C.gold : accentColor;
  ctx.textAlign = "center";
  ctx.fillText(mbText, mbX + mbW / 2, mbY + 13);
  ctx.textAlign = "left";

  // ── Stats grid ──
  await drawStatsGrid(ctx, agent, font, cx, cy + STATS_Y, accentColor);

  // ── Weapon + Skills ──
  await drawWeaponSkillRow(ctx, agent, font, cx, cy + WS_Y, accentColor);

  // ── Drive discs 3×2 ──
  const discs = agent.equip ?? [];
  const discSlots: any[] = [];
  for (let i = 0; i < 6; i++) {
    discSlots.push(discs.find((d: any) => d.equipment_type - 1 === i) ?? null);
  }

  // Compute set bonus height dynamically based on number of bonus lines
  // Each set generates: 2件 desc line + (if 4件) 4件 desc line
  const setCountPre: Record<string, number> = {};
  for (const d of discSlots) {
    if (!d?.id) continue;
    const k = d.id.toString().slice(0, 3);
    setCountPre[k] = (setCountPre[k] ?? 0) + 1;
  }
  const bonusSets = Object.values(setCountPre).filter(c => c >= 2);
  // Set bonus panel height: fixed 120px — enough for up to 3×2件 + 1×4件 with wrapped desc
  const SET_BONUS_H = 120;

  const discAvailH = CARD_H - DISC_Y - PAD - SET_BONUS_H - 4;
  const CELL_W = Math.floor(INNER_W / 3);
  const CELL_H = Math.floor(discAvailH / 2);

  for (let di = 0; di < 6; di++) {
    const col = di % 3;
    const row = Math.floor(di / 3);
    await drawDiscCell(
      ctx,
      discSlots[di],
      font,
      cx + PAD + col * CELL_W,
      cy + DISC_Y + row * CELL_H,
      CELL_W,
      CELL_H,
      di + 1,
      accentColor,
    );
  }

  // ── Disc set bonuses ──
  const setBonusY = cy + DISC_Y + CELL_H * 2 + 4;
  await drawDiscSetBonuses(ctx, discSlots, font, cx + PAD, setBonusY, INNER_W, SET_BONUS_H, accentColor);
}

// ── Disc set bonus strip ─────────────────────────────────────────────────────
async function drawDiscSetBonuses(
  ctx: SKRSContext2D,
  discSlots: any[],
  font: string,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  accentColor: string,
) {
  // Collect sets
  const setMap: Record<string, { count: number; name: string; desc1: string; desc2: string }> = {};
  for (const disc of discSlots) {
    if (!disc?.id) continue;
    const key = disc.id.toString().slice(0, 3);
    if (!setMap[key]) {
      const rawName: string = disc.suite_name ?? disc.equip_suit?.name ?? disc.name ?? key;
      const setName = rawName.replace(/\s+(I{1,3}|IV|VI{0,3}|[1-6])$/u, "").trim();
      const desc1: string = disc.equip_suit?.desc1 ?? disc.suite_desc1 ?? disc.desc1 ?? "";
      const desc2: string = disc.equip_suit?.desc2 ?? disc.suite_desc2 ?? disc.desc2 ?? "";
      setMap[key] = { count: 0, name: setName, desc1, desc2 };
    }
    setMap[key].count++;
  }

  rr(ctx, bx, by, bw, bh - 2, 4, C.surface2);
  rrStroke(ctx, bx, by, bw, bh - 2, 4, accentColor + "35");

  // Build bonus entries: one entry per tier (2pc / 4pc)
  type BonusEntry = { name: string; tier: 2 | 4; desc: string };
  const entries: BonusEntry[] = [];
  for (const set of Object.values(setMap)) {
    if (set.count >= 2) entries.push({ name: set.name, tier: 2, desc: set.desc1 });
    if (set.count >= 4) entries.push({ name: set.name, tier: 4, desc: set.desc2 });
  }

  if (entries.length === 0) {
    ctx.font = `11px ${font}`;
    ctx.fillStyle = C.dim;
    ctx.textAlign = "center";
    ctx.fillText("無套裝", bx + bw / 2, by + bh / 2 + 4);
    return;
  }

  // Layout:
  //   Left col  → 2件 entries (up to 3)
  //   Left col  → 2件 entries (up to 3)
  //   Right col → 4件 entry (always gets full right half so desc can wrap freely)
  // If there is no 4件, all entries go into a single left column.
  const DESC_FONT  = `10px ${font}`;
  const BADGE_H    = 14;
  const DESC_LINE  = 13;  // px per wrapped desc line
  const HEADER_GAP = 4;   // gap between badge row and desc

  const twoEntries  = entries.filter(e => e.tier === 2);
  const fourEntries = entries.filter(e => e.tier === 4);
  const hasFour     = fourEntries.length > 0;

  const leftW  = hasFour ? Math.floor(bw * 0.42) : bw;
  const rightW = bw - leftW;

  // Measure how many desc lines an entry needs given a column width
  const countDescLines = (entry: BonusEntry, colW: number): number => {
    if (!entry.desc) return 0;
    ctx.font = DESC_FONT;
    const segs = parseRichText(entry.desc);
    return wrapRichSegments(ctx, segs, colW - 10, DESC_FONT).length;
  };

  // Draw a single entry; returns the total height consumed
  const drawEntry = (entry: BonusEntry, ex: number, ey: number, maxW: number): number => {
    const is4        = entry.tier === 4;
    const badgeLabel = is4 ? "4件" : "2件";
    ctx.font = `11px ${font}`;
    const bw2 = ctx.measureText(badgeLabel).width + 10;
    rr(ctx, ex, ey, bw2, BADGE_H, 2, is4 ? C.goldDim : accentColor + "20");
    rrStroke(ctx, ex, ey, bw2, BADGE_H, 2, is4 ? "rgba(240,184,74,0.45)" : accentColor + "55");
    ctx.fillStyle = is4 ? C.gold : accentColor;
    ctx.textAlign = "center";
    ctx.fillText(badgeLabel, ex + bw2 / 2, ey + BADGE_H - 2);

    ctx.font      = `11px ${font}`;
    ctx.fillStyle = C.fg;
    ctx.textAlign = "left";
    const nameX = ex + bw2 + 4;
    const nameW = maxW - bw2 - 4;
    ctx.fillText(truncate(ctx, entry.name, nameW), nameX, ey + BADGE_H - 2);

    let totalH = BADGE_H;
    if (entry.desc) {
      ctx.font = DESC_FONT;
      const segs  = parseRichText(entry.desc);
      const lines = wrapRichSegments(ctx, segs, maxW, DESC_FONT);
      lines.forEach((line, li) => {
        const lineY = ey + BADGE_H + HEADER_GAP + li * DESC_LINE + DESC_LINE - 2;
        let curX = ex;
        for (const seg of line) {
          if (!seg.text) continue;
          const isColored = !!seg.color;
          ctx.font = isColored
            ? DESC_FONT.replace(/^(\d)/, "bold $1").replace(/^(?!bold)/, "bold ")
            : DESC_FONT;
          ctx.fillStyle = seg.color ?? C.muted;
          ctx.textAlign = "left";
          ctx.fillText(seg.text, curX, lineY);
          curX += ctx.measureText(seg.text).width;
        }
      });
      totalH += HEADER_GAP + lines.length * DESC_LINE;
    }
    return totalH;
  };

  // ── Left column: 2件 entries, vertically centered ──
  if (twoEntries.length > 0) {
    const entryHeights = twoEntries.map(e => {
      const dl = countDescLines(e, leftW);
      return BADGE_H + (dl > 0 ? HEADER_GAP + dl * DESC_LINE : 0);
    });
    const GAP = 6;
    const contentH = entryHeights.reduce((a, b) => a + b, 0) + GAP * (twoEntries.length - 1);
    let ey = by + Math.floor((bh - contentH) / 2);
    twoEntries.forEach((entry, i) => {
      const h = drawEntry(entry, bx + 6, ey, leftW - 10);
      ey += h + GAP;
    });
  }

  // ── Right column: 4件 entry, vertically centered ──
  if (hasFour) {
    const rightX = bx + leftW;
    const entryHeights = fourEntries.map(e => {
      const dl = countDescLines(e, rightW);
      return BADGE_H + (dl > 0 ? HEADER_GAP + dl * DESC_LINE : 0);
    });
    const GAP = 6;
    const contentH = entryHeights.reduce((a, b) => a + b, 0) + GAP * (fourEntries.length - 1);
    let ey = by + Math.floor((bh - contentH) / 2);
    fourEntries.forEach((entry, i) => {
      const h = drawEntry(entry, rightX + 4, ey, rightW - 10);
      ey += h + GAP;
    });
  }
}
async function drawBangbooCard(
  ctx: SKRSContext2D,
  bangboo: any,
  font: string,
  bx: number,
) {
  const bw = BANGBOO_W - PAD;
  const imgH = 200;
  const cardH = imgH + 80;
  const by = (CARD_H - cardH) / 2;

  rr(ctx, bx, by, bw, cardH, 8, C.surface2);
  rrStroke(ctx, bx, by, bw, cardH, 8, C.border);

  if (bangboo.bangboo_rectangle_url) {
    const img = await loadImg(bangboo.bangboo_rectangle_url);
    if (img) {
      ctx.save();
      ctx.beginPath();
      (ctx as any).roundRect(bx, by, bw, imgH, [8, 8, 0, 0]);
      ctx.clip();
      ctx.drawImage(img, bx, by, bw, imgH);
      ctx.restore();
    }
  }

  ctx.font = `16px ${font}`;
  ctx.fillStyle = C.fg;
  ctx.textAlign = "center";
  ctx.fillText(bangboo.name ?? "", bx + bw / 2, by + imgH + 26);

  ctx.font = `12px ${font}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(
    `Lv.${bangboo.level ?? "?"}  ${"★".repeat(bangboo.star ?? 1)}`,
    bx + bw / 2,
    by + imgH + 46,
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
export async function handleTeamDraw(
  interaction: ChatInputCommandInteraction,
  tr: any,
  zzz: ZenlessZoneZero,
  agentIds: string[],
  bangbooId: string | null,
  paintingMode = false,
  rankDependentPainting = false,
): Promise<void> {
  drawQueue.push(async () => {
    try {
      const userLocale =
        (await getUserLang(interaction.user.id)) ||
        toI18nLang((interaction as any).locale) ||
        "en";
      const fontKey = userLocale.replace("-", "").toLowerCase().slice(0, 2);
      const font = fonts[fontKey] ?? fonts.default;

      // ── Fetch agents ──
      const agents = (
        await Promise.all(
          agentIds.map(async (id) => {
            try {
              const result = (await zzz.record.character(parseInt(id))) as any;
              return Array.isArray(result) ? (result[0] ?? null) : result;
            } catch {
              return null;
            }
          }),
        )
      ).filter(Boolean) as any[];

      if (agents.length === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe76161 as any)
              .setTitle(tr("DrawError") || "Error")
              .setDescription(tr("team_NoAgentData") || "Could not retrieve agent data."),
          ],
        });
        return;
      }

      // ── Fetch bangboo ──
      let bangboo: any = null;
      if (bangbooId) {
        try {
          const record = await zzz.record.records();
          bangboo =
            ((record as any).buddy_list as any[] ?? []).find(
              (b: any) => String(b.id) === bangbooId,
            ) ?? null;
        } catch { /* continue without */ }
      }

      // ── Fetch wiki paintings (optional) ──
      const wikiPaintingUrls: (string | undefined)[] = await Promise.all(
        agents.map(async (agent: any) => {
          if (!paintingMode) return undefined;
          const name: string = agent.name_mi18n ?? agent.full_name_mi18n ?? agent.name ?? "";
          if (!name) return undefined;
          try {
            const entryId = await searchWikiEntry(name);
            if (!entryId) return undefined;
            const rank: number = agent.rank ?? 0;
            const paintingIdx = rankDependentPainting ? paintingIndexForRank(rank) : null;
            // null idx = pick last available; otherwise pick requested idx (no silent fallback to 0)
            const localPaths = getLocalWikiPaintings(entryId);
            const localPath = paintingIdx !== null
              ? (localPaths[paintingIdx] ?? null)
              : (localPaths[localPaths.length - 1] ?? null);
            if (localPath) return localPath;
            // Fall back to remote
            const imgs = await fetchWikiPaintings(entryId);
            return paintingIdx !== null
              ? (imgs[paintingIdx] ?? null)
              : (imgs[imgs.length - 1] ?? null);
          } catch {
            return undefined;
          }
        }),
      );

      // ── Canvas ──
      const totalW =
        agents.length * CARD_W + (agents.length - 1) * PAD + (bangboo ? PAD + BANGBOO_W : 0);
      const canvas = createCanvas(totalW, CARD_H);
      const ctx = canvas.getContext("2d") as unknown as SKRSContext2D;

      // Background
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, totalW, CARD_H);

      for (let i = 0; i < agents.length; i++) {
        await drawAgentCard(ctx, agents[i], font, i * (CARD_W + PAD), wikiPaintingUrls[i]);
      }

      if (bangboo) {
        await drawBangbooCard(ctx, bangboo, font, agents.length * (CARD_W + PAD));
      }

      const buf = (canvas as any).toBuffer("image/png");
      await interaction.editReply({ files: [new AttachmentBuilder(buf, { name: "team.png" })] });
    } catch (error: any) {
      console.error("[/team] draw error:", error);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe76161 as any)
              .setTitle(tr("DrawError") || "Error")
              .setDescription(`\`${error?.message ?? error}\``),
          ],
        });
      } catch { /* ignore */ }
    }
  });
}
