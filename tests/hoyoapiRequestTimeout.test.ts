import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Exercises the PATCHED request layer of @yeci226/hoyoapi (patches/
// @yeci226+hoyoapi+1.4.0.patch): per-attempt timeout, error handler, bounded
// retries. node:https is stubbed; no network is used.
const mockRequest = jest.fn();
jest.mock("https", () => ({
  ...jest.requireActual("https"),
  request: (...args: unknown[]) => mockRequest(...args),
}));

const distDir = path.join(
  process.cwd(),
  "node_modules/@yeci226/hoyoapi/dist",
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HTTPRequest } = require(path.join(distDir, "cjs/request/request.js"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HoyoAPIError } = require(path.join(distDir, "cjs/error/index.js"));

type Behaviour = (cb: (res: any) => void, req: EventEmitter) => void;

function stubRequest(onEnd: Behaviour) {
  mockRequest.mockImplementation((_url: unknown, _opts: unknown, cb: any) => {
    const req: any = new EventEmitter();
    req.write = () => true;
    req.destroy = (err?: Error) => {
      process.nextTick(() => req.emit("error", err));
    };
    req.end = () => onEnd(cb, req);
    return req;
  });
}

function jsonResponse(cb: (res: any) => void, body: unknown, headers = {}) {
  const res: any = new EventEmitter();
  res.statusCode = 200;
  res.statusMessage = "OK";
  res.complete = true;
  res.headers = { "content-type": "application/json", ...headers };
  process.nextTick(() => {
    cb(res);
    res.emit("data", Buffer.from(JSON.stringify(body)));
    res.emit("end");
    res.emit("close");
  });
}

function fastClient() {
  const r = new HTTPRequest();
  r.timeoutMs = 50;
  r.retryBaseMs = 1;
  return r;
}

describe("patched hoyoapi request layer", () => {
  let uncaught: Error[];
  const onUncaught = (e: Error) => uncaught.push(e);
  beforeEach(() => {
    uncaught = [];
    mockRequest.mockReset();
    process.on("uncaughtException", onUncaught);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    (console.log as jest.Mock).mockRestore?.();
    process.off("uncaughtException", onUncaught);
  });

  it("defaults to a 15s timeout and 3 attempts", () => {
    const r = new HTTPRequest();
    expect(r.timeoutMs).toBe(15000);
    expect(r.maxAttempts).toBe(3);
  });

  it("rejects with a timeout error when the server never responds", async () => {
    stubRequest(() => undefined);
    const started = Date.now();
    const err: any = await fastClient()
      .send("https://example.invalid/a", "GET", 0)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoyoAPIError);
    expect(err.message).toMatch(/timeout/i);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(uncaught).toEqual([]);
  });

  it("rejects (no uncaught exception) on a connection error", async () => {
    stubRequest((_cb, req) => {
      process.nextTick(() => req.emit("error", new Error("read ECONNRESET")));
    });
    const err: any = await fastClient()
      .send("https://example.invalid/b", "GET", 0)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoyoAPIError);
    expect(err.message).toContain("ECONNRESET");
    await new Promise((r) => setTimeout(r, 20));
    expect(uncaught).toEqual([]);
  });

  it("rejects when the response stream dies mid-body", async () => {
    stubRequest((cb) => {
      const res: any = new EventEmitter();
      res.statusCode = 200;
      res.headers = { "content-type": "application/json" };
      res.complete = false;
      process.nextTick(() => {
        cb(res);
        res.emit("data", Buffer.from("{"));
        res.emit("close");
      });
    });
    const err: any = await fastClient()
      .send("https://example.invalid/c", "GET", 0)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoyoAPIError);
    expect(err.message).toMatch(/closed|aborted/i);
  });

  it("stops after 3 attempts on a retryable retcode and returns the same shape", async () => {
    stubRequest((cb) =>
      jsonResponse(cb, { retcode: -1004, message: "busy", data: null }),
    );
    const res = await fastClient().send("https://example.invalid/d", "GET", 0);
    expect(mockRequest).toHaveBeenCalledTimes(3);
    expect(res.response).toEqual({ data: null, message: "busy", retcode: -1004 });
    expect(res.status.code).toBe(200);
  });

  it("does not retry non-retryable retcodes", async () => {
    stubRequest((cb) =>
      jsonResponse(cb, { retcode: -100, message: "login", data: null }),
    );
    const res = await fastClient().send("https://example.invalid/e", "GET", 0);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(res.response.retcode).toBe(-100);
  });

  it("honors Retry-After and caps the wait", async () => {
    const waits: number[] = [];
    const realSetTimeout = global.setTimeout;
    jest.spyOn(global, "setTimeout").mockImplementation(((fn: any, ms?: number) => {
      // Only record/skip the retry waits (timeouts of 50ms are the request deadline).
      if (ms !== 50) {
        waits.push(ms as number);
        return realSetTimeout(fn, 0);
      }
      return realSetTimeout(fn, ms);
    }) as any);
    stubRequest((cb) =>
      jsonResponse(
        cb,
        { retcode: 429, message: "x", data: null },
        { "retry-after": "3600" },
      ),
    );
    const r = fastClient();
    r.retryBaseMs = 1000;
    await r.send("https://example.invalid/f", "GET", 0);
    (global.setTimeout as any).mockRestore();
    expect(waits).toEqual([10000, 10000]);
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });

  it("ESM build behaves the same (child process)", () => {
    const probe = path.join(process.cwd(), "tests/helpers/hoyoapiEsmProbe.mjs");
    const chunk = path.join(distDir, "esm/chunk-FMPTW7AC.mjs");
    const run = (scenario: string) => {
      const out = execFileSync(process.execPath, [probe, chunk, scenario], {
        encoding: "utf8",
        timeout: 20000,
      });
      return JSON.parse(out.split("RESULT ")[1]);
    };
    const hang = run("hang");
    expect(hang.ok).toBe(false);
    expect(hang.message).toMatch(/timeout/i);
    const reset = run("econnreset");
    expect(reset.ok).toBe(false);
    expect(reset.message).toContain("ECONNRESET");
    const retry = run("retry");
    expect(retry).toMatchObject({ ok: true, retcode: -1004, attempts: 3 });
  });
});
