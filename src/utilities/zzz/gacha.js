import axios from "axios";

async function fetchWarpData(query, id, endId) {
  query.set("real_gacha_type", id);
  query.set("end_id", endId);

  return axios
    .get(
      "https://public-operation-nap-sg.hoyoverse.com/common/gacha_record/api/getGachaLog?" +
        query
    )
    .then((response) => response.data);
}

async function warpLog(input, userLocale) {
  const takumiQuery = new URLSearchParams({
    authkey_ver: 1,
    sign_type: 2,
    game_biz: "nap_global",
    lang: userLocale,
    authkey: "",
    region: "",
    real_gacha_type: 0,
    size: 20,
    end_id: 0,
  });

  const queryParams = new URLSearchParams(input);
  const authkey = queryParams.get("authkey");
  const lastId = queryParams.get("end_id");
  const gachaTypes = { regular: 1, character: 2, weapon: 3, bangboo: 5 };

  if (authkey) {
    const query = takumiQuery;
    query.set("authkey", authkey);

    const warps = [];

    for (const [gachaType, id] of Object.entries(gachaTypes)) {
      console.log(`Fetching ${gachaType} data...`);
      let last_id = 0;
      const tempWarps = [];

      while (true) {
        const warpData = await fetchWarpData(query, id, last_id);

        if (warpData && warpData.data) {
          const listLength = warpData.data.list.length - 1;

          if (listLength < 0) break;

          for (const warp of warpData.data.list) {
            if (warp.id == lastId) break;
            tempWarps.push({
              id: warp.item_id,
              name: warp.name.toLowerCase().replaceAll(" ", "_"),
              type: warp.item_type.toLowerCase().replaceAll(" ", "_"),
              time: warp.time,
              rank:
                warp.rank_type == "4" ? "S" : warp.rank_type == "3" ? "A" : "B",
            });
          }

          last_id = warpData.data.list[listLength].id;
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else break;
      }

      warps.push({
        type: gachaType,
        size: tempWarps.length,
        data: tempWarps,
      });
    }

    const list = {
      character: { total: 0, average: 0, pity: 0, data: [] },
      weapon: { total: 0, average: 0, pity: 0, data: [] },
      regular: { total: 0, average: 0, pity: 0, data: [] },
      bangboo: { total: 0, average: 0, pity: 0, data: [] },
    };

    for (const warp of warps) {
      const { type: warpType, data: warpData } = warp;
      let total = 0;
      let count = 0;

      for (const index of warpData.reverse()) {
        total++;
        if (index.rank === "S") {
          list[warpType].data.push({
            id: index.id,
            type: index.type,
            name: index.name,
            count: count + 1,
          });
          count = 0;
        } else {
          count++;
        }
      }

      const { data } = list[warpType];
      data.reverse();
      list[warpType].pity = count;
      list[warpType].average = data.length
        ? parseFloat(
            (data.reduce((acc, i) => acc + i.count, 0) / data.length).toFixed(2)
          )
        : 0;
      list[warpType].total = total;
    }

    return list;
  }
}

const { character, weapon, regular, bangboo } = await warpLog(
  "https://public-operation-nap-sg.hoyoverse.com/common/gacha_record/api/getGachaLog?authkey_ver=1&sign_type=2&auth_appid=webview_gacha&win_mode=fullscreen&gacha_id=2c1f5692fdfbb733a08733f9eb69d32aed1d37&timestamp=1720620373&init_log_gacha_type=2001&init_log_gacha_base_type=2&ui_layout=&button_mode=default&plat_type=3&authkey=GIpnAjPqL54LSBIuuUuVh0fz6inZ3Liui65n6l4ev%2B6i8JihDuk6ujW8k8JQy0GVi8sFLraW3JgP%2BBcI6ttSPAE1%2Fwh3R9FcgpTAJqRypxokZ198SDQKDU3z%2B5JoZ%2FuT99LTTP1XeaG1wy3FT4XpDh9uCfqGYjecMejRCM7k2CdWx6agafOon%2F7D6pKIFE%2Fne8YxvDMvA53df8MBwDSKgh%2B8vDMKmPCf%2B4Hm%2FNpH6O0D1ZZtbeX1RP4B0V72hmgVpw5TXptsmFSVZ8pT8Vp2R5ilOepBmg4tlJ%2Bk5GSJvSJpZuRiUqvPAMXooX3Qb49pZMwgS3zcXe7eaeuiZ5ojNwBj6v4AnVB8zxZJJxI2TyVD7bZSHELZsBOzUAnlL2gyn%2Bx0iRSGRYPhYYVL%2B3lrg5n6a13vTSi0n6D8NbmXQfUL9d%2BMGmOLetWZWVv1yLNd9dITEZw7HuRjIndwzN2RBjACLTSlMTnVUZGMzCQPfp0ZNEuzvx0lixI1vBEdop4BrwGMGL56CM%2B87EdMOioSq%2B9bJ%2FarWDJQ5U%2FCXuLK%2B%2FNZGFCvEKQ%2BxPkprq%2B%2FoKWpmhQ0aaoqIbTzaM20hxBlFKmy%2FgNjT1InJLJsGeaN2XzT%2B3D8WsIlI%2F08MMJ5P3ED3nxSPsEoIKOmYhYdu3syTTSRskpcLAspXjImyEVHB70%3D&lang=zh-tw&region=prod_gf_jp&game_biz=nap_global&page=1&size=5&gacha_type=2001&real_gacha_type=2&end_id=",
  "zh-tw"
);

console.log(
  "============================== Warp Log =============================="
);
console.log("Character:");
console.log(
  `總抽數：${character.total}抽, 平均五星抽數：${character.average}抽, 已在這卡持墊了：${character.pity}抽 \n 抽到了 ${character.data.map((i) => i.name).join(", ")}`
);
console.log("Weapon:");
console.log(
  `總抽數：${weapon.total}抽, 平均五星抽數：${weapon.average}抽, 已在這卡持墊了：${weapon.pity}抽 \n 抽到了 ${weapon.data.map((i) => i.name).join(", ")}`
);
console.log("Regular:");
console.log(
  `總抽數：${regular.total}抽, 平均五星抽數：${regular.average}抽, 已在這卡持墊了：${regular.pity}抽 \n 抽到了 ${regular.data.map((i) => i.name).join(", ")}`
);
console.log("Bangboo:");
console.log(
  `總抽數：${bangboo.total}抽, 平均五星抽數：${bangboo.average}抽, 已在這卡持墊了：${bangboo.pity}抽 \n 抽到了 ${bangboo.data.map((i) => i.name).join(", ")}`
);

// To get gachaUrl use this
// Start-Process powershell -Verb runAs -ArgumentList '-NoExit -Command "Invoke-Expression  (New-Object Net.WebClient).DownloadString(\"https://raw.githubusercontent.com/yeci226/ZZZ-ToS-PP/main/getSignal.ps1\")"'
