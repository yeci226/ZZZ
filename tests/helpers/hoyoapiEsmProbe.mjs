// Child-process probe for tests/hoyoapiRequestTimeout.test.ts: loads the ESM
// build of the vendored hoyoapi with node:https stubbed, runs one scenario
// and prints a JSON result. Usage: node hoyoapiEsmProbe.mjs <esmChunkPath> <scenario>
import https from "node:https";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";

const [chunkPath, scenario] = process.argv.slice(2);
let attempts = 0;

https.request = (_url, _opts, cb) => {
  attempts++;
  const req = new EventEmitter();
  req.write = () => true;
  req.destroy = (err) => {
    process.nextTick(() => req.emit("error", err));
  };
  req.end = () => {
    if (scenario === "hang") return;
    if (scenario === "econnreset") {
      process.nextTick(() => req.emit("error", new Error("read ECONNRESET")));
      return;
    }
    const res = new EventEmitter();
    res.statusCode = 200;
    res.statusMessage = "OK";
    res.complete = true;
    res.headers = { "content-type": "application/json", "retry-after": "0" };
    process.nextTick(() => {
      cb(res);
      res.emit("data", Buffer.from(JSON.stringify({ retcode: -1004, message: "busy", data: null })));
      res.emit("end");
      res.emit("close");
    });
  };
  return req;
};
syncBuiltinESMExports();

const mod = await import(pathToFileURL(chunkPath).href);
const HTTPRequest = Object.values(mod).find((v) => typeof v === "function" && v.name === "HTTPRequest");
const r = new HTTPRequest();
r.timeoutMs = 50;
r.retryBaseMs = 1;
let out;
try {
  const res = await r.send("https://example.invalid/x", "GET", 0);
  out = { ok: true, retcode: res.response.retcode, attempts };
} catch (e) {
  out = { ok: false, name: e.name, message: e.message, attempts };
}
console.log("RESULT " + JSON.stringify(out));
