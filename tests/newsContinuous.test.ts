import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  NewsPublisher,
  publicationId,
} from "../src/utilities/news/publication.js";
import {
  MESSAGE_LAYOUT_VERSION,
  linkedTitle,
  renderMessage,
  type NewsMessageDocument,
} from "../src/utilities/news/messages.js";
import { NewsStore } from "../src/utilities/news/store.js";
import { NewsSources } from "../src/utilities/news/sources.js";
import { cropBoundaries } from "../src/utilities/news/media.js";
import { parseArticle } from "../src/utilities/news/article.js";
import {
  newSubscription,
  type NewsEvent,
  type NewsGame,
  GAME_CONFIG,
} from "../src/utilities/news/types.js";
const event = (game: NewsGame, id = "1"): NewsEvent => ({
  id: `post:${game}:tw:${id}`,
  game,
  source: "hoyolab",
  locale: "tw",
  categories: ["other"],
  publishedAt: 1787919305000,
  title: "🌟 代理人 [檔案] <:Roxy:12345>｜洛克茜 🇹🇼 1️⃣",
  authorName: "絕區零",
  summary: "",
  image: null,
  url: `https://www.hoyolab.com/article/${id}`,
  kind: "article",
  version: null,
});
const document = (e: NewsEvent): NewsMessageDocument => ({
  version: `${e.id}-doc`,
  layout: MESSAGE_LAYOUT_VERSION,
  event: e,
  locale: "tw",
  parts: [
    { blocks: [{ type: "markdown", text: "First 😀" }] },
    { blocks: [{ type: "markdown", text: "Second" }] },
    { blocks: [{ type: "markdown", text: "Third" }] },
  ],
});
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "news-continuous-"));
});
afterEach(() => rmSync(directory, { force: true, recursive: true }));
test("linked title strips emoji only from labels, escapes Markdown and uses original author/date", () => {
  const e = event("zzz"),
    doc = document(e),
    first = renderMessage(doc, 0, "123").body,
    next = renderMessage(doc, 1, "123").body;
  const firstJson = JSON.stringify(first),
    nextJson = JSON.stringify(next);
  expect(linkedTitle(e.title, e.url)).not.toMatch(/🌟|<:|🇹🇼|1️⃣/);
  expect(linkedTitle(e.title, e.url)).toContain("\\[檔案\\]");
  expect(firstJson).toContain("絕區零 - <t:1787919305:f>");
  expect(firstJson).toContain("First 😀");
  expect(firstJson).not.toMatch(/accent_color|官方原文|news:read|國際服|第 1/);
  expect(nextJson).not.toMatch(/代理人|hoyolab|絕區零|news:read|<@&/);
  expect(first.allowed_mentions.roles).toEqual(["123"]);
  expect(next.allowed_mentions.roles).toEqual([]);
  expect(next.flags).toBe(32768 | 4096);
});
test.each([
  "update",
  "preload",
  "maintenance_start",
  "maintenance_end",
] as const)(
  "%s card contains only title, game, version, icon and simulation label",
  (kind) => {
    const e = { ...event("hsr"), kind, version: "4.5.0", simulated: true },
      doc = { ...document(e), parts: [{ blocks: [] }] };
    const result = renderMessage(doc, 0),
      json = JSON.stringify(result.body);
    expect(json).toContain('"type":9');
    expect(json).toContain('"type":11');
    expect(json).toContain("4.5.0");
    expect(json).toContain("模擬事件");
    expect(json).not.toMatch(/accent_color|偵測|<t:|news:read|官方原文/);
    expect(result.files[0]?.name).toBe("news-hsr.jpg");
  },
);
test("video metadata never leaks into HTML or structured text, while ordinary text and cover remain", () => {
  const raw = '{"video":"571178","describe":""}',
    cover = "https://example.com/cover.jpg";
  expect(parseArticle(null, raw, cover).blocks).toEqual([
    expect.objectContaining({ type: "image", url: cover }),
  ]);
  const mixed = parseArticle(
    JSON.stringify([{ insert: `Before\n${raw}\nAfter 😄` }]),
    "",
    null,
  );
  expect(mixed.blocks).toEqual([
    { type: "markdown", text: "Before\n\nAfter 😄" },
  ]);
  const html = parseArticle(
    null,
    `<p>Before</p><p>${raw.replace(/"/g, "&quot;")}</p><p>After</p>`,
    cover,
  );
  expect(JSON.stringify(html)).not.toContain("571178");
  expect(JSON.stringify(html)).toContain("Before");
});
test.each([
  [13075, 7],
  [11351, 6],
])("1080×%i is fully covered by %i equal-width crops", (height, count) => {
  const cuts = cropBoundaries(1080, height),
    heights = cuts.slice(1).map((y, i) => y - cuts[i]!);
  expect(heights).toHaveLength(count);
  expect(cuts[0]).toBe(0);
  expect(cuts.at(-1)).toBe(height);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  expect(heights.reduce((s, h) => s + h, 0)).toBe(height);
});

