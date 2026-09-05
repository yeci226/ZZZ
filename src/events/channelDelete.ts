import { client } from "../index.js";
import { Events } from "discord.js";
import Logger from "../utilities/core/logger.js";
import { disableDestinationsMatching } from "../utilities/core/notificationDestination.js";

client.on(Events.ChannelDelete, async (channel) => {
  const disabled = await disableDestinationsMatching(
    client.db as any,
    { channelId: channel.id },
    "unknown_channel",
  ).catch(() => 0);
  if (disabled > 0) {
    new Logger("通知清理").warn(
      `頻道 ${channel.id} 已刪除，已停用 ${disabled} 個通知目的地；自動功能維持啟用`,
    );
  }
});
