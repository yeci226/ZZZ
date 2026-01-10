import { client } from "../../index.js";
import {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import Queue from "queue";
import {
  getRandomColor,
  drawInQueueReply,
  getUserHoyolabData,
  getUserLang,
  getCharacterData,
} from "../utilities.js";
import { toI18nLang } from "../core/i18n.js";
import emoji from "../../assets/emoji.js";
import {
  createCanvas,
  loadImage,
  GlobalFonts,
  SKRSContext2D,
  Image,
} from "@napi-rs/canvas";
import fs from "fs";
import { join } from "path";
const db = client.db;
const drawQueue = new Queue({ autostart: true });

const offsetCharacter: Record<
  string,
  { x?: number; y?: number; title?: string; element?: string }
> = {
  // Default { x: 0, y: 0, title: "", element: "" }
  1091: { x: -70, title: "VoidHunter", element: "frost" }, // Miyabi
  1181: { x: -55 }, // Grace
  1221: { x: 60 }, // Yanagi
  1251: { x: -70 }, // Qingyi
  1331: { y: -480 }, // Vivian
  1371: { title: "GrandMaster", element: "auricink" }, // Yixuan
  1381: { x: -70 }, // Zero Anby
  1391: { x: 0, y: -220 }, // Jufufu
  1411: { x: -100, y: -380 }, // Yuzuha
  1431: { title: "VoidHunter", element: "honededge" }, // YeShunguang
};
const offsetCharacterSkin = {
  1031: {
    3110311: { x: 0 },
  },
  1401: {
    3114011: { x: -200 },
  },
  1411: {
    3114111: { x: 0, y: -160 },
  },
  1431: {
    3114311: { x: -200 },
  },
};

const elementId = {
  200: "physic",
  201: "fire",
  202: "ice",
  203: "thunder",
  205: "ether",
};
const professionId = {
  1: "attack",
  2: "stun",
  3: "anomaly",
  4: "support",
  5: "defense",
  6: "rupture",
};
const propertyId = {
  // 基礎屬性
  1: "hp",
  2: "atk",
  3: "def",
  4: "stun", // 衝擊力
  5: "crit", // 暴擊率
  6: "critdmg", // 暴擊傷害
  7: "power", // 異常掌控
  8: "mystery", // 異常精通
  9: "penratio", // 穿透率
  10: "sprecover", // 能量回復
  11: "penvalue", // 穿透值

  // 屬性加成
  12: "physic",
  13: "fire",
  14: "ice",
  15: "thunder",
  16: "ether",

  // 命破專屬
  19: "perforation", // 貫穿力
  20: "energyaccumulation", // 閃能自動累積
};
const propertiesId = {
  11102: "hp", // 小生命
  11103: "hp", // 大生命
  12101: "atk", // 基礎攻擊
  12102: "atk", // 大攻擊
  12103: "atk", // 小攻擊
  12202: "stun", // 衝擊
  13103: "def", // 小防禦
  13102: "def", // 大防禦
  20103: "crit", // 暴率
  21103: "critdmg", // 暴傷
  31402: "power", // 異常掌控
  31203: "mystery", // 異常精通
  30502: "sprecover", // 能量回復
  23103: "penratio", // 穿透率
  23203: "penvalue", // 穿透值
  31503: "physic", // 物理傷害加成
  31603: "fire", // 火傷害加成
  31703: "ice", // 冰傷害加成
  31803: "thunder", // 電傷害加成
  31903: "ether", // 以太傷害加成
};

const zzzStaticUrl = "https://act-webstatic.hoyoverse.com/game_record/zzz";
// const verticalUrl = `${zzzStaticUrl}/role_vertical_painting/role_vertical_painting_`;
// const rectangleUrl = `${zzzStaticUrl}/role_rectangle_avatar/role_rectangle_avatar_`;
// const bangbooSquareUrl = `${zzzStaticUrl}/bangboo_square_avatar/bangboo_square_avatar_`;
const bangbooRectangleUrl = `${zzzStaticUrl}/bangboo_rectangle_avatar/bangboo_rectangle_avatar_`;

GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "en-us.ttf"),
  "EN"
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "zh-tw.ttf"),
  "TW"
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "zh-cn.ttf"),
  "CN"
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "vi-vn.ttf"),
  "VI"
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "ja-jp.ttf"),
  "JP"
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "ko-kr.ttf"),
  "KR"
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "fr-fr.ttf"),
  "FR"
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "impact.ttf"),
  "Impact"
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "Nunito-BlackItalic.ttf"),
  "Nunito"
);

const fonts = {
  tw: "TW",
  cn: "CN",
  vi: "VI",
  jp: "JP",
  kr: "KR",
  fr: "FR",
  default: "EN",
};

async function loadImageAsync(url: string, fallbackUrl?: string) {
  try {
    return await loadImage(url);
  } catch {
    try {
      if (fallbackUrl) return await loadImage(fallbackUrl);
      return await loadImage("./src/assets/images/None.png");
    } catch {
      return await loadImage("./src/assets/images/None.png");
    }
  }
}

