import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NewsStore, NewsConflictError } from "../src/utilities/news/store.js";
import {
  CATEGORIES,
  newSubscription,
  type NewsEvent,
  type NewsGame,
  type UpdateState,
} from "../src/utilities/news/types.js";
import {
  NewsSources,
  classifyArticle,
  evaluateUpdates,
  evaluateMaintenance,
} from "../src/utilities/news/sources.js";
import {
  NewsService,
  collectArticles,
  deliveryPayload,
} from "../src/utilities/news/service.js";

const now = 1_800_000_000_000;
const article = (
  game: NewsGame,
  id = "1",
  overrides: Partial<NewsEvent> = {},
): NewsEvent => ({
  id: `post:${game}:tw:${id}`,
  game,
  source: "hoyolab",
  locale: "tw",
  categories: ["character_reveal", "character"],
  publishedAt: now,
  title: "角色公開",
  summary: "",
  image: null,
  url: `https://www.hoyolab.com/article/${id}`,
  kind: "article",
  version: null,
  ...overrides,
});

describe.each(["hsr", "zzz"] as NewsGame[])("%s news subscriptions", (game) => {
  let store: NewsStore;
  beforeEach(() => {
    store = new NewsStore(":memory:");
  });
  afterEach(() => store.close());
  function subscribe() {
    return store.saveSubscription(
      {
        ...newSubscription("123", "tw"),
        enabled: true,
        categories: [...CATEGORIES],
      },
      0,
      now - 1000,
    );
  }
  function seed() {
    store.ingest("articles", {}, [], [], now - 2000);
  }

  test("first source poll establishes baseline without flooding old articles", () => {
    subscribe();
    store.ingest(
      "articles",
      {},
      [article(game, "1", { publishedAt: now - 2000 })],
      [],
      now,
    );
    expect(store.claim(now)).toBeNull();
  });
  test("first poll does not lose articles published after subscription", () => {
    subscribe();
    store.ingest("articles", {}, [article(game)], [], now);
    expect(store.claim(now)?.eventId).toBe(article(game).id);
  });
  test("multiple matching categories and repeated polls yield one delivery", () => {
    subscribe();
    seed();
    store.ingest("articles", {}, [article(game)], [], now);
    store.ingest("another-feed", {}, [article(game)], [], now);
    store.ingest("articles", {}, [article(game)], [], now);
    const job = store.claim(now)!;
    expect(job).not.toBeNull();
    store.finish(job, "sent", null, now);
    expect(store.claim(now + 300_000)).toBeNull();
  });
  test("new subscriptions do not receive previously published articles", () => {
    subscribe();
    seed();
    store.ingest(
      "articles",
      {},
      [article(game, "1", { publishedAt: now - 2000 })],
      [],
      now,
    );
    expect(store.claim(now)).toBeNull();
  });
  test("new categories and re-enabling have their own activation time", () => {
    let sub = store.saveSubscription(
      {
        ...newSubscription("123", "tw"),
        categories: ["preload"],
        enabled: true,
      },
      0,
      now - 2000,
    );
    sub = store.saveSubscription(
      { ...sub, categories: ["preload", "character"] },
      sub.revision,
      now - 1000,
    );
    expect(sub.categorySince.preload).toBe(now - 2000);
    expect(sub.categorySince.character).toBe(now - 1000);
    sub = store.saveSubscription({ ...sub, enabled: false }, sub.revision, now);
    sub = store.saveSubscription(
      { ...sub, enabled: true },
      sub.revision,
      now + 1000,
    );
    expect(sub.categorySince.preload).toBe(now + 1000);
  });
  test("disabling cancels queued deliveries and stale settings cannot overwrite", () => {
    const sub = subscribe();
    seed();
    store.ingest("articles", {}, [article(game)], [], now);
    store.saveSubscription({ ...sub, enabled: false }, sub.revision, now + 100);
    expect(store.claim(now + 100)).toBeNull();
    expect(() => store.saveSubscription(sub, sub.revision)).toThrow(
      NewsConflictError,
    );
  });
  test("one shared subscription per channel with optimistic concurrency", () => {
    const sub = {
      ...newSubscription("123", "tw"),
      id: "channel:456",
      scope: "channel" as const,
      channelId: "456",
      guildId: "789",
      enabled: true,
    };
    store.saveSubscription(sub, 0, now);
    expect(() =>
      store.saveSubscription({ ...sub, userId: "other-admin" }, 0, now),
    ).toThrow(NewsConflictError);
    expect(store.subscriptions()).toHaveLength(1);
  });
  test("empty categories rejected", () => {
    expect(() =>
      store.saveSubscription(
        { ...newSubscription("123", "tw"), categories: [] },
        0,
      ),
    ).toThrow("empty_categories");
  });
  test("language mismatch and expired events never deliver", () => {
    subscribe();
    seed();
    store.ingest(
      "articles",
      {},
      [
        article(game, "1", { locale: "en" }),
        article(game, "2", { publishedAt: now - 86_400_001 }),
      ],
      [],
      now,
    );
    expect(store.claim(now)).toBeNull();
  });
  test("successful deliveries survive restarting database connection", () => {
    const dir = mkdtempSync(join(tmpdir(), "news-test-")),
      path = join(dir, "news.sqlite");
    try {
      const db = new NewsStore(path);
      db.saveSubscription(
        { ...newSubscription("123", "tw"), enabled: true },
        0,
        now - 1000,
      );
      db.ingest("articles", {}, [], [], now - 1000);
      db.ingest("articles", {}, [article(game)], [], now);
      db.finish(db.claim(now)!, "sent", null, now);
      db.close();
      const reopened = new NewsStore(path);
      reopened.ingest("articles", {}, [article(game)], [], now + 1);
      expect(reopened.claim(now + 300_000)).toBeNull();
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("temporary send failure retries; permanent failure disables the destination", async () => {
    subscribe();
    seed();
    store.ingest("articles", {}, [article(game)], [], now);
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce({ code: 50007 });
    const service = new NewsService(
      store,
      new NewsSources(game),
      send,
      () => {},
    );
    await service.drain(now);
    expect(store.getSubscription("dm:123")?.enabled).toBe(true);
    await service.drain(now + 29_999);
    expect(send).toHaveBeenCalledTimes(1);
    await service.drain(now + 30_000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.getSubscription("dm:123")?.invalidReason).toBe("cannot_dm");
  });
  test("notifications never parse mentions in article content and only allow selected role", () => {
    const sub = subscribe(),
      event = article(game, "1", { summary: "@everyone <@123> <@&456>" });
    const payload = deliveryPayload(event, sub);
    expect(payload.allowed_mentions).toEqual({
      parse: [],
      users: [],
      roles: [],
      replied_user: false,
    });
    expect(
      deliveryPayload(event, { ...sub, scope: "channel", roleId: "456" })
        .allowed_mentions.roles,
    ).toEqual(["456"]);
    expect(deliveryPayload(event, sub).nonce).toBe(payload.nonce);
    expect(payload.enforce_nonce).toBe(true);
  });
  test("maintenance failure retains state and never signals maintenance ended", async () => {
    const sources = new NewsSources(game);
    jest
      .spyOn(sources, "updates")
      .mockResolvedValue({ main: "1.0.0", preload: null });
    jest
      .spyOn(sources, "maintenance")
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("timeout"));
    const service = new NewsService(
      store,
      sources,
      async () => {},
      () => {},
    );
    await service.pollUpdates(now);
    await service.pollUpdates(now + 120_000);
    expect(store.state("maintenance")).toEqual({ active: true, cycle: 1 });
    expect(store.event(`${game}:maintenance_end:1`)).toBeNull();
  });
  test("version comparison, no-preload transition, and repeated preload", () => {
    const initial = evaluateUpdates(
      game,
      null,
      { main: "1.9.0", preload: null },
      now,
    );
    expect(initial.events).toEqual([]);
    const preload = evaluateUpdates(
      game,
      initial.state,
      { main: "1.9.0", preload: "1.10.0" },
      now,
    );
    expect(preload.events.map((e) => e.kind)).toEqual(["preload"]);
    const removed = evaluateUpdates(
      game,
      preload.state,
      { main: "1.9.0", preload: null },
      now,
    );
    expect(
      evaluateUpdates(
        game,
        removed.state,
        { main: "1.9.0", preload: "1.10.0" },
        now,
      ).events,
    ).toEqual([]);
    expect(
      evaluateUpdates(
        game,
        preload.state,
        { main: "1.10.0", preload: null },
        now,
      ).events.map((e) => e.kind),
    ).toEqual(["update"]);
    const old: UpdateState = {
      main: "1.10.0",
      preload: null,
      highestPreload: "1.10.0",
    };
    expect(
      evaluateUpdates(game, old, { main: "1.9.0", preload: null }, now).state
        .main,
    ).toBe("1.10.0");
  });
  test("maintenance cycle emits each actual transition once", () => {
    const start = evaluateMaintenance(
      game,
      { active: false, cycle: 0 },
      true,
      "1.0.0",
      now,
    );
    expect(start.events[0]?.kind).toBe("maintenance_start");
    expect(
      evaluateMaintenance(game, start.state, true, "1.0.0", now).events,
    ).toEqual([]);
    expect(
      evaluateMaintenance(game, start.state, false, "1.0.0", now).events[0]
        ?.kind,
    ).toBe("maintenance_end");
  });
});

test.each([
  ["「天外衛星通訊」| #Saber", "character_reveal"], // HoYoLAB 38584449
  ["角色預覽 | 砂金•戲浪", "character"], // 46570570
  ["代理人機制介紹｜克拉蕾篇", "character"], // 46593088
  ["《絕區零》克拉蕾角色展示｜不想培訓，但攻略已寫好", "character"], // 46570955
  ["Agent Record | Pyrois", "character_reveal"], // 44836786
  ["3.2版本限時頻道（上期）", "banner"], // 46604530
  ["「天使應援大作戰」活動說明", "event"], // 46604642
  ["《絕區零》3.2版本前瞻特別節目｜情報總覽", "preview"], // 46486178
  ["2026年9月月曆桌布", "other"],
  ["Agent Mechanics Intro | Claret", "character"],
  ["Character Trailer", "character"],
  ["事前ダウンロードのお知らせ", "preload"],
  ["사전 다운로드 안내", "preload"],
  ["Pré-téléchargement disponible", "preload"],
  ["Thông báo tải trước", "preload"],
])("classifies official title %s", (title, category) =>
  expect(classifyArticle(title)).toContain(category),
);

test("character giveaways do not become reveals or character intros", () => {
  const categories = classifyArticle(
    "【星瓊獎勵】參與銀狼LV.999角色登場討論 贏星瓊",
  );
  expect(categories).toEqual(["event"]);
  expect(classifyArticle("Agent Record giveaway event")).toEqual(["event"]);
});

test("paginated feeds process more than 25 items and numeric cursors", async () => {
  const first = Array.from({ length: 25 }, (_, i) =>
    article("zzz", String(i + 1)),
  );
  const fetch = jest
    .fn()
    .mockResolvedValueOnce({
      events: first,
      ids: first.map((e) => e.id),
      cursor: "25",
      last: false,
    })
    .mockResolvedValueOnce({
      events: [article("zzz", "26")],
      ids: ["known"],
      cursor: "50",
      last: false,
    });
  const result = await collectArticles(
    fetch,
    (id) => id === "known",
    true,
    now,
  );
  expect(result.events).toHaveLength(26);
  expect(fetch).toHaveBeenLastCalledWith("25");
});

test("invalid pagination aborts the scan rather than losing a checkpoint", async () => {
  const fetch = jest.fn().mockResolvedValue({
    events: [article("zzz")],
    ids: ["1"],
    cursor: "25",
    last: false,
  });
  await expect(collectArticles(fetch, () => false, true, now)).rejects.toThrow(
    "article_cursor_loop",
  );
});

test.each([
  {},
  { application_maintenance: undefined },
  { application_maintenance: false },
  { application_maintenance: [] },
])("malformed maintenance is unknown: %j", async (data) => {
  const source = new NewsSources("zzz", async () => data);
  await expect(source.maintenance("1.0.0")).rejects.toThrow(
    "maintenance_unknown",
  );
});

test("sources use global game tags and the agreed HSR maintenance proxy", async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce({
      game_branches: [
        {
          game: { id: "4ziysqXOQ8" },
          main: { tag: "4.5.0" },
          pre_download: null,
        },
      ],
    })
    .mockResolvedValueOnce({ application_maintenance: null });
  const source = new NewsSources("hsr", request);
  expect(await source.updates()).toEqual({ main: "4.5.0", preload: null });
  expect(await source.maintenance("4.5.0")).toBe(false);
  expect(request.mock.calls[1]?.[1]).toMatchObject({
    "x-rpc-cg_game_biz": "hkrpg_cn",
  });
});

test("nonofficial posts excluded; image-only article renders without description", () => {
  const source = new NewsSources("zzz");
  const raw = {
    post: {
      post_id: "1",
      subject: "代理人檔案",
      created_at: now / 1000,
      content: "zh-tw",
    },
    user: { uid: "219270333" },
    image_list: [{ url: "https://example.com/character.png" }],
  };
  const event = source.article(raw, "tw")!;
  expect(event.summary).toBe("");
  expect(event.image).toBe("https://example.com/character.png");
  expect(source.article({ ...raw, user: { uid: "fan" } }, "tw")).toBeNull();
});
