import path from "node:path";
import type { MessageEditOptions } from "discord.js";
import { loadGachaAnimation, readGachaGif, DEFAULT_GACHA_CACHE, type GachaGifFile } from "./gachaAnimationCache.js";
import { renderGachaResult } from "./gachaResultImage.js";
import { simulationMessage, withoutSimulationContinuation } from "./gachaSimulationPresentation.js";
import { simulationResultItems, type SimulationCatalog } from "./gachaSimulationCatalog.js";
import type { GachaSimulationStore, SimulationSession } from "./gachaSimulationStore.js";

export type SimulationPayload = ReturnType<typeof simulationMessage> & {
  files?: Array<{ attachment: Buffer; name: string }>;
  attachments?: [];
};
export interface SimulationMessageHandle {
  id: string;
  components?: readonly unknown[];
  edit(payload: MessageEditOptions): Promise<unknown>;
  fetch?(): Promise<{ components: readonly unknown[] }>;
}
export interface SimulationTransport {
  attachmentLimit: number;
  applicationId?: string;
  channelId?: string;
  guildId?: string | null;
  send(payload: SimulationPayload): Promise<SimulationMessageHandle>;
}
export const playbackDependencies = { loadAnimation: loadGachaAnimation, readGif: readGachaGif, render: renderGachaResult };
type Dependencies = typeof playbackDependencies;
const active = new Map<string, () => Promise<void>>();
const deliveries = new Map<string, Promise<void>>();
const MAX_MEDIA_WAIT = 12_000;
// Discord's media-ready signal describes its servers, not the viewer's player.
// Allow for the observed ~2.2s client startup delay, rounded up to 3s.
const CLIENT_STARTUP_GRACE_MS = 3_000;
export const simulationPlaybackDelay = (gif: GachaGifFile) =>
  gif.durationMs - (gif.endHoldMs || 0) + CLIENT_STARTUP_GRACE_MS;

function messageParts(message: Pick<SimulationMessageHandle, "components">): any[] {
  const boxes = JSON.parse(JSON.stringify(message.components || [])) as any[];
  return boxes.flatMap(box => box.type === 17 ? box.components || [] : [box]);
}

export function isSimulationAnimation(message: Pick<SimulationMessageHandle, "components">, id: string): boolean {
  return messageParts(message).some(part => part.type === 1 &&
    part.components?.some((button: any) => button.custom_id === `gsim:skip:${id}`));
}

/** Inspect fresh Discord components, not the local finished flag or edit status. */
export function isSimulationResult(message: Pick<SimulationMessageHandle, "components">, id: string, continued = false): boolean {
  const parts = messageParts(message);
  const ids = parts.filter(part => part.type === 1).flatMap(part => part.components || []).map(button => button.custom_id);
  if (ids.includes(`gsim:skip:${id}`)) return false;
  if (continued) {
    if (!ids.includes(`gsim:a:${id}`) || !ids.includes(`gsim:s:${id}`) || ids.some(id => /^gsim:(one|ten):/.test(id))) return false;
  } else if (!ids.includes(`gsim:one:${id}`) || !ids.includes(`gsim:ten:${id}`)) return false;
  const media = parts.filter(part => part.type === 12).flatMap(part => part.items || []).map(item => item.media);
  // The explicit text-result fallback has no media and remains usable.
  return media.length === 0 || media.every(m => typeof m?.url === "string" && /\/gacha-result\.png(?:\?|$)/.test(m.url) &&
    m.loading_state !== 1 && m.loading_state !== 3 && (m.loading_state === 2 || (m.width > 0 && m.height > 0)));
}

/** External GIFs are initially placeholders until Discord finishes fetching them. */
async function waitForAnimationMedia(message: SimulationMessageHandle, stopped: () => boolean) {
  if (!message.fetch) return "ready";
  const deadline = Date.now() + MAX_MEDIA_WAIT;
  while (!stopped() && Date.now() < deadline) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        message.fetch(),
        new Promise<undefined>(resolve => { timeout = setTimeout(() => resolve(undefined), Math.max(1, deadline - Date.now())); }),
      ]);
      if (stopped()) return "skipped";
      if (!response) return "unavailable";
      const boxes = JSON.parse(JSON.stringify(response.components)) as any[];
      const media = boxes.flatMap(b => b.components || [b]).filter(c => c.type === 12).flatMap(c => c.items || []).map(i => i.media);
      if (media.some(m => m?.loading_state === 3)) return "unavailable";
      if (media.length && media.every(m => m?.loading_state === 2 || (m?.loading_state == null && m?.width && m?.height))) return "ready";
    } catch {
      // Some application contexts can reply but cannot read channel history.
      // Preserve the original duration-based behavior if inspection is unavailable.
      return "ready";
    } finally { if (timeout) clearTimeout(timeout); }
    if (!stopped()) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return stopped() ? "skipped" : "unavailable";
}