export async function handleProfileDraw(
  interaction: any,
  tr: (key: string, args?: any) => string,
  user: any,
  zzz: any,
  accountIndex: number
) {
  const drawTask = async () => {
    try {
      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(tr("Searching"))
            .setColor(getRandomColor() as any)
            .setImage(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif"
            ),
        ],
      });

      // Request
      const requestStartTime = Date.now();
      const userMindScape = (await db.get(`${user.id}.mindscape`)) ?? true;
      const userLocale =
        (await getUserLang(interaction.user.id)) ||
        toI18nLang(interaction.locale) ||
        "en";
      const record = await zzz.record.records();
      const characters = await zzz.record.characters();
      const userData = await getUserHoyolabData(
        interaction,
        tr,
        user.id,
        userLocale,
        accountIndex
      );

      const requestEndTime = Date.now();

      // Generate
      const drawStartTime = Date.now();
      const imageBuffer = await drawMainImage(tr, userLocale, userData, record);
      if (!imageBuffer) throw new Error(tr("profile_NoImageData"));
      const drawEndTime = Date.now();

      // bla bla bla Builder
      const image = new AttachmentBuilder(imageBuffer, {
        name: `MainImage_${zzz.uid}.png`,
      });

      function chunkArray(array: any[], size: number) {
        return Array.from(
          { length: Math.ceil(array.length / size) },
          (_, index) => array.slice(index * size, (index + 1) * size)
        );
      }

      const characterOptions = characters.map((character: any) => {
        return {
          emoji: (emoji as any)[(elementId as any)[character.element_type]],
          label: `${character.name_mi18n}`,
          description: `${tr("profile_CharactersFormat", {
            level: character.level,
            rank: character.rank,
          })}`,
          value: `${user.id}-${accountIndex}-${character.id}`,
        };
      });

      const optionChunks = chunkArray(characterOptions, 25);

      const rowSelects = optionChunks.map((optionsChunk, index) =>
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(`${tr("profile_SelectCharacter")} (${index + 1})`)
            .setCustomId(`profile_SelectCharacter-${index}`)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(optionsChunk)
        )
      );

      const rowMindScape = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("profile_CharacterMindScape")
          .setLabel(tr("MindScape"))
          .setStyle(userMindScape ? ButtonStyle.Success : ButtonStyle.Secondary)
      );

      interaction.editReply({
        embeds: [],
        components: [...rowSelects, rowMindScape],
        files: [image],
      });
    } catch (error: any) {
      if (error?.code == "-501000") {
        interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(tr("note_Error"))
              .setConfig("#E76161", "sob")
              .setImage(
                "https://media.discordapp.net/attachments/1149960935654559835/1258313139078955039/image.png"
              )
              .setDescription(
                tr("note_Error_Description") + "\n\n" + `\`${error.message}\``
              ),
          ],
          withResponse: true,
        });
      } else {
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
          withResponse: true,
        });
      }
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

