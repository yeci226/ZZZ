import { loadImage } from "@napi-rs/canvas";

import { renderDetail } from "../src/utilities/interknot/detailRenderer.js";
import { renderFeed, type FeedCard } from "../src/utilities/interknot/feedRenderer.js";
import { AVATAR_IDS, renderAvatarSheet } from "../src/utilities/interknot/setupRenderer.js";

const COVER = "./src/assets/images/interknot/testCover01.png";

const card = (id: number, over: Partial<FeedCard> = {}): FeedCard => ({
  id,
  title: `[灌水]第 ${id} 篇文`,
  excerpt: "摘要內容摘要內容",
  nickname: `代理人${id}`,
  avatarId: (id % 11) + 1,
  coverPath: id % 3 ? COVER : null,
  featured: id % 4 === 0,
  isNew: id % 2 === 0,
  read: id % 5 === 0,
  ...over,
});

const input = (n: number, over: Partial<FeedCard> = {}) => ({
  viewer: { nickname: "Yeci", avatarId: 1, reputation: 12 },
  mainLabels: ["推播", "本伺服器", "我的"],
  subLabels: ["全部", "Fairy精選", "求助資訊"],
  main: 0,
  sub: 0,
  cards: Array.from({ length: n }, (_, i) => card(i + 1, over)),
  page: 0,
  featuredLabel: "Fairy精選",
  locale: "tw",
});

describe("renderFeed", () => {
  it("renders 1920x1080 and reports visible ids", async () => {
    const r = await renderFeed(input(40));
    const img = await loadImage(r.buffer);
    expect([img.width, img.height]).toEqual([1920, 1080]);
    expect(r.visibleIds.length).toBeGreaterThan(0);
    expect(r.visibleIds.length).toBeLessThanOrEqual(25);
    expect(r.totalPages).toBeGreaterThan(1);
  });

  it("lists every card on exactly one page", async () => {
    const first = await renderFeed(input(40));
    const seen: number[] = [];
    for (let page = 0; page < first.totalPages; page++) seen.push(...(await renderFeed({ ...input(40), page })).visibleIds);
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it("clamps page beyond the end", async () => {
    const r = await renderFeed({ ...input(3), page: 50 });
    expect(r.page).toBe(0);
    expect(r.visibleIds).toEqual([1, 2, 3]);
  });

  it("renders an empty feed", async () => {
    const r = await renderFeed(input(0));
    expect(r).toMatchObject({ visibleIds: [], totalPages: 1, page: 0 });
  });

  it("survives long unbroken text, emoji and a missing cover", async () => {
    const r = await renderFeed(
      input(1, { title: "[灌水]" + "啊".repeat(200), nickname: "🐱".repeat(12), excerpt: "x".repeat(500), coverPath: "/nope.webp" }),
    );
    expect(r.visibleIds).toEqual([1]);
  });
});

describe("renderDetail", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      floor: i + 1,
      nickname: `留言者${i + 1}`,
      avatarId: (i % 11) + 1,
      body: "樓主，阿飯才不會害怕你！不過你有沒有思考過一種可能性",
      isOp: i % 7 === 0,
    }));
  const d = (over: Partial<Parameters<typeof renderDetail>[0]> = {}) => ({
    author: { nickname: "修勾有夢想", avatarId: 3, reputation: 220 },
    title: "[灌水]求問，今天阿飯老師為什麼有點反常？",
    body: "事情是這樣嘟",
    coverPath: COVER,
    featured: false,
    featuredLabel: "Fairy精選",
    comments: many(3),
    expanded: false,
    commentPage: 0,
    endLabel: "— 已無更多評論 —",
    opLabel: "[樓主]",
    locale: "tw",
    ...over,
  });

  it("renders 1920x1080 with no truncation for short content", async () => {
    const r = await renderDetail(d({ body: "短", comments: [] }));
    const img = await loadImage(r.buffer);
    expect([img.width, img.height]).toEqual([1920, 1080]);
    expect(r).toMatchObject({ bodyTruncated: false, commentPages: 1, commentPage: 0, visibleFloors: [] });
  });

  it("truncates long bodies unless expanded", async () => {
    expect((await renderDetail(d({ body: "長".repeat(1000) }))).bodyTruncated).toBe(true);
    expect((await renderDetail(d({ body: "長".repeat(1000), expanded: true }))).bodyTruncated).toBe(false);
  });

  it("pages comments and clamps the page", async () => {
    const first = await renderDetail(d({ comments: many(30) }));
    expect(first.commentPages).toBeGreaterThan(1);
    expect(first.visibleFloors[0]).toBe(1);
    const last = await renderDetail(d({ comments: many(30), commentPage: 99 }));
    expect(last.commentPage).toBe(first.commentPages - 1);
    expect(last.visibleFloors.at(-1)).toBe(30);
    const all: number[] = [];
    for (let p = 0; p < first.commentPages; p++)
      all.push(...(await renderDetail(d({ comments: many(30), commentPage: p }))).visibleFloors);
    expect(all).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("survives emoji, unbroken text and an unknown avatar", async () => {
    const r = await renderDetail(
      d({
        title: "🐱".repeat(40),
        coverPath: null,
        featured: true,
        comments: [{ floor: 1, nickname: "x".repeat(12), avatarId: 99, body: "a".repeat(300), isOp: true }],
      }),
    );
    expect(r.visibleFloors).toEqual([1]);
  });
});

describe("renderAvatarSheet", () => {
  it("renders every avatar choice", async () => {
    expect(AVATAR_IDS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const img = await loadImage(await renderAvatarSheet());
    expect(img.width).toBeGreaterThan(0);
  });
});

describe("renderFeed memory use", () => {
  it("decodes only covers on the current page, not the whole feed", async () => {
    const drawing = await import("../src/utilities/interknot/drawing.js");
    const spy = jest.spyOn(drawing, "cachedImage");
    await renderFeed(input(60));
    const coverLoads = spy.mock.calls.filter(([p]) => p === COVER).length;
    spy.mockRestore();
    expect(coverLoads).toBeGreaterThan(0);
    expect(coverLoads).toBeLessThan(30);
  });
});
