import { client } from "../index.js";
import { Events, Interaction } from "discord.js";
import { handleContactDevInteraction } from "../utilities/contactDev.js";

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("contact-dev:")) return;
  await handleContactDevInteraction(interaction);
});