export async function drawMainImage(
  tr: (key: string, args?: any) => string,
  userLocale: string,
  userData: any,
  record: any
) {
  try {
    const selectedFont =
      fonts[userLocale as keyof typeof fonts] || fonts.default;
    const canvas = createCanvas(1000, 1600);
    const ctx = canvas.getContext("2d");

    const imagePaths = [
      `./src/assets/images/profileBg.png`,
      record.cur_head_icon_url,
      ...(await Promise.all(
        record.avatar_list.map((agent: any) => agent.role_square_url)
      )),
      "./src/assets/images/icons/other/showmore.png",
      ...record.buddy_list.map((buddy: any) => buddy.bangboo_rectangle_url),
      "./src/assets/images/icons/other/showmore.png",
    ];
    const images = await Promise.all(imagePaths.map((p) => loadImageAsync(p)));
    const [bg, userHeadIcon, ...restImages] = images;
    const agentImages = restImages.slice(0, record.avatar_list.length + 1);
    const buddyImages = restImages.slice(record.avatar_list.length + 1);
    const boxColor = "rgba(48, 48, 48, 255)";

    // Draw BackGround
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    // Draw BackGround Text
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.font = `24px ${selectedFont}`;
    ctx.fillText(tr("InterKnot"), 30, 33);

    // Draw User Card
    if (record.game_data_show?.card_url) {
      // Main Card
      const cardImage = await loadImageAsync(record.game_data_show.card_url);

      const cardImageHeight = 265;
      const cardImageScale = Math.min(1, cardImageHeight / cardImage.height);
      ctx.drawImage(
        cardImage,
        -(cardImage.width * cardImageScale) / 2 + canvas.width * 0.66,
        0,
        cardImage.width * cardImageScale,
        cardImageHeight
      );

      // Underline
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, cardImageHeight);
      ctx.lineTo(canvas.width, cardImageHeight);
      ctx.stroke();
    }

    // Draw User Info
    // Draw circular background for user head icon
    const headIconX = 54;
    const headIconY = 94;
    const headIconSize = 129;

    // Draw circular background
    ctx.beginPath();
    ctx.arc(
      headIconX + headIconSize / 2,
      headIconY + headIconSize / 2,
      headIconSize / 2 + 2.5,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "rgba(162, 162, 162, 1)";
    ctx.fill();

    // Draw border
    ctx.beginPath();
    ctx.arc(
      headIconX + headIconSize / 2,
      headIconY + headIconSize / 2,
      headIconSize / 2 + 2.5,
      0,
      Math.PI * 2
    );
    ctx.strokeStyle = "rgba(22, 22, 22, 1)";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw user head icon
    ctx.drawImage(
      userHeadIcon,
      headIconX,
      headIconY,
      headIconSize,
      headIconSize
    );

    const userNameX = 200;
    // Draw User Name
    ctx.textAlign = "left";
    drawText(
      ctx,
      userData?.nickname ?? "Unknown",
      selectedFont,
      170,
      46,
      22,
      userNameX,
      record.game_data_show?.personal_title ? 150 : 180
    ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)

    // Draw User Name Outline
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 2;
    ctx.strokeText(
      userData?.nickname ?? "Unknown",
      userNameX,
      record.game_data_show?.personal_title ? 150 : 180
    );

    // Draw User level
    const userNameWidth = ctx.measureText(userData?.nickname ?? "").width;
    const userLevelString = `Lv.${userData.level}`;
    drawTextWithBackground(
      ctx,
      userLevelString,
      userNameX + userNameWidth + 20,
      145,
      {
        font: `25px ${selectedFont}`,
        textColor: "black",
        backgroundColor: "#FFDE00",
        padding: 7.5,
      }
    );

    // Draw User title
    const gameDataShow = record.game_data_show ?? null;
    const title = gameDataShow?.personal_title ?? null;
    if (title) {
      const titleMainColor = `#${gameDataShow.title_main_color.toUpperCase()}`;
      const titleBottomColor = `#${gameDataShow.title_bottom_color.toUpperCase()}`;

      ctx.textAlign = "left";
      drawTextWithBackground(ctx, `${title}`, 210, 200, {
        font: `30px ${selectedFont}`,
        textColor: "black",
        backgroundColor: "black",
        padding: 12.5,
        radius: 20,
        outlineWidth: 3,
        outlineColor: "rgba(255, 255, 255, 0.12)",
      });

      const gradient = ctx.createLinearGradient(0, 220 - 26, 0, 220);
      gradient.addColorStop(0, titleMainColor);
      gradient.addColorStop(1, titleBottomColor);

      ctx.font = `30px ${selectedFont}`;
      ctx.fillStyle = gradient;
      ctx.fillText(`${title}`, 210, 200);
    }

    // // Draw User World Level Name
    // ctx.textAlign = "left";
    // drawText(
    //   ctx,
    //   tr("InterKnotReputation"),
    //   selectedFont,
    //   320,
    //   28,
    //   20,
    //   425,
    //   128
    // ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
    // ctx.textAlign = "right";
    // drawText(
    //   ctx,
    //   record.stats.world_level_name,
    //   selectedFont,
    //   160,
    //   28,
    //   22,
    //   970,
    //   128
    // ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)

    // // Draw User Active Days
    // ctx.textAlign = "left";
    // drawText(ctx, tr("ActiveDays"), selectedFont, 320, 28, 20, 425, 178); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
    // ctx.fillStyle = "white";
    // ctx.textAlign = "right";
    // ctx.font = `28px ${selectedFont}`;
    // ctx.fillText(`${record.stats.active_days}`, 970, 178);

    // Draw User Medal
    if (gameDataShow.medal_item_list.length > 0) {
      const userTitleWidth = ctx.measureText(title).width;
      for (
        let index = 0;
        index < gameDataShow.medal_item_list.length;
        index++
      ) {
        const medal = gameDataShow.medal_item_list[index];
        const medalIcon = await loadImageAsync(medal.medal_icon);
        const medalIconX =
          (userTitleWidth ? 220 + userTitleWidth + 10 : 220) + 10 + index * 70;
        const medalIconY = 155;

        ctx.drawImage(medalIcon, medalIconX, medalIconY, 64, 64);

        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.font = `28px Impact`;

        function formatNumber(num: number) {
          const units = [
            { value: 1_000_000_000, suffix: "B" }, // 十億以上顯示 B
            { value: 1_000_000, suffix: "M" }, // 百萬以上顯示 M
            { value: 1_000, suffix: "K" }, // 千以上顯示 K
          ];

          for (const unit of units) {
            if (num >= unit.value) {
              const value = num / unit.value;
              // 根據數字大小決定小數位
              if (value >= 1000) {
                // 超過 1000x 的單位，繼續進位 (例如 1000M = 1B)
                continue;
              } else if (value >= 100) {
                return value.toFixed(1) + unit.suffix; // 100~999.X
              } else {
                return value.toFixed(2) + unit.suffix; // <100 顯示兩位小數
              }
            }
          }

          return num.toString(); // 小於 1000 就直接顯示原數字
        }

        // 使用範例
        let displayNumber = formatNumber(medal.number);
        ctx.fillText(displayNumber, medalIconX + 32, medalIconY + 67);

        // Text Outline
        ctx.strokeStyle = "black";
        ctx.lineWidth = 1.75;
        ctx.strokeText(displayNumber, medalIconX + 32, medalIconY + 67);
      }
    }

    // Agents
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.font = `36px ${selectedFont}`;
    ctx.fillText(tr("Agents") + ` (${record.stats.avatar_num})`, 50, 330);

    if (record.avatar_list.length == 9)
      record.avatar_list.push({ name_mi18n: tr("Showmore") });
    record.avatar_list.map((agent: any, index: number) => {
      const offset_x = 180 * (index % 5);
      const offset_y = 280 * Math.floor(index / 5);
      drawRoundedRect(
        ctx,
        60 + offset_x,
        360 + offset_y,
        160,
        260,
        30,
        boxColor
      ); // (ctx, x, y, width, height, radius, color)

      drawCircleImage(
        ctx,
        agentImages[index],
        60 + offset_x + 10,
        360 + offset_y + 10,
        140
      );

      // Draw Agent Name
      ctx.textAlign = "center";
      drawText(
        ctx,
        agent.name_mi18n,
        selectedFont,
        140,
        24,
        20,
        140 + offset_x,
        550 + offset_y
      ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)

      // Draw Agent Level
      ctx.fillStyle = "rgba(128, 128, 128, 255)";
      ctx.textAlign = "center";
      ctx.font = `20px ${selectedFont}`;
      ctx.fillText(
        agent.level
          ? tr("levelFormat2", {
              level: agent.level,
            })
          : "",
        140 + offset_x,
        588 + offset_y
      );

      // Draw Agent Rank
      if (agent.rank ? agent.rank != 0 : false) {
        drawRoundedRect(
          ctx,
          178 + offset_x,
          357 + offset_y,
          45,
          45,
          22.5,
          "rgba(206, 35, 40, 255)"
        ); // (ctx, x, y, width, height, radius, color)
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.font = `28px ${selectedFont}`;
        ctx.fillText(`${agent.rank}`, 200 + offset_x, 388 + offset_y);
      }
    });

    // Buddy
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.font = `36px ${selectedFont}`;
    ctx.fillText(tr("Bangboo") + ` (${record.stats.buddy_num})`, 50, 960);

    if (record.buddy_list.length == 9)
      record.buddy_list.push({ name: tr("Showmore") });
    record.buddy_list.map((buddy: any, index: number) => {
      const offset_x = 180 * (index % 5);
      const offset_y = 280 * Math.floor(index / 5);
      drawRoundedRect(
        ctx,
        60 + offset_x,
        990 + offset_y,
        160,
        260,
        30,
        boxColor
      ); // (ctx, x, y, width, height, radius, color)

      drawCircleImage(
        ctx,
        buddyImages[index],
        60 + offset_x + 10,
        990 + offset_y + 10,
        140
      ); // (ctx, img, x, y, size, scaleFactor)

      // Draw Buddy Name
      ctx.textAlign = "center";
      drawText(
        ctx,
        buddy.name,
        selectedFont,
        140,
        24,
        20,
        140 + offset_x,
        1180 + offset_y
      ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)

      // Draw Buddy Level
      ctx.fillStyle = "rgba(128, 128, 128, 255)";
      ctx.textAlign = "center";
      ctx.font = `20px ${selectedFont}`;
      ctx.fillText(
        buddy.level
          ? tr("levelFormat2", {
              level: buddy.level,
            })
          : "",
        140 + offset_x,
        1218 + offset_y
      );

      // Draw Buddy Rank
      if (buddy.star ? buddy.star - 1 != 0 : false) {
        drawRoundedRect(
          ctx,
          178 + offset_x,
          987 + offset_y,
          45,
          45,
          22.5,
          "rgba(206, 35, 40, 255)"
        ); // (ctx, x, y, width, height, radius, color)
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.font = `28px ${selectedFont}`;
        ctx.fillText(`${buddy.star}`, 200 + offset_x, 1018 + offset_y);
      }
    });

    // Player UID
    ctx.font = `28px ${selectedFont}`;
    ctx.fillStyle = "white";
    ctx.textAlign = "right";
    ctx.fillText(
      `${userData.region_name} | ${userData?.game_role_id ? `UID ${userData.game_role_id}` : ""}`,
      canvas.width - 10,
      canvas.height - 10
    );

    return canvas.toBuffer("image/png");
  } catch (error) {
    console.log(error);
    console.error("Error generating image:", error);
  }
}

