import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";

const INDEX_URL = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/zzz/avatars.json";
const IMAGE_HOST = "https://enka.network";
const HEADERS = { "User-Agent": "Mozilla/5.0" };

type AgentEntry = { Image?: string; WeaponId?: number | string };

function agentIds(index: Record<string, unknown>): string[] {
  return Object.keys(index).filter((key) => /^\d{4}$/.test(key)).sort((a, b) => Number(a) - Number(b));
}

export function planPortraitDownloads(index: Record<string, { Image?: string }>, existingIds: ReadonlySet<string>): Array<{ id: string; url: string }> {
  const plan: Array<{ id: string; url: string }> = [];
  for (const id of agentIds(index)) {
    const image = index[id]?.Image;
    if (!image || existingIds.has(id)) continue;
    plan.push({ id, url: `${IMAGE_HOST}${image.startsWith("/") ? "" : "/"}${image}` });
  }
  return plan;
}

export function signatureWeaponMap(index: Record<string, { WeaponId?: number | string }>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of agentIds(index)) {
    const raw = index[id]?.WeaponId;
    const weaponId = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : raw;
    if (typeof weaponId !== "number" || !Number.isInteger(weaponId) || weaponId <= 0) continue;
    map[String(weaponId)] = id;
  }
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => Number(a) - Number(b)));
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");
  const root = resolve("src", "assets"); // run from the repository root
  const agentsDir = join(root, "images", "agents");
  const index = (await (await fetchWithTimeout(INDEX_URL)).json()) as Record<string, AgentEntry>;
  const existing = new Set(existsSync(agentsDir) ? readdirSync(agentsDir).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)) : []);
  const plan = planPortraitDownloads(index, existing);
  console.log(`${plan.length} portrait(s) to download`);
  if (dryRun) {
    for (const { id, url } of plan) console.log(`${id} ${url}`);
    return 0;
  }
  mkdirSync(agentsDir, { recursive: true });
  let failures = 0;
  for (const [i, { id, url }] of plan.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      const image = await loadImage(Buffer.from(await (await fetchWithTimeout(url)).arrayBuffer()));
      const canvas = createCanvas(image.width, image.height);
      canvas.getContext("2d").drawImage(image, 0, 0);
      writeFileSync(join(agentsDir, `${id}.webp`), canvas.toBuffer("image/webp", 90));
      console.log(`saved ${id}.webp (${image.width}x${image.height})`);
    } catch (error) {
      failures++;
      console.error(`failed ${id} ${url}: ${error instanceof Error ? error.message : error}`);
    }
  }
  writeFileSync(join(root, "signature-weapons.json"), `${JSON.stringify(signatureWeaponMap(index), null, 2)}\n`);
  return failures ? 1 : 0;
}

// ts-jest compiles to CJS where import.meta is a type error, so detect direct execution by file name
if (/syncAgentPortraits\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  void main().then((code) => { process.exitCode = code; }, (error) => { console.error(error); process.exitCode = 1; });
}
