import { existsSync, readFileSync } from "node:fs";
import { planPortraitDownloads, signatureWeaponMap } from "../src/scripts/syncAgentPortraits.js";

it("plans downloads only for agents without local art", () => {
  const index = { "1091": { Image: "/ui/zzz/IconRole13.png" }, "1321": { Image: "/ui/zzz/IconRole37.png" }, "9999": {} };
  expect(planPortraitDownloads(index, new Set(["1091"]))).toEqual([{ id: "1321", url: "https://enka.network/ui/zzz/IconRole37.png" }]);
});

it("maps signature W-Engines to their agent and skips agents without one", () => {
  expect(signatureWeaponMap({ "1091": { WeaponId: 14109 }, "1011": {} })).toEqual({ "14109": "1091" });
});

// catalog.json lives in a git-ignored folder; clean checkouts lack it, so skip then
const hasCatalog = existsSync("src/assets/gacha-simulation/catalog.json");
(hasCatalog ? it : it.skip)("has art and a signature mapping for every catalogued S-rank", () => {
  const catalog = JSON.parse(readFileSync("src/assets/gacha-simulation/catalog.json", "utf8"));
  const map = JSON.parse(readFileSync("src/assets/signature-weapons.json", "utf8"));
  const items = Object.values(catalog.items) as Array<{ id: string; rank: string; kind: string }>;
  for (const item of items.filter((entry) => entry.rank === "S" && entry.kind === "character")) {
    expect(existsSync(`src/assets/images/agents/${item.id}.webp`)).toBe(true);
  }
  for (const item of items.filter((entry) => entry.rank === "S" && entry.kind === "weapon")) {
    expect(map[item.id]).toMatch(/^\d{4}$/);
  }
});
