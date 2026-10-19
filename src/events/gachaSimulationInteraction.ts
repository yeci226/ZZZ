import { Events } from "discord.js";
import { client } from "../index.js";
import { handleGachaSimulationButton } from "../utilities/zzz/gachaSimulationInteraction.js";
import { handleGachaSimulationPanel } from "../utilities/zzz/gachaSimulationPanelInteraction.js";
import { startSimulationRecovery } from "../utilities/zzz/gachaSimulationRecovery.js";

client.once(Events.ClientReady, () => { startSimulationRecovery(client); });

client.on(Events.InteractionCreate, async interaction => {
  if (!(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) || !interaction.customId.startsWith("gsim:")) return;
  try {
    if (interaction.isButton() && /^gsim:(skip|one|ten):/.test(interaction.customId)) await handleGachaSimulationButton(interaction);
    else await handleGachaSimulationPanel(interaction);
  }
  catch (error) { console.error("[gacha-simulate] Interaction failed", error instanceof Error ? error.message : "Request failed"); }
});
