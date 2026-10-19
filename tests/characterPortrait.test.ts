import { resolveCharacterPortrait } from "../src/utilities/zzz/characterPortrait.js";

const original = {
  skin_id: 1,
  skin_name: "原始",
  is_original: true,
  skin_vertical_painting_url: "original.png",
  skin_square_url: "original-square.png",
  skin_vertical_painting_color: "#9c77f2",
};
const owned = {
  skin_id: 2,
  skin_name: "已擁有",
  unlocked: true,
  skin_vertical_painting_url: "owned.png",
  skin_square_url: "owned-square.png",
};
const displayed = {
  skin_id: 3,
  skin_name: "展示中",
  skin_vertical_painting_url: "displayed.png",
  skin_square_url: "displayed-square.png",
  skin_vertical_painting_color: "#ee73a4",
};
test("uses the returned appearance, not the first unlocked skin", () => {
  expect(
    resolveCharacterPortrait({
      role_vertical_painting_url: "displayed.png",
      skin_list: [owned, displayed, original],
    }),
  ).toEqual({ source: "displayed.png", skinName: "展示中", color: "#ee73a4" });
});
test("maps an API square appearance to the matching tall asset without stretching", () => {
  expect(
    resolveCharacterPortrait({
      role_square_url: "displayed-square.png",
      skin_list: [owned, displayed, original],
    }),
  ).toEqual({ source: "displayed.png", skinName: "展示中", color: "#ee73a4" });
});
test("keeps original appearance despite owning another skin", () => {
  expect(
    resolveCharacterPortrait({
      role_vertical_painting_url: "original.png",
      skin_list: [owned, original],
    }),
  ).toEqual({ source: "original.png", skinName: null, color: "#9c77f2" });
});
test("missing appearance uses original art, never a random owned skin", () => {
  expect(resolveCharacterPortrait({ skin_list: [owned, original] })).toEqual({
    source: "original.png",
    skinName: null,
    color: "#9c77f2",
  });
  expect(resolveCharacterPortrait({})).toEqual({
    source: null,
    skinName: null,
    color: null,
  });
});

test("ignores malformed API colors", () => {
  expect(
    resolveCharacterPortrait({
      role_vertical_painting_url: "art.png",
      role_vertical_painting_color: "invalid",
    }).color,
  ).toBeNull();
});
