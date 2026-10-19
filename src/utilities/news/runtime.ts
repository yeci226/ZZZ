import { NewsPublisher } from "./publication.js";
import { NewsReader } from "./reader.js";
import { join } from "node:path";
import type { Client } from "discord.js";
import { NewsStore } from "./store.js";
import { NewsSources } from "./sources.js";
import { NewsService } from "./service.js";
import { NewsWizard } from "./wizard.js";
import type { NewsGame } from "./types.js";

const runtimes = new Map<
  NewsGame,
  {
    store: NewsStore;
    sources: NewsSources;
    service: NewsService;
    wizard: NewsWizard;
    reader: NewsReader;
    publisher: NewsPublisher;
  }
>();
export function getNewsRuntime(client: Client, game: NewsGame) {
  const current = runtimes.get(game);
  if (current) return current;
  const store = new NewsStore(
    process.env.NEWS_DATABASE_PATH ??
      join(process.cwd(), "data", `${game}-news.sqlite`),
  );
  const sources = new NewsSources(game);
  const reader = new NewsReader(client, store, sources);
  const publisher = new NewsPublisher(client, store, sources);
  const runtime = {
    publisher,
    reader,
    store,
    sources,
    service: new NewsService(store, sources, async (event, sub) => {
      await publisher.send(event, sub);
    }),
    wizard: new NewsWizard(client, game, store, sources, publisher),
  };
  runtimes.set(game, runtime);
  return runtime;
}
