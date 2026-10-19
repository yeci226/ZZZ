import { NewsStore, NewsConflictError } from "../src/utilities/news/store";
import { newSubscription, type NewsEvent } from "../src/utilities/news/types";

describe("news channel move transaction", () => {
  let store: NewsStore;
  const now = 1800000000000;
  const event = (id: string, publishedAt = now): NewsEvent => ({
    id,
    game: "zzz",
    source: "hoyolab",
    locale: "tw",
    categories: ["update"],
    publishedAt,
    title: "News",
    summary: "",
    image: null,
    url: "https://example.test",
    kind: "article",
    version: null,
  });
  beforeEach(() => {
    store = new NewsStore(":memory:");
  });
  afterEach(() => store.close());
  function source() {
    return store.saveSubscription(
      {
        ...newSubscription("admin", "tw"),
        scope: "channel",
        id: "channel:old",
        guildId: "g",
        channelId: "old",
        roleId: "role",
        categories: ["update"],
        enabled: true,
      },
      0,
      now - 100,
    );
  }
  test("cancels pending/sending deliveries and pending publications without replay", () => {
    const sub = source();
    store.ingest("articles", {}, [event("one"), event("two")], [], now);
    expect(store.claim(now)).not.toBeNull();
    store.beginPublication(
      "publication",
      "channel:old",
      sub,
      "document",
      "old",
    );
    const moved = store.moveChannelSubscription(
      sub.id,
      sub.revision,
      "g",
      "new",
      now + 10,
    );
    expect(moved).toMatchObject({
      categorySince: sub.categorySince,
      roleId: "role",
      categories: ["update"],
      locale: "tw",
      enabled: true,
    });
    expect(store.publication("publication")?.status).toBe("cancelled");
    expect(store.claim(now + 400000)).toBeNull();
    store.ingest(
      "articles",
      {},
      [event("one"), event("two"), event("three", now + 20)],
      [],
      now + 30,
    );
    expect(store.claim(now + 30)).toMatchObject({
      eventId: "three",
      subscriptionId: "channel:new",
    });
    expect(store.claim(now + 30)).toBeNull();
  });
  test("rolls back destination creation if source disabling fails", () => {
    const sub = source();
    const original = store.saveSubscription.bind(store);
    jest
      .spyOn(store, "saveSubscription")
      .mockImplementation((input, revision, at) => {
        if (input.id === sub.id && !input.enabled)
          throw new Error("write failed");
        return original(input, revision, at);
      });
    expect(() =>
      store.moveChannelSubscription(sub.id, sub.revision, "g", "new"),
    ).toThrow("write failed");
    expect(store.getSubscription("channel:new")).toBeNull();
    expect(store.getSubscription(sub.id)).toEqual(sub);
  });
  test("stale revisions, other guilds, and same destinations cannot move", () => {
    const sub = source();
    for (const [revision, guild, channel] of [
      [0, "g", "new"],
      [sub.revision, "other", "new"],
      [sub.revision, "g", "old"],
    ] as const) {
      expect(() =>
        store.moveChannelSubscription(sub.id, revision, guild, channel),
      ).toThrow(NewsConflictError);
    }
    expect(store.getSubscription(sub.id)).toEqual(sub);
  });
});
