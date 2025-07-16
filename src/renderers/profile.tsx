import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageEnum } from '@yeci226/hoyoapi';

import { Card } from '@/components/test';

interface ProfileDrawQuery {
  userId: string;
  accountIndex: number;
}

export async function handleProfileDraw(locale: LanguageEnum, query: ProfileDrawQuery) {
  return '<!DOCTYPE html>' + renderToStaticMarkup(<Card name={'test'} avatar={'https://cdn.discordapp.com/avatars/1234567890/1234567890.png'} />);
}

interface CharacterDrawQuery {
  userId: string;
  accountIndex: number;
  characterId: string;
}

export async function handleCharacterDraw(locale: LanguageEnum, query: CharacterDrawQuery) {
  return '<!DOCTYPE html>' + renderToStaticMarkup(<Card name={'test'} avatar={'https://cdn.discordapp.com/avatars/1234567890/1234567890.png'} />);
}

// const drawQueue = new Queue({ autostart: true });

// const offsetCharacter = {
//   1091: { x: -70, title: 'VoidHunter', element: 'frost' }, // Miyabi
//   1101: { x: 0 }, // Koleda
//   1121: { x: 0 }, // Ben
//   1181: { x: -55 }, // Grace
//   1211: { x: 0 }, // Rina
//   1221: { x: 60 }, // Yanagi
//   1241: { x: 0 }, // Zhu Yuan
//   1251: { x: -70 }, // Qingyi
//   1281: { x: 0 }, // Piper
//   1311: { x: 0 }, // Astra Yao
//   1331: { y: -480 }, // Vivian
//   1351: { x: 0 }, // Pulchra
//   1371: { title: 'GrandMaster', element: 'auricink' }, // Yixuan
//   1381: { x: -70 }, // Zero Anby
// };
// const offsetCharacterSkin = {
//   1031: {
//     3110311: { x: 0 }, // 皮膚ID
//   },
// };

// const elementId = {
//   200: 'physic',
//   201: 'fire',
//   202: 'ice',
//   203: 'thunder',
//   205: 'ether',
// };
// const professionId = {
//   1: 'attack',
//   2: 'stun',
//   3: 'anomaly',
//   4: 'support',
//   5: 'defense',
//   6: 'rupture',
// };
// const propertyId = {
//   // 基礎屬性
//   1: 'hp',
//   2: 'atk',
//   3: 'def',
//   4: 'stun', // 衝擊力
//   5: 'crit', // 暴擊率
//   6: 'critdmg', // 暴擊傷害
//   7: 'power', // 異常掌控
//   8: 'mystery', // 異常精通
//   9: 'penratio', // 穿透率
//   10: 'sprecover', // 能量回復
//   11: 'penvalue', // 穿透值

//   // 屬性加成
//   12: 'physic',
//   13: 'fire',
//   14: 'ice',
//   15: 'thunder',
//   16: 'ether',

//   // 命破專屬
//   19: 'perforation', // 貫穿力
//   20: 'energyaccumulation', // 閃能自動累積
// };
// const propertiesId = {
//   11102: 'hp', // 小生命
//   11103: 'hp', // 大生命
//   12101: 'atk', // 基礎攻擊
//   12102: 'atk', // 大攻擊
//   12103: 'atk', // 小攻擊
//   12202: 'stun', // 衝擊
//   13103: 'def', // 小防禦
//   13102: 'def', // 大防禦
//   20103: 'crit', // 暴率
//   21103: 'critdmg', // 暴傷
//   31402: 'power', // 異常掌控
//   31203: 'mystery', // 異常精通
//   30502: 'sprecover', // 能量回復
//   23103: 'penratio', // 穿透率
//   23203: 'penvalue', // 穿透值
//   31503: 'physic', // 物理傷害加成
//   31603: 'fire', // 火傷害加成
//   31703: 'ice', // 冰傷害加成
//   31803: 'thunder', // 電傷害加成
//   31903: 'ether', // 以太傷害加成
// };

// const zzzStaticUrl = 'https://act-webstatic.hoyoverse.com/game_record/zzz';
// const verticalUrl = `${zzzStaticUrl}/role_vertical_painting/role_vertical_painting_`;
// const rectangleUrl = `${zzzStaticUrl}/role_rectangle_avatar/role_rectangle_avatar_`;
// const bangbooSquareUrl = `${zzzStaticUrl}/bangboo_square_avatar/bangboo_square_avatar_`;
// const bangbooRectangleUrl = `${zzzStaticUrl}/bangboo_rectangle_avatar/bangboo_rectangle_avatar_`;

// GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'en-us.ttf'), 'EN');
// GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'zh-tw.ttf'), 'TW');
// GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'zh-cn.ttf'), 'CN');
// GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'vi-vn.ttf'), 'VI');
// GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'ja-jp.ttf'), 'JP');
// GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'ko-kr.ttf'), 'KR');
// GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'fr-fr.ttf'), 'FR');
// GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'Nunito-BlackItalic.ttf'), 'Nunito');

// const fonts = {
//   tw: 'TW',
//   cn: 'CN',
//   vi: 'VI',
//   jp: 'JP',
//   kr: 'KR',
//   fr: 'FR',
//   default: 'EN',
// };

// async function loadImageAsync(url, fallbackUrl) {
//   try {
//     return await loadImage(url);
//   } catch {
//     try {
//       return await loadImage(fallbackUrl);
//     } catch {
//       return await loadImage('./src/assets/images/None.png');
//     }
//   }
// }