export async function drawCharacterImage(
  interaction: any,
  tr: (key: string, args?: any) => string,
  userLocale: string,
  uid: string,
  characterDataInput: any
) {
  try {
    const character = Array.isArray(characterDataInput)
      ? characterDataInput[0]
      : characterDataInput;

    const selectedFont =
      fonts[userLocale as keyof typeof fonts] || fonts.default;
    const userMindScape =
      (await db.get(`${interaction.user.id}.mindscape`)) ?? true;
    const canvas = createCanvas(2080, 870);
    const ctx = canvas.getContext("2d");

    // Fix disk driver count
    if (!character.equip) character.equip = [];
    if (!character.properties) character.properties = [];
    if (!character.skills) character.skills = [];
    for (let i = 0; i < 6; i++) {
      if (
        !character.equip.some((equip: any) => equip.equipment_type - 1 === i)
      ) {
        character.equip.push({ equipment_type: i + 1 });
      }
    }
    character.equip.sort(
      (a: any, b: any) => a.equipment_type - b.equipment_type
    );

    const characterSpecificImagePath = `https://api.hakush.in/zzz/UI/Mindscape_${character.id}_${character.rank <= 2 ? 1 : character.rank <= 5 ? 2 : 3}.webp`;
    const finalMindScapeImagePath = `./src/assets/images/icons/mindscape/m${userMindScape ? character.rank : 0}.png`;
    const characterData = await getCharacterData(character.id);

    // 如果 character.skin_list 有值，且 characterData.skin 有值，優先使用 unlocked: true 且 is_original: false 的皮膚
    let characterPath =
      characterData?.iconUrl ??
      `./src/assets/images/agents/${character.id}.webp`;

    if (
      character.skin_list &&
      character.skin_list.length > 0 &&
      characterData &&
      characterData.skin
    ) {
      const skin = character.skin_list.find(
        (skin: any) => skin.unlocked && !skin.is_original
      );

      if (skin) {
        character.usingSkin = {
          characterId: character.id,
          skinId: skin.skin_id,
          color: skin.skin_vertical_painting_color,
          name: skin.skin_name,
        };
        const skinImage =
          characterData && characterData.skin
            ? characterData.skin[String(skin.skin_id)]
            : null;
        if (skinImage)
          characterPath = `https://api.hakush.in/zzz/UI/${skinImage.Image}.webp`;
      }
    }

    // Load images concurrently
    const imagePaths = [
      finalMindScapeImagePath,
      characterSpecificImagePath,
      characterPath,
      (offsetCharacter as any)[character.id]?.element
        ? `./src/assets/images/icons/element/${(offsetCharacter as any)[character.id].element}.webp`
        : `./src/assets/images/icons/element/${elementId[character.element_type as keyof typeof elementId]}.webp`,
      `./src/assets/images/icons/profession/${professionId[character.avatar_profession as keyof typeof professionId]}.webp`,
      `${character.weapon?.icon}`,
      `./src/assets/images/icons/weapon/role-star-${character.weapon?.star}.png`,
      // 加載角色屬性圖示
      ...character.properties.map((prop: any) => {
        if (prop.property_id === 11) {
          return `./src/assets/images/icons/property/sprecover.png`;
        } else if (prop.property_id === 232) {
          return `./src/assets/images/icons/property/penvalue.png`;
        } else if (prop.property_id === 19) {
          return `./src/assets/images/icons/property/perforation.png`;
        } else if (prop.property_id === 20) {
          return `./src/assets/images/icons/property/energyaccumulation.png`;
        } else {
          return `./src/assets/images/icons/property/${propertyId[prop.property_id as keyof typeof propertyId]}.png`;
        }
      }),
      // 加載所有可能用到的屬性圖示（用於 disk driver）
      ...Object.values(propertiesId).map(
        (prop) => `./src/assets/images/icons/property/${prop}.png`
      ),
      ...character.skills.map(
        (skill: any) =>
          `./src/assets/images/icons/skills/${skill.skill_type}.png`
      ),
      ...character.equip.map((equip: any) =>
        equip?.id
          ? `./src/assets/images/icons/diskdrives/${equip.id.toString().slice(0, 3)}_${equip.rarity}.webp`
          : "./src/assets/images/icons/other/empty.png"
      ),
    ];

    const images = await Promise.all(imagePaths.map((p) => loadImageAsync(p)));
    const [
      bg,
      characterRankImage,
      characterImage,
      elementImage,
      professionImage,
      weaponImage,
      weaponStarImage,
      ...restImages
    ] = images;
    const propertyImages = restImages.slice(0, character.properties.length);
    const allPropertyImages = restImages.slice(
      character.properties.length,
      character.properties.length + Object.values(propertiesId).length
    );
    const skillImages = restImages.slice(
      character.properties.length + Object.values(propertiesId).length,
      character.properties.length +
        Object.values(propertiesId).length +
        character.skills.length
    );
    const equipImages = restImages.slice(
      character.properties.length +
        Object.values(propertiesId).length +
        character.skills.length
    );

    // 創建屬性圖示映射
    const propertyImageMap: Record<string, Image> = {};
    // 角色屬性圖示映射
    character.properties.forEach((prop: any, index: any) => {
      let propertyKey;
      if (prop.property_id === 11) {
        propertyKey = "sprecover";
      } else if (prop.property_id === 232) {
        propertyKey = "penvalue";
      } else if (prop.property_id === 19) {
        propertyKey = "perforation";
      } else if (prop.property_id === 20) {
        propertyKey = "energyaccumulation";
      } else {
        propertyKey = propertyId[prop.property_id as keyof typeof propertyId];
      }
      propertyImageMap[propertyKey] = propertyImages[index];
    });

    // 所有可能用到的屬性圖示映射（用於 disk driver）
    Object.values(propertiesId).forEach((prop, index) => {
      propertyImageMap[prop] = allPropertyImages[index];
    });

    // Draw BG
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scaleFactor = 1.3;
    const scaledWidth = canvas.width * scaleFactor;
    const scaledHeight = canvas.height * scaleFactor;
    const offsetX = (canvas.width - scaledWidth) / 2;
    const offsetY = (canvas.height - scaledHeight) / 2;

    ctx.drawImage(
      characterRankImage,
      offsetX,
      offsetY,
      scaledWidth,
      scaledHeight
    );
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    // Draw Paint
    drawPaintSplatter(ctx, canvas.width, canvas.height, {
      splatterCount: 10,
      minSize: 50,
      maxSize: 200,
      colors: [`${character.vertical_painting_color}`],
    });

    // Draw Visuals
    drawAgentPortrait(
      ctx,
      canvas,
      characterImage,
      character,
      offsetCharacter,
      offsetCharacterSkin
    );

    // Draw UI Boxes
    await drawAgentHeader(
      ctx,
      character,
      selectedFont,
      tr,
      elementImage,
      professionImage
    );
    drawPropertiesBox(
      ctx,
      character,
      propertyImages,
      elementImage,
      selectedFont
    );

    // Draw Agent Skills Box
    const customOrder = [0, 2, 5, 1, 3, 4];
    const reorderedSkillImages = customOrder.map(
      (orderIndex) => skillImages[orderIndex]
    );
    const reorderedSkillLevel = customOrder.map(
      (orderIndex) => character.skills[orderIndex]
    );

    drawSkillsBox(ctx, character, reorderedSkillImages, selectedFont);
    drawLevelBox(ctx, character, selectedFont, tr);

    // Draw Disc Driver Box
    drawEquipmentBox(
      ctx,
      character,
      equipImages,
      propertyImageMap,
      selectedFont
    );
    drawWeaponBox(
      ctx,
      character,
      weaponImage,
      weaponStarImage,
      propertyImageMap,
      selectedFont,
      tr
    );

    // Player UID
    ctx.font = `32px ${selectedFont}`;
    ctx.fillStyle = "white";
    ctx.textAlign = "right";
    ctx.fillText(`UID ${uid}`, canvas.width - 10, canvas.height - 10);

    return canvas.toBuffer("image/png");
  } catch (error) {
    console.log(error);
    return null;
  }
}

