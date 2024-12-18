import axios from "axios";
import {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
} from "discord.js";
import {
  getRandomColor,
  drawInQueueReply,
  getAvatarUrl,
} from "../utilities.js";
import Queue from "queue";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { join } from "path";

const drawQueue = new Queue({ autostart: true });

const fontPaths = {
  EN: "en-us.ttf",
  TW: "zh-tw.ttf",
  CN: "zh-cn.ttf",
  VI: "vi-vn.ttf",
  JP: "ja-jp.ttf",
  KR: "ko-kr.ttf",
  FR: "fr-fr.ttf",
  Nunito: "Nunito-BlackItalic.ttf",
};

for (const [key, value] of Object.entries(fontPaths))
  GlobalFonts.registerFromPath(join(".", "src", "assets", value), key);

const zzzStaticUrl = "https://act-webstatic.hoyoverse.com/game_record/zzz";
const bangbooRectangleUrl = `${zzzStaticUrl}/bangboo_rectangle_avatar/bangboo_rectangle_avatar_`;

function getAgentImageUrl(agentId) {
  if (agentId < 10000) {
    return getAvatarUrl(agentId);
  } else if (agentId >= 10000 && agentId < 50000) {
    return `./src/assets/images/icons/gacha/weapon/${agentId}.webp`;
  } else {
    return bangbooRectangleUrl + agentId + ".png";
  }
}

async function processAgent(agent) {
  if (!agent?.id) return "./src/assets/images/icons/gacha/none.png";
  return getAgentImageUrl(agent.id);
}

const fonts = {
  tw: "TW",
  cn: "CN",
  vi: "VI",
  jp: "JP",
  kr: "KR",
  fr: "FR",
  default: "EN",
};

const countColor = [
  { threshold: 50, color: "#9DF1DF" },
  { threshold: 70, color: "#FFBB5C" },
  { threshold: 90, color: "#FF6969" },
];

async function loadImageAsync(url, fallbackUrl) {
  try {
    return await loadImage(url);
  } catch {
    return await loadImage(fallbackUrl || "./src/assets/images/None.png");
  }
}

async function fetchSignalData(query, id, endId) {
  query.set("real_gacha_type", id);
  query.set("end_id", endId);

  const response = await axios.get(
    "https://public-operation-nap-sg.hoyoverse.com/common/gacha_record/api/getGachaLog?" +
      query
  );
  return response.data;
}

export async function getSingalLog(interaction, tr, userLocale, input) {
  const baseQueryParams = new URLSearchParams({
    authkey_ver: 1,
    sign_type: 2,
    game_biz: "nap_global",
    lang: ["tw", "cn"].includes(userLocale) ? `zh-${userLocale}` : userLocale,
    authkey: "",
    region: "",
    real_gacha_type: 0,
    size: 20,
    end_id: 0,
  });

  const type = {
    regular: tr("RegularPool"),
    character: tr("CharacterPool"),
    weapon: tr("WeaponPool"),
    bangboo: tr("BangbooPool"),
  };

  const inputParams = new URLSearchParams(input);
  const authkey = inputParams.get("authkey");
  const lastId = inputParams.get("end_id");
  const gachaTypes = { regular: 1, character: 2, weapon: 3, bangboo: 5 };

  if (!authkey) return;

  const query = new URLSearchParams(baseQueryParams);
  query.set("authkey", authkey);

  const allSignalData = [];

  for (const [gachaType, id] of Object.entries(gachaTypes)) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(tr("gacha_Loading", { type: type[gachaType] }))
          .setColor(getRandomColor())
          .setImage(
            "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif"
          ),
      ],
      fetchReply: true,
    });

    let endId = 0;
    const temp = [];

    while (true) {
      const signalData = await fetchSignalData(query, id, endId);
      if (!signalData?.data || !signalData.data.list.length) break;

      const list = signalData.data.list;
      const signalReachedLastId = list.some((signal) => signal.id == lastId);

      temp.push(
        ...list.map((signal) => ({
          id: signal.item_id,
          name: signal.name.toLowerCase().replace(/\s+/g, "_"),
          type: signal.item_type.toLowerCase().replace(/\s+/g, "_"),
          time: signal.time,
          rank:
            signal.rank_type == "4" ? "S" : signal.rank_type == "3" ? "A" : "B",
        }))
      );

      if (signalReachedLastId) break;

      endId = list[list.length - 1].id;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    allSignalData.push({
      type: gachaType,
      size: temp.length,
      data: temp,
    });
  }

  const allSignalSRanklist = {
    character: { total: 0, average: 0, pity: 0, data: [] },
    weapon: { total: 0, average: 0, pity: 0, data: [] },
    regular: { total: 0, average: 0, pity: 0, data: [] },
    bangboo: { total: 0, average: 0, pity: 0, data: [] },
  };

  for (const { type, data } of allSignalData) {
    let total = data.length;
    let count = 0;
    let dataList = [];

    for (let i = total - 1; i >= 0; i--) {
      count++;
      const item = data[i];
      if (item.rank === "S") {
        dataList.push({ ...item, count });
        count = 0;
      }
    }

    allSignalSRanklist[type].data = dataList.reverse();
    allSignalSRanklist[type].pity = count;
    allSignalSRanklist[type].average =
      dataList.length > 1
        ? parseFloat(
            (
              dataList.reduce((acc, i) => acc + i.count, 0) / dataList.length
            ).toFixed(2)
          )
        : 0;
    allSignalSRanklist[type].total = total;
    allSignalSRanklist[type].data.unshift({}); // Add blank data for showing pities
  }

  return allSignalSRanklist;
}

