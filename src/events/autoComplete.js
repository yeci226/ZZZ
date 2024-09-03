import { client } from "../index.js";
import { Events } from "discord.js";
const db = client.db;

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isAutocomplete()) return;
  const { options, user } = interaction;
  const optionName = options._hoistedOptions[0].name;

  if (optionName == "account") {
    const userAccounts = await db.get(`${user.id}.account`);
    if (!userAccounts) return;

    const choices = [];
    for (const account of userAccounts) {
      choices.push({
        name: `${account.uid} ${account.nickname ? `- ${account.nickname}` : ""}`,
        value: `${userAccounts.indexOf(account)}`,
      });
    }

    await interaction.respond(choices);
  }
});
