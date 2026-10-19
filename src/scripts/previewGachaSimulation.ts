/** Local smoke test / review artifacts; never connects a Discord client. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSimulationCatalog, selectSimulationBanner, simulationResultItems, assertSimulationAssets } from '../utilities/zzz/gachaSimulationCatalog.js';
import { GachaSimulationStore } from '../utilities/zzz/gachaSimulationStore.js';
import { loadGachaAnimation } from '../utilities/zzz/gachaAnimationCache.js';
import { renderGachaResult } from '../utilities/zzz/gachaResultImage.js';
import { simulationMessage } from '../utilities/zzz/gachaSimulationPresentation.js';

const output = path.resolve('previews/gacha-render-test/simulator-r7'); await mkdir(output, { recursive: true });
const catalog = getSimulationCatalog(), banner = selectSimulationBanner(catalog);
assertSimulationAssets(banner, catalog);
const store = new GachaSimulationStore(':memory:'); const report: any = {};
for (const [mode, count, values] of [
  ['single', 1, [0, 0]],
  ['ten', 10, [0, 0, .05, 0, 0, .05, 0, .99, ...Array.from({ length: 7 }, (_, i) => [.8, i / 7]).flat()]],
] as const) {
  let i = 0; const session = store.draw(mode, mode, banner, count, () => values[i++] ?? .9);
  const items = simulationResultItems(session, catalog), animation = await loadGachaAnimation(items);
  const gif = animation.gifs.find(f => f.height === 540)!;
  const begin = performance.now(); const image = await renderGachaResult(gif.lastFrame, items);
  const renderMs = performance.now() - begin;
  await writeFile(path.join(output, `simulation-${mode}.png`), image);
  report[mode] = { session, renderMs, imageBytes: image.length, gif, animation: simulationMessage(session, catalog, 'animation', `attachment://animation-${mode}.gif`), result: simulationMessage(session, catalog, 'result', `attachment://simulation-${mode}.png`) };
}
store.close(); await writeFile(path.join(output, 'simulation-preview.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([key, r]: any) => [key, { ranks: r.session.pulls.map((p: any) => p.rank).join(''), renderMs: r.renderMs, imageBytes: r.imageBytes }])), null, 2));
