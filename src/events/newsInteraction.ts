import { isNewsReadingInteraction } from "../utilities/news/reader.js";
import { Events, type BaseInteraction } from "discord.js";
import { client } from "../index.js";
import { getNewsRuntime } from "../utilities/news/runtime.js";
import { isNewsInteraction } from "../utilities/news/wizard.js";

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
  if (
    !("customId" in interaction) ||
    typeof interaction.customId !== "string" ||
    !isNewsInteraction(interaction.customId)
  )
    return;
  const runtime = getNewsRuntime(client, "zzz");
  if (isNewsReadingInteraction(interaction.customId))
    await runtime.reader.handle(interaction);
  else await runtime.wizard.handle(interaction);
});
client.once(Events.ClientReady, () => {
  if (client.cluster.id === 0) getNewsRuntime(client, "zzz").service.start();
});
