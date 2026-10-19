import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getSimulationCatalog,
  cacheSimulationCalendar,
  assertSimulationAssets,
  type SimulationCatalog,
} from "../src/utilities/zzz/gachaSimulationCatalog.js";

const id = "999991";
const portrait = `src/assets/images/zzz/paintings/role_vertical_painting_${id}.png`;
const prepared = `src/assets/gacha-simulation/ui/characters/${id}.png`;
const missing = `src/assets/images/agents/${id}.webp`;
let directory: string;
const previous = process.env.ZZZ_GACHA_CATALOG;
const realExists = fs.existsSync;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "zzz-asset-regression-"));
  process.env.ZZZ_GACHA_CATALOG = path.join(directory, "catalog.json");
});
afterEach(() => {
  jest.restoreAllMocks();
  if (previous === undefined) delete process.env.ZZZ_GACHA_CATALOG;
  else process.env.ZZZ_GACHA_CATALOG = previous;
  fs.rmSync(directory, { recursive: true, force: true });
});
function fixture(image = missing) {
  const catalog = JSON.parse(
    fs.readFileSync("src/assets/gacha-simulation/catalog.json", "utf8"),
  ) as SimulationCatalog;
  catalog.items[id] = {
    id,
    name: "Test agent",
    rank: "S",
    kind: "character",
    image,
    crop: [0, 0, 1, 2 / 3],
  };
  const banner = {
    ...catalog.banners.find((b) => b.pool === "character")!,
    id: "asset-regression",
    featuredS: id,
  };
  catalog.banners.push(banner);
  fs.writeFileSync(process.env.ZZZ_GACHA_CATALOG!, JSON.stringify(catalog));
  return banner;
}
function available(...images: string[]) {
  jest
    .spyOn(fs, "existsSync")
    .mockImplementation(
      (file) => images.includes(String(file)) || realExists(file),
    );
}

test("repairs a cached missing agent path with existing official artwork and its correct crop", () => {
  const banner = fixture();
  available(portrait);
  const catalog = getSimulationCatalog();
  expect(catalog.items[id].image).toBe(portrait);
  expect(catalog.items[id].crop).toEqual([0.25, 0.08, 0.47, 0.6]);
  expect(() => assertSimulationAssets(banner, catalog)).not.toThrow();
});
test("prefers prepared simulation artwork when both fallbacks exist", () => {
  fixture();
  available(prepared, portrait);
  expect(getSimulationCatalog().items[id].image).toBe(prepared);
});
test("keeps existing images and their custom crop", () => {
  fixture();
  available(missing, portrait);
  const item = getSimulationCatalog().items[id];
  expect(item.image).toBe(missing);
  expect(item.crop).toEqual([0, 0, 1, 2 / 3]);
});
test("still rejects unavailable artwork before a draw", () => {
  const banner = fixture();
  expect(() => assertSimulationAssets(banner, getSimulationCatalog())).toThrow(
    id,
  );
});
test("resolves new calendar items before caching and persisting the catalog", () => {
  available(portrait);
  cacheSimulationCalendar([
    {
      name: "Test UP",
      version: "3.3",
      channelCategory: "character_up",
      startAt: "2026-10-01T00:00:00Z",
      endAt: "2026-10-20T00:00:00Z",
      upItems: [
        { id, name: "Test agent", rarity: "S" },
        { id: "1011", name: "Anby", rarity: "A" },
      ],
    },
  ]);
  expect(getSimulationCatalog().items[id].image).toBe(portrait);
  expect(
    JSON.parse(fs.readFileSync(process.env.ZZZ_GACHA_CATALOG!, "utf8")).items[
      id
    ].image,
  ).toBe(portrait);
});
