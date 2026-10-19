import { Events, type BaseInteraction } from "discord.js";
import { client } from "../index.js";
import { handleReminderInteraction } from "../utilities/zzz/reminderWizard.js";

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
  if (!("customId" in interaction)
    || typeof interaction.customId !== "string"
    || !interaction.customId.startsWith("reminder:")) return;
  await handleReminderInteraction(client, interaction, client.db);
});
