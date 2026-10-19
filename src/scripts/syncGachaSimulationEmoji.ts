/** Run explicitly when preparing game icons for a bot. Never called during an interaction. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { REST } from "discord.js";
import { getConfig } from "../utilities/core/config.js";
import { SIM_IMAGE_PATHS, picture } from "../utilities/zzz/gachaSimulationVisuals.js";

const config = getConfig(), test = process.argv.includes("--test"), production = process.argv.includes("--production");
if (test === production) throw new Error("Choose exactly one bot: --test or --production");
const token = test ? config.TEST_TOKEN : config.TOKEN;
if (test && token === config.TOKEN) throw new Error("A separate test token is required");
const rest = new REST({ version: "10" }).setToken(token);
const application = await rest.get("/oauth2/applications/@me") as { id: string };
const existing = await rest.get(`/applications/${application.id}/emojis`) as { items: Array<{ id: string; name: string }> };
const file = path.resolve("src/assets/gacha-simulation/ui/application-emojis.json");
let manifest: Record<string, Record<string, { id: string; name: string }>> = {};
try { manifest = JSON.parse(readFileSync(file, "utf8")); } catch { /* First setup. */ }
manifest[application.id] ||= {};
for (const key of Object.keys(SIM_IMAGE_PATHS)) {
  const name = `gsim_${key.toLowerCase()}`;
  let emoji = existing.items.find(e => e.name === name);
  if (!emoji) {
    const canvas = createCanvas(128, 128); await picture(canvas.getContext("2d"), key, 0, 0, 128);
    const png = canvas.toBuffer("image/png");
    if (png.length > 256 * 1024) throw new Error(`${name} exceeds Discord's emoji size limit`);
    emoji = await rest.post(`/applications/${application.id}/emojis`, { body: { name, image: `data:image/png;base64,${png.toString("base64")}` } }) as { id: string; name: string };
  }
  manifest[application.id][key] = { id: emoji.id, name: emoji.name };
  writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
}
console.log(JSON.stringify({ applicationId: application.id, icons: Object.keys(manifest[application.id]).length }));
