import { parentPort, workerData } from "node:worker_threads";
import { simulate } from "./engine.js";
if (parentPort) {
  try {
    const result = simulate(workerData, (done, total) => { if (done % 10 === 0 || done === total) parentPort!.postMessage({type: "progress", done, total}); });
    parentPort.postMessage({type: "result", result});
  } catch (error) { parentPort.postMessage({type: "error", error: error instanceof Error ? error.message : "Simulation failed"}); }
}