// --- Helper Functions for drawCharacterImage ---

function drawAgentPortrait(
  ctx: SKRSContext2D,
  canvas: any,
  characterImage: Image,
  character: any,
  offsetCharacter: any,
  offsetCharacterSkin: any
) {
  const characterId = character.id;
  const skinId = character.skin_list.find(
    (skin: any) => skin.unlocked && !skin.is_original
  )?.skin_id;

  const baseOffset = offsetCharacter[characterId] || {};
  const skinOffset =
    skinId && offsetCharacterSkin[characterId]
      ? offsetCharacterSkin[characterId][skinId]
      : null;

  const offset = {
    x: skinOffset?.x ?? baseOffset.x ?? 0,
    y: skinOffset?.y ?? baseOffset.y ?? -100,
  };

  const scaledWidth = characterImage.width / 1.25;
  const scaledHeight = characterImage.height / 1.25;

  const characterImageX = canvas.width / 2 - scaledWidth / 2 + offset.x;
  const characterImageY = canvas.height / 2 - scaledHeight / 8 + offset.y; // Adjusted Y for better centering

  ctx.drawImage(
    characterImage,
    characterImageX,
    characterImageY,
    scaledWidth,
    scaledHeight
  );
}

async function drawAgentHeader(
  ctx: SKRSContext2D,
  character: any,
  selectedFont: string,
  tr: any,
  elementImage: Image,
  professionImage: Image
) {
  const boxColor = "rgba(34, 33, 34, 0.95)";
  const baseOffset = (offsetCharacter as any)[character.id] || {};
  const padding = 50;
  const iconSpacing = 40;
  const iconSize = 60;

  ctx.font = `60px ${selectedFont}`;
  const textWidth = ctx.measureText(character.name_mi18n).width;
  const titleExtraWidth = baseOffset.title ? 100 : -20;
  const isUsingSkin = character.usingSkin?.name;

  const boxWidth =
    padding * 2 + textWidth + iconSpacing + iconSize * 2 + titleExtraWidth;
  const boxHeight = (isUsingSkin ? 15 : 0) + 100;

  drawRoundedRect(ctx, 60, 40, boxWidth, boxHeight, 30, boxColor);

  // Character Name
  ctx.fillStyle = "white";
  ctx.fillText(character.name_mi18n, 60 + padding, 110);

  // Skin Name
  if (isUsingSkin) {
    ctx.font = `28px ${selectedFont}`;
    ctx.fillStyle = character.usingSkin.color || "#A2A2A2";
    ctx.fillText(character.usingSkin.name, 60 + padding, 145);
    ctx.fillStyle = "white";
    ctx.font = `60px ${selectedFont}`;
  }

  // Title Icon/Text
  if (baseOffset.title) {
    const TitleIcon = await loadImageAsync(
      `./src/assets/images/icons/other/${baseOffset.title}.png`
    );
    const iconX = 60 + padding + textWidth + 10;
    ctx.drawImage(TitleIcon, iconX, 75, 40, 40);

    const TitleText = tr(baseOffset.title) || "";
    ctx.font = `32px ${selectedFont}`;
    ctx.fillStyle = "#E3E3E3";
    ctx.fillText(TitleText, iconX + 50, 75 + 32.5);
  }

  // Element & Profession Icons
  const iconY = isUsingSkin ? 57.5 : 60;
  const elementX = 60 + padding + textWidth + iconSpacing + titleExtraWidth;
  ctx.drawImage(elementImage, elementX, iconY, iconSize, iconSize);
  ctx.drawImage(
    professionImage,
    elementX + iconSize + 10,
    iconY,
    iconSize,
    iconSize
  );
}

