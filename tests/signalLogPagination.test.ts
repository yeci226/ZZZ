import { paginateSignalBannerChoices } from "../src/utilities/zzz/signalLogPagination.js";

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
});
