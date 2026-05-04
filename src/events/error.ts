import { client } from "../index.js";
import { WebhookClient, EmbedBuilder, Events } from "discord.js";
import Logger from "../utilities/core/logger.js";
import { getConfig } from "../utilities/core/config.js";
const config = getConfig();

const webhook = config.ERRWEBHOOK ? new WebhookClient({ url: config.ERRWEBHOOK }) : null;

client.on(Events.Error, async (error: Error) => {
  console.log(error);
  new Logger("系統").error(`錯誤訊息：${error.message}`);
  if (webhook) {
    webhook.send({
      embeds: [
        new EmbedBuilder().setTimestamp().setDescription(`${error.message}`),
      ],
    });
  }
});

client.on("warn", (error) => {
  new Logger("系統").warn(`警告訊息：${error}`);
});

process.on("unhandledRejection", (error) => {
  console.log(error);
  new Logger("系統").error(`錯誤訊息：${(error as Error).message}`);
  if (webhook) {
    webhook.send({
      embeds: [
        new EmbedBuilder().setTimestamp().setDescription(`${(error as Error).message}`),
      ],
    });
  }
});

process.on("uncaughtException", console.error);
