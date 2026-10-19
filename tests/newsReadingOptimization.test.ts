import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeUrlLabels } from "../src/utilities/news/urlLabels.js";
import { parseArticle } from "../src/utilities/news/article.js";
import {
  messageRequest,
  type NewsMessageDocument,
} from "../src/utilities/news/messages.js";
import { pageRequest } from "../src/utilities/news/presentation.js";
import { NewsReader, type ReadingState } from "../src/utilities/news/reader.js";
import { NewsStore } from "../src/utilities/news/store.js";
import { NewsSources } from "../src/utilities/news/sources.js";
import type { NewsMedia } from "../src/utilities/news/media.js";
import { NewsMediaCache } from "../src/utilities/news/media.js";

const urls = [
  "https://hoyo.link/dQIkFKAL",
  "https://www.twitch.tv/directory/category/zenless-zone-zero",
];
const wrapped = urls.map((url) => `[${url}](<${url}>)`).join("\n");
const document = (media: NewsMedia[] = []): NewsMessageDocument => ({
  version: "cached",
  layout: "paged-v1",
  locale: "tw",
  event: {
    id: "post:zzz:tw:1",
    game: "zzz",
    kind: "article",
    source: "hoyolab",
    locale: "tw",
    categories: ["other"],
    publishedAt: 1,
    title: "Activity",
    summary: "",
    image: null,
    url: "https://www.hoyolab.com/article/1",
    version: null,
  },
  parts: [
    { blocks: [{ type: "markdown", text: "first" }] },
    {
      blocks: [
        { type: "markdown", text: wrapped },
        ...(media.length ? [{ type: "gallery" as const, media }] : []),
      ],
    },
  ],
});
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "news-optimization-"));
});
afterEach(() => {
  jest.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});
const picture = (ext = "jpg"): NewsMedia => ({
  url: `attachment://image.${ext}`,
  original: `https://upload-os-bbs.hoyolab.com/image.${ext}`,
  file: join(dir, `image.${ext}`),
  name: `image.${ext}`,
  width: 1080,
  height: 720,
});

test("the two Twitch URLs unwrap in raw, structured, HTML and persisted documents", async () => {
  expect(normalizeUrlLabels(wrapped)).toBe(urls.join("\n"));
  expect(normalizeUrlLabels(urls.map((u) => `[${u}](${u})`).join("\n"))).toBe(
    urls.join("\n"),
  );
  const structured = parseArticle(
    urls.flatMap((u) => [
      { insert: u, attributes: { link: u } },
      { insert: "\n" },
    ]),
    null,
    null,
  );
  const html = parseArticle(
    null,
    urls.map((u) => `<p><a href="${u}">${u}</a></p>`).join(""),
    null,
  );
  for (const doc of [structured, html]) {
    expect(JSON.stringify(doc)).not.toContain("](<");
    expect(JSON.stringify(doc)).toContain(urls[0]);
  }
  const req = await messageRequest(document(), 1, null, null, "reader");
  expect(JSON.stringify(req.body)).not.toContain(`[${urls[0]}]`);
  expect(JSON.stringify(req.body)).toContain(urls[1]);
});

test("descriptive/mismatching links and inline/fenced code survive unchanged; normalization is idempotent", () => {
  const link = `[${urls[0]}](<${urls[0]}>)`;
  const preserved = [
    `[活動頁面](<${urls[0]}>)`,
    `[${urls[0]}](<${urls[1]}>)`,
    `\`${link}\``,
    `\`\`x\` ${link}\`\``,
    `\`line one\n${link}\nline three\``,
    `\`\`\`md\n${link}\n\`\`\``,
    `~~~\n${link}\n~~~`,
    `\`\`\`md\n${link}`, // Unclosed code blocks remain code.
  ];
  for (const text of preserved) expect(normalizeUrlLabels(text)).toBe(text);
  const out = normalizeUrlLabels(`${preserved[0]}\n${wrapped}`);
  expect(normalizeUrlLabels(out)).toBe(out);
});

