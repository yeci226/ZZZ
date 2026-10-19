import { loadImage } from "@napi-rs/canvas";

import { renderFeed, type FeedCard } from "../src/utilities/interknot/feedRenderer.js";

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
