import { commandTipContent } from "../core/commandTips.js";
import { getDiscLeaderboardStore, type DiscEnrollment, type DiscLeaderboardStore } from "./discLeaderboardStore.js";
import { discContent, discText } from "./discLeaderboardCopy.js";
import { unwrapProfileCharacter } from "./profileData.js";
import { createDiscBatchReader, type DiscBatchReader } from "./discProfileBatch.js";

type ProfileSyncInput = Omit<DiscEnrollment, "character"> & { characters: readonly { id: string | number }[] };
type SyncResult = { status: "complete" | "partial" | "cancelled" | "busy" | "recent" | "hidden" | "other-owner" | "stale"; updated: number; total: number };
type SyncOptions = { store?: DiscLeaderboardStore; pause?: () => Promise<void>; timeoutMs?: number; now?: () => number; fetchBatch?: DiscBatchReader };

/** Prefer batches of 10 current builds; the sequential SDK endpoint covers unavailable or missing results. */
export async function syncProfileDiscs(input: ProfileSyncInput, client: { record: { character(id: number): Promise<unknown> } }, options: SyncOptions = {}): Promise<SyncResult> {
  const store = options.store ?? getDiscLeaderboardStore(), now = options.now ?? Date.now;
  const ids = [...new Set(input.characters.map(c => String(c.id)).filter(id => /^\d{4}$/.test(id)))];
  const started = store.beginProfileSync(input, now());
  if (started !== "started") return { status: started, updated: 0, total: ids.length };
  let updated = 0, failures = 0;
  const completed = new Set<string>();
  const deadline = now() + 120_000;
  const pause = options.pause ?? (() => new Promise<void>(resolve => setTimeout(resolve, 250)));
  try {
    const batchReader = options.fetchBatch ?? createDiscBatchReader(client as any, input.characters);
    if (batchReader) {
      for (let offset = 0; offset < ids.length; offset += 10) {
        if (!store.profileSyncActive(input.uid, input.requestId, now())) return { status: "cancelled", updated, total: ids.length };
        if (now() >= deadline) break;
        const batch = ids.slice(offset, offset + 10);
        let details: any[];
        try { details = await batchReader(batch); }
        catch { break; } // Cookie-based chronicle access may still work when event-tool authentication fails.
        if (!store.profileSyncActive(input.uid, input.requestId, now())) return { status: "cancelled", updated, total: ids.length };
        for (const character of details) {
          const id = String(character?.id);
          if (!batch.includes(id) || completed.has(id) || !Array.isArray(character?.equip)) continue;
          const status = store.record({ ...input, character });
          if (status === "hidden" || status === "other-owner") return { status, updated, total: ids.length };
          if (status === "recorded" || status === "stale") { updated++; completed.add(id); }
        }
        if (offset + 10 < ids.length) await pause();
      }
    }
    for (const id of ids.filter(id => !completed.has(id))) {
      if (!store.profileSyncActive(input.uid, input.requestId, now())) return { status: "cancelled", updated, total: ids.length };
      if (now() >= deadline) break;
      let timer: ReturnType<typeof setTimeout> | undefined, timedOut = false;
      try {
        const raw = await Promise.race([
          client.record.character(Number(id)),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error("Character request timed out")); }, options.timeoutMs ?? 12_000); }),
        ]);
        if (!store.profileSyncActive(input.uid, input.requestId, now())) return { status: "cancelled", updated, total: ids.length };
        const character = unwrapProfileCharacter(raw);
        // A missing detail response must never erase a valid build. An explicit empty equip array may.
        if (String(character?.id) !== id || !Array.isArray(character?.equip)) throw new Error("Missing character equipment");
        const status = store.record({ ...input, character });
        if (status === "hidden" || status === "other-owner") return { status, updated, total: ids.length };
        if (status === "recorded" || status === "stale") updated++;
        failures = 0;
      } catch {
        // Never log SDK errors: they can contain authenticated request headers.
        if (timedOut || ++failures >= 3) break;
      } finally { if (timer) clearTimeout(timer); }
      if (id !== ids.at(-1)) await pause();
    }
    return { status: updated === ids.length ? "complete" : "partial", updated, total: ids.length };
  } finally { store.finishProfileSync(input.uid, input.requestId, updated === ids.length, now()); }
}

// Bound work within each shard. Database leases deduplicate the same UID across shards.
let tail: Promise<unknown> = Promise.resolve(), pending = 0;
export function queueProfileDiscSync(interaction: any, ownerId: string, client: any, characters: ProfileSyncInput["characters"], locale: string): void {
  if (ownerId !== interaction.user.id) return;
  const input: ProfileSyncInput = { ownerId, requesterId: interaction.user.id, uid: String(client.uid || ""), characters,
    requestId: interaction.id, requestedAt: interaction.createdTimestamp, guildId: interaction.guildId,
    playerName: interaction.user.displayName || interaction.user.username || discText(locale, "proxy"),
    avatarSource: interaction.user.displayAvatarURL?.({ extension: "png", size: 128 }) };
  if (pending >= 20) {
    void interaction.editReply({ content: commandTipContent(interaction, "profile", locale, discContent(locale, "syncBusy")) }).catch(() => {}); return;
  }
  pending++;
  tail = tail.then(async () => {
    const result = await syncProfileDiscs(input, client);
    const key = result.status === "complete" ? "syncComplete" : result.status === "partial" ? "syncPartial"
      : result.status === "recent" ? "syncRecent" : result.status === "busy" ? "syncBusy"
      : result.status === "other-owner" ? "duplicate" : result.status === "hidden" ? "hidden" : "syncCancelled";
    // Content only: never replace a newer character card, attachments, or its selector.
    await interaction.editReply({ content: commandTipContent(interaction, "profile", locale, discContent(locale, key, { n: result.updated, total: result.total })), allowedMentions: { parse: [] } }).catch(() => {});
  }).catch(() => {
    console.warn("[disc-leaderboard] profile sync failed");
    return interaction.editReply({ content: discContent(locale, "enrollFailed") }).catch(() => {});
  }).finally(() => { pending--; });
}
