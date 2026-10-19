import { parentPort, workerData } from "node:worker_threads";
import { runBulkTrial, runResourcePlan } from "./gachaSimulationAnalysis.js";
try {
  const result = workerData.type === "resource" ? runResourcePlan(workerData.input) : runBulkTrial(workerData.input);
  parentPort?.postMessage({ result });
} catch (error) { parentPort?.postMessage({ error: error instanceof Error ? error.message : "試算失敗" }); }
