import { createHash } from "node:crypto";
import {
  NewsMediaCache,
  MAX_NEWS_FILE_BYTES,
  MAX_NEWS_MESSAGE_BYTES,
  type NewsMedia,
  type DisplayBlock,
} from "../src/utilities/news/media.js";
import {
  splitMessages,
  renderMessage,
  MESSAGE_LAYOUT_VERSION,
  type NewsMessageDocument,
} from "../src/utilities/news/messages.js";
import { NewsVideoTitles, youtubeVideo } from "../src/utilities/news/video.js";
import {
  parseArticle,
  type ArticleDocument,
} from "../src/utilities/news/article.js";
import {
  NewsPublisher,
  publicationId,
} from "../src/utilities/news/publication.js";
import { NewsSources } from "../src/utilities/news/sources.js";
import { NewsStore } from "../src/utilities/news/store.js";
import {
  newSubscription,
  type NewsGame,
  type NewsEvent,
  type NewsLocale,
} from "../src/utilities/news/types.js";
const media = (n: number, bytes = 100): NewsMedia => ({
  url: `https://example.com/${n}.jpg`,
  original: `https://example.com/${n}.jpg`,
  width: 1080,
  height: 1800,
  bytes,
});
const galleries = (blocks: DisplayBlock[]) =>
  blocks.filter((b) => b.type === "gallery");
const event = (game: NewsGame): NewsEvent => ({
  id: `post:${game}:tw:1`,
  game,
  source: "hoyolab",
  locale: "tw",
  categories: ["other"],
  publishedAt: Date.now(),
  title: "Article",
  summary: "",
  image: null,
  url: "https://www.hoyolab.com/article/1",
  kind: "article",
  version: null,
});
const videoDoc: ArticleDocument = {
  version: "raw",
  blocks: [
    {
      type: "video",
      url: "https://www.youtube.com/embed/0lb2dtaMPOk",
      text: "Video",
    },
  ],
};

test("Koleda's JPG and two original GIFs fit one message as three single galleries", () => {
  const blocks: DisplayBlock[] = [
    { type: "markdown", text: "Introduction" },
    ...[416272, 7942258, 8013348].map((bytes, i) => ({
      type: "gallery" as const,
      media: [media(i, bytes)],
      runId: "koleda",
      intent: "single" as const,
    })),
  ];
  const parts = splitMessages(blocks);
  expect(parts).toHaveLength(1);
  expect(galleries(parts[0]!.blocks).map((g) => g.media.length)).toEqual([
    1, 1, 1,
  ]);
});
test("file limit and request budget are independent", () => {
  expect(MAX_NEWS_FILE_BYTES).toBe(10 * 1024 * 1024);
  expect(MAX_NEWS_MESSAGE_BYTES).toBe(24 * 1024 * 1024);
  const gallery: DisplayBlock = {
    type: "gallery",
    media: [
      media(1, 9.5 * 1024 * 1024),
      media(2, 9.5 * 1024 * 1024),
      media(3, 9.5 * 1024 * 1024),
    ],
    intent: "multi",
    runId: "large",
  };
  expect(
    splitMessages([gallery]).map(
      (p) => galleries(p.blocks).flatMap((g) => g.media).length,
    ),
  ).toEqual([2, 1]);
  expect(() =>
    splitMessages([
      { type: "gallery", media: [media(1, MAX_NEWS_FILE_BYTES + 1)] },
    ]),
  ).toThrow("news_file_limit");
});
test("eleven ordinary images following a cover regroup as nine plus two across messages", async () => {
  const cache = new NewsMediaCache("/unused");
  jest
    .spyOn(cache, "prepare")
    .mockImplementation(async (b) => [media(Number(b.identity))]);
  const image = (i: number) => ({
    type: "image" as const,
    url: media(i).url,
    identity: String(i),
    width: 1080,
    height: 1800,
  });
  const blocks = await cache.blocks(
    [
      image(0),
      { type: "markdown", text: "intro" },
      ...Array.from({ length: 11 }, (_, i) => image(i + 1)),
    ],
    "https://www.hoyolab.com/article/1",
  );
  const parts = splitMessages(blocks);
  expect(
    parts.map((p) => galleries(p.blocks).map((g) => g.media.length)),
  ).toEqual([[1, 9], [2]]);
  expect(
    parts.flatMap((p) =>
      galleries(p.blocks).flatMap((g) => g.media.map((m) => m.url)),
    ),
  ).toEqual(Array.from({ length: 12 }, (_, i) => media(i).url));
});
test("text breaks groups and crops never merge, even with incorrect multi-gallery hints", () => {
  const crop = {
    ...media(2),
    slice: { top: 0, bottom: 1800, hash: "hash", version: "v2-equal" },
  };
  const result = splitMessages([
    {
      type: "gallery",
      media: [media(1), crop, media(3)],
      intent: "multi",
      runId: "same",
    },
    { type: "markdown", text: "separator" },
    {
      type: "gallery",
      media: [media(4), media(5)],
      intent: "multi",
      runId: "other",
    },
  ]);
  expect(galleries(result[0]!.blocks).map((g) => g.media.length)).toEqual([
    1, 1, 1, 2,
  ]);
});

