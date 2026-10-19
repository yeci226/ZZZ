import { Events, MessageFlags } from "discord.js";
import { client } from "../index.js";
import { handleDiscLeaderboardInteraction } from "../utilities/zzz/discLeaderboard.js";
import { getDiscLeaderboardStore } from "../utilities/zzz/discLeaderboardStore.js";
import { getScoringStore } from "../utilities/zzz/combat/scoringStore.js";
import { discContent } from "../utilities/zzz/discLeaderboardCopy.js";

client.once(Events.ClientReady, () => {
  const sync = () => { void getDiscLeaderboardStore().syncScoring(getScoringStore().snapshot()).catch(() => console.warn("[disc-leaderboard] scoring refresh failed")); };
  sync(); setInterval(sync, 60_000).unref();
});
client.on(Events.InteractionCreate, async interaction => {
  if ((!interaction.isButton() && !interaction.isStringSelectMenu()) || !interaction.customId.startsWith("zdisc:")) return;
  try { await handleDiscLeaderboardInteraction(interaction, client.db); }
  catch {
    console.warn("[disc-leaderboard] interaction failed");
    const locale = await client.db.get(`${interaction.user.id}.locale`).catch(() => interaction.locale) || interaction.locale;
    const message = { content: discContent(locale, "failed"), flags: MessageFlags.Ephemeral as const };
    if (interaction.deferred || interaction.replied) await interaction.followUp(message).catch(() => {});
    else await interaction.reply(message).catch(() => {});
  }
});