function drawPropertiesBox(
  ctx: SKRSContext2D,
  character: any,
  propertyImages: Image[],
  elementImage: Image,
  selectedFont: string
) {
  const boxColor = "rgba(34, 33, 34, 0.95)";
  const maxTextWidth = 210;

  drawRoundedRect(
    ctx,
    60,
    160,
    440,
    20 + character.properties.length * 56 + 10,
    30,
    boxColor
  );

  character.properties.forEach((prop: any, index: number) => {
    const offset_y = index * 56;
    const propertyName = prop.property_name;
    const propertyFinalValue = prop.final;

    const image =
      index === character.properties.length - 1
        ? elementImage
        : propertyImages[index];
    ctx.drawImage(
      image,
      80,
      (index === character.properties.length - 1 ? -2 : 0) + 180 + offset_y,
      48,
      48
    );

    let fontSize = 32;
    ctx.font = `${fontSize}px ${selectedFont}`;
    let textWidth = ctx.measureText(propertyName).width;
    let yPos = 214 + offset_y;

    while (textWidth > maxTextWidth && fontSize > 22) {
      fontSize--;
      yPos -= 0.4;
      ctx.font = `${fontSize}px ${selectedFont}`;
      textWidth = ctx.measureText(propertyName).width;
    }

    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.fillText(propertyName, 140, yPos);

    if (prop.base && prop.add) {
      ctx.textAlign = "right";
      ctx.font = `22px ${selectedFont}`;
      const valW = ctx.measureText(`${propertyFinalValue}`).width;
      ctx.fillText(`${prop.base}`, 440 - valW, 202 + offset_y);
      ctx.fillStyle = "#B5FF00";
      ctx.fillText(`+${prop.add}`, 440 - valW, 222 + offset_y);
    }

    ctx.textAlign = "right";
    ctx.font = `32px ${selectedFont}`;
    ctx.fillStyle = "white";
    ctx.fillText(`${propertyFinalValue}`, 480, 214 + offset_y);
  });
}

