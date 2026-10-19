/** Post a prepared continuous-message preview using a separately authorized test token. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, Routes } from "discord.js";
import { NewsPublisher } from "../utilities/news/publication.js";
import { NewsStore } from "../utilities/news/store.js";
import { NewsSources } from "../utilities/news/sources.js";
import { NewsMediaCache } from "../utilities/news/media.js";
import {
  newSubscription,
  type NewsEvent,
  type NewsGame,
} from "../utilities/news/types.js";
async function main(): Promise<void> {
  const {
    TEST_TOKEN: token,
    TOKEN: production,
    NEWS_PREVIEW_BOT: botId,
    NEWS_PREVIEW_GUILD: guildId,
    NEWS_PREVIEW_CHANNEL: channelId,
  } = process.env;
  if (!token || token === production || !botId || !guildId || !channelId)
    throw new Error(
      "Distinct TEST_TOKEN and explicit preview bot/guild/channel are required",
    );
  const client = new Client({
    intents: [],
    rest: { timeout: 20_000, retries: 2 },
  });
  client.rest.setToken(token);
  const [me, channel] = (await Promise.all([
    client.rest.get(Routes.user("@me")),
    client.rest.get(Routes.channel(channelId)),
  ])) as [{ id: string; bot: boolean }, { guild_id: string }];
  if (!me.bot || me.id !== botId || channel.guild_id !== guildId)
    throw new Error("Test bot or destination mismatch");
  const previewSet = process.env.NEWS_PREVIEW_SET ?? "v3";
  if (!/^v[1-9]\d{0,3}$/.test(previewSet))
    throw new Error("Invalid preview set");
  const directory = resolve(
      process.env.NEWS_PREVIEW_DIRECTORY ?? "previews/news",
    ),
    store = new NewsStore(resolve(directory, "v2.sqlite"));
  try {
    const samples = JSON.parse(
      readFileSync(resolve(directory, `${previewSet}-prepared.json`), "utf8"),
    ) as { game: NewsGame; kind: string; event: NewsEvent }[];
    const receipts = [];
    for (const sample of samples) {
      const publisher = new NewsPublisher(
        client,
        store,
        new NewsSources(sample.game),
        new NewsMediaCache(resolve(directory, "v2-media")),
      );
      const sub = {
        ...newSubscription(botId, "tw"),
        id: `channel:${channelId}`,
        scope: "channel" as const,
        guildId,
        channelId,
        enabled: true,
        revision: Number(previewSet.slice(1)),
      };
      const ids = await publisher.send(sample.event, sub, false);
      receipts.push({
        game: sample.game,
        kind: sample.kind,
        ids,
        urls: ids.map(
          (id) => `https://discord.com/channels/${guildId}/${channelId}/${id}`,
        ),
      });
      writeFileSync(
        resolve(directory, `${previewSet}-receipts.json`),
        JSON.stringify(receipts, null, 2),
      );
      console.log(
        JSON.stringify({ game: sample.game, kind: sample.kind, ids }),
      );
    }
  } finally {
    store.close();
    client.destroy();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : "preview_failed",
    }),
  );
  process.exitCode = 1;
});
