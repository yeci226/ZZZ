import {
  legacyToggleView,
  normalizeSignalLogView,
  wallPageCount,
  paginateSignalBannerChoices,
  paginateSignalBannerChoicesWithPinned,
} from "../src/utilities/zzz/signalLogPagination.js";

describe("signal log banner pagination", () => {
  const choices = Array.from({ length: 51 }, (_, index) => ({
    label: `3.${index} 卡池`, value: `banner-${index}`,
  }));

  it("uses Discord's 25-option limit and pages newest-to-oldest", () => {
    expect(paginateSignalBannerChoices(choices, 0)).toMatchObject({
      page: 0, pages: 3, items: choices.slice(0, 25),
    });
    expect(paginateSignalBannerChoices(choices, 1).items).toEqual(choices.slice(25, 50));
    expect(paginateSignalBannerChoices(choices, 2).items).toEqual(choices.slice(50));
  });

  it("clamps forged or stale page numbers", () => {
    expect(paginateSignalBannerChoices(choices, 99).page).toBe(2);
    expect(paginateSignalBannerChoices(choices, -3).page).toBe(0);
    expect(paginateSignalBannerChoices([], 8)).toEqual({ items: [], page: 0, pages: 1 });
  });

  it("pins the all-history option while reserving 24 slots for banners", () => {
    const all = { label: "全部紀錄", value: "__all__" };
    const first = paginateSignalBannerChoicesWithPinned(choices, 0, all);
    const second = paginateSignalBannerChoicesWithPinned(choices, 1, all);
    expect(first.items).toEqual([all, ...choices.slice(0, 24)]);
    expect(second.items).toEqual([all, ...choices.slice(24, 48)]);
    expect(first.items).toHaveLength(25);
    expect(first.pages).toBe(3);
  });
});

describe("signal log view helpers", () => {
  it("maps stored and unknown view values", () => {
    expect(["overview", "records", "home", "wall", "versions", "cycles", "", null, "x"].map(normalizeSignalLogView))
      .toEqual(["wall", "cycles", "home", "wall", "versions", "cycles", "home", "home", "home"]);
  });

  it("keeps old toggle buttons working between the wall and pity cycles", () => {
    expect(["wall", "cycles", "home", "versions"].map((view) => legacyToggleView(view as any))).toEqual(["cycles", "wall", "cycles", "cycles"]);
  });

  it("counts wall pages with the live pity cell taking one slot on the first page", () => {
    expect([[0, true], [34, true], [35, true], [35, false], [36, false], [0, false]].map(([s, live]) => wallPageCount(s as number, live as boolean)))
      .toEqual([1, 1, 2, 1, 2, 1]);
  });
});
