import { AttachmentBuilder, escapeMarkdown, MessageFlags, type StringSelectMenuInteraction } from "discord.js";
import type { DbAdapter, LegacyAccount } from "../accountStore.js";
import { inspectAccountAccess } from "../accountAccess.js";
import { createTranslator } from "../core/i18n.js";
import { messageSubtext } from "../core/messageSubtext.js";
import { normalizeZzzLocale } from "./canvasFonts.js";
import { createZzzClient, getZzzClientLanguage } from "./clientFactory.js";
import { discContent, discText } from "./discLeaderboardCopy.js";
import type { DiscLeaderboardStore } from "./discLeaderboardStore.js";
import { unwrapProfileCharacter } from "./profileData.js";
import { normalizeZzzProfileStyle } from "./profileStyle.js";

interface PlayerTarget { ownerId: string; uid: string; agentId: string; guildId: string | null }
const pendingViewers = new Set<string>();

/** Read the precise UID without migrating someone else's data or falling back to account zero. */
export async function rankedPlayerAccount(db: Pick<DbAdapter, "get">, owner: string, uid: string): Promise<LegacyAccount | null> {
  const raw: any = await db.get(`${owner}.hoyolabs`);
  const groups = Array.isArray(raw) ? raw : Array.isArray(raw?.hoyolabs) ? raw.hoyolabs : [];
  if (groups.length) {
    for (const group of groups) {
      const character = Array.isArray(group?.characters)
        ? group.characters.find((c: any) => String(c?.uid) === uid) : undefined;
      if (character) return { uid, cookie: group.cookie, nickname: character.nickname, invalid: Boolean(group.invalid || character.invalid) };
    }
    return null;
  }
  const legacy = await db.get<LegacyAccount[]>(`${owner}.account`);
  const account = Array.isArray(legacy) ? legacy.find(a => String(a?.uid) === uid) : undefined;
  return account ? { uid, cookie: account.cookie, nickname: account.nickname, invalid: account.invalid } : null;
}

async function withTimeout<T>(request: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Player character request timed out")), ms);
    })]);
  } finally { clearTimeout(timer); }
}

/** Viewing is read-only, even when the selected player is the person clicking. */
export async function showDiscLeaderboardPlayer(
  interaction: StringSelectMenuInteraction,
  db: DbAdapter,
  target: PlayerTarget,
  store: DiscLeaderboardStore,
  locale: string,
) {
  if (pendingViewers.has(interaction.user.id)) {
    await interaction.reply({ content: discContent(locale, "playerBusy"), flags: MessageFlags.Ephemeral });
    return;
  }
  pendingViewers.add(interaction.user.id);
  const currentEntry = () => {
    const entry = store.page(target.agentId, target.ownerId, target.guildId).viewer;
    return entry?.uid === target.uid ? entry : undefined;
  };
  const fail = (key: "playerUnavailable" | "playerAccountUnavailable" | "playerLoadFailed") =>
    interaction.editReply({ content: discContent(locale, key), embeds: [], components: [], attachments: [], allowedMentions: { parse: [] } });
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!currentEntry()) { await fail("playerUnavailable"); return; }
    const account = await rankedPlayerAccount(db, target.ownerId, target.uid);
    const access = await inspectAccountAccess(db, { ownerId: target.ownerId, accountIndex: 0, account });
    if (access.status !== "ready" || !account) { await fail("playerAccountUnavailable"); return; }
    if (!currentEntry()) { await fail("playerUnavailable"); return; }
    const zzz = createZzzClient({ cookie: account.cookie, uid: Number(target.uid), lang: getZzzClientLanguage(locale) });
    const character = unwrapProfileCharacter(await withTimeout(zzz.record.character(Number(target.agentId)), 12_000));
    if (!character || String(character.id) !== target.agentId) { await fail("playerLoadFailed"); return; }
    const [style, painting, rankPainting] = await Promise.all([
      db.get(`${interaction.user.id}.profileStyle`),
      db.get(`${interaction.user.id}.paintingMode`),
      db.get(`${interaction.user.id}.rankPainting`),
    ]);
    const { drawCharacterImage } = await import("./profile.js");
    const language = normalizeZzzLocale(locale);
    const buffer = await drawCharacterImage(interaction, createTranslator(language), language, target.uid,
      character, painting === true, rankPainting === true, normalizeZzzProfileStyle(style));
    if (!buffer) { await fail("playerLoadFailed"); return; }
    // Leaving, unlinking, or replacing the winning account while loading must revoke this view.
    const entry = currentEntry();
    if (!entry) { await fail("playerUnavailable"); return; }
    const name = (value: string) => escapeMarkdown(value.replace(/\s+/g, " ").trim().slice(0, 100));
    const nickname = typeof account.nickname === "string" ? account.nickname.trim() : "";
    const identity = [nickname && name(nickname), name(entry.playerName), `UID ${target.uid}`].filter(Boolean).join(" · ");
    await interaction.editReply({
      content: messageSubtext(identity) + "\n" + discContent(locale, "playerLiveBuild"),
      embeds: [], components: [], attachments: [],
      files: [new AttachmentBuilder(buffer, { name: `leaderboard-${target.uid}-${target.agentId}.png` })],
      allowedMentions: { parse: [] },
    });
  } catch {
    console.warn("[disc-leaderboard] player detail failed");
    if (interaction.deferred || interaction.replied) await fail("playerLoadFailed");
    else await interaction.reply({ content: discText(locale, "playerLoadFailed"), flags: MessageFlags.Ephemeral });
  } finally { pendingViewers.delete(interaction.user.id); }
}
