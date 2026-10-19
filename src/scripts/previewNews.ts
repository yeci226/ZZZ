/** Offline by default. --live reads public sources; neither mode sends to Discord. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { NewsStore } from "../utilities/news/store.js";
import { NewsSources } from "../utilities/news/sources.js";
import type { Client } from "discord.js";
import { NewsPublisher } from "../utilities/news/publication.js";
import { NewsMediaCache } from "../utilities/news/media.js";
import { renderMessage } from "../utilities/news/messages.js";
import {
  createNewsSession,
  renderNewsSession,
} from "../utilities/news/wizard.js";
import {
  CATEGORIES,
  GAME_CONFIG,
  newSubscription,
  type NewsEvent,
  type NewsGame,
} from "../utilities/news/types.js";

async function main(): Promise<void> {
  const game = process.argv.find((arg) => arg === "hsr" || arg === "zzz") as
    NewsGame | undefined;
  if (!game)
    throw new Error("Usage: tsx src/scripts/previewNews.ts hsr|zzz [--live]");
  const source = new NewsSources(game);
  const now = Date.now();
  const events: NewsEvent[] = [
    {
      id: `${game}:preview`,
      game,
      source: "hoyoplay",
      locale: null,
      categories: ["preload"],
      publishedAt: now,
      title: "",
      summary: "",
      image: null,
      url: `https://m.hoyolab.com/toBBS.html?game_id=${GAME_CONFIG[game].gids}`,
      kind: "preload",
      version: "X.Y.Z",
      simulated: true,
    },
  ];
  const live: Record<string, unknown> = {};
  if (process.argv.includes("--live")) {
    const updates = await source.updates();
    live.updates = updates;
    try {
      live.maintenance = await source.maintenance(updates.main);
    } catch {
      live.maintenance = "unknown";
    }
    const page = await source.articles("tw", 3);
    live.articles = page.events.length;
    events.push(...page.events.slice(0, 3));
  }
  const db = new NewsStore(":memory:");
  try {
    const sub = db.saveSubscription(
      {
        ...newSubscription("111111111111111111", "tw"),
        enabled: true,
        categories: [...CATEGORIES],
      },
      0,
      now,
    );
    const session = createNewsSession(
      game,
      sub.userId,
      "333333333333333333",
      "tw",
      sub,
      true,
      now,
    );
    const screens = [0, 1, 2, 3, 4].map((page) => {
      session.page = page as 0 | 1 | 2 | 3 | 4;
      return {
        page,
        components: renderNewsSession(session).components.map((c) =>
          c.toJSON(),
        ),
      };
    });
    const channelSub = {
      ...sub,
      id: "channel:222222222222222222",
      scope: "channel" as const,
      channelId: "222222222222222222",
      guildId: session.guildId,
    };
    session.page = 1;
    session.draft = channelSub;
    const channels = renderNewsSession(session, [channelSub]).components.map(
      (c) => c.toJSON(),
    );
    const path = resolve("previews", "news", `${game}-news-preview.json`);
    mkdirSync(dirname(path), { recursive: true });
    const reader = new NewsPublisher(
      {} as Client,
      db,
      source,
      new NewsMediaCache(resolve("previews", "news", "media")),
    );
    const notifications = [];
    for (const locale of GAME_CONFIG[game].locales) {
      const messages = [];
      for (const event of events) {
        const document = await reader.prepare(event, locale);
        messages.push({
          eventId: event.id,
          parts: document.parts.map((_, index) =>
            renderMessage(document, index),
          ),
        });
      }
      notifications.push({ locale, messages });
    }
    writeFileSync(
      path,
      JSON.stringify(
        {
          game,
          previewOnly: true,
          createdAt: new Date(now).toISOString(),
          live,
          screens,
          channels,
          notifications,
        },
        null,
        2,
      ),
    );
    console.log(`Preview saved: ${path} (no Discord messages sent)`);
  } finally {
    db.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
