import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pixelDifferenceRatio } from "../src/utilities/canvas/visualDiff.js";

const root = process.cwd();
let actualRoot = "";

describe("ZZZ official static visual baselines", () => {
  jest.setTimeout(60_000);

  beforeAll(() => {
    actualRoot = mkdtempSync(join(tmpdir(), "zzz-visual-"));
    const env = { ...process.env, ZZZ_PREVIEW_OUTPUT_ROOT: actualRoot };
    for (const script of [
      "previews/note-design/render-preview.ts",
      "previews/banner-design/render-preview.ts",
      "previews/signal-log-design/render-previews.ts",
      "previews/mystery-maze-design/render-preview.ts",
    ])
      execFileSync(process.execPath, ["--import", "tsx", script], {
        cwd: root,
        env,
        stdio: "pipe",
      });
  });

  afterAll(() => {
    if (actualRoot) rmSync(actualRoot, { recursive: true, force: true });
  });

  it.each([
    ["Note", "zzz-note-official-preview.png"],
    ["Banner", "banner-design/同期雙欄預覽.png"],
    ["Mystery Maze overview", "mystery-maze-design/迷宮詭域-01.png"],
    ["Mystery Maze collection page 1", "mystery-maze-design/迷宮詭域-02.png"],
    ["Mystery Maze collection page 2", "mystery-maze-design/迷宮詭域-03.png"],
    ["Mystery Maze records page 1", "mystery-maze-design/迷宮詭域-04.png"],
    ["Mystery Maze records page 2", "mystery-maze-design/迷宮詭域-05.png"],
  ] as const)(
    "keeps %s static-area difference below 2%%",
    async (_name, file) => {
      const actual = readFileSync(join(actualRoot, file));
      const baseline = readFileSync(join(root, "previews", file));
      await expect(
        pixelDifferenceRatio(actual, baseline),
      ).resolves.toBeLessThanOrEqual(0.02);
    },
  );

  it("keeps both Signal Log layouts below 2%", async () => {
    const overview = "signal-log-design/官方限定總覽.png";
    const records = "signal-log-design/完整紀錄20格.png";
    await expect(
      pixelDifferenceRatio(
        readFileSync(join(actualRoot, overview)),
        readFileSync(join(root, "previews", overview)),
      ),
    ).resolves.toBeLessThanOrEqual(0.02);
    await expect(
      pixelDifferenceRatio(
        readFileSync(join(actualRoot, records)),
        readFileSync(join(root, "previews", records)),
      ),
    ).resolves.toBeLessThanOrEqual(0.02);
  });
});
