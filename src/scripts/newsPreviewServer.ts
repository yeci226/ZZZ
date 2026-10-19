/** Dedicated test-bot reader. Never starts source polling or the production bot. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, Events, GatewayIntentBits, Routes } from "discord.js";
import { NewsStore } from "../utilities/news/store.js";
import { NewsSources } from "../utilities/news/sources.js";
import {
  NewsReader,
  isNewsReadingInteraction,
} from "../utilities/news/reader.js";
import { NewsMediaCache } from "../utilities/news/media.js";
import {
  newSubscription,
  type NewsEvent,
  type NewsGame,
} from "../utilities/news/types.js";

async function main(): Promise<void> {
  const token = process.env.TEST_TOKEN;
  if (!token || token === process.env.TOKEN)
    throw new Error("A distinct TEST_TOKEN is required");
  const guildId = process.env.NEWS_PREVIEW_GUILD,
    channelId = process.env.NEWS_PREVIEW_CHANNEL,
    botId = process.env.NEWS_PREVIEW_BOT;
  if (!guildId || !channelId || !botId)
    throw new Error(
      "NEWS_PREVIEW_GUILD, NEWS_PREVIEW_CHANNEL and NEWS_PREVIEW_BOT are required",
    );
  const directory = resolve(
    process.env.NEWS_PREVIEW_DIRECTORY ?? "previews/news",
  );
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    rest: { timeout: 20_000, retries: 2 },
  });
  client.rest.setToken(token);
  const [me, channel] = (await Promise.all([
    client.rest.get(Routes.user("@me")),
    client.rest.get(Routes.channel(channelId)),
  ])) as [{ id: string; bot: boolean }, { guild_id: string }];
  if (!me.bot || me.id !== botId || channel.guild_id !== guildId)
    throw new Error("Test bot or destination mismatch");
  const store = new NewsStore(resolve(directory, "v2.sqlite"));
  const readers = Object.fromEntries(
    (["hsr", "zzz"] as NewsGame[]).map((game) => [
      game,
      new NewsReader(
        client,
        store,
        new NewsSources(game),
        new NewsMediaCache(resolve(directory, "v2-media")),
      ),
    ]),
  ) as Record<NewsGame, NewsReader>;
  client.on(Events.InteractionCreate, (interaction) => {
    if (
      !interaction.isMessageComponent() ||
      !isNewsReadingInteraction(interaction.customId)
    )
      return;
    const game = interaction.customId.split(":")[2] as NewsGame;
    void readers[game]
      .handle(interaction)
      .then(() =>
        console.log(
          JSON.stringify({
            action: "read",
            game,
            messageId: interaction.message.id,
          }),
        ),
      )
      .catch(() => console.error("preview_read_failed"));
  });
  const ready = new Promise<void>((done) =>
    client.once(Events.ClientReady, () => done()),
  );
  await client.login(token);
  await ready;
  console.log(
    JSON.stringify({ ready: true, botId: client.user?.id, channelId }),
  );
  if (process.argv.includes("--send")) {
    const samples = JSON.parse(
      readFileSync(resolve(directory, "v2-prepared.json"), "utf8"),
    ) as { game: NewsGame; kind: string; event: NewsEvent }[];
    const receipts: {
      game: NewsGame;
      kind: string;
      id: string;
      url: string;
    }[] = [];
    for (const sample of samples) {
      const sub = {
        ...newSubscription(botId, "tw"),
        id: `channel:${channelId}`,
        scope: "channel" as const,
        guildId,
        channelId,
        enabled: true,
        revision: 2,
      };
      await readers[sample.game].send(sample.event, sub, false);
      // The reader saves binding before the receipt is written, so reruns skip existing messages.
      const { createHash } = await import("node:crypto");
      const token = createHash("sha256")
        .update(`${sample.event.id}:${sub.id}:${sub.revision}`)
        .digest("hex")
        .slice(0, 24);
      const id = store.reader<{ messageId: string }>(token)!.messageId;
      receipts.push({
        game: sample.game,
        kind: sample.kind,
        id,
        url: `https://discord.com/channels/${guildId}/${channelId}/${id}`,
      });
      writeFileSync(
        resolve(directory, "v2-receipts.json"),
        JSON.stringify(receipts, null, 2),
      );
      console.log(JSON.stringify({ sent: sample.kind, game: sample.game, id }));
    }
  }
  const stop = () => {
    client.destroy();
    store.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : "preview_failed",
    }),
  );
  process.exit(1);
});
