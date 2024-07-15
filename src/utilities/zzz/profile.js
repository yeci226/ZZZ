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
} from "../utilities.js";
import { toI18nLang } from "../core/i18n.js";
import emoji from "../../assets/emoji.js";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { join } from "path";
const db = client.db;
const drawQueue = new Queue({ autostart: true });

const offsetCharacter = {
  1121: 0, // Ben
  1281: 0, // Piper
  1211: 0,
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
};
const propertyId = {
  1: "hp",
  2: "atk",
  3: "def",
  4: "stun",
  5: "crit",
  6: "critdmg",
  7: "power",
  8: "mystery",
  9: "penratio",
  10: "sprecover",
  11: "physic",
  12: "fire",
  13: "ice",
  14: "thunder",
  15: "ether",
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
  23203: "penratio", // 穿透值
  31503: "physic", // 物理傷害加成
  31603: "fire", // 火傷害加成
  31703: "ice", // 冰傷害加成
  31803: "thunder", // 電傷害加成
  31903: "ether", // 以太傷害加成
};

const zzzStaticUrl = "https://act-webstatic.hoyoverse.com/game_record/zzz";
const squareUrl = `${zzzStaticUrl}/role_square_avatar/role_square_avatar_`;
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
  join(".", "src", ".", "assets", "Nunito-BlackItalic.ttf"),
  "Nunito"
);

const loadImageAsync = async (url) => {
  try {
    return await loadImage(url);
  } catch {
    return await loadImage(
      `https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/icon/element/None.png`
    );
  }
};

