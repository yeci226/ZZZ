jest.mock("node-fetch", () => ({
  __esModule: true,
  default: jest.fn(),
}));

import fs from "node:fs";

import {
  findKeyByValue,
} from "../src/utilities/zzz/autoDownloadIcons.js";
import {
  weaponIconLocalPath,
  weaponIconMapFromItems,
} from "../src/utilities/zzz/gachaWeaponIcons.js";
import {
  bangbooIconLocalPath,
  bangbooIconMapFromItems,
  resolveGachaBangbooIcon,
} from "../src/utilities/zzz/gachaBangbooIcons.js";

describe("驅動盤圖示資料欄位解析", () => {
  it("錨點不在第一列時仍能找出欄位名稱", () => {
    const rows = [
      { itemId: 1, icon: "first.webp" },
      { itemId: 31021, icon: "disc.webp" },
    ];

    expect(findKeyByValue(rows, 31021)).toBe("itemId");
  });

  it("建立所有稀有度音擎的 item ID 圖片對照", () => {
    const rows = [
      { itemId: 31021, icon: "Assets/NapResources/UI/Sprite/Other/IconFund.png" },
      { itemId: 12003, icon: "Assets/NapResources/UI/Sprite/A1DynamicLoad/ItemIconWeaponBig/UnPacker/Weapon_B_Common_03Big.png" },
      { itemId: 12008, icon: "Assets/NapResources/UI/Sprite/A1DynamicLoad/ItemIconWeaponBig/UnPacker/Weapon_B_Common_08Big.png" },
      { itemId: 12010, icon: "Assets/NapResources/UI/Sprite/A1DynamicLoad/ItemIconWeaponBig/UnPacker/Weapon_B_Common_10Big.png" },
      { itemId: 12013, icon: "Assets/NapResources/UI/Sprite/A1DynamicLoad/ItemIconWeaponBig/UnPacker/Weapon_B_Common_13Big.png" },
      { itemId: 13010, icon: "Assets/NapResources/UI/Sprite/A1DynamicLoad/ItemIconWeaponBig/UnPacker/Weapon_A_Common_10Big.png" },
      { itemId: 14001, icon: "Assets/NapResources/UI/Sprite/A1DynamicLoad/ItemIconWeapon/UnPacker/Weapon_S_Common_01.png" },
      { itemId: 99999, icon: "Assets/NapResources/UI/Sprite/NotAWeapon.png" },
    ];

    expect(weaponIconMapFromItems(rows)).toEqual({
      "12003": "https://static.nanoka.cc/assets/zzz/Weapon_B_Common_03Big.webp",
      "12008": "https://static.nanoka.cc/assets/zzz/Weapon_B_Common_08Big.webp",
      "12010": "https://static.nanoka.cc/assets/zzz/Weapon_B_Common_10Big.webp",
      "12013": "https://static.nanoka.cc/assets/zzz/Weapon_B_Common_13Big.webp",
      "13010": "https://static.nanoka.cc/assets/zzz/Weapon_A_Common_10Big.webp",
    });
    expect(weaponIconLocalPath("12008")).toMatch(/icons\/gacha\/weapon-big\/12008\.webp$/);
  });

  it("遇到無法辨識的 manifest 時安全回傳空對照", () => {
    expect(weaponIconMapFromItems([])).toEqual({});
    expect(weaponIconMapFromItems([{ unknown: "value" }])).toEqual({});
  });

  it("建立邦布抽卡 item ID 到完整 512px 立繪的對照", () => {
    const rows = [
      { itemId: 12008, art: "UI/Sprite/A1DynamicLoad/IconWeapon/UnPacker/Weapon_B_Common_08.png" },
      { itemId: 53001, art: "UI/Sprite/A1DynamicLoad/BangbooModGarage/UnPacker/BangbooRole/BangbooGarageRole12.png" },
      { itemId: 54010, art: "UI/Sprite/A1DynamicLoad/BangbooModGarage/UnPacker/BangbooRole/BangbooGarageRole46.png" },
      { itemId: 54023, art: "UI/Sprite/A1DynamicLoad/BangbooModGarage/UnPacker/BangbooRole/BangbooGarageRole48.png" },
      { itemId: 54024, art: "UI/Sprite/A1DynamicLoad/IconBangbooPiece/UnPacker/IconBangbooPiece49.png" },
    ];

    expect(bangbooIconMapFromItems(rows)).toEqual({
      "53001": "https://static.nanoka.cc/assets/zzz/BangbooGarageRole12.webp",
      "54010": "https://static.nanoka.cc/assets/zzz/BangbooGarageRole46.webp",
      "54023": "https://static.nanoka.cc/assets/zzz/BangbooGarageRole48.webp",
    });
    expect(bangbooIconLocalPath("54023")).toMatch(/icons\/gacha\/bangboo\/54023\.webp$/);
  });

  it("邦布 manifest 缺少 ID 或完整立繪欄位時安全回傳空對照", () => {
    expect(bangbooIconMapFromItems([])).toEqual({});
    expect(bangbooIconMapFromItems([{ itemId: 54010, icon: "IconBangbooPiece39.png" }])).toEqual({});
  });

  it("邦布 resolver 優先使用已存在的本機快取", async () => {
    const exists = jest.spyOn(fs, "existsSync").mockReturnValue(true);
    await expect(resolveGachaBangbooIcon("54010")).resolves.toBe(bangbooIconLocalPath("54010"));
    exists.mockRestore();
  });
});