// const drawTask = async () => {
//   try {
//     interaction.editReply({
//       embeds: [
//         new EmbedBuilder()
//           .setTitle(tr("Searching"))
//           .setColor(getRandomColor())
//           .setImage(
//             "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif"
//           ),
//       ],
//       fetchReply: true,
//     });
//     // Request
//     const requestStartTime = Date.now();
//     const userMindScape = (await db.get(`${user.id}.mindscape`)) ?? true;
//     const userLocale =
//       (await getUserLang(interaction.user.id)) ||
//       toI18nLang(interaction.locale) ||
//       "en";
//     const record = await zzz.record.records();
//     const characters = await zzz.record.characters();
//     const userData = await getUserHoyolabData(
//       interaction,
//       tr,
//       user.id,
//       userLocale,
//       accountIndex
//     );
//     const requestEndTime = Date.now();
//     // Generate
//     const drawStartTime = Date.now();
//     const imageBuffer = await drawMainImage(tr, userLocale, userData, record);
//     if (!imageBuffer) throw new Error(tr("profile_NoImageData"));
//     const drawEndTime = Date.now();
//     // bla bla bla Builder
//     const image = new AttachmentBuilder(imageBuffer, {
//       name: `MainImage_${zzz.uid}.png`,
//     });
//     function chunkArray(array, size) {
//       return Array.from(
//         { length: Math.ceil(array.length / size) },
//         (_, index) => array.slice(index * size, (index + 1) * size)
//       );
//     }
//     const characterOptions = characters.map((character) => {
//       return {
//         emoji: emoji[elementId[character.element_type]],
//         label: `${character.name_mi18n}`,
//         description: `${tr("profile_CharactersFormat", {
//           level: character.level,
//           rank: character.rank,
//         })}`,
//         value: `${user.id}-${accountIndex}-${character.id}`,
//       };
//     });
//     const optionChunks = chunkArray(characterOptions, 25);
//     const rowSelects = optionChunks.map((optionsChunk, index) =>
//       new ActionRowBuilder().addComponents(
//         new StringSelectMenuBuilder()
//           .setPlaceholder(`${tr("profile_SelectCharacter")} (${index + 1})`)
//           .setCustomId(`profile_SelectCharacter-${index}`)
//           .setMinValues(1)
//           .setMaxValues(1)
//           .addOptions(optionsChunk)
//       )
//     );
//     const rowMindScape = new ActionRowBuilder().addComponents(
//       new ButtonBuilder()
//         .setCustomId("profile_CharacterMindScape")
//         .setLabel(tr("MindScape"))
//         .setStyle(userMindScape ? ButtonStyle.Success : ButtonStyle.Secondary)
//     );
//     interaction.editReply({
//       embeds: [
//         new EmbedBuilder().setImage(`attachment://${image.name}`).setFooter({
//           text: tr("TimeSpent", {
//             requestTime: ((requestEndTime - requestStartTime) / 1000).toFixed(
//               2
//             ),
//             drawTime: ((drawEndTime - drawStartTime) / 1000).toFixed(2),
//           }),
//         }),
//       ],
//       components: [...rowSelects, rowMindScape],
//       files: [image],
//     });
//   } catch (error) {
//     if (error?.code == "-501000") {
//       interaction.editReply({
//         embeds: [
//           new EmbedBuilder()
//             .setTitle(tr("note_Error"))
//             .setConfig("#E76161", "sob")
//             .setImage(
//               "https://media.discordapp.net/attachments/1149960935654559835/1258313139078955039/image.png"
//             )
//             .setDescription(
//               tr("note_Error_Description") + "\n\n" + `\`${error.message}\``
//             ),
//         ],
//         fetchReply: true,
//       });
//     } else {
//       interaction.editReply({
//         embeds: [
//           new EmbedBuilder()
//             .setColor("#E76161")
//             .setTitle(tr("DrawError"))
//             .setDescription(`\`${error}\``)
//             .setThumbnail(
//               "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png"
//             ),
//         ],
//         fetchReply: true,
//       });
//     }
//   }
// };
// drawQueue.push(drawTask);
// if (drawQueue.length !== 1) {
//   drawInQueueReply(
//     interaction,
//     tr("DrawInQueue", { position: drawQueue.length - 1 })
//   );
// }

