import { Events } from "discord.js";
import { client } from "../index.js";
import { handleAnalyticsReference } from "../utilities/zzz/analyticsReference.js";

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton() || !interaction.customId.startsWith("zref:"))
    return;
  try {
    await handleAnalyticsReference(interaction);
  } catch {
    console.warn("[analytics-reference] interaction failed");
  }
});