export function selectSimulationGif(gifs: GachaGifFile[], attachmentLimit: number): GachaGifFile | undefined {
  // A public, already uploaded URL bypasses this interaction's attachment cap.
  return [...gifs].filter(f => f.remoteUrl || f.bytes <= attachmentLimit)
    .sort((a, b) => Number(!!b.remoteUrl) - Number(!!a.remoteUrl) || b.width - a.width)[0];
}
async function prepareResult(session: SimulationSession, catalog: SimulationCatalog, deps: Dependencies, limit: number) {
  const items = simulationResultItems(session, catalog);
  let animation;
  try { animation = await deps.loadAnimation(items); } catch { /* Uncached rare counts still retain their actual draw. */ }
  const selected = session.gifHeight ? animation?.gifs.find(f => f.height === session.gifHeight) : animation && selectSimulationGif(animation.gifs, limit);
  const background = selected?.lastFrame || animation?.lastFrame || path.join(process.env.ZZZ_GACHA_CACHE_DIR || DEFAULT_GACHA_CACHE, "neutral-stage.png");
  let png: Buffer | undefined;
  try { png = await deps.render(background, items); } catch (error) { console.error("[gacha-simulate] Result image failed; retaining text results", error); }
  const note = !animation ? "這組動畫尚未準備完成，直接顯示實際抽取結果。" : !selected ? "動畫超過此聊天室的附件限制，直接顯示結果。" : undefined;
  const final: SimulationPayload = {
    ...simulationMessage(session, catalog, "result", png ? "attachment://gacha-result.png" : undefined, png ? note : "結果圖片暫時無法顯示；抽取結果與計數已保存。"),
    attachments: [], ...(png ? { files: [{ attachment: png, name: "gacha-result.png" }] } : {}),
  };
  return { selected, final };
}

function currentResult(final: SimulationPayload, session: SimulationSession, store: GachaSimulationStore): SimulationPayload {
  // Rendering/recovery can overlap a click. Never restore a consumed action row.
  return store.get(session.id)?.continuationId ? { ...final, ...withoutSimulationContinuation(final.components, session.id) } : final;
}

function attachResult(session: SimulationSession, store: GachaSimulationStore, transport: SimulationTransport, message: SimulationMessageHandle) {
  store.attachMessage(session.id, message.id, transport.applicationId && transport.channelId ? {
    applicationId: transport.applicationId, channelId: transport.channelId, guildId: transport.guildId,
    completeAt: Date.now(), attachmentLimit: transport.attachmentLimit,
  } : undefined);
  store.finish(session.id);
}

/** Recover a saved continuation whose followup was interrupted; never redraw. */
export async function deliverSimulationResult(session: SimulationSession, catalog: SimulationCatalog, store: GachaSimulationStore,
  transport: SimulationTransport, deps: Dependencies = playbackDependencies): Promise<void> {
  if (deliveries.has(session.id)) return deliveries.get(session.id);
  if (store.get(session.id)?.messageId) return;
  const running = (async () => {
    const { final } = await prepareResult(store.get(session.id) || session, catalog, deps, transport.attachmentLimit);
    const message = await transport.send(currentResult(final, session, store));
    attachResult(session, store, transport, message);
  })();
  deliveries.set(session.id, running);
  try { await running; } finally { deliveries.delete(session.id); }
}

/** Waits for server media readiness, then allows time for client playback startup. */
export async function playSimulation(
  session: SimulationSession, catalog: SimulationCatalog, store: GachaSimulationStore,
  transport: SimulationTransport, deps: Dependencies = playbackDependencies,
): Promise<void> {
  const pending = deliveries.get(session.id);
  if (pending) return pending;
  if (store.get(session.id)?.messageId) return;
  const running = startPlayback(session, catalog, store, transport, deps);
  deliveries.set(session.id, running);
  try { await running; } finally { deliveries.delete(session.id); }
}

