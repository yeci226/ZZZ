/** Compare a saved, locally compiled combat plan against independently transcribed game observations. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { combatCatalog } from "../utilities/zzz/combat/catalog.js";
import {
  importDocument,
  compileDocument,
} from "../utilities/zzz/combat/document.js";
import {
  compareCombatCapture,
  type CombatCapture,
} from "../utilities/zzz/combat/calibration.js";
import { simulateTrial } from "../utilities/zzz/combat/engine.js";
import { scenarioKey } from "../utilities/zzz/combat/plans.js";

async function main() {
  const [
    planPath,
    capturePath,
    outputPath = "previews/combat/calibration-report.json",
  ] = process.argv.slice(2);
  if (!planPath || !capturePath)
    throw new Error(
      "Usage: tsx src/scripts/calibrateCombat.ts <plan-v3.json> <capture.json> [report.json]",
    );
  const plan = importDocument(
    await readFile(resolve(planPath), "utf8"),
    combatCatalog,
  );
  if (!plan.gameDataVersion)
    throw new Error("Calibration requires a pinned game data version");
  const scenario = compileDocument(plan, combatCatalog);
  const capture = JSON.parse(
    await readFile(resolve(capturePath), "utf8"),
  ) as CombatCapture;
  const report = compareCombatCapture(
    simulateTrial(scenario, scenario.seed, true),
    capture,
    {
      gameVersion: plan.gameDataVersion,
      modelVersion: plan.modelVersion,
      scenarioFingerprint: scenarioKey(scenario),
    },
  );
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(
    `${report.passed ? "Numerical comparison passed; source review still required" : "Calibration failed"}: ${output}`,
  );
  if (!report.passed) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Calibration failed");
  process.exitCode = 1;
});
