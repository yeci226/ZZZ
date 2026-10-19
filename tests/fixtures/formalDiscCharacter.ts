/** Synthetic values model the reported six-disc layout; no account data or requests. */
export function formalDiscCharacter(id = 1581, name = "蕾米埃爾") {
  const rows = [
    [
      [201, "4.8%", 1],
      [312, "36", 3],
      [121, "3%", 0],
      [111, "3%", 0],
    ],
    [
      [121, "12%", 3],
      [201, "4.8%", 1],
      [131, "9.6%", 1],
      [312, "9", 0],
    ],
    [
      [131, "14.4%", 2],
      [121, "6%", 1],
      [312, "27", 2],
      [201, "2.4%", 0],
    ],
    [
      [121, "57", 2],
      [111, "6%", 1],
      [111, "224", 1],
      [201, "4.8%", 1],
    ],
    [
      [111, "6%", 1],
      [231, "18", 1],
      [121, "19", 0],
      [131, "14.4%", 2],
    ],
    [
      [231, "18", 1],
      [121, "57", 2],
      [312, "9", 0],
      [131, "28.8%", 5],
    ],
  ] as const;
  const mains = [
    [1, "2200"],
    [2, "316"],
    [3, "184"],
    [8, "92"],
    [2, "30%"],
    [2, "30%"],
  ] as const;
  return {
    id,
    name_mi18n: name,
    level: 60,
    rank: 0,
    element_type: 200,
    vertical_painting_color: "#d66494",
    properties: [
      11478,
      3847,
      1014,
      83,
      "21.8%",
      "50.0%",
      115,
      403,
      "0.0%",
      "1.20",
      36,
    ].map((value, index) => ({ property_id: index + 1, final: String(value) })),
    skills: [0, 1, 2, 3, 5, 6].map((skill_type, index) => ({
      skill_type,
      level: [12, 12, 7, 12, 7, 8][index],
    })),
    weapon: {
      id: 14129,
      name: "測試音擎",
      level: 60,
      star: 5,
      icon: "./src/assets/images/icons/gacha/weapon-big/14129.webp",
      main_properties: [{ property_id: 2, base: "743" }],
      properties: [{ property_id: 2, base: "36%" }],
    },
    equip_plan_info: {
      plan_effective_property_list: [{ system_id: 121 }, { system_id: 312 }],
    },
    equip: rows.map((properties, index) => ({
      id: 33300 + index,
      rarity: "S",
      equipment_type: index + 1,
      main_properties: [
        { property_id: mains[index][0], base: mains[index][1] },
      ],
      properties: properties.map(([system_id, base, add]) => ({
        system_id,
        base,
        add,
        property_id: (
          { 201: 5, 312: 8, 121: 2, 111: 1, 131: 3, 231: 232 } as Record<
            number,
            number
          >
        )[system_id],
      })),
    })),
  };
}