function drawSkillsBox(
  ctx: SKRSContext2D,
  character: any,
  skillImages: Image[],
  selectedFont: string
) {
  const boxColor = "rgba(34, 33, 34, 0.95)";
  const customOrder = [0, 2, 5, 1, 3, 4];

  customOrder.forEach((orderIndex, index) => {
    const skill = character.skills[orderIndex];
    if (!skill) return;

    const offset_y = index * 60;
    drawRoundedRect(ctx, 520, 260 + offset_y, 120, 54, 27, boxColor);
    ctx.drawImage(skillImages[index], 526, 264 + offset_y, 46, 46);

    ctx.font = `32px ${selectedFont}`;
    ctx.fillStyle = "white";
    ctx.textAlign = "right";
    ctx.fillText(`${skill.level}`, 614, 298 + offset_y);
  });
}

function drawLevelBox(
  ctx: SKRSContext2D,
  character: any,
  selectedFont: string,
  tr: any
) {
  const boxColor = "rgba(34, 33, 34, 0.95)";
  const levelText = tr("levelFormat", { level: character.level });

  ctx.font = `48px ${selectedFont}`;
  const textWidth = ctx.measureText(levelText).width;
  const paddingX = 45;
  const boxWidth = textWidth + paddingX * 2;
  const boxX = 520;

  drawRoundedRect(ctx, boxX, 680, boxWidth, 100, 30, boxColor);

  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.fillText(levelText, boxX + boxWidth / 2, 746);
}

function drawEquipmentBox(
  ctx: SKRSContext2D,
  character: any,
  equipImages: Image[],
  propertyImageMap: any,
  selectedFont: string
) {
  const boxColor = "rgba(34, 33, 34, 0.95)";

  character.equip.forEach((equip: any, index: number) => {
    const offset_x = 220 * (index % 3);
    const offset_y = 280 * Math.floor(index / 3);
    const boxW = 210;
    const boxH = 270;

    drawRoundedRect(
      ctx,
      1320 + offset_x,
      60 + offset_y,
      boxW,
      boxH,
      30,
      boxColor
    );

    const image = equipImages[index];
    if (image) {
      ctx.drawImage(
        image,
        equip.id ? 1310 + offset_x : 1280 + offset_x + boxW / 2,
        equip.id ? 28 + offset_y : offset_y + boxH / 2,
        equip.id ? 110 : 84,
        equip.id ? 110 : 84
      );
    }

    if (equip.id) {
      drawRoundedRect(
        ctx,
        1426 + offset_x,
        80 + offset_y,
        84,
        36,
        18,
        "rgba(255, 255, 255, 0.95)"
      );
      ctx.font = `32px ${selectedFont}`;
      ctx.fillStyle = "black";
      ctx.textAlign = "center";
      ctx.fillText(`+${equip.level}`, 1465 + offset_x, 110 + offset_y);

      // Main Prop
      equip.main_properties?.forEach((prop: any) => {
        const pImage =
          propertyImageMap[
            propertiesId[prop.property_id as keyof typeof propertiesId]
          ];
        if (pImage)
          ctx.drawImage(pImage, 1334 + offset_x, 126 + offset_y, 40, 40);
        ctx.font = `36px ${selectedFont}`;
        ctx.fillStyle = prop.valid ? "#F1AD3D" : "white";
        ctx.textAlign = "right";
        ctx.fillText(`${prop.base}`, 1510 + offset_x, 160 + offset_y);
      });

      // Sub Props
      equip.properties?.forEach((prop: any, pIndex: number) => {
        const pImage =
          propertyImageMap[
            propertiesId[prop.property_id as keyof typeof propertiesId]
          ];
        const pY = 176 + offset_y + pIndex * 36;
        if (pImage) ctx.drawImage(pImage, 1340 + offset_x, pY, 28, 28);
        ctx.font = `24px ${selectedFont}`;
        ctx.fillStyle = prop.valid ? "#F1AD3D" : "#FFFFFFA6";
        if (prop.add > 0) {
          ctx.textAlign = "left";
          ctx.fillText(`+${prop.add}`, 1380 + offset_x, pY + 24);
        }
        ctx.textAlign = "right";
        ctx.fillText(`${prop.base}`, 1510 + offset_x, pY + 24);
      });
    } else {
      ctx.font = `32px ${selectedFont}`;
      ctx.fillStyle = "#FFFFFF29";
      ctx.textAlign = "center";
      ctx.fillText(
        "EMPTY",
        1320 + offset_x + boxW / 2,
        60 + offset_y + boxH / 2 + 50
      );
    }
  });
}

function drawWeaponBox(
  ctx: SKRSContext2D,
  character: any,
  weaponImage: Image,
  weaponStarImage: Image,
  propertyImageMap: any,
  selectedFont: string,
  tr: any
) {
  const boxColor = "rgba(34, 33, 34, 0.95)";
  drawRoundedRect(ctx, 1320, 620, 650, 200, 30, boxColor);

  if (character.weapon) {
    ctx.drawImage(weaponImage, 1365, 630, 150, 150);
    ctx.drawImage(
      weaponStarImage,
      1380,
      755,
      weaponStarImage.width / 1.2,
      weaponStarImage.height / 1.2
    );

    character.weapon.main_properties.forEach((prop: any, index: number) => {
      const pY = 640 + index * 56;
      const pImage =
        propertyImageMap[
          propertiesId[prop.property_id as keyof typeof propertiesId]
        ];
      ctx.textAlign = "left";
      if (pImage) {
        ctx.drawImage(pImage, 1560, pY, 40, 40);
        drawText(
          ctx,
          prop.property_name,
          selectedFont,
          170,
          32,
          28,
          1620,
          pY + 32
        );
        ctx.font = `32px ${selectedFont}`;
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.fillText(`${prop.base}`, 1900, pY + 32);
      }
    });

    character.weapon.properties.forEach((prop: any, index: number) => {
      const pY = 686 + index * 56;
      const pImage =
        propertyImageMap[
          propertiesId[prop.property_id as keyof typeof propertiesId]
        ];
      ctx.textAlign = "left";
      if (pImage) {
        ctx.drawImage(pImage, 1562, pY, 36, 36);
        drawText(
          ctx,
          prop.property_name,
          selectedFont,
          170,
          28,
          24,
          1620,
          pY + 30
        );
        ctx.font = `28px ${selectedFont}`;
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.fillText(`${prop.base}`, 1900, pY + 30);
      }
    });

    ctx.textAlign = "left";
    ctx.font = `40px ${selectedFont}`;
    ctx.fillText(
      tr("levelFormat", { level: character.weapon.level }),
      1560,
      790
    );
  } else {
    ctx.font = `48px ${selectedFont}`;
    ctx.fillStyle = "#FFFFFF29";
    ctx.textAlign = "center";
    ctx.fillText("EMPTY", 1320 + 650 / 2, 620 + 200 / 2);
  }
}