//   try {
//     const selectedFont = fonts[userLocale] || fonts.default;
//     const canvas = createCanvas(1000, 1600);
//     const ctx = canvas.getContext("2d");
//     const imagePaths = [
//       `./src/assets/images/profileBg.png`,
//       record.cur_head_icon_url,
//       ...(await Promise.all(
//         record.avatar_list.map((agent) => agent.role_square_url)
//       )),
//       "./src/assets/images/icons/other/showmore.png",
//       ...record.buddy_list.map((buddy) => buddy.bangboo_rectangle_url),
//       "./src/assets/images/icons/other/showmore.png",
//     ];
//     const images = await Promise.all(imagePaths.map(loadImageAsync));
//     const [bg, userHeadIcon, ...restImages] = images;
//     const agentImages = restImages.slice(0, record.avatar_list.length + 1);
//     const buddyImages = restImages.slice(record.avatar_list.length + 1);
//     const boxColor = "rgba(48, 48, 48, 255)";
//     // Draw BackGround
//     ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
//     // Draw BackGround Text
//     ctx.fillStyle = "white";
//     ctx.textAlign = "left";
//     ctx.font = `24px ${selectedFont}`;
//     ctx.fillText(tr("InterKnot"), 30, 33);
//     // Draw User Card
//     if (record.game_data_show?.card_url) {
//       // Main Card
//       const cardImage = await loadImageAsync(record.game_data_show.card_url);
//       const cardImageHeight = 265;
//       const cardImageScale = Math.min(1, cardImageHeight / cardImage.height);
//       ctx.drawImage(
//         cardImage,
//         -(cardImage.width * cardImageScale) / 2 + canvas.width * 0.66,
//         0,
//         cardImage.width * cardImageScale,
//         cardImageHeight
//       );
//       // Underline
//       ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
//       ctx.lineWidth = 1.5;
//       ctx.beginPath();
//       ctx.moveTo(0, cardImageHeight);
//       ctx.lineTo(canvas.width, cardImageHeight);
//       ctx.stroke();
//     }
//     // Draw User Info
//     ctx.drawImage(userHeadIcon, 54, 94, 129, 129);
//     const userNameX = 200;
//     // Draw User Name
//     ctx.textAlign = "left";
//     drawText(
//       ctx,
//       userData?.nickname ?? "Unknown",
//       selectedFont,
//       170,
//       46,
//       22,
//       userNameX,
//       record.game_data_show?.personal_title ? 150 : 180
//     ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
//     // Draw User Name Outline
//     ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
//     ctx.lineWidth = 2;
//     ctx.strokeText(
//       userData?.nickname ?? "Unknown",
//       userNameX,
//       record.game_data_show?.personal_title ? 150 : 180
//     );
//     // Draw User level
//     const userNameWidth = ctx.measureText(userData?.nickname ?? "").width;
//     const userLevelString = `Lv.${userData.level}`;
//     drawTextWithBackground(
//       ctx,
//       userLevelString,
//       userNameX + userNameWidth + 20,
//       145,
//       {
//         font: `25px ${selectedFont}`,
//         textColor: "black",
//         backgroundColor: "#FFDE00",
//         padding: 7.5,
//       }
//     );
//     // Draw User title
//     const gameDataShow = record.game_data_show ?? null;
//     const title = gameDataShow?.personal_title ?? null;
//     if (title) {
//       const titleMainColor = `#${gameDataShow.title_main_color.toUpperCase()}`;
//       const titleBottomColor = `#${gameDataShow.title_bottom_color.toUpperCase()}`;
//       ctx.textAlign = "left";
//       drawTextWithBackground(ctx, `${title}`, 210, 200, {
//         font: `30px ${selectedFont}`,
//         textColor: "black",
//         backgroundColor: "black",
//         padding: 12.5,
//         radius: 20,
//         outlineWidth: 3,
//         outlineColor: "rgba(255, 255, 255, 0.12)",
//       });
//       const gradient = ctx.createLinearGradient(0, 220 - 26, 0, 220);
//       gradient.addColorStop(0, titleMainColor);
//       gradient.addColorStop(1, titleBottomColor);
//       ctx.font = `30px ${selectedFont}`;
//       ctx.fillStyle = gradient;
//       ctx.fillText(`${title}`, 210, 200);
//     }
//     // // Draw User World Level Name
//     // ctx.textAlign = "left";
//     // drawText(
//     //   ctx,
//     //   tr("InterKnotReputation"),
//     //   selectedFont,
//     //   320,
//     //   28,
//     //   20,
//     //   425,
//     //   128
//     // ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
//     // ctx.textAlign = "right";
//     // drawText(
//     //   ctx,
//     //   record.stats.world_level_name,
//     //   selectedFont,
//     //   160,
//     //   28,
//     //   22,
//     //   970,
//     //   128
//     // ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
//     // // Draw User Active Days
//     // ctx.textAlign = "left";
//     // drawText(ctx, tr("ActiveDays"), selectedFont, 320, 28, 20, 425, 178); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
//     // ctx.fillStyle = "white";
//     // ctx.textAlign = "right";
//     // ctx.font = `28px ${selectedFont}`;
//     // ctx.fillText(`${record.stats.active_days}`, 970, 178);
//     // Draw User Medal
//     if (gameDataShow.medal_item_list.length > 0) {
//       const userTitleWidth = ctx.measureText(title).width;
//       for (
//         let index = 0;
//         index < gameDataShow.medal_item_list.length;
//         index++
//       ) {
//         const medal = gameDataShow.medal_item_list[index];
//         const medalIcon = await loadImageAsync(medal.medal_icon);
//         const medalIconX =
//           (userTitleWidth ? 220 + userTitleWidth + 10 : 220) + 10 + index * 70;
//         const medalIconY = 155;
//         ctx.drawImage(medalIcon, medalIconX, medalIconY, 64, 64);
//         ctx.fillStyle = "white";
//         ctx.textAlign = "center";
//         ctx.font = `36px Impact`;
//         ctx.fillText(`${medal.number}`, medalIconX + 32, medalIconY + 67);
//         // Text Outline
//         ctx.strokeStyle = "black";
//         ctx.lineWidth = 1.75;
//         ctx.strokeText(`${medal.number}`, medalIconX + 32, medalIconY + 67);
//       }
//     }
//     // Agents
//     ctx.fillStyle = "white";
//     ctx.textAlign = "left";
//     ctx.font = `36px ${selectedFont}`;
//     ctx.fillText(tr("Agents") + ` (${record.stats.avatar_num})`, 50, 330);
//     if (record.avatar_list.length == 9)
//       record.avatar_list.push({ name_mi18n: tr("Showmore") });
//     record.avatar_list.map((agent, index) => {
//       const offset_x = 180 * (index % 5);
//       const offset_y = 280 * Math.floor(index / 5);
//       drawRoundedRect(
//         ctx,
//         60 + offset_x,
//         360 + offset_y,
//         160,
//         260,
//         30,
//         boxColor
//       ); // (ctx, x, y, width, height, radius, color)
//       drawCircleImage(
//         ctx,
//         agentImages[index],
//         60 + offset_x + 10,
//         360 + offset_y + 10,
//         140
//       );
//       // Draw Agent Name
//       ctx.textAlign = "center";
//       drawText(
//         ctx,
//         agent.name_mi18n,
//         selectedFont,
//         140,
//         24,
//         20,
//         140 + offset_x,
//         550 + offset_y
//       ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
//       // Draw Agent Level
//       ctx.fillStyle = "rgba(128, 128, 128, 255)";
//       ctx.textAlign = "center";
//       ctx.font = `20px ${selectedFont}`;
//       ctx.fillText(
//         agent.level
//           ? tr("levelFormat2", {
//               level: agent.level,
//             })
//           : "",
//         140 + offset_x,
//         588 + offset_y
//       );
//       // Draw Agent Rank
//       if (agent.rank ? agent.rank != 0 : false) {
//         drawRoundedRect(
//           ctx,
//           178 + offset_x,
//           357 + offset_y,
//           45,
//           45,
//           22.5,
//           "rgba(206, 35, 40, 255)"
//         ); // (ctx, x, y, width, height, radius, color)
//         ctx.fillStyle = "white";
//         ctx.textAlign = "center";
//         ctx.font = `28px ${selectedFont}`;
//         ctx.fillText(`${agent.rank}`, 200 + offset_x, 388 + offset_y);
//       }
//     });
//     // Buddy
//     ctx.fillStyle = "white";
//     ctx.textAlign = "left";
//     ctx.font = `36px ${selectedFont}`;
//     ctx.fillText(tr("Bangboo") + ` (${record.stats.buddy_num})`, 50, 960);
//     if (record.buddy_list.length == 9)
//       record.buddy_list.push({ name: tr("Showmore") });
//     record.buddy_list.map((buddy, index) => {
//       const offset_x = 180 * (index % 5);
//       const offset_y = 280 * Math.floor(index / 5);
//       drawRoundedRect(
//         ctx,
//         60 + offset_x,
//         990 + offset_y,
//         160,
//         260,
//         30,
//         boxColor
//       ); // (ctx, x, y, width, height, radius, color)
//       drawCircleImage(
//         ctx,
//         buddyImages[index],
//         60 + offset_x + 10,
//         990 + offset_y + 10,
//         140
//       ); // (ctx, img, x, y, size, scaleFactor)
//       // Draw Buddy Name
//       ctx.textAlign = "center";
//       drawText(
//         ctx,
//         buddy.name,
//         selectedFont,
//         140,
//         24,
//         20,
//         140 + offset_x,
//         1180 + offset_y
//       ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
//       // Draw Buddy Level
//       ctx.fillStyle = "rgba(128, 128, 128, 255)";
//       ctx.textAlign = "center";
//       ctx.font = `20px ${selectedFont}`;
//       ctx.fillText(
//         buddy.level
//           ? tr("levelFormat2", {
//               level: buddy.level,
//             })
//           : "",
//         140 + offset_x,
//         1218 + offset_y
//       );
//       // Draw Buddy Rank
//       if (buddy.star ? buddy.star - 1 != 0 : false) {
//         drawRoundedRect(
//           ctx,
//           178 + offset_x,
//           987 + offset_y,
//           45,
//           45,
//           22.5,
//           "rgba(206, 35, 40, 255)"
//         ); // (ctx, x, y, width, height, radius, color)
//         ctx.fillStyle = "white";
//         ctx.textAlign = "center";
//         ctx.font = `28px ${selectedFont}`;
//         ctx.fillText(`${buddy.star}`, 200 + offset_x, 1018 + offset_y);
//       }
//     });
//     // Player UID
//     ctx.font = `28px ${selectedFont}`;
//     ctx.fillStyle = "white";
//     ctx.textAlign = "right";
//     ctx.fillText(
//       `${userData.region_name} | ${userData?.game_role_id ? `UID ${userData.game_role_id}` : ""}`,
//       canvas.width - 10,
//       canvas.height - 10
//     );
//     return canvas.toBuffer("image/png");
//   } catch (error) {
//     console.log(error);
//     console.error("Error generating image:", error);
//   }

