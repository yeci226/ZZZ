import type { Client } from "discord.js";
import { getSimulationCatalog, type SimulationCatalog } from "./gachaSimulationCatalog.js";
import { deliverSimulationResult, isSimulationResult, skipSimulation, type SimulationMessageHandle, type SimulationPayload } from "./gachaSimulationPlayback.js";
import { withoutSimulationContinuation } from "./gachaSimulationPresentation.js";
import { getGachaSimulationStore, type GachaSimulationStore, type SimulationSession } from "./gachaSimulationStore.js";

interface RecoveryTransport {
  applicationId: string;
  owns(session: SimulationSession): boolean;
  fetchMessage(session: SimulationSession): Promise<SimulationMessageHandle | undefined>;
  sendMessage?(session: SimulationSession, payload: SimulationPayload): Promise<SimulationMessageHandle>;
  onError?(session: SimulationSession, error: unknown): void;
}

/** Reuses saved draws. An unsent continuation may need its first result message. */
export async function recoverSimulationResults(
  store: GachaSimulationStore, catalog: SimulationCatalog, transport: RecoveryTransport,
  now = Date.now(), finish = skipSimulation, deliver = deliverSimulationResult,
) {
  let completed = 0;
  if (transport.sendMessage) for (const pending of store.pendingContinuations(transport.applicationId, now)) {
    if (!transport.owns(pending)) continue;
    const session = store.claimPendingContinuation(pending.id, now);
    if (!session) continue;
    try {
      const parent = store.get(session.parentId!);
      if (parent?.messageId) {
        const oldMessage = await transport.fetchMessage(parent);
        if (oldMessage) await oldMessage.edit(withoutSimulationContinuation(oldMessage.components || [], parent.id));
      }
      await deliver(session, catalog, store, {
        ...session.delivery!, send: payload => transport.sendMessage!(session, payload),
      });
      completed++;
    } catch (error) { transport.onError?.(session, error); }
  }
  const sessions = [...store.pendingResults(transport.applicationId, now), ...store.pendingResultChecks(transport.applicationId, now)];
  for (let session of sessions) {
    if (!transport.owns(session)) continue;
    try {
      const message = await transport.fetchMessage(session);
      if (!message) {
        // Deleted messages cannot be restored. Their draw and pity remain saved.
        store.finish(session.id, now); store.confirmResult(session.id, now);
        continue;
      }
      session = store.get(session.id)!;
      if (session.finished) {
        if (isSimulationResult(message, session.id, !!session.continuationId)) {
          store.confirmResult(session.id, now);
          continue;
        }
        // Retry the same saved draw; never advance pity or create another message.
        store.reopenResult(session.id);
        session.finished = false;
      }
      await finish(session, catalog, store, message, session.delivery!.attachmentLimit);
      completed++;
    } catch (error) { transport.onError?.(session, error); }
  }
  return completed;
}

/** One recovery worker per shard, also retries failed automatic result edits. */
export function startSimulationRecovery(client: Client, store = getGachaSimulationStore()) {
  if (!client.user) throw new Error("The Discord client must be ready before recovering simulations");
  let running = false, stopped = false;
  const retryAfter = new Map<string, number>();
  const transport: RecoveryTransport = {
    applicationId: client.user.id,
    owns: session => {
      if ((retryAfter.get(session.id) || 0) > Date.now()) return false;
      const guildId = session.delivery!.guildId;
      if (guildId) return client.guilds.cache.has(guildId);
      const cluster = (client as Client & { cluster?: { id: number } }).cluster;
      return cluster ? cluster.id === 0 : !client.shard || client.shard.ids.includes(0);
    },
    fetchMessage: async session => {
      try {
        const channel = await client.channels.fetch(session.delivery!.channelId);
        if (!channel?.isTextBased()) throw new Error("The simulation channel is unavailable");
        const message = await channel.messages.fetch({ message: session.messageId!, force: true });
        if (message.author.id !== client.user!.id) throw new Error("The simulation message belongs to another bot");
        retryAfter.delete(session.id);
        return message;
      } catch (error) {
        if ([10003, 10008].includes(Number((error as { code?: number }).code))) return undefined;
        throw error;
      }
    },
    sendMessage: async (session, payload) => {
      const channel = await client.channels.fetch(session.delivery!.channelId);
      if (!channel?.isSendable()) throw new Error("The simulation channel is unavailable");
      // The original interaction may have expired while the process was down.
      // A stable nonce also deduplicates an ambiguous send retried by Discord.
      return channel.send({ ...payload, nonce: session.requestId, enforceNonce: true });
    },
    onError: (session, error) => {
      retryAfter.set(session.id, Date.now() + 60_000);
      console.error("[gacha-simulate] Result recovery will retry", session.id,
        error instanceof Error ? error.message : "Discord request failed");
    },
  };
  const run = async () => {
    if (running || stopped) return;
    running = true;
    try {
      for (const [id, retryAt] of retryAfter) if (retryAt <= Date.now()) retryAfter.delete(id);
      await recoverSimulationResults(store, getSimulationCatalog(), transport);
    } catch (error) {
      console.error("[gacha-simulate] Recovery unavailable", error instanceof Error ? error.message : "Unknown error");
    } finally { running = false; }
  };
  void run();
  const timer = setInterval(() => { void run(); }, 15_000);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
