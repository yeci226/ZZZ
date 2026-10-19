jest.mock("../src/utilities/zzz/autoDownloadIcons.js", () => ({
  downloadPaintingCache: async (source: string) => source,
  getWikiM6Painting: jest.fn().mockResolvedValue(null),
}));
jest.mock("../src/utilities/zzz/profileSuitIcons.js", () => ({
  getFlatSuitIcon: jest.fn().mockResolvedValue(null),
}));
jest.mock("node-fetch", () => ({
  __esModule: true,
  default: jest.fn().mockRejectedValue(new Error("Offline renderer test")),
}));
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { renderSimulation } from "../src/utilities/zzz/combat/render.js";
import { simulate } from "../src/utilities/zzz/combat/engine.js";
import { testScenario } from "./fixtures/combat.js";
import type { ProfileScore } from "../src/utilities/zzz/combat/scoring.js";
import { drawFormalCharacterProfile } from "../src/utilities/zzz/profileCharacterFormal.js";
import { drawOfficialCharacterProfile } from "../src/utilities/zzz/profileCharacter.js";
import { createTranslator } from "../src/utilities/core/i18n.js";
import { formalDiscCharacter } from "./fixtures/formalDiscCharacter.js";

beforeAll(() => { for (const [name, family] of [["zh-tw", "TW"], ["en-us", "EN"], ["fr-fr", "FR"], ["vi-vn", "VI"], ["ja-jp", "JP"], ["ko-kr", "KR"], ["zh-cn", "CN"]]) GlobalFonts.registerFromPath(`src/assets/${name}.ttf`, family); });
test.each(["formal", "official"])("%s card fits scores within its original dimensions", async style => {
  const score: ProfileScore = {version: "test", hash: "1234567890", build: "CRIT", availableBuilds: ["CRIT"], total: 540, grade: "ACE", complete: true,
    discs: Array.from({length: 6}, (_, i) => ({slot: i + 1, status: "scored", score: 90, grade: "ACE", main: 1, sub: 0.83333}))};
  const character = {
    ...formalDiscCharacter(1251, "青衣"),
    role_vertical_painting_url: "./src/assets/images/zzz/wiki_paintings/1112/2.png",
  }, tr = createTranslator("tw");
  const render = (value: ProfileScore | null) => style === "formal"
    ? drawFormalCharacterProfile(tr, "tw", "test", character, value)
    : drawOfficialCharacterProfile(tr, "tw", "test", character, false, false, value);
  const original = await loadImage((await render(null))!);
  const prototype = Object.getPrototypeOf(createCanvas(1, 1).getContext("2d"));
  const fillText = jest.spyOn(prototype, "fillText");
  try {
    const image = await loadImage((await render(score))!);
    expect([image.width, image.height]).toEqual([original.width, original.height]);
    expect(fillText.mock.calls.filter(call => call[0] === "90.0")).toHaveLength(6);
    expect(fillText.mock.calls.filter(call => call[0] === "ACE")).toHaveLength(7);
    expect(fillText.mock.calls.some(call => call[0] === "540.0")).toBe(true);
    expect(fillText.mock.calls.some(call => call[0] === "/600")).toBe(true);
    const total = fillText.mock.calls.find(call => call[0] === "總分")!;
    const rolls = fillText.mock.calls.find(call => call[0] === "總有效詞條數")!;
    expect(total).toBeDefined();
    expect(rolls).toBeDefined();
    expect(Number(total[1])).toBeGreaterThan(Number(rolls[1]));
    expect(total[2]).toBe(rolls[2]);
    // Adding scores must not move or cover the formal card's substats and enhancement dots.
    if (style === "formal") {
      const pixels = (source: typeof image) => {
        const canvas = createCanvas(source.width, source.height), ctx = canvas.getContext("2d");
        ctx.drawImage(source, 0, 0);
        return Buffer.from(ctx.getImageData(0, 580, source.width, 65).data);
      };
      expect(pixels(image).equals(pixels(original))).toBe(true);
    }
  } finally {
    fillText.mockRestore();
  }
});
test("simulation chart renders zero-damage runs without NaN or invalid geometry", async () => {
  const scenario = testScenario(); scenario.team[0].panel.atk = 0;
  const image = await loadImage(renderSimulation(simulate(scenario), {test_a: "合成測試"}, "tw")); expect([image.width, image.height]).toEqual([1000, 660]);
});