//   try {
//     const selectedFont = fonts[userLocale] || fonts.default;
//     const userMindScape =
//       (await db.get(`${interaction.user.id}.mindscape`)) ?? true;
//     const canvas = createCanvas(2080, 870);
//     const ctx = canvas.getContext("2d");
//     // Fix disk driver count
//     for (let i = 0; i < 6; i++) {
//       if (!character.equip.some((equip) => equip.equipment_type - 1 === i)) {
//         character.equip.push({ equipment_type: i + 1 });
//       }
//     }
//     character.equip.sort((a, b) => a.equipment_type - b.equipment_type);
//     const propertyLength = 16;
//     // 檢查 character.id 對應的圖片是否存在
//     const characterSpecificImagePath = `./src/assets/images/icons/mindscape/${character.id}.png`;
//     const defaultImagePath = `./src/assets/images/icons/mindscape/m0.png`;
//     const userMindScapeImagePath = `./src/assets/images/icons/mindscape/m${userMindScape ? character.rank : 0}.png`;
//     // 如果 characterSpecificImagePath 不存在，將 userMindScapeImagePath 改為 defaultImagePath
//     let finalMindScapeImagePath = userMindScapeImagePath;
//     if (!fs.existsSync(characterSpecificImagePath)) {
//       finalMindScapeImagePath = defaultImagePath;
//     }
//     const characterData = await getCharacterData(character.id);
//     // 如果 character.skin_list 有值，且 characterData.skin 有值，優先使用 unlocked: true 且 is_original: false 的皮膚
//     let characterPath =
//       characterData?.iconUrl ??
//       `./src/assets/images/agents/${character.id}.webp`;
//     if (character.skin_list.length > 0 && characterData.skin) {
//       const skin = character.skin_list.find(
//         (skin) => skin.unlocked && !skin.is_original
//       );
//       if (skin) {
//         character.usingSkin = {
//           characterId: character.id,
//           skinId: skin.skin_id,
//           color: skin.skin_vertical_painting_color,
//           name: skin.skin_name,
//         };
//         const skinImage = characterData.skin[String(skin.skin_id)];
//         if (skinImage)
//           characterPath = `https://api.hakush.in/zzz/UI/${skinImage.Image}.webp`;
//       }
//     }
//     // Load images concurrently
//     const imagePaths = [
//       finalMindScapeImagePath,
//       characterSpecificImagePath,
//       characterPath,
//       offsetCharacter[character.id]?.element
//         ? `./src/assets/images/icons/element/${offsetCharacter[character.id].element}.webp`
//         : `./src/assets/images/icons/element/${elementId[character.element_type]}.webp`,
//       `./src/assets/images/icons/profession/${professionId[character.avatar_profession]}.webp`,
//       `${character.weapon?.icon}`,
//       `./src/assets/images/icons/weapon/role-star-${character.weapon?.star}.png`,
//       // 加載角色屬性圖示
//       ...character.properties.map((prop) => {
//         if (prop.property_id === 11) {
//           return `./src/assets/images/icons/property/sprecover.png`;
//         } else if (prop.property_id === 232) {
//           return `./src/assets/images/icons/property/penvalue.png`;
//         } else if (prop.property_id === 19) {
//           return `./src/assets/images/icons/property/perforation.png`;
//         } else if (prop.property_id === 20) {
//           return `./src/assets/images/icons/property/energyaccumulation.png`;
//         } else {
//           return `./src/assets/images/icons/property/${propertyId[prop.property_id]}.png`;
//         }
//       }),
//       // 加載所有可能用到的屬性圖示（用於 disk driver）
//       ...Object.values(propertiesId).map(
//         (prop) => `./src/assets/images/icons/property/${prop}.png`
//       ),
//       ...character.skills.map(
//         (skill) => `./src/assets/images/icons/skills/${skill.skill_type}.png`
//       ),
//       ...character.equip.map((equip) =>
//         equip?.id
//           ? `./src/assets/images/icons/diskdrives/${equip.id.toString().slice(0, 3)}_${equip.rarity}.webp`
//           : "./src/assets/images/icons/other/empty.png"
//       ),
//     ];
//     const images = await Promise.all(imagePaths.map(loadImageAsync));
//     const [
//       bg,
//       characterRankImage,
//       characterImage,
//       elementImage,
//       professionImage,
//       weaponImage,
//       weaponStarImage,
//       ...restImages
//     ] = images;
//     const propertyImages = restImages.slice(0, character.properties.length);
//     const allPropertyImages = restImages.slice(
//       character.properties.length,
//       character.properties.length + Object.values(propertiesId).length
//     );
//     const skillImages = restImages.slice(
//       character.properties.length + Object.values(propertiesId).length,
//       character.properties.length +
//         Object.values(propertiesId).length +
//         character.skills.length
//     );
//     const equipImages = restImages.slice(
//       character.properties.length +
//         Object.values(propertiesId).length +
//         character.skills.length
//     );
//     // 創建屬性圖示映射
//     const propertyImageMap = {};
//     // 角色屬性圖示映射
//     character.properties.forEach((prop, index) => {
//       let propertyKey;
//       if (prop.property_id === 11) {
//         propertyKey = "sprecover";
//       } else if (prop.property_id === 232) {
//         propertyKey = "penvalue";
//       } else if (prop.property_id === 19) {
//         propertyKey = "perforation";
//       } else if (prop.property_id === 20) {
//         propertyKey = "energyaccumulation";
//       } else {
//         propertyKey = propertyId[prop.property_id];
//       }
//       propertyImageMap[propertyKey] = propertyImages[index];
//     });
//     // 所有可能用到的屬性圖示映射（用於 disk driver）
//     Object.values(propertiesId).forEach((prop, index) => {
//       propertyImageMap[prop] = allPropertyImages[index];
//     });
//     // Draw BG
//     ctx.drawImage(characterRankImage, 0, 0, canvas.width, canvas.height);
//     ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
//     // Draw Paint
//     drawPaintSplatter(ctx, canvas.width, canvas.height, {
//       splatterCount: 10,
//       minSize: 50,
//       maxSize: 200,
//       colors: [`${character.vertical_painting_color}`],
//     });
//     // Draw Agent
//     // 取得角色 ID 和皮膚 ID
//     const characterId = character.id;
//     const skinId = character.skin_list.find(
//       (skin) => skin.unlocked && !skin.is_original
//     )?.skin_id;
//     const baseOffset = offsetCharacter[characterId] || {};
//     const skinOffset = skinId && offsetCharacterSkin[characterId]?.[skinId];
//     const offset = {
//       x: skinOffset?.x ?? baseOffset.x ?? -180,
//       y: skinOffset?.y ?? baseOffset.y ?? -160,
//     };
//     const characterMeta = baseOffset;
//     const characterImageX =
//       canvas.width / 2 - characterImage.width / 2.5 + offset.x;
//     const characterImageY =
//       canvas.height / 2 - characterImage.height / 10 + offset.y;
//     ctx.drawImage(
//       characterImage,
//       characterImageX,
//       characterImageY,
//       characterImage.width / 1.25,
//       characterImage.height / 1.25
//     ); // For agent.webp
//     // ctx.drawImage(characterImage, -300, 0, 1664, 806); // For agent.png
//     const boxColor = "rgba(34, 33, 34, 0.95)";
//     ctx.font = `60px ${selectedFont}`;
//     // Draw Agent Info Box
//     let padding = 50;
//     const iconSpacing = 40;
//     const elementIconSize = 60;
//     const professionIconSize = 60;
//     const textWidth = ctx.measureText(character.name_mi18n).width;
//     // 如果有稱號圖示與文字，預估會佔用 100px 寬（圖 + 間距 + 文字）
//     const titleExtraWidth = characterMeta.title ? 100 : -20;
//     const isUsingSkin = character.usingSkin?.name;
//     const boxWidth =
//       padding * 2 +
//       textWidth +
//       iconSpacing +
//       elementIconSize +
//       professionIconSize +
//       titleExtraWidth;
//     const boxHeight = (isUsingSkin ? 15 : 0) + 100; // 如果有皮膚名稱，則增加高度
//     // 畫框
//     drawRoundedRect(ctx, 60, 40, boxWidth, boxHeight, 30, boxColor);
//     // 畫角色名
//     ctx.fillStyle = "white";
//     ctx.font = `60px ${selectedFont}`;
//     ctx.fillText(character.name_mi18n, 60 + padding, 110);
//     // 畫皮膚名稱
//     if (isUsingSkin) {
//       ctx.font = `28px ${selectedFont}`;
//       ctx.fillStyle = character.usingSkin.color
//         ? character.usingSkin.color
//         : "#A2A2A2";
//       ctx.fillText(character.usingSkin.name, 60 + padding, 145);
//       ctx.fillStyle = "white"; // 恢復顏色
//       ctx.font = `60px ${selectedFont}`; // 恢復字體大小
//     }
//     // 如果有稱號則繪製圖與文字
//     if (characterMeta.title) {
//       const TitleIcon = await loadImageAsync(
//         `./src/assets/images/icons/other/${characterMeta.title}.png`
//       );
//       // 算出 icon 和文字位置
//       const iconX = 60 + padding + textWidth + 10;
//       const iconY = 75;
//       const textX = iconX + 40 + 10;
//       const textY = iconY + 32.5;
//       ctx.drawImage(TitleIcon, iconX, iconY, 40, 40);
//       const TitleText = tr(characterMeta.title) || "";
//       ctx.font = `32px ${selectedFont}`;
//       ctx.fillStyle = "#E3E3E3";
//       ctx.fillText(TitleText, textX, textY);
//     }
//     const elementIconX =
//       60 + padding + textWidth + iconSpacing + titleExtraWidth;
//     const elementIconY = isUsingSkin ? 57.5 : 60;
//     const professionIconX = elementIconX + elementIconSize + 10;
//     const professionIconY = isUsingSkin ? 57.5 : 60;
//     ctx.drawImage(
//       elementImage,
//       elementIconX,
//       elementIconY,
//       elementIconSize,
//       elementIconSize
//     );
//     ctx.drawImage(
//       professionImage,
//       professionIconX,
//       professionIconY,
//       professionIconSize,
//       professionIconSize
//     );
//     // Draw Agent Properties Box
//     drawRoundedRect(
//       ctx,
//       60,
//       160,
//       440,
//       20 + character.properties.length * 56 + 10,
//       30,
//       boxColor
//     ); // (ctx, x, y, width, height, radius, color)
//     propertyImages.map((image, index) => {
//       if (index < character.properties.length) {
//         const offset_y = index * 56;
//         const propertyName = character.properties[index].property_name;
//         let fontSize = 32;
//         ctx.font = `${fontSize}px ${selectedFont}`;
//         let propertyTextWidth = ctx.measureText(propertyName).width;
//         const maxTextWidth = 210;
//         let yPosition = 214 + offset_y;
//         while (propertyTextWidth > maxTextWidth && fontSize > 22) {
//           fontSize--;
//           yPosition -= 0.4;
//           ctx.font = `${fontSize}px ${selectedFont}`;
//           propertyTextWidth = ctx.measureText(propertyName).width;
//         }
//         ctx.drawImage(
//           index == character.properties.length - 1 ? elementImage : image, // 最後一個屬性是該角色的屬性加成
//           80,
//           (index == character.properties.length - 1 ? -2 : 0) + 180 + offset_y,
//           48,
//           48
//         );
//         const propertyFinalValue = character.properties[index].final;
//         if (
//           character.properties[index].base &&
//           character.properties[index].add
//         ) {
//           // Property Base Value
//           ctx.fillStyle = "white";
//           ctx.textAlign = "right";
//           ctx.font = `22px ${selectedFont}`;
//           ctx.fillText(
//             `${character.properties[index].base}`,
//             480 - ctx.measureText(`${propertyFinalValue}`).width - 40,
//             202 + offset_y
//           );
//           // Property Add Value
//           ctx.fillStyle = "#B5FF00";
//           ctx.fillText(
//             `+${character.properties[index].add}`,
//             480 - ctx.measureText(`${propertyFinalValue}`).width - 40,
//             222 + offset_y
//           );
//         }
//         // Property Final Value
//         ctx.font = `${fontSize}px ${selectedFont}`;
//         ctx.fillStyle = "white";
//         ctx.textAlign = "left";
//         ctx.fillText(propertyName, 140, yPosition);
//         ctx.textAlign = "right";
//         ctx.font = `32px ${selectedFont}`;
//         ctx.fillText(`${propertyFinalValue}`, 480, 214 + offset_y);
//       }
//     });
//     // Draw Agent Skills Box
//     const customOrder = [0, 2, 5, 1, 3, 4];
//     const reorderedSkillImages = customOrder.map(
//       (orderIndex) => skillImages[orderIndex]
//     );
//     const reorderedSkillLevel = customOrder.map(
//       (orderIndex) => character.skills[orderIndex]
//     );
//     reorderedSkillImages.map((image, index) => {
//       const offset_y = index * 60;
//       drawRoundedRect(ctx, 520, 260 + offset_y, 120, 54, 27, boxColor); // (ctx, x, y, width, height, radius, color)
//       ctx.drawImage(image, 526, 264 + offset_y, 46, 46);
//       ctx.font = `32px ${selectedFont}`;
//       ctx.fillStyle = "white";
//       ctx.textAlign = "right";
//       ctx.fillText(`${reorderedSkillLevel[index].level}`, 614, 298 + offset_y);
//     });
//     // Draw Agent Level Box
//     drawRoundedRect(
//       ctx,
//       520,
//       680,
//       ctx.measureText(
//         tr("levelFormat", {
//           level: character.level,
//         })
//       ).width + 120,
//       100,
//       30,
//       boxColor
//     ); // (ctx, x, y, width, height, radius, color)
//     ctx.font = `48px ${selectedFont}`;
//     ctx.fillStyle = "white";
//     ctx.textAlign = "left";
//     ctx.fillText(
//       tr("levelFormat", {
//         level: character.level,
//       }),
//       550,
//       746
//     );
//     // Draw Disc Driver Box
//     character.equip.map((equip, index) => {
//       const offset_x = 220 * (index % 3);
//       const offset_y = 280 * Math.floor(index / 3);
//       const boxWidth = 210;
//       const boxHeight = 270;
//       drawRoundedRect(
//         ctx,
//         1320 + offset_x,
//         60 + offset_y,
//         boxWidth,
//         boxHeight,
//         30,
//         boxColor
//       );
//       // Draw Disk Driver Icon
//       const image = equipImages[equip.equipment_type - 1];
//       ctx.drawImage(
//         image,
//         equip.id ? 1310 + offset_x : 1280 + offset_x + boxWidth / 2,
//         equip.id ? 28 + offset_y : offset_y + boxHeight / 2,
//         equip.id ? 110 : 84,
//         equip.id ? 110 : 84
//       );
//       // Draw Disk Driver
//       if (equip.id) {
//         drawRoundedRect(
//           ctx,
//           1426 + offset_x,
//           80 + offset_y,
//           84,
//           36,
//           18,
//           "rgba(255, 255, 255, 0.95)"
//         );
//         ctx.font = `32px ${selectedFont}`;
//         ctx.fillStyle = "black";
//         ctx.textAlign = "center";
//         ctx.fillText(`+${equip.level}`, 1465 + offset_x, 110 + offset_y, 70);
//       } else {
//         ctx.font = `32px ${selectedFont}`;
//         ctx.fillStyle = "#FFFFFF29";
//         ctx.textAlign = "center";
//         ctx.fillText(
//           `EMPTY`,
//           1322.5 + offset_x + boxWidth / 2,
//           112.5 + offset_y + boxHeight / 2,
//           95
//         );
//       }
//       // Draw Disk Driver Main Prop
//       equip.main_properties?.forEach((prop) => {
//         const image = propertyImageMap[propertiesId[prop.property_id]];
//         ctx.drawImage(image, 1334 + offset_x, 126 + offset_y, 40, 40);
//         ctx.font = `36px ${selectedFont}`;
//         ctx.fillStyle = prop.valid ? "#F1AD3D" : "white";
//         ctx.textAlign = "right";
//         ctx.fillText(`${prop.base}`, 1510 + offset_x, 160 + offset_y);
//       });
//       // Draw Disk Driver Prop
//       equip.properties?.forEach((prop, index) => {
//         const propOffest_x = 0;
//         const propOffest_y = 36 * index;
//         const image = propertyImageMap[propertiesId[prop.property_id]];
//         ctx.drawImage(
//           image,
//           1340 + offset_x,
//           176 + offset_y + propOffest_y,
//           28,
//           28
//         );
//         // Property Add
//         ctx.font = `24px ${selectedFont}`;
//         ctx.fillStyle = prop.valid ? "#F1AD3D" : "#FFFFFFA6";
//         if (prop.add > 0) {
//           ctx.textAlign = "left";
//           ctx.fillText(
//             `+${prop.add}`,
//             1380 + offset_x,
//             200 + offset_y + propOffest_y
//           );
//         }
//         ctx.textAlign = "right";
//         ctx.fillText(
//           `${prop.base}`,
//           1510 + offset_x,
//           200 + offset_y + propOffest_y
//         );
//       });
//     });
//     // Draw Weapon Box
//     drawRoundedRect(ctx, 1320, 620, 650, 200, 30, boxColor);
//     if (character.weapon) {
//       // Draw weapon Icon
//       ctx.drawImage(weaponImage, 1365, 630, 150, 150);
//       ctx.drawImage(
//         weaponStarImage,
//         1380,
//         755,
//         weaponStarImage.width / 1.2,
//         weaponStarImage.height / 1.2
//       );
//       // Draw weapon main properties
//       character.weapon.main_properties.forEach((prop, index) => {
//         const propOffest_x = 0;
//         const propOffest_y = 56 * index;
//         const image = propertyImageMap[propertiesId[prop.property_id]];
//         ctx.drawImage(image, 1560, 640 + propOffest_y, 40, 40);
//         ctx.textAlign = "left";
//         drawText(
//           ctx,
//           prop.property_name,
//           selectedFont,
//           170,
//           32,
//           28,
//           1620,
//           672 + propOffest_x
//         ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
//         ctx.font = `32px ${selectedFont}`;
//         ctx.fillStyle = "white";
//         ctx.textAlign = "right";
//         ctx.fillText(`${prop.base}`, 1900, 672 + propOffest_y);
//       });
//       // Draw weapon properties
//       character.weapon.properties.forEach((prop, index) => {
//         const propOffest_x = 0;
//         const propOffest_y = 56 * index;
//         const image = propertyImageMap[propertiesId[prop.property_id]];
//         ctx.drawImage(image, 1562, 686 + propOffest_y, 36, 36);
//         ctx.textAlign = "left";
//         drawText(
//           ctx,
//           prop.property_name,
//           selectedFont,
//           170,
//           28,
//           24,
//           1620,
//           716 + propOffest_y
//         ); // (ctx, text, userLocale, maxWidth, initialFontSize, minFontSize, x, y)
//         ctx.font = `28px ${selectedFont}`;
//         ctx.fillStyle = "white";
//         ctx.textAlign = "right";
//         ctx.fillText(`${prop.base}`, 1900, 716 + propOffest_y);
//       });
//       // Weapon Level
//       ctx.textAlign = "left";
//       ctx.font = `40px ${selectedFont}`;
//       ctx.fillText(
//         tr("levelFormat", {
//           level: character.weapon.level,
//         }),
//         1560,
//         790
//       );
//     } else {
//       ctx.font = `48px ${selectedFont}`;
//       ctx.fillStyle = "#FFFFFF29";
//       ctx.textAlign = "center";
//       ctx.fillText(`EMPTY`, 1320 + 650 / 2, 620 + 240 / 2, 650 / 2, 650 / 2);
//     }
//     // Player UID
//     ctx.font = `32px ${selectedFont}`;
//     ctx.fillStyle = "white";
//     ctx.textAlign = "right";
//     ctx.fillText(`UID ${uid}`, canvas.width - 10, canvas.height - 10);
//     return canvas.toBuffer("image/png");
//   } catch (error) {
//     console.log(error);
//     console.error("Error generating image:", error);
//   }

