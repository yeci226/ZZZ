jest.mock("../src/utilities/zzz/autoDownloadIcons.js", () => ({
  downloadPaintingCache: async (source: string) => source,
  getWikiM6Painting: jest.fn().mockResolvedValue(null),
}));
jest.mock("../src/utilities/zzz/profileSuitIcons.js", () => ({
  getFlatSuitIcon: jest.fn().mockResolvedValue(null),
}));
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  drawFormalCharacterProfile,
  FORMAL_PROFILE_DIMENSIONS,
} from "../src/utilities/zzz/profileCharacterFormal.js";
import {
  drawFormalCharacterProfileStack,
  FORMAL_PROFILE_CARD_SIZE,
} from "../src/utilities/zzz/profileCharacterStack.js";
import { formalDiscCharacter } from "./fixtures/formalDiscCharacter.js";
import { createTranslator } from "../src/utilities/core/i18n.js";

async function decode(buffer: Buffer | null) {
  expect(buffer).not.toBeNull();
  const img = await loadImage(buffer!);
  const canvas = createCanvas(img.width, img.height),
    ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return {
    width: img.width,
    height: img.height,
    orangeXs: (y: number) => {
      const pixels = ctx.getImageData(0, y, img.width, 1).data;
      return Array.from({ length: img.width }, (_, x) => x).filter(x =>
        pixels[x * 4] === 168 && pixels[x * 4 + 1] === 75 && pixels[x * 4 + 2] === 18);
    },
    pixel: (x: number, y: number) =>
      Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3),
  };
}
it("renders upgraded stats and a single legend within the added footer space", async () => {
  const tr = jest.fn(createTranslator("tw"));
  const result = await decode(
    await drawFormalCharacterProfile(
      tr,
      "tw",
      "test",
      formalDiscCharacter(1251, "青衣"),
    ),
  );
  expect(FORMAL_PROFILE_DIMENSIONS.height).toBe(649);
  expect(result.height).toBe(678); // one extra character-property row
  expect(result.pixel(52, 608)).toEqual([168, 75, 18]); // first stat: one dot
  expect(result.pixel(61, 608)).not.toEqual([168, 75, 18]); // not a second dot
  expect(result.pixel(52, 640)).not.toEqual([168, 75, 18]); // zero-upgrade stat
  const legendDots = result.orangeXs(result.height - 15);
  expect(legendDots.length).toBeGreaterThan(0);
  expect(Math.min(...legendDots)).toBeGreaterThan(500);
  expect(Math.max(...legendDots)).toBeLessThan(975);
  expect(
    tr.mock.calls.filter(
      (call) => call[0] === "profileCharacter_EnhancementDotLegend",
    ),
  ).toHaveLength(1);
});
it("omits the legend for empty slots", async () => {
  const tr = jest.fn(createTranslator("tw"));
  const character = { ...formalDiscCharacter(1251, "青衣"), equip: [] };
  const result = await decode(
    await drawFormalCharacterProfile(tr, "tw", "test", character),
  );
  expect(result.pixel(28, result.height - 15)).not.toEqual([168, 75, 18]);
  expect(
    tr.mock.calls.some(
      (call) => call[0] === "profileCharacter_EnhancementDotLegend",
    ),
  ).toBe(false);
});
it("stacks cards using their expanded measured heights", async () => {
  const character = formalDiscCharacter(1251, "青衣");
  const result = await decode(
    await drawFormalCharacterProfileStack(
      createTranslator("tw"),
      "tw",
      "test",
      [character, character],
    ),
  );
  expect(FORMAL_PROFILE_CARD_SIZE.height).toBe(649);
  expect(result.height).toBe(678 * 2 + 18);
  expect(result.pixel(52, 608)).toEqual([168, 75, 18]);
  expect(result.pixel(52, 678 + 18 + 608)).toEqual([168, 75, 18]);
});

it.each([false, true])("shows the effective roll total at the bottom left (empty=%s)", async empty => {
  const prototype = Object.getPrototypeOf(createCanvas(1, 1).getContext("2d"));
  const fillText = jest.spyOn(prototype, "fillText");
  try {
    const character = formalDiscCharacter(1251, "青衣");
    character.equip = empty ? [] : [{
      ...character.equip[0],
      // Main stats do not contribute; only the first two substats are effective.
      main_properties: [{ property_id: 2, base: "999" }],
      properties: [
        { system_id: 121, property_id: 2, base: "19", add: 0 },
        { system_id: 121, property_id: 2, base: "12%", add: 3 },
        { system_id: 201, property_id: 5, base: "28.8%", add: 5 },
      ],
    }] as any;
    await drawFormalCharacterProfile(createTranslator("tw"), "tw", "test", character);
    expect(fillText).toHaveBeenCalledWith("總有效詞條數", 25, 667);
    const footerValue = fillText.mock.calls.find(call =>
      call[0] === (empty ? "0" : "5") && call[2] === 667);
    expect(footerValue).toBeDefined();
    expect(footerValue![1]).toBeLessThan(300);
  } finally {
    fillText.mockRestore();
  }
});