test("YouTube embed/short links normalize without accepting unrelated hosts or numeric IDs", () => {
  expect(youtubeVideo("https://www.youtube.com/embed/0lb2dtaMPOk")).toEqual({
    id: "0lb2dtaMPOk",
    url: "https://www.youtube.com/watch?v=0lb2dtaMPOk",
  });
  expect(youtubeVideo("https://youtu.be/0lb2dtaMPOk")?.id).toBe("0lb2dtaMPOk");
  expect(
    youtubeVideo("https://youtube.com.evil.example/embed/0lb2dtaMPOk"),
  ).toBeNull();
  expect(youtubeVideo("571178")).toBeNull();
});
test("video lookup is deduplicated by ID, caches actual titles and preserves article-provided titles", async () => {
  const get = jest.fn(async () => ({ title: "Official video title" })),
    titles = new NewsVideoTitles(get);
  const docs = await Promise.all([
    titles.enrich(videoDoc, "Article", "tw"),
    titles.enrich(videoDoc, "Article", "en"),
  ]);
  expect(get).toHaveBeenCalledTimes(1);
  expect(docs[0]!.blocks[0]).toMatchObject({
    text: "Official video title",
    titleSource: "youtube",
    url: "https://www.youtube.com/watch?v=0lb2dtaMPOk",
  });
  await titles.enrich(videoDoc, "Article", "tw");
  expect(get).toHaveBeenCalledTimes(1);
  const supplied = await titles.enrich(
    {
      version: "raw",
      blocks: [
        {
          type: "video",
          text: "Provided title",
          url: "https://www.youtube.com/embed/0lb2dtaMPOk",
        },
      ],
    },
    "Article",
    "tw",
  );
  expect(supplied.blocks[0]).toMatchObject({
    text: "Provided title",
    titleSource: "article",
  });
  expect(get).toHaveBeenCalledTimes(1);
});
test("failed video metadata uses localized article-title fallback without blocking or repeated requests", async () => {
  const get = jest.fn(async () => {
      throw new Error("timeout");
    }),
    titles = new NewsVideoTitles(get);
  const a = await titles.enrich(videoDoc, "砂金影片", "tw"),
    b = await titles.enrich(videoDoc, "Aventurine", "en");
  expect(a.blocks[0]).toMatchObject({
    text: "觀看影片：砂金影片",
    titleSource: "fallback",
  });
  expect(b.blocks[0]).toMatchObject({ text: "Watch video：Aventurine" });
  expect(get).toHaveBeenCalledTimes(1);
});
test("resolved video labels remove emoji and escape brackets, preserving adjacent original text", async () => {
  const cache = new NewsMediaCache("/unused"),
    doc = await new NewsVideoTitles(async () => ({
      title: "🎥 Title [PV]",
    })).enrich(videoDoc, "Article", "tw");
  const blocks = await cache.blocks(
    [{ type: "markdown", text: "Original 😀" }, ...doc.blocks],
    "https://www.hoyolab.com/article/1",
  );
  expect(blocks[0]).toMatchObject({ text: "Original 😀" });
  expect(blocks[1]).toMatchObject({
    text: "[Title \\[PV\\]](<https://www.youtube.com/watch?v=0lb2dtaMPOk>)",
  });
});
test.each(["tw", "cn", "en", "jp", "kr", "fr", "vi"] as NewsLocale[])(
  "%s status cards contain localized names and descriptions, no link or date",
  (locale) => {
    for (const game of ["hsr", "zzz"] as const)
      for (const kind of [
        "update",
        "preload",
        "maintenance_start",
        "maintenance_end",
      ] as const) {
        const e = { ...event(game), kind, version: "3.2.0" },
          doc: NewsMessageDocument = {
            version: "test",
            layout: MESSAGE_LAYOUT_VERSION,
            event: e,
            locale,
            parts: [{ blocks: [] }],
          };
        const json = JSON.stringify(renderMessage(doc, 0).body);
        expect(json).not.toMatch(
          /https?:|hoyolab|<t:|accent_color|"type":2[,}]/,
        );
        expect(json).toContain('"type":11');
        expect(json).toContain("3.2.0");
        const section = renderMessage(
          doc,
          0,
        ).body.components[0]!.components.find((c) => c.type === 9) as any;
        expect(section.components[0].content).toMatch(/^## /);
        expect(section.components[0].content).not.toContain("\n");
        if (locale === "tw" && game === "zzz" && kind === "update")
          expect(section.components[0].content).toBe("## 絕區零更新可下載");
        if (locale === "tw" && game === "zzz" && kind === "maintenance_start")
          expect(section.components[0].content).toBe("## 絕區零維護已開始");
      }
  },
);

