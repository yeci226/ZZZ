import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { SimulationResult, SimulationScenario } from "./types.js";

export interface CombatJob {
  id: string; owner: string; promise: Promise<SimulationResult>;
  cancel(): void;
}
interface Task {
  id: string; owner: string; scenario: SimulationScenario;
  resolve(value: SimulationResult): void; reject(error: Error): void;
  progress?: (done: number, total: number) => void;
  worker?: Worker; timeout?: ReturnType<typeof setTimeout>; finished: boolean;
}
/** Per-process pool; never starts more than two CPU-bound workers. */
export class CombatJobs {
  private queue: Task[] = [];
  private running = new Map<string, Task>();
  constructor(private concurrency = 2, private capacity = 10, private timeoutMs = 30_000,
    private factory: (scenario: SimulationScenario) => Worker = scenario => new Worker(resolve("dist/utilities/zzz/combat/worker.js"), {workerData: scenario, execArgv: []})) {}
  submit(owner: string, scenario: SimulationScenario, progress?: Task["progress"]): CombatJob {
    if (this.queue.length + this.running.size >= this.capacity) throw new Error("Simulation queue is full");
    if ([...this.queue, ...this.running.values()].some(t => t.owner === owner)) throw new Error("A simulation is already running for this user");
    let task: Task;
    const promise = new Promise<SimulationResult>((resolve, reject) => { task = {id: randomUUID(), owner, scenario: structuredClone(scenario), progress, resolve, reject, finished: false}; });
    this.queue.push(task!); this.drain();
    return {id: task!.id, owner, promise, cancel: () => this.finish(task!, new Error("Simulation cancelled"))};
  }
  cancel(owner: string) {
    for (const task of [...this.queue, ...this.running.values()]) if (task.owner === owner) this.finish(task, new Error("Simulation cancelled"));
  }
  private finish(task: Task, error?: Error, result?: SimulationResult) {
    if (task.finished) return; task.finished = true;
    clearTimeout(task.timeout); this.queue = this.queue.filter(t => t !== task); this.running.delete(task.id);
    if (task.worker) void task.worker.terminate();
    if (error) task.reject(error); else if (result) task.resolve(result); else task.reject(new Error("Missing simulation result"));
    this.drain();
  }
  private drain() {
    while (this.running.size < this.concurrency && this.queue.length) {
      const task = this.queue.shift()!; if (task.finished) continue;
      this.running.set(task.id, task);
      try {
        task.worker = this.factory(task.scenario);
        task.timeout = setTimeout(() => this.finish(task, new Error("Simulation timed out; no partial result was saved")), this.timeoutMs);
        task.worker.on("message", message => {
          if (task.finished) return;
          if (message.type === "progress") { try { task.progress?.(message.done, message.total); } catch { /* UI failure must not orphan a worker. */ } }
          else if (message.type === "result") this.finish(task, undefined, message.result);
          else if (message.type === "error") this.finish(task, new Error(message.error));
        });
        task.worker.once("error", error => this.finish(task, error instanceof Error ? error : new Error("Simulation worker failed")));
        task.worker.once("exit", code => { if (!task.finished) this.finish(task, new Error(`Simulation worker exited (${code})`)); });
      } catch (error) { this.finish(task, error instanceof Error ? error : new Error("Worker start failed")); }
    }
  }
}
export const combatJobs = new CombatJobs();