// function drawRoundedRect(
//   ctx,
//   x,
//   y,
//   width,
//   height,
//   radius,
//   color,
//   outlineWidth = 0,
//   outlineColor = "black"
// ) {
//   ctx.beginPath();
//   ctx.moveTo(x + radius, y);
//   ctx.arcTo(x + width, y, x + width, y + height, radius);
//   ctx.arcTo(x + width, y + height, x, y + height, radius);
//   ctx.arcTo(x, y + height, x, y, radius);
//   ctx.arcTo(x, y, x + width, y, radius);
//   ctx.closePath();

//   ctx.fillStyle = color;
//   ctx.fill();

//   if (outlineWidth > 0) {
//     ctx.strokeStyle = outlineColor;
//     ctx.lineWidth = outlineWidth;
//     ctx.stroke();
//   }
// }

// function drawCircleImage(ctx, img, x, y, size, scaleFactor = 1.2) {
//   ctx.save();

//   const centerX = x + size / 2;
//   const centerY = y + size / 2;

//   ctx.beginPath();
//   ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2, true);
//   ctx.closePath();

//   ctx.clip();

//   const scale = Math.min(size / img.width, size / img.height) * scaleFactor;

//   const scaledWidth = img.width * scale;
//   const scaledHeight = img.height * scale;

