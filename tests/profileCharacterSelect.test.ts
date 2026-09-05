import {
  encodeProfileCharacterSelectCustomId,
  extractProfileCharacterIdFromOptionValue,
  paginateProfileCharacters,
  parseProfileCharacterSelectCustomId,
  PROFILE_SELECT_NEXT_PAGE,
  PROFILE_SELECT_PREVIOUS_PAGE,
  resolveProfileCharacterSelection,
} from "../src/utilities/zzz/profileCharacterSelect.js";
import { buildProfileCharacterSelectRows } from "../src/utilities/zzz/profileCharacterSelectMenu.js";

const characters = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1 }));

const option = (id: number) => `target-0-${id}`;

describe("ZZZ profile 角色選單分頁", () => {
  it.each([
    [25, [25], [false], [false]],
    [26, [24, 2], [false, true], [true, false]],
    [50, [24, 23, 3], [false, true, true], [true, true, false]],
    [52, [24, 23, 5], [false, true, true], [true, true, false]],
  ])(
    "%i 位角色不超過 25 個選項並正確放置上一頁/下一頁",
    (count, sizes, previous, next) => {
      const pages = paginateProfileCharacters(characters(count));
      expect(pages.map((page) => page.characters.length)).toEqual(sizes);
      expect(pages.map((page) => page.hasPrevious)).toEqual(previous);
      expect(pages.map((page) => page.hasNext)).toEqual(next);
      expect(
        pages.every(
          (page) =>
            page.characters.length +
              Number(page.hasPrevious) +
              Number(page.hasNext) <=
            25,
        ),
      ).toBe(true);
    },
  );

  it("選擇角色後按下一頁會保留暫存角色", () => {
    const pages = paginateProfileCharacters(characters(52));
    const resolution = resolveProfileCharacterSelection(
      pages,
      0,
      [],
      [option(1), option(2), PROFILE_SELECT_NEXT_PAGE],
    );

    expect(resolution).toEqual({
      kind: "navigate",
      page: 1,
      selectedCharacterIds: ["1", "2"],
    });
  });

  it("在下一頁完成選擇時會合併上一頁的角色", () => {
    const pages = paginateProfileCharacters(characters(52));
    const resolution = resolveProfileCharacterSelection(
      pages,
      1,
      ["1", "2"],
      [option(25)],
    );

    expect(resolution).toEqual({
      kind: "submit",
      page: 1,
      selectedCharacterIds: ["1", "2", "25"],
    });
  });

  it("同時選上一頁與下一頁時不換頁，並保留目前選擇", () => {
    const pages = paginateProfileCharacters(characters(52));
    const resolution = resolveProfileCharacterSelection(
      pages,
      1,
      ["1"],
      [option(25), PROFILE_SELECT_PREVIOUS_PAGE, PROFILE_SELECT_NEXT_PAGE],
    );

    expect(resolution).toEqual({
      kind: "navigation-conflict",
      page: 1,
      selectedCharacterIds: ["1", "25"],
    });
  });

  it("跨頁累積超過三位角色時拒絕新增選擇", () => {
    const pages = paginateProfileCharacters(characters(52));
    const resolution = resolveProfileCharacterSelection(
      pages,
      1,
      ["1", "2", "3"],
      [option(25), PROFILE_SELECT_NEXT_PAGE],
    );

    expect(resolution).toEqual({
      kind: "too-many",
      page: 1,
      selectedCharacterIds: ["1", "2", "3"],
    });
  });

  it("實際 Discord payload 只有一個 select 且每頁不超過 25 個選項", () => {
    const tr = (key: string) =>
      ({
        profile_SelectCharacter: "選擇角色查看",
        profile_CharactersFormat: "等級",
        profile_SelectCharacterNextPage: "下一頁",
        profile_SelectCharacterPreviousPage: "上一頁",
      })[key];
    const rows = buildProfileCharacterSelectRows(
      tr,
      characters(52),
      "target",
      0,
    );
    const payload = rows[0]!.toJSON();
    const menu = payload.components[0]!;

    expect(rows).toHaveLength(1);
    expect(menu.type).toBe(3);
    expect(menu.options).toHaveLength(25);
    expect(menu.options.at(-1)!.value).toBe(PROFILE_SELECT_NEXT_PAGE);
  });
});

describe("ZZZ profile 角色選單狀態 custom ID", () => {
  it("可以編碼並還原分頁與暫存角色", () => {
    const customId = encodeProfileCharacterSelectCustomId({
      targetUserId: "123456789012345678",
      accountIndex: 2,
      page: 4,
      selectedCharacterIds: ["101", "102"],
    });

    expect(parseProfileCharacterSelectCustomId(customId)).toEqual({
      targetUserId: "123456789012345678",
      accountIndex: 2,
      page: 4,
      selectedCharacterIds: ["101", "102"],
    });
    expect(customId.length).toBeLessThanOrEqual(100);
  });

  it("能從既有角色 option value 取出角色 ID", () => {
    expect(extractProfileCharacterIdFromOptionValue("target-3-1091")).toBe(
      "1091",
    );
    expect(
      extractProfileCharacterIdFromOptionValue(PROFILE_SELECT_NEXT_PAGE),
    ).toBeNull();
  });
});
