import cn from "../src/assets/languages/cn.js";
import en from "../src/assets/languages/en.js";
import fr from "../src/assets/languages/fr.js";
import jp from "../src/assets/languages/jp.js";
import kr from "../src/assets/languages/kr.js";
import tw from "../src/assets/languages/tw.js";
import vi from "../src/assets/languages/vi.js";
import { createTranslator } from "../src/utilities/core/i18n.js";
import { TAGS } from "../src/utilities/interknot/rules.js";

const keys = Object.keys(tw).filter((k) => k.startsWith("interknot_"));

describe("interknot copy", () => {
  it("defines the full key set in tw", () => {
    expect(keys.length).toBeGreaterThanOrEqual(60);
    for (const tag of TAGS) expect(keys).toContain(`interknot_Tag_${tag}`);
    expect(tw.interknot_Tab_Featured).toBe("Fairy精選");
  });

  it.each([
    ["cn", cn],
    ["en", en],
    ["jp", jp],
    ["kr", kr],
    ["fr", fr],
    ["vi", vi],
  ])("%s has every interknot key", (_, lang) => {
    expect(keys.filter((k) => !(k in lang))).toEqual([]);
  });

  it("interpolates placeholders", () => {
    const tr = createTranslator("tw");
    expect(tr("interknot_Heart", { n: 5 })).toContain("5");
    expect(tr("interknot_RateLimited", { time: "<t:1:R>" })).toContain("<t:1:R>");
  });
});