//   const imgX = centerX - scaledWidth / 2;
//   const imgY = centerY - scaledHeight / 2;

//   ctx.drawImage(img, imgX, imgY, scaledWidth, scaledHeight);
//   ctx.restore();
// }

// function drawText(
//   ctx,
//   text,
//   selectedFont,
//   maxWidth,
//   initialFontSize,
//   minFontSize,
//   x,
//   y,
//   color = "white"
// ) {
//   let fontSize = initialFontSize;
//   ctx.font = `${fontSize}px ${selectedFont}`;
//   let textWidth = ctx.measureText(text).width;

//   while (textWidth > maxWidth && fontSize > minFontSize) {
//     fontSize--;
//     ctx.font = `${fontSize}px ${selectedFont}`;
//     textWidth = ctx.measureText(text).width;
//   }

//   ctx.fillStyle = color;
//   ctx.fillText(`${text}`, x, y);
// }

// function drawTextWithBackground(ctx, text, x, y, options = {}) {
//   // 解構選項參數，提供預設值
//   const {
//     font = "20px Arial",
//     textColor = "black",
//     backgroundColor = "lightblue",
//     padding = 5,
//     radius = 10,
//     outlineWidth = 0,
//     outlineColor = "black",
//   } = options;

//   if (!text) return;

