import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Disc scoring can ship independently of the unfinished combat simulation. */
export function discScoringReleased(): boolean {
  try {
    const release = JSON.parse(
      readFileSync(resolve("src/assets/combat/scoring-release.json"), "utf8"),
    );
    return release.schemaVersion === 1 && release.enabled === true;
  } catch {
    return false;
  }
}