function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
  outlineWidth = 0,
  outlineColor = "black"
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  if (outlineWidth > 0) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth;
    ctx.stroke();
  }
}

function drawCircleImage(
  ctx: SKRSContext2D,
  img: Image,
  x: number,
  y: number,
  size: number,
  scaleFactor = 1.2
) {
  ctx.save();

  const centerX = x + size / 2;
  const centerY = y + size / 2;

  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2, true);
  ctx.closePath();

  ctx.clip();

  const scale = Math.min(size / img.width, size / img.height) * scaleFactor;

  const scaledWidth = img.width * scale;
  const scaledHeight = img.height * scale;

  const imgX = centerX - scaledWidth / 2;
  const imgY = centerY - scaledHeight / 2;

  ctx.drawImage(img, imgX, imgY, scaledWidth, scaledHeight);
  ctx.restore();
}

function drawText(
  ctx: SKRSContext2D,
  text: string,
  selectedFont: string,
  maxWidth: number,
  initialFontSize: number,
  minFontSize: number,
  x: number,
  y: number,
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

function drawTextWithBackground(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  options: any = {}
) {
  // 解構選項參數，提供預設值
  const {
    font = "20px Arial",
    textColor = "black",
    backgroundColor = "lightblue",
    padding = 5,
    radius = 10,
    outlineWidth = 0,
    outlineColor = "black",
  } = options;

  if (!text) return;

  // 設定字體
  ctx.font = font;

  // 計算文字尺寸
  const textWidth = ctx.measureText(text).width;
  const textHeight = parseInt(font, 7.5);

  // 計算背景矩形的尺寸和位置
  const rectX = x - padding;
  const rectY = y - textHeight - padding;
  const rectWidth = textWidth + padding * 2;
  const rectHeight = textHeight + padding * 2;

  // 繪製背景矩形
  ctx.fillStyle = backgroundColor;
  drawRoundedRect(
    ctx,
    rectX,
    rectY,
    rectWidth,
    rectHeight,
    radius,
    backgroundColor,
    outlineWidth,
    outlineColor
  );

  // 繪製文字
  ctx.fillStyle = textColor;
  ctx.fillText(text, x, y);
}

function drawPaintSplatter(
  ctx: SKRSContext2D,
  canvasWidth: number,
  canvasHeight: number,
  options: any = {}
) {
  const {
    splatterCount = 50, // 潑灑總數量
    minSize = 5, // 最小潑灑點大小
    maxSize = 30, // 最大潑灑點大小
    colors = ["red", "blue", "yellow", "green", "purple"], // 潑灑顏色
  } = options;

  const splatters = []; // 記錄所有潑灑的位置和大小

  for (let i = 0; i < splatterCount; i++) {
    let isValid = false;
    let x = 0,
      y = 0,
      size = 0;

    // 持續嘗試直到找到不重疊的位置
    while (!isValid) {
      x = Math.random() * canvasWidth; // 隨機 X 坐標
      y = Math.random() * canvasHeight; // 隨機 Y 坐標
      size = Math.random() * (maxSize - minSize) + minSize; // 隨機大小

      // 檢查是否與已有的潑灑點重疊
      isValid = splatters.every((s) => {
        const distance = Math.sqrt((x - s.x) ** 2 + (y - s.y) ** 2);
        return distance > s.size + size; // 距離大於半徑之和，表示不重疊
      });
    }

    // 紀錄新的潑灑點
    splatters.push({ x, y, size });

    // 設定顏色和透明度
    const color = colors[Math.floor(Math.random() * colors.length)];
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.random() * 0.6 + 0.1; // 隨機透明度 (0.2 - 1.0)

    // 繪製主潑灑點
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    // 繪製額外的小滴
    const dripCount = Math.floor(Math.random() * 5 + 3); // 每次潑灑的小滴數量
    for (let j = 0; j < dripCount; j++) {
      const dripX = x + Math.random() * size * 2 - size; // 小滴的偏移 X
      const dripY = y + Math.random() * size * 2 - size; // 小滴的偏移 Y
      const dripSize = size * (Math.random() * 0.4); // 小滴的大小

      // 確保小滴也不會與主潑灑點或其他點重疊
      const isDripValid = splatters.every((s) => {
        const distance = Math.sqrt((dripX - s.x) ** 2 + (dripY - s.y) ** 2);
        return distance > s.size + dripSize;
      });

      if (isDripValid) {
        ctx.beginPath();
        ctx.arc(dripX, dripY, dripSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 恢復透明度
  ctx.globalAlpha = 1.0;
}