//   // 設定字體
//   ctx.font = font;

//   // 計算文字尺寸
//   const textWidth = ctx.measureText(text).width;
//   const textHeight = parseInt(font, 7.5);

//   // 計算背景矩形的尺寸和位置
//   const rectX = x - padding;
//   const rectY = y - textHeight - padding;
//   const rectWidth = textWidth + padding * 2;
//   const rectHeight = textHeight + padding * 2;

//   // 繪製背景矩形
//   ctx.fillStyle = backgroundColor;
//   drawRoundedRect(
//     ctx,
//     rectX,
//     rectY,
//     rectWidth,
//     rectHeight,
//     radius,
//     backgroundColor,
//     outlineWidth,
//     outlineColor
//   );

//   // 繪製文字
//   ctx.fillStyle = textColor;
//   ctx.fillText(text, x, y);
// }

// function drawPaintSplatter(ctx, canvasWidth, canvasHeight, options = {}) {
//   const {
//     splatterCount = 50, // 潑灑總數量
//     minSize = 5, // 最小潑灑點大小
//     maxSize = 30, // 最大潑灑點大小
//     colors = ["red", "blue", "yellow", "green", "purple"], // 潑灑顏色
//   } = options;

//   const splatters = []; // 記錄所有潑灑的位置和大小

