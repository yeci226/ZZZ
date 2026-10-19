import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import {
  parseArticle,
  type ArticleBlock,
} from "../src/utilities/news/article.js";
import {
  cropBoundaries,
  isAnimated,
  NewsMediaCache,
} from "../src/utilities/news/media.js";
import {
  paginate,
  renderPage,
  splitMarkdown,
  type NewsDocument,
} from "../src/utilities/news/presentation.js";
import { NewsReader, type ReadingState } from "../src/utilities/news/reader.js";
import { NewsStore } from "../src/utilities/news/store.js";
import { NewsSources } from "../src/utilities/news/sources.js";
import {
  newSubscription,
  GAME_CONFIG,
  type NewsEvent,
  type NewsGame,
} from "../src/utilities/news/types.js";
const picture = (n: number): Extract<ArticleBlock, { type: "image" }> => ({
  type: "image",
  url: `https://upload-os-bbs.hoyolab.com/${n}.png`,
  identity: String(n),
  width: 100,
  height: 100,
});
const event = (game: NewsGame): NewsEvent => ({
  id: `post:${game}:tw:1`,
  game,
  source: "hoyolab",
  locale: "tw",
  categories: ["preview"],
  publishedAt: Date.now(),
  title: "標題",
  summary: "",
  image: null,
  url: "https://www.hoyolab.com/article/1",
  kind: "article",
  version: null,
});
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "news-v2-"));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

test("structured body replaces locale marker and preserves formatting, video and two image positions", () => {
  const doc = parseArticle(
    JSON.stringify([
      { insert: "Title" },
      { insert: "\n", attributes: { header: 1 } },
      {
        insert: "Bold",
        attributes: {
          bold: true,
          italic: true,
          strike: true,
          link: "https://example.com",
        },
      },
      { insert: "\n" },
      {
        insert: { image: picture(1).url },
        attributes: { width: 1080, height: 13075 },
      },
      { insert: "\n\n" },
      {
        insert: { image: picture(2).url },
        attributes: { width: 1080, height: 11351 },
      },
      { insert: { video: "https://youtube.com/watch?v=123" } },
    ]),
    "zh-tw",
    picture(9).url,
  );
  expect(doc.blocks.map((b) => b.type)).toEqual([
    "markdown",
    "image",
    "image",
    "video",
  ]);
  expect(doc.blocks[0]).toMatchObject({
    text: expect.stringContaining("# Title"),
  });
  expect(doc.blocks[0]).toMatchObject({
    text: expect.stringContaining("[~~***Bold***~~](<https://example.com/>)"),
  });
  expect(
    doc.blocks.filter((b) => b.type === "image").map((b) => b.height),
  ).toEqual([13075, 11351]);
});
test("HTML fallback preserves nested formatting, code, lists, images and source links", () => {
  const doc = parseArticle(
    "broken",
    '<h2>標題</h2><p><strong>A</strong> <em>B</em> <del>C</del></p><ul><li>One</li><li>Two</li></ul><blockquote>Quote</blockquote><pre><code>const a = 1;</code></pre><p><a href="https://example.com">Link</a></p><img src="https://example.com/a.png"><p>middle @everyone</p><img src="https://example.com/b.png"><video src="https://example.com/v.mp4"></video>',
    "https://example.com/a.png",
  );
  expect(doc.blocks.map((b) => b.type)).toEqual([
    "markdown",
    "image",
    "markdown",
    "image",
    "video",
  ]);
  const text = JSON.stringify(doc.blocks);
  for (const expected of [
    "## 標題",
    "**A**",
    "*B*",
    "~~C~~",
    "- One",
    "> Quote",
    "```",
    "[Link](<https://example.com/>)",
    "@\u200beveryone",
  ])
    expect(text).toContain(expected);
  expect(parseArticle(null, "zh-tw", picture(1).url).blocks).toHaveLength(1);
});

