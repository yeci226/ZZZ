import { createCanvas } from "@napi-rs/canvas";
import { resolveProfileFont } from "../profileLocale.js";
import { combatText } from "./copy.js";
import { scoreCharacter, SCORE_VERSION, type DiscScore, type ProfileScore, type ScoringSnapshot } from "./scoring.js";
import { getScoringStore } from "./scoringStore.js";
import { discScoringReleased } from "./scoringRelease.js";
import type { SimulationResult } from "./types.js";

export function profileScore(character: unknown, build = "auto", snapshot?: ScoringSnapshot): ProfileScore | null {
  if (!snapshot && !discScoringReleased()) return null;
  const pinned = snapshot ?? getScoringStore().snapshot();
  const unavailable = (pending: boolean): ProfileScore => ({version: SCORE_VERSION, hash: pinned.hash, build, availableBuilds: [], discs: [], total: null, grade: null, complete: false, pending});
  try { return scoreCharacter(character, pinned, build) ?? unavailable(true); }
  catch (error) { console.warn("[disc-scoring]", error instanceof Error ? error.message : "Invalid data"); return unavailable(false); }
}
export function discScoreLabel(disc: DiscScore | undefined): string {
  if (!disc || disc.status === "empty") return "";
  return disc.status === "scored" && disc.score !== null
    ? `${disc.score.toFixed(1)} · ${disc.grade ?? "—"}`
    : "—";
}

export function totalScoreLabel(score: ProfileScore | null, locale: string): string {
  if (!score) return "";
  const tr = combatText(locale);
  const value = score.pending ? tr.pending : score.total === null ? tr.invalid
    : `${score.total.toFixed(1)}/600 · ${score.grade ?? "—"}`;
  return `${tr.total} ${value}`;
}
export function renderSimulation(result: SimulationResult, names: Record<string, string>, locale: string): Buffer {
  const canvas = createCanvas(1000, 660), ctx = canvas.getContext("2d"), tr = combatText(locale), font = resolveProfileFont(locale);
  ctx.fillStyle = "#17191c"; ctx.fillRect(0, 0, 1000, 660);
  ctx.fillStyle = "#f6eee2"; ctx.font = `700 27px ${font}`; ctx.fillText(tr.simulation, 32, 45);
  ctx.font = `20px ${font}`; ctx.fillText(`${tr.damage}  ${Math.round(result.meanDamage).toLocaleString()}     DPS  ${result.meanDps === null ? "—" : Math.round(result.meanDps).toLocaleString()}`, 32, 87);
  ctx.fillStyle = "#bfc1c4"; ctx.font = `14px ${font}`;
  ctx.fillText(`${result.durationMs / 1000}s · n=${result.trials} · P10 ${Math.round(result.p10)} / P90 ${Math.round(result.p90)}`, 32, 117);
  const x = 40, y = 340, w = 920, h = 180, max = Math.max(1, ...result.perSecond);
  ctx.strokeStyle = "#62666c"; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
  // Stun intervals are from the labelled first-seed trace, not an averaged timeline.
  let start: number | undefined;
  for (const event of [...result.trace.events, {atMs: result.durationMs, kind: "recover" as const}]) {
    if (event.kind === "stun") start = event.atMs;
    if (event.kind === "recover" && start !== undefined) { ctx.fillStyle = "rgba(126,147,255,0.18)"; ctx.fillRect(x + w * start / result.durationMs, y - h, w * (event.atMs - start) / result.durationMs, h); start = undefined; }
  }
  ctx.strokeStyle = "#ffba6b"; ctx.lineWidth = 2; ctx.beginPath();
  result.perSecond.forEach((n, i) => { const px = x + i / Math.max(1, result.perSecond.length - 1) * w, py = y - h * n / max; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
  ctx.fillStyle = "#bfc1c4"; ctx.fillText(`0s`, x, y + 22); ctx.fillText(`${result.durationMs / 1000}s`, x + w - 45, y + 22);
  ctx.fillText(`seed ${result.trace.seed}`, x, y + 43);
  ctx.fillStyle = "#f6eee2"; ctx.font = `18px ${font}`; ctx.fillText(tr.share, 40, 415);
  Object.entries(result.byActor).sort((a, b) => b[1] - a[1]).forEach(([id, amount], i) => {
    const ratio = result.meanDamage > 0 ? amount / result.meanDamage : 0, yy = 449 + i * 35;
    ctx.fillStyle = "#f6eee2"; ctx.fillText(names[id] ?? id, 40, yy, 240);
    ctx.fillStyle = "#ffba6b"; ctx.fillRect(300, yy - 15, ratio * 520, 18);
    ctx.fillStyle = "#f6eee2"; ctx.fillText(`${(ratio * 100).toFixed(1)}%`, 850, yy);
  });
  ctx.fillStyle = "#a8aaad"; ctx.font = `12px ${font}`;
  ctx.fillText(`${result.modelVersion} · ${result.fingerprint.slice(0, 12)}`, 32, 634);
  return canvas.toBuffer("image/png");
}