//   for (let i = 0; i < splatterCount; i++) {
//     let isValid = false;
//     let x, y, size;

//     // 持續嘗試直到找到不重疊的位置
//     while (!isValid) {
//       x = Math.random() * canvasWidth; // 隨機 X 坐標
//       y = Math.random() * canvasHeight; // 隨機 Y 坐標
//       size = Math.random() * (maxSize - minSize) + minSize; // 隨機大小

//       // 檢查是否與已有的潑灑點重疊
//       isValid = splatters.every((s) => {
//         const distance = Math.sqrt((x - s.x) ** 2 + (y - s.y) ** 2);
//         return distance > s.size + size; // 距離大於半徑之和，表示不重疊
//       });
//     }

//     // 紀錄新的潑灑點
//     splatters.push({ x, y, size });

//     // 設定顏色和透明度
//     const color = colors[Math.floor(Math.random() * colors.length)];
//     ctx.fillStyle = color;
//     ctx.globalAlpha = Math.random() * 0.6 + 0.1; // 隨機透明度 (0.2 - 1.0)

//     // 繪製主潑灑點
//     ctx.beginPath();
//     ctx.arc(x, y, size, 0, Math.PI * 2);
//     ctx.fill();

//     // 繪製額外的小滴
//     const dripCount = Math.floor(Math.random() * 5 + 3); // 每次潑灑的小滴數量
//     for (let j = 0; j < dripCount; j++) {
//       const dripX = x + Math.random() * size * 2 - size; // 小滴的偏移 X
//       const dripY = y + Math.random() * size * 2 - size; // 小滴的偏移 Y
//       const dripSize = size * (Math.random() * 0.4); // 小滴的大小

//       // 確保小滴也不會與主潑灑點或其他點重疊
//       const isDripValid = splatters.every((s) => {
//         const distance = Math.sqrt((dripX - s.x) ** 2 + (dripY - s.y) ** 2);
//         return distance > s.size + dripSize;
//       });

//       if (isDripValid) {
//         ctx.beginPath();
//         ctx.arc(dripX, dripY, dripSize, 0, Math.PI * 2);
//         ctx.fill();
//       }
//     }
//   }

//   // 恢復透明度
//   ctx.globalAlpha = 1.0;
// }