async function startPlayback(
  session: SimulationSession, catalog: SimulationCatalog, store: GachaSimulationStore,
  transport: SimulationTransport, deps: Dependencies,
) {
  const { selected, final } = await prepareResult(session, catalog, deps, transport.attachmentLimit);
  if (!selected || session.animation === false) {
    const message = await transport.send(currentResult(final, session, store)); attachResult(session, store, transport, message); return;
  }
  store.setGifHeight(session.id, selected.height);
  const playbackDelay = simulationPlaybackDelay(selected);
  let timer: ReturnType<typeof setTimeout> | undefined, finishing: Promise<void> | undefined;
  let ready!: (message: SimulationMessageHandle) => void;
  let failed!: (reason: unknown) => void;
  const messageReady = new Promise<SimulationMessageHandle>((resolve, reject) => { ready = resolve; failed = reject; });
  void messageReady.catch(() => {});
  const finish = (): Promise<void> => {
    if (finishing) return finishing;
    if (timer) clearTimeout(timer);
    finishing = (async () => {
      const message = await messageReady;
      await message.edit(currentResult(final, session, store)); store.finish(session.id); active.delete(session.id);
    })().catch(error => { finishing = undefined; throw error; });
    return finishing;
  };
  active.set(session.id, finish);
  let payload: SimulationPayload;
  let delivered: SimulationMessageHandle;
  try {
    const remote = selected.remoteUrl ? new URL(selected.remoteUrl) : undefined;
    // A unique media URL makes a repeated count variant start a fresh GIF in the
    // client instead of reusing an already completed image animation instance.
    remote?.searchParams.set("play", session.id);
    payload = { ...simulationMessage(session, catalog, "animation", remote?.href || "attachment://gacha-animation.gif"),
      ...(selected.remoteUrl ? {} : { files: [{ attachment: await deps.readGif(selected), name: "gacha-animation.gif" }] }) };
    const message = await transport.send(payload); delivered = message;
    store.attachMessage(session.id, message.id, transport.applicationId && transport.channelId ? {
      applicationId: transport.applicationId, channelId: transport.channelId, guildId: transport.guildId,
      completeAt: Date.now() + playbackDelay + (selected.remoteUrl ? MAX_MEDIA_WAIT : 0), attachmentLimit: transport.attachmentLimit,
    } : undefined);
    ready(message);
  } catch (error) {
    failed(error); active.delete(session.id);
    const message = await transport.send(currentResult(final, session, store)); attachResult(session, store, transport, message); return;
  }
  if (selected.remoteUrl && !finishing) {
    const state = await waitForAnimationMedia(delivered!, () => !!finishing);
    if (state === "unavailable") { await finish(); return; }
  }
  if (!finishing) {
    store.setPlaybackCompleteAt(session.id, Date.now() + playbackDelay);
    // The GIF has an extra final-frame hold, so fast clients can wait for the
    // result edit while slower clients finish the original animation. Do not
    // count that whole hold again, or the result would arrive after a replay.
    timer = setTimeout(() => { void finish().catch(error => {
      console.error("[gacha-simulate] Automatic result replacement failed; skip can retry", error);
      active.delete(session.id);
    }); }, playbackDelay);
    timer.unref?.();
  }
}

/** Also works after a bot restart, from the persisted draw and selected GIF's last frame. */
export async function skipSimulation(
  session: SimulationSession, catalog: SimulationCatalog, store: GachaSimulationStore,
  message: SimulationMessageHandle, limit: number, deps: Dependencies = playbackDependencies,
) {
  session = store.get(session.id) || session;
  const finish = active.get(session.id);
  if (finish) return finish();
  if (session.finished || store.get(session.id)?.finished) {
    // Old messages can regress to a failed GIF after an edit was acknowledged.
    // A visible skip button must restore the saved result even when marked done.
    if (!isSimulationAnimation(message, session.id)) return;
    store.reopenResult(session.id);
  }
  const { final } = await prepareResult(session, catalog, deps, limit);
  await message.edit(currentResult(final, session, store)); store.finish(session.id);
}
