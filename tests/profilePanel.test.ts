import { getProfilePanelProperties } from "../src/utilities/zzz/profilePanel.js";

const character = (
  pieces: number,
  final: string,
  main = "30%",
  weapon = "",
) => ({
  properties: [{ property_id: 9, base: "", final }],
  equip: Array.from({ length: pieces }, (_, index) => ({
    equip_suit: { suit_id: "31100" },
    main_properties:
      index === 0
        ? [{ property_id: main === "30%" ? 31703 : 23103, base: main }]
        : [],
  })),
  weapon: { properties: weapon ? [{ property_id: 23103, base: weapon }] : [] },
});

test.each([
  [0, "0.0%", "30%", "", "0.0%"],
  [1, "0.0%", "30%", "", "0.0%"],
  [2, "0.0%", "30%", "", "8.0%"],
  [4, "0.0%", "30%", "", "8.0%"],
  [2, "8.0%", "30%", "", "8.0%"],
  [2, "24.0%", "24%", "", "32.0%"],
  [2, "32.0%", "24%", "", "32.0%"],
  [2, "48.0%", "24%", "24%", "56.0%"],
  [2, "70.0%", "24%", "24%", "70.0%"],
])(
  "Puffer %i pieces, panel %s, main %s, weapon %s => %s",
  (pieces, final, main, weapon, expected) => {
    const raw = character(pieces, final, main, weapon);
    const before = structuredClone(raw);
    expect(getProfilePanelProperties(raw)[0].final).toBe(expected);
    expect(raw).toEqual(before);
  },
);

test("unrelated stats and missing equipment remain unchanged", () => {
  const raw = { properties: [{ property_id: 232, final: "18" }] };
  expect(getProfilePanelProperties(raw)).toEqual(raw.properties);
  expect(getProfilePanelProperties({})).toEqual([]);
});
