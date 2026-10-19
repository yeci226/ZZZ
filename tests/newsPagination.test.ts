import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { paginateArticle } from "../src/utilities/news/pagination.js";
import {
  renderMessage,
  type NewsMessageDocument,
} from "../src/utilities/news/messages.js";
import type { DisplayBlock, NewsMedia } from "../src/utilities/news/media.js";
import {
  NewsPublisher,
  publicationId,
} from "../src/utilities/news/publication.js";
import {
  NewsReader,
  readingRequest,
  type ReadingState,
} from "../src/utilities/news/reader.js";
import { NewsStore } from "../src/utilities/news/store.js";
import { NewsSources } from "../src/utilities/news/sources.js";
import {
  newSubscription,
  type NewsEvent,
  type NewsGame,
} from "../src/utilities/news/types.js";
const text = (text: string): DisplayBlock => ({ type: "markdown", text });
const media = (i: number, bytes = 100): NewsMedia => ({
  url: `https://example.com/${i}.png`,
  original: `https://example.com/${i}.png`,
  width: 1080,
  height: 1800,
  bytes,
});
const images = (
  count: number,
  intent: "single" | "multi" | "slice",
  runId = "r",
  start = 0,
): DisplayBlock[] =>
  Array.from({ length: count }, (_, i) => ({
    type: "gallery",
    intent,
    runId,
    media: [
      {
        ...media(start + i),
        ...(intent === "slice"
          ? {
              slice: {
                top: i * 1800,
                bottom: (i + 1) * 1800,
                hash: runId,
                version: "v2-equal",
              },
            }
          : {}),
      },
    ],
  }));
const galleries = (blocks: DisplayBlock[]) =>
  blocks.filter((b) => b.type === "gallery");
const event = (game: NewsGame): NewsEvent => ({
  id: `post:${game}:tw:1`,
  game,
  kind: "article",
  source: "hoyolab",
  locale: "tw",
  categories: ["other"],
  publishedAt: 1787919305000,
  title: "🎥 Title [PV]",
  authorName: "Official",
  summary: "",
  image: null,
  url: "https://www.hoyolab.com/article/1",
  version: null,
});
const document = (game: NewsGame): NewsMessageDocument => ({
  version: "fixed",
  layout: "paged-v1",
  event: event(game),
  locale: "tw",
  parts: paginateArticle(images(11, "slice")),
});