export async function handleSignalLogDraw(
  interaction,
  tr,
  userLocale,
  requestTime,
  signalResults,
  type = "character"
) {
  const drawTask = async () => {
    try {
      // // Request
      // const requestStartTime = Date.now();
      // let signalResults;
      // if (url != "")
      //   signalResults = await getSingalLog(interaction, tr, userLocale, url);
      // if (!signalResults) throw new Error("沒有資料 哈哈");
      // const requestEndTime = Date.now();

      // Generate
      const drawStartTime = Date.now();
      const imageBuffer = await drawSignalLogImage(
        tr,
        userLocale,
        signalResults[type],
        type
      );
      if (!imageBuffer) throw new Error(tr("profile_NoImageData"));
      const drawEndTime = Date.now();

      // bla bla bla Builder
      const image = new AttachmentBuilder(imageBuffer, {
        name: `singalLog_${interaction.user.id}.png`,
      });

      const rowGachaTypeSelecter = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("signalLogSelect")
          .setPlaceholder(tr("gacha_SelectType"))
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(tr("CharacterPool"))
              .setValue("character"),
            new StringSelectMenuOptionBuilder()
              .setLabel(tr("WeaponPool"))
              .setValue("weapon"),
            new StringSelectMenuOptionBuilder()
              .setLabel(tr("RegularPool"))
              .setValue("regular"),
            new StringSelectMenuOptionBuilder()
              .setLabel(tr("BangbooPool"))
              .setValue("bangboo")
          )
      );

      const resMessage = await interaction.editReply({
        embeds: [
          new EmbedBuilder().setImage(`attachment://${image.name}`).setFooter({
            text: tr("CostTime", {
              requestTime: requestTime,
              drawTime: ((drawEndTime - drawStartTime) / 1000).toFixed(2),
            }),
          }),
        ],
        components: [rowGachaTypeSelecter],
        files: [image],
      });

      let collector = resMessage.createMessageComponentCollector({
        time: 30 * 60 * 1000, // 30 mins
        componentType: ComponentType.StringSelect,
      });

      collector.on("collect", async (interaction) => {
        const { values } = interaction;
        const type = values[0];

        await interaction.deferUpdate({ fetchReply: true }).catch(() => {});
        interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(tr("Searching"))
              .setColor(getRandomColor())
              .setImage(
                "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif"
              ),
          ],
          components: [],
          fetchReply: true,
        });

        handleSignalLogDraw(
          interaction,
          tr,
          userLocale,
          requestTime,
          signalResults,
          type
        );
        collector.stop();
      });

      collector.on("end", () => {
        resMessage.edit({
          components: [],
        });
      });
    } catch (error) {
      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#E76161")
            .setTitle(tr("DrawError"))
            .setDescription(`\`${error}\``)
            .setThumbnail(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png"
            ),
        ],
        fetchReply: true,
      });
    }
  };
  drawQueue.push(drawTask);

  if (drawQueue.length !== 1) {
    drawInQueueReply(
      interaction,
      tr("DrawInQueue", { position: drawQueue.length - 1 })
    );
  }
}

