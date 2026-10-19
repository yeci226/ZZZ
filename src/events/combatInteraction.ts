import { Events } from "discord.js";
import { client } from "../index.js";
import { handleCombatInteraction, isCombatInteraction } from "../utilities/zzz/combat/workbench.js";
import { discScoringReleased } from "../utilities/zzz/combat/scoringRelease.js";
import { getScoringStore } from "../utilities/zzz/combat/scoringStore.js";

client.once(Events.ClientReady, () => {
  if (discScoringReleased()) getScoringStore().start(error => console.warn("[disc-scoring]", error instanceof Error ? error.message : "Sync failed"));
});
client.on(Events.InteractionCreate, async interaction => {
  if (!(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) || !isCombatInteraction(interaction.customId)) return;
  try { await handleCombatInteraction(interaction, client.db); }
  catch (error) { console.error("[combat]", error instanceof Error ? error.message : "Interaction failed"); }
});