test("Koleda originals stay on one page with three single galleries", () => {
  const blocks: DisplayBlock[] = [
    text("Intro"),
    ...[416272, 7942258, 8013348].map((bytes, i) => ({
      type: "gallery" as const,
      intent: "single" as const,
      runId: "koleda",
      media: [media(i, bytes)],
    })),
  ];
  const pages = paginateArticle(blocks);
  expect(pages).toHaveLength(1);
  expect(galleries(pages[0]!.blocks).map((g) => g.media.length)).toEqual([
    1, 1, 1,
  ]);
});
test("a heading and explanatory paragraph move with the following image group", () => {
  const pages = paginateArticle([
    ...images(3, "single", "cover"),
    text("## Mechanism\nDescription."),
    ...images(2, "single", "mechanism", 3),
  ]);
  expect(pages).toHaveLength(2);
  expect(JSON.stringify(pages[0])).not.toContain("Mechanism");
  expect(
    pages[1]!.blocks.filter((b) => b.type === "markdown").map((b) => b.text),
  ).toEqual(["## Mechanism", "Description."]);
  expect(galleries(pages[1]!.blocks)).toHaveLength(2);
});
test.each([
  [5, [3, 2]],
  [6, [3, 3]],
  [7, [4, 3]],
  [11, [4, 4, 3]],
])(
  "%i crops balance without merging or changing their row coverage",
  (count, expected) => {
    const original = images(count as number, "slice");
    const pages = paginateArticle(original);
    expect(pages.map((p) => galleries(p.blocks).length)).toEqual(expected);
    expect(
      pages.flatMap((p) => galleries(p.blocks).flatMap((g) => g.media)),
    ).toEqual(original.flatMap((b) => (b.type === "gallery" ? b.media : [])));
    expect(
      pages
        .flatMap((p) => galleries(p.blocks))
        .every((g) => g.media.length === 1),
    ).toBe(true);
  },
);
test("ordinary multi run is balanced, single image runs and text separators keep their intent", () => {
  const pages = paginateArticle(images(11, "multi"));
  expect(
    pages.map((p) => galleries(p.blocks).map((g) => g.media.length)),
  ).toEqual([[6], [5]]);
  expect(
    paginateArticle([
      ...images(4, "single"),
      text("new paragraph"),
      ...images(4, "single", "other"),
    ]),
  ).toHaveLength(2);
});
test("byte limits take priority over balanced image counts", () => {
  const blocks: DisplayBlock[] = [
    {
      type: "gallery",
      intent: "multi",
      runId: "large",
      media: [
        media(1, 9 * 1024 ** 2),
        media(2, 9 * 1024 ** 2),
        media(3, 9 * 1024 ** 2),
      ],
    },
  ];
  expect(
    paginateArticle(blocks).map(
      (p) => galleries(p.blocks).flatMap((g) => g.media).length,
    ),
  ).toEqual([2, 1]);
});
test("heading stays with oversized prose and code fences remain balanced", () => {
  const pages = paginateArticle([
    text(
      "## Heading\n" +
        "paragraph ".repeat(500) +
        "\n\n```ts\n" +
        "let x = 1;\n".repeat(400) +
        "```",
    ),
  ]);
  expect(pages.length).toBeGreaterThan(2);
  expect(pages[0]!.blocks[0]).toMatchObject({
    text: expect.stringMatching(/## Heading\n\nparagraph/),
  });
  for (const p of pages)
    for (const b of p.blocks)
      if (b.type === "markdown")
        expect((b.text.match(/^```/gm)?.length ?? 0) % 2).toBe(0);
});
test("each page repeats modern header, has bounded navigation, no source button or accent; single page hides navigation", () => {
  const doc = document("zzz");
  doc.parts.forEach((_, i) => {
    const req = renderMessage(
      doc,
      i,
      null,
      "news:session:home",
      "a".repeat(24),
    );
    const json = JSON.stringify(req.body);
    expect(json).toContain("Official");
    expect(json).toContain("<t:1787919305:f>");
    expect(json).toContain(`第 ${i + 1}/${doc.parts.length} 頁`);
    expect(json).not.toMatch(/🎥|accent_color|官方原文/);
    const row = req.body.components[0]!.components.at(-2) as any;
    expect(row.components[0].disabled).toBe(i === 0);
    expect(row.components).toHaveLength(5);
    expect(row.components[1].disabled).toBe(i === 0);
    expect(row.components[2].disabled).toBe(true);
    expect(row.components[3].disabled).toBe(i === doc.parts.length - 1);
    expect(row.components[4].disabled).toBe(i === doc.parts.length - 1);
    expect(
      (req.body.components[0]!.components.at(-1) as any).components[0]
        .custom_id,
    ).toBe("news:session:home");
  });
  const single = { ...doc, parts: [{ blocks: [] }] };
  expect(
    JSON.stringify(renderMessage(single, 0, null, null, "a".repeat(24))),
  ).not.toContain("上一頁");
});

describe.each(["hsr", "zzz"] as NewsGame[])("%s paged delivery", (game) => {
  const setup = (store: NewsStore, rest: any) => {
    const sub = store.saveSubscription(
      {
        ...newSubscription("owner", "tw"),
        id: "channel:c",
        scope: "channel",
        channelId: "c",
        guildId: "g",
        roleId: "123",
        enabled: true,
      },
      0,
    );
    const publisher = new NewsPublisher(
      { rest } as any,
      store,
      new NewsSources(game),
    );
    const doc = document(game);
    store.putDocument(doc.version, doc);
    jest.spyOn(publisher, "prepare").mockResolvedValue(doc);
    return { sub, publisher, doc, id: publicationId(doc.event, sub) };
  };
  test("one send binds all pages, retries dedupe, concurrent readers serialize and survive restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "paged-news-")),
      path = join(dir, "news.sqlite");
    const a = new NewsStore(path),
      post = jest.fn(async () => ({ id: "message" }));
    const { publisher, sub, doc, id } = setup(a, { post });
    await Promise.all([
      publisher.send(doc.event, sub),
      publisher.send(doc.event, sub),
    ]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(a.publication(id)?.status).toBe("sent");
    expect(a.reader<ReadingState>(id)).toMatchObject({
      messageId: "message",
      page: 0,
      documentId: "fixed",
    });
    const b = new NewsStore(path),
      ra = new NewsReader({} as any, a, new NewsSources(game)),
      rb = new NewsReader({} as any, b, new NewsSources(game));
    const seen: number[] = [];
    const edit = async (_doc: any, state: ReadingState) => {
      await new Promise((r) => setTimeout(r, 10));
      seen.push(state.page);
    };
    await Promise.all([
      ra.turn(id, "c", "message", "a", "g", "next", edit),
      rb.turn(id, "c", "message", "b", "g", "next", edit),
    ]);
    expect(seen).toEqual([1, 2]);
    a.close();
    b.close();
    const reopened = new NewsStore(path),
      reader = new NewsReader({} as any, reopened, new NewsSources(game));
    await reader.turn(id, "c", "message", "c", "g", "prev", edit);
    expect(seen).toEqual([1, 2, 1]);
    reopened.close();
    rmSync(dir, { recursive: true });
  });
  test("failed initial send retries once; revoked subscription never sends", async () => {
    const store = new NewsStore(":memory:"),
      post = jest
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValue({ id: "message" });
    const { publisher, sub, doc, id } = setup(store, { post });
    await expect(publisher.send(doc.event, sub)).rejects.toThrow("timeout");
    expect(store.reader<ReadingState>(id)?.messageId).toBeNull();
    await publisher.send(doc.event, sub);
    expect(post).toHaveBeenCalledTimes(2);
    store.saveSubscription({ ...sub, enabled: false }, sub.revision);
    await publisher.send({ ...doc.event, id: "other" }, sub);
    expect(post).toHaveBeenCalledTimes(2);
    store.close();
  });
  test("manual open updates only original message; DM access and failed edits preserve page", async () => {
    const store = new NewsStore(":memory:"),
      post = jest.fn(),
      patch = jest.fn(async () => ({}));
    const { publisher, doc } = setup(store, { post, patch });
    await publisher.open(
      {
        applicationId: "app",
        token: "token",
        message: { id: "m" },
        channelId: "dm",
        guildId: null,
        user: { id: "owner" },
      } as any,
      doc.event,
      "tw",
      "news:session:home",
    );
    expect(patch).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    const request = (patch.mock.calls[0] as any)[1];
    const token = JSON.stringify(request).match(
      /news:read:\w+:([a-f0-9]{24}):next/,
    )![1]!;
    const reader = new NewsReader({} as any, store, new NewsSources(game)),
      edit = jest.fn(async () => {});
    expect(
      await reader.turn(token, "dm", "m", "other", null, "next", edit),
    ).toBe(false);
    await expect(
      reader.turn(token, "dm", "m", "owner", null, "next", async () => {
        throw new Error("network");
      }),
    ).rejects.toThrow("network");
    expect(store.reader<ReadingState>(token)?.page).toBe(0);
    const emptyPage = { ...doc, parts: [{ blocks: [] }] };
    const r = await readingRequest(emptyPage, 0, token);
    expect(r.body.attachments).toEqual([]);
    expect(r.body.allowed_mentions.roles).toEqual([]);
    expect(r.body.flags & 4096).toBe(4096);
    store.close();
  });
});

test("short introduction joins the first crop page and cover does not become an isolated page", () => {
  const long = paginateArticle([
    text("Introduction"),
    text("[Original image](<https://example.com/long.png>)"),
    ...images(7, "slice"),
  ]);
  expect(long.map((p) => galleries(p.blocks).length)).toEqual([4, 3]);
  expect(JSON.stringify(long[0])).toContain("Introduction");
  const overview = paginateArticle([
    ...images(1, "single", "cover"),
    text("Overview"),
    ...images(11, "multi", "body", 1),
  ]);
  expect(
    overview.map((p) => galleries(p.blocks).map((g) => g.media.length)),
  ).toEqual([[1, 5], [6]]);
});

test("long lists split between items without treating bullet markers as italic delimiters", () => {
  const content = Array.from(
    { length: 80 },
    (_, i) => `* Item ${i}: ${"detail ".repeat(8)}`,
  ).join("\n");
  const pages = paginateArticle([text(content)]);
  expect(pages.length).toBeGreaterThan(1);
  const lines = pages.flatMap((p) =>
    p.blocks.flatMap((b) =>
      b.type === "markdown" ? b.text.trim().split("\n") : [],
    ),
  );
  expect(lines.map((line) => line.trimEnd())).toEqual(
    content.split("\n").map((line) => line.trimEnd()),
  );
});

test("first/last routes jump directly, preserve ownership, and reject unknown actions", async () => {
  const { isNewsReadingInteraction } =
    await import("../src/utilities/news/reader.js");
  const store = new NewsStore(":memory:"),
    doc = document("zzz"),
    id = "a".repeat(24);
  store.putDocument(doc.version, doc);
  store.putReader(id, {
    id,
    documentId: doc.version,
    messageId: "m",
    channelId: "c",
    guildId: null,
    ownerId: "owner",
    page: 0,
    back: null,
  });
  const reader = new NewsReader({} as any, store, new NewsSources("zzz"));
  const edit = jest.fn(async () => {});
  for (const action of ["first", "last"])
    expect(isNewsReadingInteraction(`news:read:zzz:${id}:${action}`)).toBe(
      true,
    );
  expect(isNewsReadingInteraction(`news:read:zzz:${id}:page`)).toBe(false);
  expect(await reader.turn(id, "c", "m", "other", null, "last", edit)).toBe(
    false,
  );
  expect(await reader.turn(id, "c", "m", "owner", null, "last", edit)).toBe(
    true,
  );
  expect(store.reader<ReadingState>(id)?.page).toBe(doc.parts.length - 1);
  await expect(
    reader.turn(id, "c", "m", "owner", null, "first", async () => {
      throw new Error("network");
    }),
  ).rejects.toThrow("network");
  expect(store.reader<ReadingState>(id)?.page).toBe(doc.parts.length - 1);
  await reader.turn(id, "c", "m", "owner", null, "first", edit);
  expect(store.reader<ReadingState>(id)?.page).toBe(0);
  expect(await reader.turn(id, "c", "m", "owner", null, "invalid", edit)).toBe(
    false,
  );
  store.close();
});