export async function drawSignalLogImage(tr, userLocale, signalResults, type) {
  try {
    const selectedFont = fonts[userLocale] || fonts.default;
    const canvas = createCanvas(1000, 1600);
    const ctx = canvas.getContext("2d");

    const imagePaths = [
      "./src/assets/images/gachaBg.png",
      "./src/assets/images/icons/gacha/character.png",
      "./src/assets/images/icons/gacha/regular.png",
      "./src/assets/images/icons/gacha/boopon.png",
      ...(await Promise.all(signalResults.data.map(processAgent))),
    ];
    const images = await Promise.all(imagePaths.map(loadImageAsync));
    const [bg, characterImage, regularImage, booponImage, ...restImages] =
      images;
    const agentImages = restImages.slice(0, signalResults.data.length);
    const boxColor = "rgba(64, 64, 64, 255)";

    // Draw BackGround
    ctx.drawImage(bg, 0, 0, ctx.width, ctx.height);

    // Draw BackGround Text
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.font = `24px ${selectedFont}`;
    ctx.fillText(tr("InterKnot"), 30, 33);

    // Draw Signal Data
    drawRoundedRect(ctx, 70, 100, 500, 230, 30, boxColor); // (ctx, x, y, width, height, radius, color)
    const titleFontSize = 34;
    ctx.textAlign = "left";
    drawText(
      ctx,
      tr("gacha_TotalCount"),
      selectedFont,
      320,
      titleFontSize,
      titleFontSize - 4,
      100,
      160
    ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
    drawText(
      ctx,
      tr("gacha_SRankCount"),
      selectedFont,
      320,
      titleFontSize,
      titleFontSize - 4,
      100,
      220
    ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
    drawText(
      ctx,
      tr("gacha_SRankAverage"),
      selectedFont,
      320,
      titleFontSize,
      titleFontSize - 4,
      100,
      290
    ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
    ctx.textAlign = "right";
    drawText(
      ctx,
      `${signalResults.total}`,
      selectedFont,
      100,
      titleFontSize,
      titleFontSize - 4,
      540,
      160
    ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
    drawText(
      ctx,
      `${signalResults.data.length - 1 ?? 0}`,
      selectedFont,
      100,
      titleFontSize,
      titleFontSize - 4,
      540,
      230
    ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
    drawText(
      ctx,
      `${isNaN(signalResults.average) ? 0 : signalResults.average}`,
      selectedFont,
      100,
      titleFontSize,
      titleFontSize - 4,
      540,
      290
    ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)

    // Draw Signal Result
    signalResults.data.forEach((data, index) => {
      const offsetX = (index % 5) * (160 + 15);
      const offsetY = Math.floor(index / 5) * 200;
      if (index < 25) {
        // Draw S Rank Picture
        drawRoundedRectImage(
          ctx,
          agentImages[index],
          70 + offsetX,
          390 + offsetY,
          160,
          160,
          30,
          boxColor
        ); // (ctx, img, x, y, width, height, radius)

        // Draw Agent Name

        if (index == 0) {
          ctx.textAlign = "center";
          drawText(
            ctx,
            tr("gacha_Pity", { pity: signalResults.pity }),
            selectedFont,
            160,
            30,
            28,
            150 + offsetX,
            590 + offsetY,
            "#808080"
          ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
        } else {
          ctx.textAlign = "center";
          const nameText = data?.name ?? "NONE";
          const count = data?.count ?? 0;
          const countText = tr("gacha_Count", { count });

          // Draw Agent Name
          drawText(
            ctx,
            nameText,
            selectedFont,
            160,
            30,
            20,
            145 + offsetX - ctx.measureText(countText).width / 2,
            590 + offsetY
          ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)

          // Draw Agent Count
          let color = "#000000";
          for (const { threshold, color: colorValue } of countColor)
            if (count <= threshold) {
              color = colorValue;
              break;
            }
          ctx.textAlign = "center";
          drawText(
            ctx,
            countText,
            selectedFont,
            160,
            30,
            20,
            145 + offsetX + ctx.measureText(nameText).width / 2 + 5,
            590 + offsetY,
            color
          ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
        }
      }
    });

    // Draw Signal Type
    const i =
      type === "character"
        ? 0
        : type === "weapon"
          ? 1
          : type === "regular"
            ? 2
            : 3;

    const offsetX = i * (160 + 35);
    drawRoundedRect(ctx, 100 + offsetX, 1440, 160, 160, 30, boxColor); // (ctx, x, y, width, height, radius, color)
    drawRoundedRect(ctx, 70 + offsetX, 1500, 220, 160, 30, boxColor);
    drawRoundedRect(
      ctx,
      -60 + offsetX,
      1440,
      160,
      160,
      30,
      "rgba(48, 48, 48, 255)"
    );
    drawRoundedRect(
      ctx,
      260 + offsetX,
      1440,
      160,
      160,
      30,
      "rgba(48, 48, 48, 255)"
    );

    // Draw Signal Type
    ctx.drawImage(characterImage, 110, 1450, 140, 140);
    ctx.drawImage(characterImage, 305, 1450, 140, 140);
    ctx.drawImage(regularImage, 500, 1450, 140, 140);
    ctx.drawImage(booponImage, 695, 1450, 140, 140);

    return canvas.toBuffer("image/png");
  } catch (e) {
    console.error(e);
    return null;
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius, color) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
}

function drawRoundedRectImage(ctx, img, x, y, width, height, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(
    img,
    x + (width - img.width) / 2,
    y + (height - img.height) / 2,
    img.width,
    img.height
  );
  ctx.restore();
}

function drawText(
  ctx,
  text,
  selectedFont,
  maxWidth,
  initialFontSize,
  minFontSize,
  x,
  y,
  color = "white"
) {
  let fontSize = initialFontSize;
  ctx.font = `${fontSize}px ${selectedFont}`;
  let textWidth = ctx.measureText(text).width;

  while (textWidth > maxWidth && fontSize > minFontSize) {
    fontSize--;
    ctx.font = `${fontSize}px ${selectedFont}`;
    textWidth = ctx.measureText(text).width;
  }

  ctx.fillStyle = color;
  ctx.fillText(`${text}`, x, y);
}

// To get gachaUrl use this
// Start-Process powershell -Verb runAs -ArgumentList '-NoExit -Command "Invoke-Expression  (New-Object Net.WebClient).DownloadString(\"https://raw.githubusercontent.com/yeci226/ZZZ-ToS-PP/main/getSignal.ps1\")"'

// https://public-operation-nap-sg.hoyoverse.com/common/gacha_record/api/getGachaLog?authkey_ver=1&sign_type=2&auth_appid=webview_gacha&win_mode=fullscreen&gacha_id=7083b8f538908fae48f161333dfb709835bfd8&timestamp=1723591680&init_log_gacha_type=2001&init_log_gacha_base_type=2&ui_layout=&button_mode=default&plat_type=pc&authkey=GIpnAjPqL54LSBIuuUuVh0fz6inZ3Liui65n6l4ev%2B6i8JihDuk6ujW8k8JQy0GVi8sFLraW3JgP%2BBcI6ttSPAE1%2Fwh3R9FcgpTAJqRypxokZ198SDQKDU3z%2B5JoZ%2FuT99LTTP1XeaG1wy3FT4XpDh9uCfqGYjecMejRCM7k2Ceiy29lx0%2ButI2k2VRxkUngb9bnYBPLLKA90D2bq8rNSHSpHZvsI3g5tBWhGGTv43rnWueiVSqQszMdL8wTnzQ3pw5TXptsmFSVZ8pT8Vp2R5ilOepBmg4tlJ%2Bk5GSJvSJpZuRiUqvPAMXooX3Qb49pZMwgS3zcXe7eaeuiZ5ojNwBj6v4AnVB8zxZJJxI2TyVD7bZSHELZsBOzUAnlL2gyn%2Bx0iRSGRYPhYYVL%2B3lrg5n6a13vTSi0n6D8NbmXQfUL9d%2BMGmOLetWZWVv1yLNd9dITEZw7HuRjIndwzN2RBjACLTSlMTnVUZGMzCQPfp0ZNEuzvx0lixI1vBEdop4BBER22yxPi2%2FU4vnB95NJh%2BALu3Z8rWux3%2B6mZJb6YPy213YeZwKzTvmjQ8LxX89gRCHxRVzekqYZCqmLr3dcTqmy%2FgNjT1InJLJsGeaN2XzT%2B3D8WsIlI%2F08MMJ5P3ED3nxSPsEoIKOmYhYdu3syTTSRskpcLAspXjImyEVHB70%3D&lang=zh-tw&region=prod_gf_jp&game_biz=nap_global&page=1&size=5&gacha_type=2001&real_gacha_type=2&end_id=
