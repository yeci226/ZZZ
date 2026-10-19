import type { SKRSContext2D } from "@napi-rs/canvas";
import type { DiscScore, ProfileScore } from "./combat/scoring.js";
import { combatText } from "./combat/copy.js";

export type ScoreTheme = "paper" | "dark";
const GRADE_COLORS: Record<string, [string, string]> = {
  D: ["#59616c", "#d4dae2"], C: ["#59616c", "#d4dae2"],
  B: ["#255f92", "#cde8ff"], A: ["#24684b", "#b9e7ce"],
  S: ["#775315", "#f8dda0"], SS: ["#68438f", "#e3d0ff"],
  SSS: ["#923c66", "#ffd0e5"], ACE: ["#923b1c", "#ffc39d"],
};

export function gradeColors(grade: string | null): [string, string] {
  return GRADE_COLORS[grade ?? ""] ?? GRADE_COLORS.D;
}

export function drawGradeBadge(ctx: SKRSContext2D, grade: string, x: number, baseline: number, size = 10): number {
  ctx.save();
  ctx.font = `800 ${size}px EN`;
  const width = Math.ceil(ctx.measureText(grade).width) + size;
  const [ink, fill] = gradeColors(grade);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, baseline - size - 2, width, size + 6, 4);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(grade, x + width / 2, baseline);
  ctx.restore();
  return width;
}

/** Compact score at the top-right of a disc; never changes the card geometry. */
export function drawDiscScore(ctx: SKRSContext2D, disc: DiscScore | undefined, right: number, baseline: number, theme: ScoreTheme): void {
  if (!disc || disc.status === "empty") return;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  const valid = disc.status === "scored" && disc.score !== null && Number.isFinite(disc.score);
  const value = valid ? disc.score!.toFixed(1) : "—";
  let valueRight = right;
  if (valid && disc.grade) {
    ctx.font = "800 10px EN";
    const width = Math.ceil(ctx.measureText(disc.grade).width) + 10;
    drawGradeBadge(ctx, disc.grade, right - width, baseline - 1);
    valueRight -= width + 5;
  }
  ctx.fillStyle = theme === "paper" ? "#28242d" : "#faf5ed";
  ctx.font = "900 16px Nunito";
  ctx.textAlign = "right";
  ctx.fillText(value, valueRight, baseline);
  ctx.restore();
}

/** Returns the natural width so callers can reserve space next to effective rolls. */
export function drawTotalScore(ctx: SKRSContext2D, score: ProfileScore, x: number, baseline: number, font: string, locale: string, theme: ScoreTheme, measureOnly = false): number {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const ink = theme === "paper" ? "#28242d" : "#faf5ed";
  const muted = theme === "paper" ? "#6c6265" : "#b6b6bf";
  const copy = combatText(locale);
  let cursor = x;
  const segment = (value: string, typeface: string, color: string, gap: number) => {
    ctx.font = typeface; ctx.fillStyle = color;
    if (!measureOnly) ctx.fillText(value, cursor, baseline);
    cursor += ctx.measureText(value).width + gap;
  };
  segment(copy.total, `600 11px ${font}`, muted, 7);
  if (score.pending || score.total === null || !Number.isFinite(score.total)) {
    segment(score.pending ? copy.pending : "—", `600 12px ${font}`, muted, 0);
  } else {
    segment(score.total.toFixed(1), "900 19px Nunito", ink, 4);
    segment("/600", "600 10px EN", muted, score.grade ? 7 : 0);
    if (score.grade) {
      ctx.font = "800 10px EN";
      const width = Math.ceil(ctx.measureText(score.grade).width) + 10;
      if (!measureOnly) drawGradeBadge(ctx, score.grade, cursor, baseline - 2);
      cursor += width;
    }
  }
  ctx.restore();
  return cursor - x;
}
