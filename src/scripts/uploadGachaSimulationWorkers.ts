/** Add cached GIFs to the existing Workers asset gallery, preserving its images. */
import { readFile, writeFile, mkdir, copyFile, link, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseConfigFileTextToJson } from "typescript";
import { load } from "cheerio";
import { DEFAULT_GACHA_CACHE, gachaCacheKey } from "../utilities/zzz/gachaAnimationCache.js";
import { buildImageGallery, safeGalleryPath, type GalleryIndex, type GalleryEntry } from "../utilities/imageGallery.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const args = process.argv.slice(2);
const option = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const root = path.resolve(option("--stage") || "previews/gacha-render-test/cloudflare");
const cache = path.resolve(option("--cache") || process.env.ZZZ_GACHA_CACHE_DIR || DEFAULT_GACHA_CACHE);
const configFile = option("--config");
const base = new URL(option("--base-url") || "https://img.yeci.it.com/");
const apply = args.includes("--apply");
const incremental = args.includes("--incremental");
const MAX_FILE = 25 * 1024 * 1024;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const runFile = promisify(execFile);
interface Asset { pathname: string; file: string; bytes: number; sha256: string; }
interface Gif extends Asset { relativeFile: string; remoteUrl: string; }
interface VerifiedAsset { sha256: string; bytes: number; etag: string; }

async function linkOrCopy(source: string, target: string) {
  await mkdir(path.dirname(target), { recursive: true });
  try { await link(source, target); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await copyFile(source, target);
  }
}

function localPath(directory: string, pathname: string) {
  const decoded = decodeURIComponent(pathname);
  const target = path.resolve(directory, '.' + decoded);
  if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').includes('..') || !target.startsWith(directory + path.sep)) {
    throw new Error(`Invalid asset path: ${pathname}`);
  }
  return target;
}
async function publicFile(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "error", headers: { "Accept-Encoding": "identity" } });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Public asset returned HTTP ${response.status}: ${url.pathname}`); }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of response.body as any) {
    size += chunk.length;
    if (size > MAX_FILE) throw new Error(`Asset exceeds Workers' 25 MiB limit: ${url.pathname}`);
    chunks.push(Buffer.from(chunk));
  }
  return { bytes: Buffer.concat(chunks), type: response.headers.get("content-type") || "" };
}
async function saveAsset(directory: string, pathname: string, bytes: Buffer): Promise<Asset> {
  const file = localPath(directory, pathname);
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
  return { pathname, file, bytes: bytes.length, sha256: sha256(bytes) };
}
async function parallel<T>(values: T[], task: (value: T) => Promise<void>, concurrency = 3) {
  const queue = [...values];
  await Promise.all(Array.from({ length: concurrency }, async () => { for (;;) { const item = queue.shift(); if (item === undefined) break; await task(item); } }));
}

