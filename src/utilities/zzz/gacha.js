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
  getWeaponData,
  getBangbooData,
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

async function getAgentImageUrl(agent) {
  if (!agent?.id) return "./src/assets/images/icons/gacha/none.png";
  const agentId = parseInt(agent.id);

  if (agentId < 10000) {
    return getAvatarUrl(agentId);
  } else if (agentId >= 10000 && agentId < 50000) {
    const weaponData = await getWeaponData(agentId);
    return weaponData.iconUrl;
  } else {
    const bangbooData = await getBangbooData(agentId);
    return bangbooData.iconUrl;
  }
}

const standardCharacterIds = ["1021", "1041", "1101", "1141", "1181", "1211"];
const standardWeaponIds = [
  "14104",
  "14102",
  "14110",
  "14114",
  "14121",
  "14118",
];

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
    try {
      return await loadImage(fallbackUrl);
    } catch {
      return await loadImage("./src/assets/images/None.png");
    }
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

    if (type === "character" || type === "weapon") {
      let limitedPullSegments = [];
      let counterSinceLastS = 0;
      const standardIds =
        type === "character" ? standardCharacterIds : standardWeaponIds;

      for (let i = data.length - 1; i >= 0; i--) {
        counterSinceLastS++;
        const item = data[i];

        if (item.rank === "S") {
          const isLimited = !standardIds.includes(item.id.toString());
          if (isLimited) {
            limitedPullSegments.push(counterSinceLastS);
            counterSinceLastS = 0;
          }
        }
      }

      if (limitedPullSegments.length > 0) {
        const totalPulls = limitedPullSegments.reduce((sum, c) => sum + c, 0);
        const avg = totalPulls / limitedPullSegments.length;
        allSignalSRanklist[type].limitedCharacterPullsAverage = parseFloat(
          avg.toFixed(2)
        );
      } else {
        allSignalSRanklist[type].limitedCharacterPullsAverage = 0;
      }
    } else {
      allSignalSRanklist[type].limitedCharacterPullsAverage = 0;
    }
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
            text: tr("TimeSpent", {
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
        await interaction.editReply({
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
      await interaction.editReply({
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
      "./src/assets/images/icons/gacha/o.png",
      "./src/assets/images/icons/gacha/fei.png",
      "./src/assets/images/icons/gacha/y.png",
      ...(await Promise.all(signalResults.data.map(getAgentImageUrl))),
    ];
    const images = await Promise.all(imagePaths.map(loadImageAsync));
    const [
      bg,
      characterImage,
      regularImage,
      booponImage,
      stampGoodLuckImage,
      stampBadLuckImage,
      yImage,
      ...restImages
    ] = images;
    const agentImages = restImages.slice(0, signalResults.data.length);
    const standardCharacterImage = yImage;
    const boxColor = "rgba(64, 64, 64, 255)";

    // Draw BackGround
    ctx.drawImage(bg, 0, 0, ctx.width, ctx.height);

    // Draw BackGround Text
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.font = `24px ${selectedFont}`;
    ctx.fillText(tr("InterKnot"), 30, 33);

    const isLimitedPool = type === "character" || type === "weapon";
    // Draw Signal Data
    drawRoundedRect(
      ctx,
      70,
      isLimitedPool ? 100 : 125,
      500,
      isLimitedPool ? 270 : 220,
      30,
      boxColor
    ); // (ctx, x, y, width, height, radius, color) - Increased height for new line
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
      isLimitedPool ? 160 : 185
    ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
    drawText(
      ctx,
      tr("gacha_SRankCount"),
      selectedFont,
      320,
      titleFontSize,
      titleFontSize - 4,
      100,
      isLimitedPool ? 220 : 245
    ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
    drawText(
      ctx,
      tr("gacha_SRankAverage"),
      selectedFont,
      320,
      titleFontSize,
      titleFontSize - 4,
      100,
      isLimitedPool ? 280 : 305
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
      isLimitedPool ? 160 : 185
    ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
    drawText(
      ctx,
      `${signalResults.data.length - 1 ?? 0}`,
      selectedFont,
      100,
      titleFontSize,
      titleFontSize - 4,
      540,
      isLimitedPool ? 220 : 245
    ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
    drawText(
      ctx,
      `${isNaN(signalResults.average) ? 0 : signalResults.average}`, // Use a ternary operator to handle NaN
      selectedFont,
      100,
      titleFontSize,
      titleFontSize - 4,
      540,
      isLimitedPool ? 280 : 305
    ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
    if (isLimitedPool) {
      drawText(
        ctx,
        `${isNaN(signalResults.limitedCharacterPullsAverage) ? 0 : signalResults.limitedCharacterPullsAverage}`,
        selectedFont,
        100,
        titleFontSize,
        titleFontSize - 4,
        540,
        340
      );
      ctx.textAlign = "left";
      drawText(
        ctx,
        tr("gacha_LimitedCharacterPulls"),
        selectedFont,
        320,
        titleFontSize,
        titleFontSize - 4,
        100,
        340
      );
    }

    // Draw Signal Result
    signalResults.data.forEach((data, index) => {
      const offsetX = (index % 5) * (160 + 15);
      const offsetY = Math.floor(index / 5) * 210;
      if (index < 25) {
        // Draw S Rank Picture
        drawRoundedRectImage(
          ctx,
          agentImages[index],
          70 + offsetX,
          390 + offsetY, // Adjusted Y-offset
          160,
          160,
          30,
          boxColor
        ); // (ctx, img, x, y, width, height, radius)

        // New: Draw y.png overlay for standard characters
        if (
          (type === "character" || type === "weapon") &&
          index !== 0 &&
          standardCharacterIds.includes(data.id.toString())
        ) {
          const overlaySize = 80; // Size of the y.png overlay
          const overlayX = 85 + offsetX + 160 - overlaySize - 5; // Position at top-right, with some padding
          const overlayY = 375 + offsetY + 5; // Adjusted Y-offset

          ctx.save();
          ctx.translate(overlayX + overlaySize / 2, overlayY + overlaySize / 2); // Center for rotation
          ctx.rotate((25 * Math.PI) / 180); // Rotate by 20 degrees
          ctx.drawImage(
            standardCharacterImage,
            -overlaySize / 2,
            -overlaySize / 2,
            overlaySize,
            overlaySize
          );
          ctx.restore();
        }

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
            585 + offsetY,
            "#808080"
          ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
        } else {
          const nameText = data?.name ?? "NONE";
          const count = data?.count ?? 0;
          const countText = tr("gacha_Count", { count });
          const combinedText = `${nameText}${countText}`;

          const maxTextWidth = 160; // Max width for name + count
          const initialFontSize = 30;
          const minFontSize = 20;

          // Get optimal font size for the combined text
          const optimalFontSize = getOptimalFontSize(
            ctx,
            combinedText,
            selectedFont,
            maxTextWidth,
            initialFontSize,
            minFontSize
          );

          // Set font for actual drawing
          ctx.font = `${optimalFontSize}px ${selectedFont}`;

          const nameWidth = ctx.measureText(nameText).width;
          const countWidth = ctx.measureText(countText).width;

          const gap = 3; // Small gap between name and count
          const totalCombinedWidth = nameWidth + countWidth + gap;

          // Calculate starting X to center the combined text within the 160px space
          const startX = 150 + offsetX - totalCombinedWidth / 2;

          ctx.textAlign = "left";
          // Draw Agent Name
          drawText(
            ctx,
            nameText,
            selectedFont,
            nameWidth, // Use actual name width as max for its own drawing
            optimalFontSize,
            optimalFontSize, // Fixed size after calculation
            startX,
            585 + offsetY
          ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)

          // Draw Agent Count
          let color = "#000000";
          for (const { threshold, color: colorValue } of countColor)
            if (count <= threshold) {
              color = colorValue;
              break;
            }
          drawText(
            ctx,
            countText,
            selectedFont,
            countWidth, // Use actual count width as max for its own drawing
            optimalFontSize,
            optimalFontSize, // Fixed size after calculation
            startX + nameWidth + gap,
            585 + offsetY,
            color
          ); // (ctx, text, selectedFont, maxWidth, initialFontSize, minFontSize, x, y)
        }
      }
    });

    // New: Draw Stamp based on average S-rank pulls
    let stampImage = null;
    let stampPullsForCalculation = 0;

    if (
      type === "character" &&
      signalResults.limitedCharacterPullsAverage !== undefined
    ) {
      stampPullsForCalculation = signalResults.limitedCharacterPullsAverage;
    } else {
      stampPullsForCalculation = signalResults.average;
    }

    if (stampPullsForCalculation > 110) {
      stampImage = stampBadLuckImage;
    } else if (stampPullsForCalculation < 70) {
      stampImage = stampGoodLuckImage;
    }

    if (stampImage) {
      ctx.save();
      ctx.translate(780, 240);

      const stampSize = 250; // Size of the square stamp

      // Draw the stamp image
      ctx.drawImage(
        stampImage,
        -stampSize / 2,
        -stampSize / 2,
        stampSize,
        stampSize
      );

      ctx.restore();
    }

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
    const baseX = (canvas.width - (160 * 4 + 35 * 3)) / 2 - 100;

    drawRoundedRect(ctx, baseX + 100 + offsetX, 1440, 160, 160, 30, boxColor);
    drawRoundedRect(ctx, baseX + 70 + offsetX, 1500, 220, 160, 30, boxColor);

    drawRoundedRect(
      ctx,
      baseX - 60 + offsetX,
      1440,
      160,
      160,
      30,
      "rgba(48, 48, 48, 255)"
    );
    drawRoundedRect(
      ctx,
      baseX + 260 + offsetX,
      1440,
      160,
      160,
      30,
      "rgba(48, 48, 48, 255)"
    );

    // Draw Signal Type
    const iconWidth = 140;
    const iconGap = 55; // spacing between icons
    const totalIcons = 4;
    const totalWidth = iconWidth * totalIcons + iconGap * (totalIcons - 1);
    const startX = (canvas.width - totalWidth) / 2;
    const y = 1450;

    ctx.drawImage(
      characterImage,
      startX + 0 * (iconWidth + iconGap),
      y,
      iconWidth,
      iconWidth
    );
    ctx.drawImage(
      characterImage,
      startX + 1 * (iconWidth + iconGap),
      y,
      iconWidth,
      iconWidth
    );
    ctx.drawImage(
      regularImage,
      startX + 2 * (iconWidth + iconGap),
      y,
      iconWidth,
      iconWidth
    );
    ctx.drawImage(
      booponImage,
      startX + 3 * (iconWidth + iconGap),
      y,
      iconWidth,
      iconWidth
    );

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

  const imgAspect = img.width / img.height;
  const targetAspect = width / height;

  let drawWidth, drawHeight, offsetX, offsetY;

  if (imgAspect > targetAspect) {
    drawHeight = height;
    drawWidth = img.width * (height / img.height);
    offsetX = x - (drawWidth - width) / 2;
    offsetY = y;
  } else {
    drawWidth = width;
    drawHeight = img.height * (width / img.width);
    offsetX = x;
    offsetY = y - (drawHeight - height) / 2;
  }

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

  ctx.restore();
}

function getOptimalFontSize(
  ctx,
  text,
  selectedFont,
  maxWidth,
  initialFontSize,
  minFontSize
) {
  let fontSize = initialFontSize;
  ctx.font = `${fontSize}px ${selectedFont}`;
  let textWidth = ctx.measureText(text).width;

  while (textWidth > maxWidth && fontSize > minFontSize) {
    fontSize--;
    ctx.font = `${fontSize}px ${selectedFont}`;
    textWidth = ctx.measureText(text).width;
  }
  return fontSize;
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
  ctx.fillText(text, x, y);
  return textWidth;
}

// To get gachaUrl use this in PowerShell
// Start-Process powershell -Verb runAs -ArgumentList '-NoExit -Command "Invoke-Expression  (New-Object Net.WebClient).DownloadString(\"https://raw.githubusercontent.com/yeci226/ZZZ-ToS-PP/main/getSignal.ps1\")"'

// https://public-operation-nap-sg.hoyoverse.com/common/gacha_record/api/getGachaLog?authkey_ver=1&sign_type=2&auth_appid=webview_gacha&win_mode=fullscreen&gacha_id=ab661a7ad928f17ee22a87f9b1f959b49ef58175&timestamp=1749165432&font_thickness_mode=1&init_log_gacha_type=2001&init_log_gacha_base_type=2&ui_layout=&button_mode=default&plat_type=pc&is_gacha=1&no_joypad_close=1&authkey=GIpnAjPqL54LSBIuuUuVh0fz6inZ3Liui65n6l4ev%2B6i8JihDuk6ujW8k8JQy0GVi8sFLraW3JgP%2BBcI6ttSPAE1%2Fwh3R9FcgpTAJqRypxokZ198SDQKDU3z%2B5JoZ%2FuT99LTTP1XeaG1wy3FT4XpDh9uCfqGYjecMejRCM7k2Ce51JzMoqyso1dANa0sO8ehsaaWDVgVeaDClSi2%2FlJe1jMqcnMTJyaTxCHOMkMsYrMBBHQUoWfCUQYRSlTX2sLCC%2BHTUFJscqq8EW9JSsUi9I1SR22jwKU7RPjwQdI0SUuyYDDjbVnyPYtcMDdcJUAxNhdU2rPDcJ6BcBsNiw9lT5WvcibxBAdIizNeVCAXWnxxNNoUQfcRf3flUCVpeVz0TJztQXnAOx62tfbeRE3tTOEYgKy05hfq%2Ba0g806AjUawFRMILPRS167mANCEVHU9mdgalBwCUHmq%2F7QydriiYlNWFfSP7Cp8O8tJojzEo3f%2BDoIJA6G%2BCZM3MmGnk%2BK4X6AAUWza5tC6fp2%2BLAAiuaw1rYbKlVZKEKTxOdvARVnKaxip9iUxcyOg7f5MhzLJD7JVDnkptykorsY5en1I2oUkGPUW%2BoAJ%2BgbopxWVfI88gSxp1SB64D7I2R5ISKR836W9wvG6QAJHUnQ3%2FSf6E%2Bt9kYjfu6Ex6WeWNVK%2Fhm42Xosr6Lb4NXvr5veGYQIV%2F6ursGChprhKEF8tvjYSKdtT%2BGsWjgpUZ8KN29JCF9EmpIcpmCH2RjlfL9Pr2fjz&lang=zh-tw&region=prod_gf_jp&game_biz=nap_global&page=1&size=5&gacha_type=2001&real_gacha_type=2&end_id=