describe.each(["hsr", "zzz"] as NewsGame[])(
  "%s upgrade compatibility",
  (game) => {
    test.each([0, 1, 2])(
      "previous publication with %i recorded parts keeps correct progress",
      async (count) => {
        const store = new NewsStore(":memory:"),
          e = event(game),
          sub = store.saveSubscription(
            {
              ...newSubscription("u", "tw"),
              id: "channel:c",
              scope: "channel",
              channelId: "c",
              guildId: "g",
              enabled: true,
            },
            0,
          );
        const oldId = createHash("sha256")
          .update(`${e.id}:${sub.id}:${sub.revision}:continuous-v2`)
          .digest("hex")
          .slice(0, 24);
        const old: NewsMessageDocument = {
          version: "old",
          layout: "continuous-v2",
          event: e,
          locale: "tw",
          parts: [
            { blocks: [{ type: "markdown", text: "Old first" }] },
            { blocks: [{ type: "markdown", text: "Old second" }] },
          ],
        };
        store.putDocument(old.version, old);
        store.beginPublication(oldId, "channel:c", sub, old.version, "c");
        for (let i = 0; i < count; i++)
          store.savePublicationPart(oldId, i, `old-${i}`);
        if (count === 2) store.finishPublication(oldId, "sent");
        const post = jest.fn(async () => ({ id: "new" })),
          publisher = new NewsPublisher(
            { rest: { post } } as any,
            store,
            new NewsSources(game),
          );
        const prepare = jest
          .spyOn(publisher, "prepare")
          .mockImplementation(async () => {
            const doc: NewsMessageDocument = {
              ...old,
              version: "new",
              layout: MESSAGE_LAYOUT_VERSION,
              parts: [
                { blocks: [{ type: "markdown", text: "New whole article" }] },
              ],
            };
            store.putDocument(doc.version, doc);
            return doc;
          });
        const ids = await publisher.send(e, sub);
        if (count === 0) {
          expect(prepare).toHaveBeenCalledTimes(1);
          expect(JSON.stringify(post.mock.calls)).toContain(
            "New whole article",
          );
          expect(store.publication(oldId)?.documentId).toBe("new");
        }
        if (count === 1) {
          expect(prepare).not.toHaveBeenCalled();
          expect(JSON.stringify(post.mock.calls)).toContain("Old second");
          expect(ids).toEqual(["old-0", "new"]);
        }
        if (count === 2) {
          expect(post).not.toHaveBeenCalled();
          expect(prepare).not.toHaveBeenCalled();
        }
        expect(store.publication(publicationId(e, sub))).toBeNull();
        store.close();
      },
    );
  },
);
