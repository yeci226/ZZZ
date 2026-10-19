import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createLiveCalculatorApp } from "../utilities/zzz/combat/liveCalculatorApp.js";

const snapshotPath = process.argv[2];
if (!snapshotPath)
  throw new Error(
    "Usage: tsx src/scripts/liveCombatCalculator.ts <character-snapshot.json> [port]",
  );
const port = Number(process.argv[3] ?? 8788);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local port");
const input = readFileSync(resolve(snapshotPath));
if (input.byteLength > 2_000_000)
  throw new Error("Character snapshot too large");
const snapshot = JSON.parse(input.toString("utf8"));
const app = createLiveCalculatorApp(snapshot);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Live build calculator: http://127.0.0.1:${port}/`),
);
server.on("error", (error: any) => {
  console.error(`Unable to start calculator (${error.code ?? "server_error"})`);
  process.exitCode = 1;
});