test.each(["jpg", "gif", "webp"])(
  "ordinary %s media uses original URL without reading missing local files; attachment mode remains available",
  async (ext) => {
    const p = picture(ext),
      doc = document([p]);
    const record = jest.fn();
    const request = await messageRequest(doc, 1, null, null, "reader", {
      onAttachmentsRead: record,
    });
    expect(request.files).toEqual([]);
    expect(request.body.attachments).toEqual([]);
    expect(JSON.stringify(request.body)).toContain(p.original);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ uploadBytes: 0, attachmentCount: 0 }),
    );
    expect(doc.parts[1].blocks[1]).toMatchObject({ media: [{ file: p.file }] });
    writeFileSync(p.file!, Buffer.from("cached-image"));
    const old = await messageRequest(doc, 1, null, null, "reader", {
      mediaDelivery: "attachment",
    });
    expect(old.files).toHaveLength(1);
    expect(old.files[0].data.length).toBe(12);
    const legacy = await pageRequest(
      { version: "legacy", event: doc.event, locale: "tw", pages: doc.parts },
      1,
      "reader",
    );
    expect(legacy.files).toEqual([]);
  },
);

test("mixed page retains cuts and nonofficial attachments in original order", async () => {
  const ordinary = picture(),
    cut = {
      ...picture("png"),
      slice: { top: 0, bottom: 720, hash: "h", version: "v2" },
    };
  const fallback = {
    ...picture("webp"),
    original: "https://hoyolab.com.example.org/a.webp",
  };
  writeFileSync(cut.file!, "cut-bytes");
  writeFileSync(fallback.file!, "fallback-bytes");
  const request = await messageRequest(document([ordinary, cut, fallback]), 1);
  expect(request.files.map((f) => f.name)).toEqual([cut.name, fallback.name]);
  const json = JSON.stringify(request.body);
  expect(json.indexOf(ordinary.original)).toBeLessThan(json.indexOf(cut.url));
  expect(json.indexOf(cut.url)).toBeLessThan(json.indexOf(fallback.url));
});

test("cached turn sends no ordinary image bytes, never fetches or recrops, skips boundaries, and records no interaction secrets", async () => {
  const store = new NewsStore(join(dir, "news.sqlite"));
  const doc = document([picture()]);
  store.putDocument(doc.version, doc);
  const state: ReadingState = {
    id: "a".repeat(24),
    documentId: doc.version,
    messageId: "m",
    channelId: "c",
    guildId: null,
    ownerId: "u",
    page: 0,
    back: null,
  };
  store.putReader(state.id, state);
  const sources = new NewsSources("zzz");
  const full = jest.spyOn(sources, "fullArticle");
  const media = new NewsMediaCache(dir);
  const prepare = jest.spyOn(media, "prepare");
  const patch = jest.fn(async () => ({}));
  const info = jest.spyOn(console, "info").mockImplementation(() => {});
  const reader = new NewsReader(
    { rest: { patch } } as any,
    store,
    sources,
    media,
  );
  const interaction = {
    isMessageComponent: () => true,
    customId: `news:read:zzz:${state.id}:next`,
    deferUpdate: jest.fn(async () => {}),
    followUp: jest.fn(),
    applicationId: "application",
    token: "SECRET_INTERACTION_TOKEN",
    message: { id: "m" },
    channelId: "c",
    guildId: null,
    user: { id: "u" },
  };
  await reader.handle(interaction as any);
  expect(patch).toHaveBeenCalledTimes(1);
  expect((patch.mock.calls[0] as any)[1].files).toEqual([]);
  expect(store.reader<ReadingState>(state.id)?.page).toBe(1);
  await reader.handle(interaction as any);
  expect(patch).toHaveBeenCalledTimes(1);
  expect(full).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
  const logs = JSON.stringify(info.mock.calls);
  expect(logs).toContain("discordUpdateMs");
  expect(logs).toContain("documentReadMs");
  expect(logs).not.toContain("SECRET_INTERACTION_TOKEN");
  store.close();
});
