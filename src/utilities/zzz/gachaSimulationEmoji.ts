import { readFileSync } from "node:fs";
import path from "node:path";
type Emoji = { id?: string; name: string };
let manifest: Record<string, Record<string, Emoji>> | undefined;
const fallback: Record<string, string> = { S: "⭐", A: "🟣", B: "🔵", tapes: "🎞️", polychrome: "💎", character: "👤", weapon: "🔊" };
const actionIcon: Record<string, string> = {
  candidates: "S", sCandidates: "S", aUp: "A", aCandidates: "A", base: "S", softS: "S", softA: "A", up: "S",
  history: "S", collection: "character", resource: "tapes", resources: "polychrome", animation: "tapes", chooseBanner: "tapes",
  character: "character", weapon: "weapon", "stage-character": "character", "stage-weapon": "weapon",
  "banner-character": "character", "banner-weapon": "weapon", "rules-character": "character", "rules-weapon": "weapon",
  run: "tapes", cdf: "S", hazard: "S", bulk1000: "tapes", bulk10000: "tapes", bulk100000: "tapes",
};
export function simulationEmoji(applicationId: string | undefined, key: string): Emoji | undefined {
  if (!manifest) { try { manifest = JSON.parse(readFileSync(path.resolve("src/assets/gacha-simulation/ui/application-emojis.json"), "utf8")); } catch { manifest = {}; } }
  return (applicationId && manifest![applicationId]?.[key]) || (fallback[key] ? { name: fallback[key] } : undefined);
}
export function actionEmoji(applicationId: string | undefined, action: string) { return simulationEmoji(applicationId, actionIcon[action]); }
