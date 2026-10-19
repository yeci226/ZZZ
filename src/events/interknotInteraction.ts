import { Events, MessageFlags } from "discord.js";
import { client } from "../index.js";
import { createTranslator } from "../utilities/core/i18n.js";
import { handleInterknotInteraction, type Notifier } from "../utilities/interknot/actions.js";
import { createDevNotifier, handleModerationButton } from "../utilities/interknot/moderation.js";
import { getInterknotStore } from "../utilities/interknot/store.js";
import { getUserLang } from "../utilities/utilities.js";

let notifier: Notifier | undefined;

client.on(Events.InteractionCreate, async interaction => {
  if (!(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) || !interaction.customId.startsWith("ik:")) return;
  const store = getInterknotStore();
  const locale = (await getUserLang(interaction.user.id)) || "tw";
  try {
    if (interaction.customId.startsWith("ik:mod:")) {
      if (interaction.isButton()) await handleModerationButton(interaction, store);
      return;
    }
    await handleInterknotInteraction(interaction, { store, notifier: (notifier ??= createDevNotifier(client, store)), locale });
  } catch {
    console.warn("[interknot] interaction failed");
    const reply = { content: createTranslator(locale)("interknot_Failed"), flags: MessageFlags.Ephemeral } as const;
    await (interaction.deferred || interaction.replied ? interaction.followUp(reply) : interaction.reply(reply)).catch(() => {});
  }
});
