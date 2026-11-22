import {
  GT_UI_ASSET_ROOT,
  findGtUiBundlePath,
  parseGtUiIcons,
} from "../src/utilities/zzz/gtUiIcons.js";

// 取自養成計算機 gtUi bundle 的結構（節錄並縮短）
const MAPS =
  ',G=(o={},(0,i.Z)((0,i.Z)((0,i.Z)(o,200,"ZzzGameElementalPhysical1"),201,"ZzzGameElementalFire1"),' +
  '"".concat(202,"_",1),"ZzzGameElementalFrost1"),(0,i.Z)(o,"".concat(201,"_",5),"ZzzGameElementalFlare1")),' +
  'Z=(0,i.Z)((0,i.Z)({},1,"ZzzGameSpecialtiesAttack1"),7,"ZzzGameSpecialtiesFengyu1"),P=1;';

// 第一個作用域前方有同名變數的誘餌（指向載入圈圈），必須略過
const SCOPE = (n: number) =>
  `;var eY=t(86970),ex="~/assets/icons/372574f0d5e20aae.svg",zz${n}=1;` +
  "t.d(n,{ZzzGameElementalFlare1:function(){return eY},ZzzGameElementalFrost1:function(){return ex}," +
  "ZzzGameElementalPhysical1:function(){return ep},ZzzGameElementalFire1:function(){return ef}," +
  "ZzzGameSpecialtiesAttack1:function(){return sa},ZzzGameSpecialtiesFengyu1:function(){return sf}});" +
  'var eY="~/assets/icons/cd15efe28a7487c5.png",ex="~/assets/icons/df95f6290f4cf521.png",' +
  'ep="~/assets/icons/aaaaaaaaaaaaaaa1.png",ef="~/assets/icons/aaaaaaaaaaaaaaa2.png",' +
  'sa="~/assets/icons/aaaaaaaaaaaaaaa3.png",sf="~/assets/icons/aaaaaaaaaaaaaaa4.png";';

const url = (hash: string) => `${GT_UI_ASSET_ROOT}assets/icons/${hash}.png`;

describe("養成計算機 gtUi 圖示解析", () => {
  it("依數字代碼取得圖示網址，並在各自作用域內解析變數", () => {
    expect(parseGtUiIcons(MAPS + SCOPE(1) + SCOPE(2))).toEqual({
      element: {
        "200": { name: "physical", url: url("aaaaaaaaaaaaaaa1") },
        "201": { name: "fire", url: url("aaaaaaaaaaaaaaa2") },
        "202_1": { name: "frost", url: url("df95f6290f4cf521") },
        "201_5": { name: "flare", url: url("cd15efe28a7487c5") },
      },
      profession: {
        "1": { name: "attack", url: url("aaaaaaaaaaaaaaa3") },
        "7": { name: "fengyu", url: url("aaaaaaaaaaaaaaa4") },
      },
    });
  });

  it("兩個作用域解析結果不一致時捨棄該圖示", () => {
    const conflicting = SCOPE(2).replace(
      "cd15efe28a7487c5.png",
      "bbbbbbbbbbbbbbbb.png",
    );
    const result = parseGtUiIcons(MAPS + SCOPE(1) + conflicting);
    expect(result.element["201_5"]).toBeUndefined();
    expect(result.element["202_1"]).toBeDefined();
  });

  it("不同名稱指向同一網址時一併捨棄", () => {
    const shared = SCOPE(1).replace(
      'ef="~/assets/icons/aaaaaaaaaaaaaaa2.png"',
      'ef="~/assets/icons/aaaaaaaaaaaaaaa1.png"',
    );
    const result = parseGtUiIcons(MAPS + shared);
    expect(result.element["200"]).toBeUndefined();
    expect(result.element["201"]).toBeUndefined();
  });

  it("找不到對照表時回傳空結果", () => {
    expect(parseGtUiIcons("garbage")).toEqual({ element: {}, profession: {} });
  });

  it("從 index.html 找出 gtUi bundle 路徑", () => {
    const html =
      '<script src="static/js/lib-axios.1.js"></script><script defer src="static/js/gtUi.2730441d.js"></script>';
    expect(findGtUiBundlePath(html)).toBe("static/js/gtUi.2730441d.js");
    expect(findGtUiBundlePath("<html></html>")).toBeNull();
  });
});