describe.each(["hsr", "zzz"] as NewsGame[])("%s multipart delivery", (game) => {
  function setup(store: NewsStore, post: ReturnType<typeof jest.fn>) {
    const sub = store.saveSubscription(
      {
        ...newSubscription("user", "tw"),
        id: "channel:channel",
        scope: "channel",
        channelId: "channel",
        guildId: "guild",
        enabled: true,
        categories: ["other"],
        roleId: "123",
      },
      0,
    );
    const publisher = new NewsPublisher(
      { rest: { post } } as any,
      store,
      new NewsSources(game),
    );
    jest.spyOn(publisher, "prepare").mockImplementation(async (e) => {
      const doc = document(e);
      store.putDocument(doc.version, doc);
      return doc;
    });
    return { publisher, sub };
  }
  test("failed middle part resumes from saved progress after process restart without resending first", async () => {
    const path = join(directory, "news.sqlite"),
      a = new NewsStore(path),
      post = jest
        .fn()
        .mockResolvedValueOnce({ id: "one" })
        .mockRejectedValueOnce(new Error("network"));
    const { publisher, sub } = setup(a, post),
      e = event(game);
    await expect(publisher.send(e, sub)).rejects.toThrow("network");
    expect(a.publicationParts(publicationId(e, sub))).toEqual([
      { index: 0, messageId: "one" },
    ]);
    a.close();
    const b = new NewsStore(path),
      send = jest
        .fn()
        .mockResolvedValueOnce({ id: "two" })
        .mockResolvedValueOnce({ id: "three" }),
      resumed = new NewsPublisher(
        { rest: { post: send } } as any,
        b,
        new NewsSources(game),
      );
    expect(await resumed.send(e, sub)).toEqual(["one", "two", "three"]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(send.mock.calls[0]?.[1])).toContain("Second");
    expect(send.mock.calls[0]?.[1].body.flags).toBe(32768 | 4096);
    expect(b.publication(publicationId(e, sub))?.status).toBe("sent");
    await resumed.send(e, sub);
    expect(send).toHaveBeenCalledTimes(2);
    b.close();
  });
  test("another event cannot interleave with a partially delivered article", async () => {
    const store = new NewsStore(":memory:"),
      post = jest
        .fn()
        .mockResolvedValueOnce({ id: "one" })
        .mockRejectedValueOnce(new Error("network"));
    const { publisher, sub } = setup(store, post);
    await expect(publisher.send(event(game), sub)).rejects.toThrow("network");
    await expect(publisher.send(event(game, "2"), sub)).rejects.toThrow(
      "news_destination_pending",
    );
    expect(post).toHaveBeenCalledTimes(2);
    post.mockResolvedValue({ id: "rest" });
    await publisher.send(event(game), sub);
    await publisher.send(event(game, "2"), sub);
    expect(post).toHaveBeenCalledTimes(7);
    store.close();
  });
  test("disabling or revising the subscription cancels remaining parts at send boundary", async () => {
    const store = new NewsStore(":memory:"),
      post = jest.fn(),
      { publisher, sub } = setup(store, post);
    post.mockImplementationOnce(async () => {
      store.saveSubscription({ ...sub, enabled: false }, sub.revision);
      return { id: "first" };
    });
    expect(await publisher.send(event(game), sub)).toEqual(["first"]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(store.publication(publicationId(event(game), sub))?.status).toBe(
      "cancelled",
    );
    store.close();
  });
  test("simultaneous calls for the same article only send each part once", async () => {
    const store = new NewsStore(":memory:"),
      post = jest.fn(async (): Promise<{ id: string }> => {
        await new Promise((r) => setTimeout(r, 10));
        return { id: `m-${post.mock.calls.length}` };
      });
    const { publisher, sub } = setup(store, post);
    await Promise.all([
      publisher.send(event(game), sub),
      publisher.send(event(game), sub),
    ]);
    expect(post).toHaveBeenCalledTimes(3);
    expect(
      new Set(post.mock.calls.map((call: any) => call[1].body.nonce)).size,
    ).toBe(3);
    store.close();
  });
  test("manual reading edits first message, follows with ephemeral silent parts, and creates no reader state", async () => {
    const store = new NewsStore(":memory:"),
      post = jest.fn(async () => ({ id: "follow" })),
      patch = jest.fn(async () => ({}));
    const { publisher } = setup(store, post);
    (publisher.client.rest as any).patch = patch;
    await publisher.open(
      { applicationId: "app", token: "token" } as any,
      event(game),
      "tw",
      "news:session:home",
    );
    expect(patch).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(patch.mock.calls)).toContain("news:session:home");
    expect(JSON.stringify(post.mock.calls)).not.toContain("news:session:home");
    expect((post.mock.calls[0] as any)[1].body.flags).toBe(32768 | 4096 | 64);
    store.close();
  });
  test("new cache fetches author and reparses content instead of reusing old documents", async () => {
    const store = new NewsStore(":memory:"),
      e = event(game);
    store.putDocument(`article:${e.id}:tw`, { event: e, pages: [] });
    const get = jest.fn(async () => ({
      post: {
        post: {
          post_id: "1",
          subject: "Title",
          content: '{"video":"571178","describe":""}',
          created_at: 1787919305,
        },
        user: { uid: GAME_CONFIG[game].officialUid, nickname: "Official name" },
      },
    }));
    const publisher = new NewsPublisher(
        {} as any,
        store,
        new NewsSources(game, get),
      ),
      doc = await publisher.prepare(e, "tw");
    expect(get).toHaveBeenCalledTimes(1);
    expect(doc.event.authorName).toBe("Official name");
    expect(doc.parts).toEqual([{ blocks: [] }]);
    expect(JSON.stringify(renderMessage(doc, 0).body)).not.toContain("571178");
    store.close();
  });
});
