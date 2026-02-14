import { client } from "../index.js";
import { Events, AutocompleteInteraction } from "discord.js";
// Use client.db directly

client.on(Events.InteractionCreate, async (interaction: any) => {
  if (!interaction.isAutocomplete()) return;
  const autocompleteInteraction = interaction as AutocompleteInteraction;
  const focusedOption = autocompleteInteraction.options.getFocused(true);
  const { name: optionName } = focusedOption;

  if (optionName == "account") {
    const userAccounts: any[] =
      (await client.db.get(`${interaction.user.id}.account`)) || [];
    if (!userAccounts) return;

    const choices = [];
    for (const account of userAccounts) {
      choices.push({
        name: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ""}`,
        value: `${userAccounts.indexOf(account)}`,
      });
    }

    await autocompleteInteraction.respond(choices);
  }
});
