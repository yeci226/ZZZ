import path from "node:path";
import { Worker } from "node:worker_threads";
import type { GachaSimulationStore } from "./gachaSimulationStore.js";
export function runSimulationJob(store: GachaSimulationStore, id: string, ownerId: string, type: "resource" | "bulk", input: unknown): Promise<any> {
  store.claimJob(id, ownerId);
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new Worker(path.resolve("dist/utilities/zzz/gachaSimulationWorker.js"), { workerData: { type, input }, execArgv: [] }); }
    catch (error) { store.finishJob(id, "failed"); reject(error); return; }
    let finished = false;
    const end = (error?: Error, result?: unknown) => {
      if (finished) return; finished = true; clearTimeout(timeout); clearInterval(cancel);
      store.finishJob(id, error ? "failed" : "complete"); void worker.terminate(); error ? reject(error) : resolve(result);
    };
    const timeout = setTimeout(() => end(new Error("試算超過時間限制，請降低抽數後重試。")), 40_000);
    const cancel = setInterval(() => { if (store.jobStatus(id) === "cancelled") end(new Error("試算已取消，日常進度未變更。")); }, 250);
    worker.once("message", ({ result, error }) => end(error ? new Error(error) : undefined, result));
    worker.once("error", error => end(error instanceof Error ? error : new Error("試算工作失敗。")));
    worker.once("exit", code => { if (!finished) end(new Error(`試算工作意外結束 (${code})。`)); });
  });
}
