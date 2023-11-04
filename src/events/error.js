const client = require("../index.js");
const { WebhookClient, EmbedBuilder, Events } = require("discord.js");
const moment = require("moment");
const webhook = new WebhookClient({
  url: process.env.ERRWEBHOOK,
});

client.on(Events.Error, (error) => {
  console.log(error);
  webhook.send({
    embeds: [
      new EmbedBuilder().setDescription(`\`\`\`${error}\`\`\``).setFooter({
        text: `${moment().tz("Asia/Taipei").format("h:mm:ss a")}`,
      }),
    ],
  });
});

process.on(Events.UnhandledRejection, (error) => {
  console.log("Unhandled promise rejection:", error);
  webhook.send({
    embeds: [
      new EmbedBuilder().setDescription(`\`\`\`${error}\`\`\``).setFooter({
        text: `${moment().tz("Asia/Taipei").format("h:mm:ss a")}`,
      }),
    ],
  });
});

process.on(Events.UncaughtException, console.error);