test.each([1, 4, 5, 10, 11])(
  "%i consecutive originals are grouped before page limits",
  async (count) => {
    const cache = new NewsMediaCache(directory);
    jest
      .spyOn(cache, "prepare")
      .mockImplementation(async (b) => [{ ...b, original: b.url }]);
    const blocks = await cache.blocks(
      Array.from({ length: count }, (_, i) => picture(i)),
      "https://www.hoyolab.com/article/1",
    );
    expect(
      blocks.map((b) => (b.type === "gallery" ? b.media.length : 0)),
    ).toEqual(
      count <= 4 ? Array(count).fill(1) : count <= 10 ? [count] : [10, 1],
    );
    for (const page of paginate(blocks)) {
      const galleries = page.blocks.filter((b) => b.type === "gallery");
      expect(galleries.length).toBeLessThanOrEqual(4);
      expect(galleries.flatMap((b) => b.media).length).toBeLessThanOrEqual(10);
    }
  },
);
test("nonempty text and long images break runs; blank lines do not count", async () => {
  const cache = new NewsMediaCache(directory);
  jest.spyOn(cache, "prepare").mockImplementation(async (b) =>
    b.identity === "99"
      ? [0, 1, 2].map((i) => ({
          ...b,
          original: b.url,
          slice: {
            top: i * 100,
            bottom: (i + 1) * 100,
            hash: "hash",
            version: "v1",
          },
        }))
      : [{ ...b, original: b.url }],
  );
  const blocks = await cache.blocks(
    [
      picture(1),
      { type: "markdown", text: "\n\n" },
      picture(2),
      picture(99),
      picture(3),
      { type: "markdown", text: "正文" },
      picture(4),
    ],
    "https://www.hoyolab.com/article/1",
  );
  expect(
    blocks.filter((b) => b.type === "gallery").map((b) => b.media.length),
  ).toEqual([1, 1, 1, 1, 1, 1, 1]);
});
test("cropping covers every row, uses equal heights and caches full resolution slices", async () => {
  expect(cropBoundaries(100, 800)).toEqual([0, 160, 320, 480, 640, 800]);
  const canvas = createCanvas(100, 800),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f00";
  ctx.fillRect(0, 0, 100, 800);
  const download = jest.fn(async () => canvas.toBuffer("image/png"));
  const cache = new NewsMediaCache(directory, download);
  const result = await cache.prepare({ ...picture(1), height: 800 });
  expect(result[0]?.slice?.top).toBe(0);
  expect(result.at(-1)?.slice?.bottom).toBe(800);
  expect(result.reduce((sum, m) => sum + m.height, 0)).toBe(800);
  expect(
    result.every(
      (m, i) =>
        m.width === 100 &&
        (i === 0 || m.slice!.top === result[i - 1]!.slice!.bottom),
    ),
  ).toBe(true);
  expect(
    await new NewsMediaCache(directory, download).prepare(picture(1)),
  ).toEqual(result);
  expect(download).toHaveBeenCalledTimes(1);
});
test("animated originals stay intact; one failed image does not discard following content", async () => {
  const gif = Buffer.from("GIF89aanimated-data");
  expect(isAnimated(gif)).toBe(true);
  expect(
    isAnimated(
      Buffer.concat([Buffer.from("\x89PNG", "binary"), Buffer.from("acTL")]),
    ),
  ).toBe(true);
  const cache = new NewsMediaCache(directory, async (url) => {
    if (url.endsWith("2.png")) throw new Error("timeout");
    return gif;
  });
  const result = await cache.prepare({ ...picture(1), height: 900 });
  expect(result).toHaveLength(1);
  expect(result[0]?.slice).toBeUndefined();
  const blocks = await cache.blocks(
    [picture(2), { type: "markdown", text: "Still here" }, picture(3)],
    "https://www.hoyolab.com/article/1",
  );
  expect(blocks[0]).toMatchObject({
    type: "markdown",
    text: expect.stringContaining(picture(2).url),
  });
  expect(blocks.at(-1)?.type).toBe("gallery");
});
test("long Markdown remains within limits with balanced fences and inline styles", () => {
  for (const text of [
    "**" + "字".repeat(9000) + "**",
    "```ts\n" + "const foo = 1;\n".repeat(600) + "\n```",
    "- List item\n".repeat(1000),
  ]) {
    const chunks = splitMarkdown(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2400);
      expect((chunk.match(/```/g)?.length ?? 0) % 2).toBe(0);
    }
  }
});

describe.each(["hsr", "zzz"] as NewsGame[])("%s persistent reader", (game) => {
  function setup(store: NewsStore) {
    const e = event(game);
    const document: NewsDocument = {
      version: "fixed",
      event: e,
      locale: "tw",
      pages: [
        { blocks: [{ type: "markdown", text: "first" }] },
        { blocks: [{ type: "markdown", text: "second" }] },
        { blocks: [{ type: "markdown", text: "third" }] },
      ],
    };
    const state: ReadingState = {
      id: "abc",
      documentId: "fixed",
      messageId: "message",
      channelId: "channel",
      guildId: "guild",
      ownerId: null,
      page: 0,
      back: null,
    };
    store.putDocument("fixed", document);
    store.putReader("abc", state);
    return new NewsReader(
      {} as any,
      store,
      new NewsSources(game),
      new NewsMediaCache(directory),
    );
  }
  test("serialized shared clicks persist across separate SQLite connections and restart", async () => {
    const path = join(directory, "test.sqlite"),
      a = new NewsStore(path),
      b = new NewsStore(path);
    const readerA = setup(a),
      readerB = new NewsReader({} as any, b, new NewsSources(game));
    const seen: number[] = [];
    const edit = async (
      _doc: import("../src/utilities/news/reader.js").NewsReadableDocument,
      state: ReadingState,
    ) => {
      await new Promise((r) => setTimeout(r, 20));
      seen.push(state.page);
    };
    await Promise.all([
      readerA.turn("abc", "channel", "message", "a", "guild", "next", edit),
      readerB.turn("abc", "channel", "message", "b", "guild", "next", edit),
    ]);
    expect(seen).toEqual([1, 2]);
    a.close();
    b.close();
    const restarted = new NewsStore(path);
    expect(restarted.reader<ReadingState>("abc")?.page).toBe(2);
    const reader = new NewsReader({} as any, restarted, new NewsSources(game));
    await reader.turn("abc", "channel", "message", "c", "guild", "prev", edit);
    expect(seen).toEqual([1, 2, 1]);
    restarted.close();
  });
  test("destination and DM ownership enforced; failed edits do not advance state", async () => {
    const store = new NewsStore(":memory:"),
      reader = setup(store),
      edit = jest.fn(async () => {});
    for (const args of [
      ["bad", "message", "user", "guild"],
      ["channel", "bad", "user", "guild"],
      ["channel", "message", "user", "bad"],
    ])
      expect(
        await reader.turn(
          "abc",
          args[0]!,
          args[1]!,
          args[2]!,
          args[3]!,
          "next",
          edit,
        ),
      ).toBe(false);
    store.putReader("abc", {
      ...store.reader<ReadingState>("abc"),
      ownerId: "owner",
    });
    expect(
      await reader.turn(
        "abc",
        "channel",
        "message",
        "other",
        "guild",
        "next",
        edit,
      ),
    ).toBe(false);
    await expect(
      reader.turn(
        "abc",
        "channel",
        "message",
        "owner",
        "guild",
        "next",
        async () => {
          throw new Error("network");
        },
      ),
    ).rejects.toThrow("network");
    expect(store.reader<ReadingState>("abc")?.page).toBe(0);
    expect(edit).not.toHaveBeenCalled();
    store.close();
  });
  test("V2 payload clears old attachments and permits role mention on initial send only", () => {
    const store = new NewsStore(":memory:");
    setup(store);
    const doc = store.document<NewsDocument>("fixed")!;
    doc.pages[0]!.blocks.push({
      type: "gallery",
      media: [
        {
          url: "attachment://first.png",
          file: "/tmp/first.png",
          name: "first.png",
          original: picture(1).url,
          width: 100,
          height: 100,
        },
      ],
    });
    const first = renderPage(doc, 0, "abc", "123").body,
      next = renderPage(doc, 1, "abc").body;
    expect(first.flags).toBe(32768);
    expect(first).not.toHaveProperty("embeds");
    expect(first).not.toHaveProperty("content");
    expect(first.allowed_mentions.roles).toEqual(["123"]);
    expect(first.attachments).toEqual([]);
    expect(JSON.stringify(first)).toContain(picture(1).url);
    expect(
      renderPage(doc, 0, "abc", "123", null, { mediaDelivery: "attachment" })
        .body.attachments,
    ).toHaveLength(1);
    expect(next.allowed_mentions.roles).toEqual([]);
    expect(next.attachments).toEqual([]);
    store.close();
  });
  test("full fetch failures retry, same article shares cache, edits during preparation cancel send", async () => {
    const raw = {
      post: {
        post_id: "1",
        subject: "title",
        created_at: 123,
        content: "zh-tw",
        structured_content: JSON.stringify([{ insert: "full text" }]),
      },
      user: { uid: GAME_CONFIG[game].officialUid },
    };
    const get = jest
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue({ post: raw });
    const source = new NewsSources(game, get),
      store = new NewsStore(":memory:"),
      rest = { post: jest.fn() };
    const reader = new NewsReader(
      { rest } as any,
      store,
      source,
      new NewsMediaCache(directory),
    );
    await expect(reader.prepare(event(game), "tw")).rejects.toThrow("timeout");
    await Promise.all([
      reader.prepare(event(game), "tw"),
      reader.prepare(event(game), "tw"),
    ]);
    expect(get).toHaveBeenCalledTimes(2);
    const sub = store.saveSubscription(
      { ...newSubscription("user", "tw"), enabled: true },
      0,
    );
    store.saveSubscription({ ...sub, enabled: false }, sub.revision);
    await reader.send(event(game), sub);
    expect(rest.post).not.toHaveBeenCalled();
    store.close();
  });
});

test.each([
  ["hsr", "46570956"],
  ["zzz", "46486178"],
])("real %s official structured article fixture", (game, id) => {
  const raw = JSON.parse(
    readFileSync(
      join(__dirname, "fixtures", "news", `${game}-${id}.json`),
      "utf8",
    ),
  );
  const document = parseArticle(
    raw.post.structured_content,
    raw.post.content,
    raw.image_list?.[0]?.url ?? null,
  );
  if (game === "zzz") {
    const images = document.blocks.filter((b) => b.type === "image");
    expect(images.map((b) => [b.width, b.height])).toEqual([
      [1080, 13075],
      [1080, 11351],
    ]);
    expect(document.blocks[0]).toMatchObject({
      type: "markdown",
      text: expect.stringContaining("奇蹟不會獨自出現"),
    });
  } else {
    expect(document.blocks.map((b) => b.type)).toEqual([
      "image",
      "markdown",
      "video",
      "markdown",
    ]);
    expect(document.blocks[2]).toMatchObject({
      url: "https://www.youtube.com/embed/0lb2dtaMPOk",
    });
  }
});

test("reading interaction acknowledges once and edits the same webhook message with mentions disabled", async () => {
  const store = new NewsStore(":memory:"),
    id = "a".repeat(24);
  const doc: NewsDocument = {
    version: "interaction",
    event: event("zzz"),
    locale: "tw",
    pages: [
      { blocks: [] },
      { blocks: [{ type: "markdown", text: "Next page" }] },
    ],
  };
  store.putDocument(doc.version, doc);
  store.putReader(id, {
    id,
    documentId: doc.version,
    messageId: "message",
    channelId: "channel",
    guildId: "guild",
    ownerId: null,
    page: 0,
    back: null,
  });
  const rest = { patch: jest.fn(async () => ({})) },
    reader = new NewsReader({ rest } as any, store, new NewsSources("zzz"));
  const interaction: any = {
    isMessageComponent: () => true,
    customId: `news:read:zzz:${id}:next`,
    channelId: "channel",
    guildId: "guild",
    message: { id: "message" },
    user: { id: "reader" },
    applicationId: "app",
    token: "interaction-token",
    deferUpdate: jest.fn(async () => {}),
    followUp: jest.fn(async () => {}),
  };
  await reader.handle(interaction);
  expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
  expect(interaction.followUp).not.toHaveBeenCalled();
  expect(rest.patch).toHaveBeenCalledWith(
    "/webhooks/app/interaction-token/messages/%40original",
    expect.objectContaining({
      body: expect.objectContaining({
        flags: 32768,
        attachments: [],
        allowed_mentions: expect.objectContaining({ roles: [], parse: [] }),
      }),
    }),
  );
  expect(store.reader<ReadingState>(id)?.page).toBe(1);
  interaction.message.id = "other-message";
  await reader.handle(interaction);
  expect(rest.patch).toHaveBeenCalledTimes(1);
  expect(interaction.followUp).toHaveBeenCalledWith(
    expect.objectContaining({ flags: 64 }),
  );
  store.close();
});
