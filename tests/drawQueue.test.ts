import { createDrawQueue } from "../src/utilities/canvas/drawQueue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("shared draw queue", () => {
  it("never runs more than the concurrency limit at once", async () => {
    const queue = createDrawQueue(2, 1000);
    let running = 0;
    let peak = 0;
    let done = 0;
    for (let i = 0; i < 6; i++) {
      queue.push(async () => {
        running++;
        peak = Math.max(peak, running);
        await wait(15);
        running--;
        done++;
      });
    }
    await wait(150);
    expect(done).toBe(6);
    expect(peak).toBe(2);
  });

  it("reports a position that only counts jobs waiting for a slot", () => {
    const queue = createDrawQueue(2, 30);
    const never = () => new Promise<void>(() => {});
    queue.push(never);
    expect(queue.length).toBe(1);
    queue.push(never);
    expect(queue.length).toBe(1);
    queue.push(never);
    expect(queue.length).toBe(2);
  });

  it("keeps serving later jobs after a job throws", async () => {
    const queue = createDrawQueue(1, 1000);
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const ran: number[] = [];
    queue.push(async () => {
      throw new Error("boom");
    });
    queue.push(async () => {
      ran.push(1);
    });
    queue.push(() => {
      ran.push(2);
    });
    await wait(30);
    expect(ran).toEqual([1, 2]);
    spy.mockRestore();
  });

  it("times out a job that never finishes, notifies, and keeps going", async () => {
    const queue = createDrawQueue(1, 40);
    const ran: number[] = [];
    const notify = jest.fn();
    queue.push(() => new Promise<void>(() => {}), notify);
    queue.push(async () => {
      ran.push(1);
    });
    await wait(120);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(ran).toEqual([1]);
  });
});
