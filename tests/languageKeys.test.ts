import fs from "node:fs";
import path from "node:path";
import cn from "../src/assets/languages/cn.js";
import en from "../src/assets/languages/en.js";
import fr from "../src/assets/languages/fr.js";
import jp from "../src/assets/languages/jp.js";
import kr from "../src/assets/languages/kr.js";
import tw from "../src/assets/languages/tw.js";
import vi from "../src/assets/languages/vi.js";

const twKeys = Object.keys(tw).sort();

// Keys referenced by a literal tr("...") call that are known to be absent from every
// language file. Add a key here only with a reason; the goal is to keep this empty.
const KNOWN_MISSING: Record<string, string> = {};

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    // endsWith(".ts") skips backups such as redeem.ts.bak-2026...
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

describe("language files", () => {
  it.each([
    ["cn", cn],
    ["en", en],
    ["fr", fr],
    ["jp", jp],
    ["kr", kr],
    ["vi", vi],
  ])("%s has exactly the same key set as tw", (_name, lang) => {
    const keys = Object.keys(lang).sort();
    expect({
      missing: twKeys.filter((key) => !keys.includes(key)),
      extra: keys.filter((key) => !twKeys.includes(key)),
    }).toEqual({ missing: [], extra: [] });
  });

  it("defines every key used by a literal tr() call in src", () => {
    const used = new Map<string, string>();
    for (const file of listSourceFiles(path.join(__dirname, "..", "src"))) {
      const source = stripComments(fs.readFileSync(file, "utf8"));
      for (const match of source.matchAll(/\btr\(\s*(["'])([A-Za-z0-9_]+)\1/g)) {
        if (!used.has(match[2])) used.set(match[2], path.relative(path.join(__dirname, ".."), file));
      }
    }
    expect(used.size).toBeGreaterThan(100);

    const missing = [...used.entries()]
      .filter(([key]) => !(key in tw) && !(key in KNOWN_MISSING))
      .map(([key, file]) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });
});