export async function handleProfileDraw(interaction, tr, user, zzz) {
  const drawTask = async () => {
    try {
      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(tr("Searching"))
            .setColor(getRandomColor())
            .setImage(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif"
            ),
        ],
        fetchReply: true,
      });

      const requestStartTime = Date.now();
      const userLocale =
        (await getUserLang(interaction.user.id)) ||
        toI18nLang(interaction.locale) ||
        "en";
      const record = await zzz.record.records();
      const characters = await zzz.record.characters();
      const userData = await getUserHoyolabData(interaction, tr, user.id);
      const requestEndTime = Date.now();
      const drawStartTime = Date.now();
      const imageBuffer = await drawMainImage(tr, userLocale, userData, record);
      if (!imageBuffer) throw new Error(tr("profile_NoImageData"));
      const drawEndTime = Date.now();

      const image = new AttachmentBuilder(imageBuffer, {
        name: `MainImage_${zzz.uid}.png`,
      });

      const userMindScape = (await db.get(`${user.id}.mindscape`)) ?? true;
      const rowSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setPlaceholder(tr("profile_SelectCharacter"))
          .setCustomId("profile_SelectCharacter")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            characters.map((character) => {
              return {
                emoji: emoji[elementId[character.element_type]],
                label: `${character.name_mi18n}`,
                description: `${tr("profile_CharactersFormat", {
                  level: character.level,
                  rank: character.rank,
                })}`,
                value: `${user.id}-${character.id}`,
              };
            })
          )
      );
      const rowMindScape = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("profile_CharacterMindScape")
          .setLabel(tr("MindScape"))
          .setStyle(userMindScape ? ButtonStyle.Success : ButtonStyle.Secondary)
      );

      interaction.editReply({
        embeds: [
          new EmbedBuilder().setImage(`attachment://${image.name}`).setFooter({
            text: tr("CostTime", {
              requestTime: ((requestEndTime - requestStartTime) / 1000).toFixed(
                2
              ),
              drawTime: ((drawEndTime - drawStartTime) / 1000).toFixed(2),
            }),
          }),
        ],
        components: [rowSelect, rowMindScape],
        files: [image],
      });
    } catch (error) {
      if (error?.code == "-501000") {
        interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(tr("note_Error"))
              .setColor("#E76161")
              .setThumbnail(
                "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png"
              )
              .setImage(
                "https://media.discordapp.net/attachments/1149960935654559835/1258313139078955039/image.png"
              )
              .setDescription(
                tr("note_Error_Description") + "\n\n" + `\`${error.message}\``
              ),
          ],
          fetchReply: true,
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
          fetchReply: true,
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

export async function drawMainImage(tr, userLocale, userData, record) {
  try {
    const canvas = createCanvas(1000, 1600);
    const ctx = canvas.getContext("2d");

    const imagePaths = [
      `./src/assets/images/profileBg.png`,
      record.cur_head_icon_url,
      ...record.avatar_list.map((agent) => squareUrl + `${agent.id}.png`),
      "./src/assets/images/icons/other/showmore.png",
      ...record.buddy_list.map(
        (buddy) => bangbooRectangleUrl + `${buddy.id}.png`
      ),
      "./src/assets/images/icons/other/showmore.png",
    ];
    const images = await Promise.all(imagePaths.map(loadImageAsync));
    const [bg, userHeadIcon, ...restImages] = images;
    const agentImages = restImages.slice(0, record.avatar_list.length + 1);
    const buddyImages = restImages.slice(record.avatar_list.length + 1);
    const boxColor = "rgba(48, 48, 48, 255)";

    // Draw BackGround
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    // Draw BackGround Text
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.font = `24px ${userLocale === "tw" ? "TW" : "EN"}`;
    ctx.fillText(tr("InterKnot"), 30, 33);

    // Draw User Info
    ctx.drawImage(userHeadIcon, 54, 94, 129, 129);

    // Draw User Name
    ctx.textAlign = "left";
    drawText(ctx, userData.nickname, userLocale, 170, 36, 16, 200, 150); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)

    // Draw User level
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.font = `26px ${userLocale === "tw" ? "TW" : "EN"}`;
    ctx.fillText(`Lv.${userData.level}`, 200, 200);

    // Draw User World Level Name
    ctx.textAlign = "left";
    drawText(ctx, tr("InterKnotReputation"), userLocale, 320, 28, 20, 425, 128); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
    ctx.fillStyle = "white";
    ctx.textAlign = "right";
    ctx.font = `28px ${userLocale === "tw" ? "TW" : "EN"}`;
    ctx.fillText(`${record.stats.world_level_name}`, 970, 128);

    // Draw User Active Days
    ctx.textAlign = "left";
    drawText(ctx, tr("ActiveDays"), userLocale, 320, 28, 20, 425, 178); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
    ctx.fillStyle = "white";
    ctx.textAlign = "right";
    ctx.font = `28px ${userLocale === "tw" ? "TW" : "EN"}`;
    ctx.fillText(`${record.stats.active_days}`, 970, 178);

    // Draw User Cur Period Zone Layer Count
    ctx.textAlign = "left";
    drawText(ctx, tr("PeriodZoneLayer"), userLocale, 340, 28, 20, 425, 228); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
    ctx.fillStyle = "white";
    ctx.textAlign = "right";
    ctx.font = `28px ${userLocale === "tw" ? "TW" : "EN"}`;
    ctx.fillText(`${record.stats.cur_period_zone_layer_count}`, 970, 228);

    // Agents
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.font = `36px ${userLocale === "tw" ? "TW" : "EN"}`;
    ctx.fillText(tr("Agents") + ` (${record.stats.avatar_num})`, 50, 330);

    if (record.stats.avatar_num != record.avatar_list.length)
      record.avatar_list.push({ name_mi18n: tr("Showmore") });
    record.avatar_list.map((agent, index) => {
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
        userLocale,
        140,
        24,
        20,
        140 + offset_x,
        550 + offset_y
      ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)

      // Draw Agent Level
      ctx.fillStyle = "rgba(128, 128, 128, 255)";
      ctx.textAlign = "center";
      ctx.font = `20px ${userLocale === "tw" ? "TW" : "EN"}`;
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
        ctx.font = `28px ${userLocale === "tw" ? "TW" : "EN"}`;
        ctx.fillText(`${agent.rank}`, 200 + offset_x, 388 + offset_y);
      }
    });

    // Buddy
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.font = `36px ${userLocale === "tw" ? "TW" : "EN"}`;
    ctx.fillText(tr("Bangboo") + ` (${record.stats.buddy_num})`, 50, 960);

    if (record.stats.buddy_num != record.buddy_list.length)
      record.buddy_list.push({ name: tr("Showmore") });
    record.buddy_list.map((buddy, index) => {
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
      );

      // Draw Buddy Name
      ctx.textAlign = "center";
      drawText(
        ctx,
        buddy.name,
        userLocale,
        140,
        24,
        20,
        140 + offset_x,
        1180 + offset_y
      ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)

      // Draw Buddy Level
      ctx.fillStyle = "rgba(128, 128, 128, 255)";
      ctx.textAlign = "center";
      ctx.font = `20px ${userLocale === "tw" ? "TW" : "EN"}`;
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
        ctx.font = `28px ${userLocale === "tw" ? "TW" : "EN"}`;
        ctx.fillText(`${buddy.star}`, 200 + offset_x, 1018 + offset_y);
      }
    });

    // Player UID
    ctx.font = `28px ${userLocale === "tw" ? "TW" : "EN"}`;
    ctx.fillStyle = "white";
    ctx.textAlign = "right";
    ctx.fillText(
      `UID ${userData.game_role_id}`,
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
  interaction,
  tr,
  userLocale,
  uid,
  character
) {
  try {
    const userMindScape =
      (await db.get(`${interaction.user.id}.mindscape`)) ?? true;
    const canvas = createCanvas(2080, 870);
    const ctx = canvas.getContext("2d");

    // Fix disk driver count
    for (let i = 0; i < 6; i++) {
      if (!character.equip.some((equip) => equip.equipment_type - 1 === i)) {
        character.equip.push({ equipment_type: i + 1 });
      }
    }
    character.equip.sort((a, b) => a.equipment_type - b.equipment_type);
    const propertyLength = 15;

    // Load images concurrently
    const imagePaths = [
      `./src/assets/images//icons/mindscape/m${userMindScape ? character.rank : 0}.png`,
      `./src/assets/images/icons/mindscape/${character.id}.png`,
      `./src/assets/images/agents/${character.id}.webp`,
      `./src/assets/images/icons/element/${elementId[character.element_type]}.png`,
      `./src/assets/images/icons/profession/${professionId[character.avatar_profession]}.png`,
      `${character.weapon?.icon}`,
      `./src/assets/images/icons/weapon/role-star-${character.weapon?.star}.png`,
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(
        (index) => `./src/assets/images/icons/property/${propertyId[index]}.png`
      ),
      ...character.skills.map(
        (skill) => `./src/assets/images/icons/skills/${skill.skill_type}.png`
      ),
      ...character.equip.map((equip) =>
        equip?.id
          ? `./src/assets/images/icons/diskdrives/${equip.id.toString().slice(0, 3)}_${equip.rarity}.webp`
          : "./src/assets/images/icons/diskdrives/none.png"
      ),
    ];
    const images = await Promise.all(imagePaths.map(loadImageAsync));
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
    const propertyImages = restImages.slice(0, propertyLength);
    const skillImages = restImages.slice(
      propertyLength,
      propertyLength + character.skills.length
    );
    const equipImages = restImages.slice(
      propertyLength + character.skills.length
    );

    // Create a mapping from propertiesId to propertyImages
    const propertyImageMap = {};
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((index) => {
      propertyImageMap[propertyId[index]] = propertyImages[index - 1];
    });

    // Draw BG
    ctx.drawImage(characterRankImage, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    // ctx.drawImage(characterImage, -300, 0, 1664, 806); // For agent.png

    // Draw Agent
    const offsetX = offsetCharacter.hasOwnProperty(character.id)
      ? offsetCharacter[character.id]
      : -180;
    const characterImageX =
      canvas.width / 2 - characterImage.width / 2.5 + offsetX;

    ctx.drawImage(
      characterImage,
      characterImageX,
      100,
      characterImage.width / 1.25,
      characterImage.height / 1.25
    ); // For agent.webp

    const boxColor = "rgba(34, 33, 34, 0.95)";
    const padding = 60;
    const iconSpacing = 40;
    const iconSize = 80;

    ctx.font = `60px ${userLocale === "tw" ? "TW" : "EN"}`;
    const textWidth = ctx.measureText(character.name_mi18n).width;
    const boxWidth = padding * 2 + textWidth + iconSpacing + iconSize * 2;

    // Draw Agent Info Box
    drawRoundedRect(ctx, 60, 100, boxWidth, 100, 30, boxColor); // (ctx, x, y, width, height, radius, color)
    ctx.fillStyle = "white";
    ctx.fillText(character.name_mi18n, 60 + padding, 170);

    const elementIconX = 60 + padding + textWidth + iconSpacing;
    const professionIconX = elementIconX + iconSize;
    ctx.drawImage(elementImage, elementIconX, 110, iconSize, iconSize);
    ctx.drawImage(professionImage, professionIconX, 110, iconSize, iconSize);

    // Draw Agent Properties Box
    drawRoundedRect(
      ctx,
      60,
      220,
      440,
      20 + character.properties.length * 56 + 20,
      30,
      boxColor
    ); // (ctx, x, y, width, height, radius, color)

    propertyImages.map((image, index) => {
      if (index < 10) {
        const offset_y = index * 56;

        const propertyName = character.properties[index].property_name;
        let fontSize = 32;
        ctx.font = `${fontSize}px ${userLocale === "tw" ? "TW" : "EN"}`;
        let propertyTextWidth = ctx.measureText(propertyName).width;

        const maxTextWidth = 230;
        let yPosition = 274 + offset_y;
        while (propertyTextWidth > maxTextWidth && fontSize > 22) {
          fontSize--;
          yPosition -= 0.4;
          ctx.font = `${fontSize}px ${userLocale === "tw" ? "TW" : "EN"}`;
          propertyTextWidth = ctx.measureText(propertyName).width;
        }

        ctx.drawImage(image, 80, 240 + offset_y, 48, 48);
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.fillText(propertyName, 140, yPosition);
        ctx.textAlign = "right";
        ctx.font = `32px ${userLocale === "tw" ? "TW" : "EN"}`;
        ctx.fillText(
          `${character.properties[index].final}`,
          480,
          274 + offset_y
        );
      }
    });

    // Draw Agent Skills Box
    const customOrder = [0, 2, 5, 1, 3, 4];
    const reorderedSkillImages = customOrder.map(
      (orderIndex) => skillImages[orderIndex]
    );
    const reorderedSkillLevel = customOrder.map(
      (orderIndex) => character.skills[orderIndex]
    );

    reorderedSkillImages.map((image, index) => {
      const offset_y = index * 60;
      drawRoundedRect(ctx, 520, 260 + offset_y, 120, 54, 27, boxColor); // (ctx, x, y, width, height, radius, color)
      ctx.drawImage(image, 526, 264 + offset_y, 46, 46);
      ctx.font = `32px ${userLocale === "tw" ? "TW" : "EN"}`;
      ctx.fillStyle = "white";
      ctx.textAlign = "right";
      ctx.fillText(`${reorderedSkillLevel[index].level}`, 614, 298 + offset_y);
    });

    // Draw Agent Level Box
    drawRoundedRect(
      ctx,
      520,
      680,
      ctx.measureText(
        tr("levelFormat", {
          level: character.level,
        })
      ).width + 120,
      100,
      30,
      boxColor
    ); // (ctx, x, y, width, height, radius, color)
    ctx.font = `48px ${userLocale === "tw" ? "TW" : "EN"}`;
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.fillText(
      tr("levelFormat", {
        level: character.level,
      }),
      550,
      746
    );

    // Draw Disc Driver Box
    character.equip.map((equip, index) => {
      const offset_x = 220 * (index % 3);
      const offset_y = 280 * Math.floor(index / 3);

      drawRoundedRect(
        ctx,
        1320 + offset_x,
        60 + offset_y,
        210,
        270,
        30,
        boxColor
      );

      // Draw Disk Driver Icon
      const image = equipImages[equip.equipment_type - 1];
      ctx.drawImage(image, 1310 + offset_x, 28 + offset_y, 110, 110);

      // Draw Disk Driver Level
      drawRoundedRect(
        ctx,
        1426 + offset_x,
        80 + offset_y,
        84,
        36,
        18,
        "rgba(255, 255, 255, 0.95)"
      );
      ctx.font = `32px ${userLocale === "tw" ? "TW" : "EN"}`;
      ctx.fillStyle = "black";
      ctx.textAlign = "center";
      ctx.fillText(
        `+${equip.level ?? "0"}`,
        1465 + offset_x,
        110 + offset_y,
        70
      );

      // Draw Disk Driver Main Prop
      equip.main_properties?.forEach((prop) => {
        const image = propertyImageMap[propertiesId[prop.property_id]];
        ctx.drawImage(image, 1334 + offset_x, 126 + offset_y, 40, 40);
        ctx.font = `36px ${userLocale === "tw" ? "TW" : "EN"}`;
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.fillText(`${prop.base}`, 1510 + offset_x, 160 + offset_y);
      });

      // Draw Disk Driver Prop
      equip.properties?.forEach((prop, index) => {
        const propOffest_x = 0;
        const propOffest_y = 36 * index;
        const image = propertyImageMap[propertiesId[prop.property_id]];
        ctx.drawImage(
          image,
          1340 + offset_x,
          176 + offset_y + propOffest_y,
          28,
          28
        );
        ctx.font = `24px ${userLocale === "tw" ? "TW" : "EN"}`;
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.fillText(
          `${prop.base}`,
          1510 + offset_x,
          200 + offset_y + propOffest_y
        );
      });
    });

    // Draw Weapon Box
    drawRoundedRect(ctx, 1320, 620, 650, 200, 30, boxColor);

    if (character.weapon) {
      // Draw weapon Icon
      ctx.drawImage(weaponImage, 1365, 630, 150, 150);
      ctx.drawImage(
        weaponStarImage,
        1380,
        755,
        weaponStarImage.width / 1.2,
        weaponStarImage.height / 1.2
      );

      // Draw weapon main properties
      character.weapon.main_properties.forEach((prop, index) => {
        const propOffest_x = 0;
        const propOffest_y = 56 * index;
        const image = propertyImageMap[propertiesId[prop.property_id]];
        ctx.drawImage(image, 1560, 640 + propOffest_y, 40, 40);
        ctx.font = `32px ${userLocale === "tw" ? "TW" : "EN"}`;
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.fillText(`${prop.property_name}`, 1620, 672 + propOffest_x);
        ctx.font = `32px ${userLocale === "tw" ? "TW" : "EN"}`;
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.fillText(`${prop.base}`, 1900, 672 + propOffest_y);
      });

      // Draw weapon properties
      character.weapon.properties.forEach((prop, index) => {
        const propOffest_x = 0;
        const propOffest_y = 56 * index;
        const image = propertyImageMap[propertiesId[prop.property_id]];
        ctx.drawImage(image, 1562, 686 + propOffest_y, 36, 36);
        ctx.font = `28px ${userLocale === "tw" ? "TW" : "EN"}`;
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.fillText(`${prop.property_name}`, 1620, 716 + propOffest_y);
        ctx.font = `28px ${userLocale === "tw" ? "TW" : "EN"}`;
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.fillText(`${prop.base}`, 1900, 716 + propOffest_y);
      });

      // Weapon Level
      ctx.textAlign = "left";
      ctx.font = `40px ${userLocale === "tw" ? "TW" : "EN"}`;
      ctx.fillText(
        tr("levelFormat", {
          level: character.weapon.level,
        }),
        1560,
        790
      );
    }

    // Player UID
    ctx.font = `32px ${userLocale === "tw" ? "TW" : "EN"}`;
    ctx.fillStyle = "white";
    ctx.textAlign = "right";
    ctx.fillText(`UID: ${uid}`, canvas.width - 10, canvas.height - 10);

    return canvas.toBuffer("image/png");
  } catch (error) {
    console.log(error);
    console.error("Error generating image:", error);
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

function drawCircleImage(ctx, img, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, img.width, img.height);
  ctx.restore();
}

function drawText(
  ctx,
  text,
  userLocale,
  maxWidth,
  initialFontSize,
  minFontSize,
  x,
  y
) {
  let fontSize = initialFontSize;
  ctx.font = `${fontSize}px ${userLocale === "tw" ? "TW" : "EN"}`;
  let textWidth = ctx.measureText(text).width;

  while (textWidth > maxWidth && fontSize > minFontSize) {
    fontSize--;
    ctx.font = `${fontSize}px ${userLocale === "tw" ? "TW" : "EN"}`;
    textWidth = ctx.measureText(text).width;
  }

  ctx.fillStyle = "white";
  ctx.fillText(`${text}`, x, y);
}