async function verifyAndActivate(preserved: Asset[], gifs: Gif[], manifestFile: string, revision: string) {
  const temporaryDirectory = path.join(root, '.verification'); await mkdir(temporaryDirectory, { recursive: true });
  const proofFile = path.join(root, 'verified-assets.json');
  let proof: Record<string, VerifiedAsset> = {};
  if (incremental) { try { proof = JSON.parse(await readFile(proofFile, 'utf8')); } catch { /* First batch verifies full bytes. */ } }
  let completed = 0;
  // Use streaming file downloads and bounded retries for large GIFs.
  await parallel([...preserved, ...gifs], async asset => {
    const file = path.join(temporaryDirectory, createHash('sha256').update(asset.pathname).digest('hex'));
    const headerFile = file + '.headers';
    const url = new URL(asset.pathname.endsWith('/index.html') ? asset.pathname.slice(0, -10) : asset.pathname, base);
    try {
      const prior = proof[asset.pathname];
      if (incremental && prior?.etag?.startsWith('"') && prior.sha256 === asset.sha256 && prior.bytes === asset.bytes) {
        try {
          const head = await fetch(url, { method: 'HEAD', redirect: 'error', headers: { 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(20_000) });
          // Workers may omit Content-Length on HEAD. A matching strong ETag still
          // identifies the exact bytes previously downloaded and SHA-256 checked.
          const length = head.headers.get('content-length');
          if (head.ok && head.headers.get('etag') === prior.etag && (length === null || Number(length) === asset.bytes) &&
            (!asset.pathname.endsWith('.gif') || head.headers.get('content-type')?.includes('image/gif'))) {
            completed++; console.log(`VERIFIED ${completed}/${preserved.length + gifs.length} ${asset.pathname} (unchanged ETag)`); return;
          }
        } catch {
          // HEAD is only a bandwidth optimization. A transport failure must
          // fall back to the retried full download and hash check below.
          console.warn(`HEAD unavailable; verifying full download: ${asset.pathname}`);
        }
      }
      const { stdout } = await runFile('curl', ['--fail', '--silent', '--show-error', '--retry', '2', '--retry-all-errors', '--retry-delay', '2',
        '--connect-timeout', '20', '--max-time', '90', '--max-filesize', String(MAX_FILE), '--output', file,
        '--dump-header', headerFile,
        // Workers serves index.html at / and redirects the explicit filename.
        '--write-out', '%{http_code} %{content_type}', url.href], { timeout: 300_000, maxBuffer: 64 * 1024 });
      const remote = await readFile(file);
      if (!stdout.startsWith('200 ') || remote.length !== asset.bytes || sha256(remote) !== asset.sha256) throw new Error(`CDN contents differ: ${asset.pathname}`);
      if (asset.pathname.endsWith('.gif') && !stdout.includes('image/gif')) throw new Error(`CDN GIF type is incorrect: ${asset.pathname}`);
      const etag = (await readFile(headerFile, 'utf8')).match(/^etag:\s*(.+)$/im)?.[1]?.trim() || '';
      proof[asset.pathname] = { sha256: asset.sha256, bytes: asset.bytes, etag };
      completed++;
      console.log(`VERIFIED ${completed}/${preserved.length + gifs.length} ${asset.pathname}`);
    } finally { await rm(file, { force: true }); await rm(headerFile, { force: true }); }
  }, 2);
  if (incremental) { await writeFile(proofFile + '.tmp', JSON.stringify(proof, null, 2) + '\n'); await rename(proofFile + '.tmp', proofFile); }
  const newest = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (newest.animationRevision !== revision) throw new Error("Local animation revision changed; CDN verified, rerun before switching the bot");
  for (const variant of Object.values(newest.variants) as any[]) for (const gif of variant.gifs) {
    const verified = gifs.find(g => g.relativeFile === gif.file && g.sha256 === gif.sha256 && g.bytes === gif.bytes);
    if (!verified) throw new Error("Local GIF changed during upload; bot manifest was not modified");
    gif.remoteUrl = verified.remoteUrl;
  }
  const temporary = manifestFile + `.workers-${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(newest, null, 2) + '\n'); await rename(temporary, manifestFile);
}

async function main() {
  if (!configFile) throw new Error("Provide the existing gallery's --config wrangler.jsonc");
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error("Use the gallery's root HTTPS URL");
  const parsed = parseConfigFileTextToJson(configFile, await readFile(configFile, "utf8"));
  if (parsed.error) throw new Error("Invalid Wrangler config");
  const source = parsed.config;
  if (!/^[a-z0-9-]+$/.test(source.name) || !/^[a-f0-9]{32}$/.test(source.account_id) || source.main || !source.assets) throw new Error("An existing assets-only Worker config is required");
  const manifestFile = path.join(cache, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  if (manifest.schemaVersion !== 1 || !/^[a-z0-9-]+$/.test(manifest.animationRevision)) throw new Error("Invalid GIF cache manifest");
  const gifs: Gif[] = [];
  for (const [key, variant] of Object.entries(manifest.variants) as [string, any][]) {
    if (!/^[a-z0-9-]+$/.test(key)) throw new Error("Invalid animation key");
    if (typeof variant.ranks !== 'string' || key !== gachaCacheKey([...variant.ranks].map(rank => ({ rank: rank as any }))) ||
      !Array.isArray(variant.gifs) || variant.gifs.length !== 2 ||
      ![360, 540].every(height => variant.gifs.some((g: any) => g.height === height))) throw new Error("Invalid animation variant");
    for (const gif of variant.gifs) {
      const file = localPath(cache, '/' + gif.file), bytes = await readFile(file), hash = sha256(bytes);
      if (bytes.length !== gif.bytes || bytes.length > MAX_FILE || hash !== gif.sha256 || !/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) throw new Error(`Invalid cached GIF: ${gif.file}`);
      const pathname = `/zzz/gacha/${manifest.animationRevision}/${key}/${hash.slice(0, 20)}-${gif.height}.gif`;
      gifs.push({ pathname, file, relativeFile: gif.file, bytes: bytes.length, sha256: hash, remoteUrl: new URL(pathname, base).href });
    }
  }
  if (!gifs.length || gifs.length > 138) throw new Error("Expected 1–69 valid variants with both GIF profiles");

  // Capture credentials only in memory; never copy them into the deploy directory.
  const auth = spawnSync("npx", ["--yes", "wrangler@4", "auth", "token", "--json"], { encoding: "utf8", timeout: 30_000 });
  if (auth.status !== 0) throw new Error("Log in with npx wrangler@4 login --device first");
  const token = JSON.parse(auth.stdout).token;
  if (!token) throw new Error("Cloudflare token unavailable");
  const api = async (suffix: string) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${source.account_id}${suffix}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json() as any;
    if (!response.ok || !body.success) throw new Error(`Cloudflare preflight failed: ${suffix} (HTTP ${response.status})`);
    return body.result;
  };
  const script = `/workers/scripts/${source.name}`;
  const [deployments, domains, subdomain, routes] = await Promise.all([
    api(script + '/deployments'), api('/workers/domains'), api(script + '/subdomain'),
    api(`/workers/services/${source.name}/environments/production/routes?show_zonename=true`),
  ]);
  const current = deployments.deployments[0];
  if (!current || current.versions.length !== 1 || current.versions[0].percentage !== 100) throw new Error("The gallery does not have a single active version");
  const version = await api(script + '/versions/' + current.versions[0].version_id);
  if (version.resources?.bindings?.length || version.resources?.script?.handlers?.length || !version.resources?.script_runtime?.assets) throw new Error("The existing Worker is not an assets-only gallery");
  const workerDomains = domains.filter((d: any) => d.service === source.name && d.environment === 'production');
  if (!workerDomains.some((d: any) => d.hostname === base.hostname && d.enabled)) throw new Error("The public hostname is not bound to this Worker");

  if (args.includes('--verify-only')) {
    const reportFile = path.join(root, 'upload-report.json'), report = JSON.parse(await readFile(reportFile, 'utf8'));
    if (report.worker !== source.name || report.base !== base.href || report.gifs.length !== gifs.length ||
      report.gifs.some((g: Gif) => !gifs.some(planned => planned.pathname === g.pathname && planned.sha256 === g.sha256))) {
      throw new Error("The saved upload plan does not match the current cache and destination");
    }
    await verifyAndActivate(report.preserved, gifs, manifestFile, manifest.animationRevision);
    await writeFile(reportFile, JSON.stringify({ ...report, mode: 'verified', version: version.id,
      verifiedAt: new Date().toISOString(), preservedFilesVerified: report.preserved.length, gifsVerified: gifs.length }, null, 2) + '\n');
    console.log(JSON.stringify({ mode: 'verified', preservedFiles: report.preserved.length, gifs: gifs.length, base: base.href }));
    return;
  }

  const index = await publicFile(base), html = index.bytes.toString('utf8'), $ = load(html);
  let count = Number($('body > p').first().text().match(/共\s*(\d+)\s*個檔案/)?.[1]);
  let paths = $('main.grid a.card').map((_, element) => {
    const url = new URL($(element).attr('href') || '', base);
    if (url.origin !== base.origin || url.search || url.hash || !/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(url.pathname)) throw new Error("Unexpected gallery asset URL");
    return url.pathname;
  }).get();
  const galleryResponse = await fetch(new URL('/gallery-index.json', base), { signal: AbortSignal.timeout(20_000), redirect: 'error' });
  const metadata: Partial<Record<string, Partial<GalleryEntry>>> = {};
  const knownMedia = new Map<string, GalleryEntry>();
  if (galleryResponse.ok) {
    const gallery = await galleryResponse.json() as GalleryIndex;
    if (gallery.schemaVersion !== 1 || !Array.isArray(gallery.entries) || !gallery.entries.length) throw new Error('Invalid recursive gallery inventory');
    paths = [...new Set(gallery.entries.flatMap(e => [e.pathname, ...(e.thumbnail ? [e.thumbnail] : [])]))];
    for (const p of paths) if (!/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(safeGalleryPath(p))) throw new Error('Invalid gallery media');
    for (const e of gallery.entries) metadata[e.pathname] = { ...(e.thumbnail ? { thumbnail: e.thumbnail } : {}), ...(e.label ? { label: e.label } : {}) };
    for (const entry of gallery.entries) knownMedia.set(entry.pathname, entry);
    count = gallery.entries.length;
  } else if (galleryResponse.status !== 404) throw new Error('Unable to read gallery inventory');
  else if (!count || paths.length !== count || new Set(paths).size !== count) throw new Error("The live image inventory does not match the provided gallery format");

  // A fresh directory prevents stale/unverified files from entering a deployment.
  const run = path.join(root, `upload-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const assets = path.join(run, 'files'), preserved: Asset[] = [];
  await parallel(paths.filter(p => !gifs.some(g => g.pathname === p)), async pathname => {
    const known = knownMedia.get(pathname);
    if (incremental && known?.type === 'gif' && /^[a-f0-9]{64}$/.test(known.sha256)) {
      const blob = path.join(root, '.gif-blobs', known.sha256);
      let cached: Buffer | undefined; try { cached = await readFile(blob); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (cached && cached.length === known.bytes && sha256(cached) === known.sha256) {
        const file = localPath(assets, pathname); await linkOrCopy(blob, file);
        preserved.push({ pathname, file, bytes: known.bytes, sha256: known.sha256 }); return;
      }
    }
    const result = await publicFile(new URL(pathname, base));
    if (!result.type.startsWith('image/')) throw new Error(`The old image URL is not an image: ${pathname}`);
    preserved.push(await saveAsset(assets, pathname, result.bytes));
  });
  // Include every GIF from prior uploads too. Their public inventory is kept
  // outside the original gallery index so its appearance stays unchanged.
  const previousInventoryUrl = new URL('/zzz/gacha/assets.json', base);
  const oldInventoryResponse = await fetch(previousInventoryUrl, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
  if (oldInventoryResponse.ok) {
    const old = await oldInventoryResponse.json() as { assets?: Asset[] };
    if (!Array.isArray(old.assets)) throw new Error("Invalid prior GIF inventory");
    await parallel(old.assets.filter(a => !gifs.some(g => g.pathname === a.pathname) && !preserved.some(p => p.pathname === a.pathname)), async asset => {
      if (!asset.pathname.startsWith('/zzz/gacha/') || !asset.pathname.endsWith('.gif') || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("Invalid prior GIF path");
      const blob = path.join(root, '.gif-blobs', asset.sha256);
      if (incremental) {
        let cached: Buffer | undefined;
        try { cached = await readFile(blob); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (cached && cached.length === asset.bytes && sha256(cached) === asset.sha256) {
          const file = localPath(assets, asset.pathname); await linkOrCopy(blob, file);
          preserved.push({ ...asset, file }); return;
        }
      }
      const result = await publicFile(new URL(asset.pathname, base));
      if (sha256(result.bytes) !== asset.sha256 || result.bytes.length !== asset.bytes) throw new Error("Prior GIF content differs from its inventory");
      const saved = await saveAsset(assets, asset.pathname, result.bytes); preserved.push(saved);
      if (incremental) { await rm(blob, { force: true }); await linkOrCopy(saved.file, blob); }
    });
  } else if (oldInventoryResponse.status === 404) await oldInventoryResponse.body?.cancel();
  else { await oldInventoryResponse.body?.cancel(); throw new Error("Cannot inspect the previous GIF inventory"); }
  for (const gif of gifs) {
    const target = localPath(assets, gif.pathname); await linkOrCopy(gif.file, target);
  }
  for (const variant of Object.values(manifest.variants) as any[]) for (const gif of variant.gifs) {
    const uploaded = gifs.find(g => g.relativeFile === gif.file)!;
    const thumbnail = `/_gallery/thumbs/${uploaded.sha256.slice(0, 20)}.webp`;
    const canvas = createCanvas(384, 216), context = canvas.getContext('2d');
    context.drawImage(await loadImage(localPath(cache, '/' + gif.lastFrame)), 0, 0, 384, 216);
    const thumb = await saveAsset(assets, thumbnail, await canvas.encode('webp', 80));
    const old = preserved.findIndex(a => a.pathname === thumbnail); if (old >= 0) preserved.splice(old, 1);
    preserved.push(thumb); metadata[uploaded.pathname] = { thumbnail };
  }
  await buildImageGallery(assets, metadata);
  async function collectGalleryPages(relative = ''): Promise<void> {
    for (const entry of await readdir(path.join(assets, relative), { withFileTypes: true })) {
      const file = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await collectGalleryPages(file);
      else if (entry.name === 'index.html' || file === 'gallery-index.json') {
        const bytes = await readFile(path.join(assets, file));
        preserved.push({ pathname: '/' + file.split('/').map(encodeURIComponent).join('/'), file: path.join(assets, file), bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  await collectGalleryPages();
  const inventory = [...preserved.filter(a => a.pathname.startsWith('/zzz/gacha/') && a.pathname.endsWith('.gif')), ...gifs]
    .map(({ pathname, bytes, sha256 }) => ({ pathname, bytes, sha256 }));
  preserved.push(await saveAsset(assets, '/zzz/gacha/assets.json', Buffer.from(JSON.stringify({ revision: manifest.animationRevision, assets: inventory }, null, 2) + '\n')));
  await saveAsset(assets, '/_headers', Buffer.from('/zzz/gacha/*.gif\n  Cache-Control: public, max-age=31536000, immutable\n'));
  const deployConfig = { ...source, assets: { ...source.assets, directory: './files' },
    workers_dev: subdomain.enabled, preview_urls: subdomain.previews_enabled,
    routes: [...routes.map((r: any) => ({ pattern: r.pattern, ...(r.zone_name ? { zone_name: r.zone_name } : { zone_id: r.zone_id }) })),
      ...workerDomains.map((d: any) => ({ pattern: d.hostname, custom_domain: true }))] };
  const config = path.join(run, 'wrangler.jsonc'); await writeFile(config, JSON.stringify(deployConfig, null, 2) + '\n');
  const report = { mode: apply ? 'pending-deployment' : 'prepared', worker: source.name, base: base.href,
    previousVersion: current.versions[0].version_id, config, preserved, gifs, preparedAt: new Date().toISOString() };
  const reportFile = path.join(root, 'upload-report.json'); await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ mode: report.mode, oldImages: count, newGifs: gifs.length, gifBytes: gifs.reduce((sum, g) => sum + g.bytes, 0), config }));
  const dryRun = spawnSync('npx', ['--yes', 'wrangler@4', 'deploy', '--config', config, '--dry-run'], { stdio: 'inherit', timeout: 60_000 });
  if (dryRun.status !== 0) throw new Error("Wrangler rejected the prepared gallery");
  if (!apply) return;
  const latest = await api(script + '/deployments');
  if (latest.deployments[0]?.id !== current.id) throw new Error("The gallery changed while preparing; rerun to preserve the new contents");
  const deploy = spawnSync('npx', ['--yes', 'wrangler@4', 'deploy', '--config', config, '--strict'], { stdio: 'inherit', timeout: 600_000 });
  if (deploy.status !== 0) throw new Error("Worker deployment failed; verified CDN URLs were not changed");
  const deployed = await api(script + '/deployments');
  await writeFile(reportFile, JSON.stringify({ ...report, mode: 'deployed-awaiting-verification', version: deployed.deployments[0]?.versions[0]?.version_id }, null, 2) + '\n');
  // Verify old and new public content before the bot switches to these URLs.
  await verifyAndActivate(preserved, gifs, manifestFile, manifest.animationRevision);
  await writeFile(reportFile, JSON.stringify({ ...report, mode: 'verified', version: deployed.deployments[0]?.versions[0]?.version_id,
    verifiedAt: new Date().toISOString(), preservedFilesVerified: preserved.length, gifsVerified: gifs.length }, null, 2) + '\n');
  console.log(JSON.stringify({ mode: 'verified', preservedFiles: preserved.length, gifs: gifs.length, base: base.href }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Workers upload failed'); process.exitCode = 1; });
