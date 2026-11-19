import { client } from "../index.js";
import { WebhookClient, EmbedBuilder, Events } from "discord.js";
import Logger from "../utilities/core/logger.js";
import { getConfig } from "../utilities/core/config.js";
const config = getConfig();

const webhook = config.ERRWEBHOOK ? new WebhookClient({ url: config.ERRWEBHOOK }) : null;

// 非 Error 的值（字串、undefined 等）也要能安全取得訊息；空字串會讓 embed 送出失敗
function errorMessage(error: unknown): string {
  const message = (error as Error | undefined)?.message ?? String(error);
  return String(message).slice(0, 4000) || "(無訊息)";
}

// webhook 失敗只在本機記錄，絕不重送，避免 unhandledRejection 迴圈
function sendFailed(e: unknown) {
  console.error("[error webhook] send failed:", (e as Error)?.message ?? e);
}

client.on(Events.Error,async (error: Error) => {
  console.log(error);
  new Logger("系統").error(`錯誤訊息：${errorMessage(error)}`);
  if (webhook) {
    webhook.send({
      embeds: [
        new EmbedBuilder().setTimestamp().setDescription(errorMessage(error)),
      ],
    }).catch(sendFailed);
  }
});

client.on("warn", (error) => {
  new Logger("系統").warn(`警告訊息：${error}`);
});

process.on("unhandledRejection", (error) => {
  console.log(error);
  new Logger("系統").error(`錯誤訊息：${errorMessage(error)}`);
  if (webhook) {
    webhook.send({
      embeds: [
        new EmbedBuilder().setTimestamp().setDescription(errorMessage(error)),
      ],
    }).catch(sendFailed);
  }
});

process.on("uncaughtException", console.error);
