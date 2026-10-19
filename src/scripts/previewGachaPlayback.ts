/** Prepare local/site demo images and timings without importing the Discord client. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DEFAULT_GACHA_CACHE, loadGachaAnimation } from "../utilities/zzz/gachaAnimationCache.js";
import { gachaPreviewItems } from "../utilities/zzz/gachaPreviewSamples.js";
import { renderGachaResult } from "../utilities/zzz/gachaResultImage.js";

const output = path.resolve("previews/gacha-render-test/playback-pair-r1");
await mkdir(output, { recursive: true });
const report: Record<string, unknown> = {};
for (const mode of ["single", "ten"] as const) {
  const items = gachaPreviewItems(mode), animation = await loadGachaAnimation(items);
  const folder = path.join(output, animation.key);
  await mkdir(folder, { recursive: true });
  const timings: Record<string, number> = {};
  for (const gif of animation.gifs) {
    const start = performance.now();
    const result = await renderGachaResult(gif.lastFrame, items);
    timings[String(gif.height)] = performance.now() - start;
    await writeFile(path.join(folder, `result-${gif.height}.png`), result);
  }
  report[animation.key] = { items: items.map(({ id, name, rank, isNew }) => ({ id, name, rank, isNew: isNew ?? false })), renderMilliseconds: timings };
}
const manifest = JSON.parse(await readFile(path.join(DEFAULT_GACHA_CACHE, "manifest.json"), "utf8"));
await writeFile(path.join(output, "report.json"), JSON.stringify({ ...manifest, resultRevision: "r5-ui-r6-gif-background", resultVisualApproved: false, examples: report }, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
