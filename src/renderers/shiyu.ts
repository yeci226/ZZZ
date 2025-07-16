import { client } from '@/index';
import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Queue from 'queue';
import { getRandomColor, drawInQueueReply, getUserHoyolabData, getUserLang, failedReply } from '@/utilities';
import { toI18nLang } from '@/utilities/core/i18n.js';
import emoji from '@/assets/emoji.js';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import fs from 'fs';
import { join } from 'path';
const drawQueue = new Queue({ autostart: true });

GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'en-us.ttf'), 'EN');
GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'zh-tw.ttf'), 'TW');
GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'zh-cn.ttf'), 'CN');
GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'vi-vn.ttf'), 'VI');
GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'ja-jp.ttf'), 'JP');
GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'ko-kr.ttf'), 'KR');
GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'fr-fr.ttf'), 'FR');
GlobalFonts.registerFromPath(join('.', 'src', '.', 'assets', 'Nunito-BlackItalic.ttf'), 'Nunito');

const zzzStaticUrl = 'https://act-webstatic.hoyoverse.com/game_record/zzz';
// const verticalUrl = `${zzzStaticUrl}/role_vertical_painting/role_vertical_painting_`;
// const rectangleUrl = `${zzzStaticUrl}/role_rectangle_avatar/role_rectangle_avatar_`;
// const bangbooSquareUrl = `${zzzStaticUrl}/bangboo_square_avatar/bangboo_square_avatar_`;
const bangbooRectangleUrl = `${zzzStaticUrl}/bangboo_rectangle_avatar/bangboo_rectangle_avatar_`;

const fonts = {
  tw: 'TW',
  cn: 'CN',
  vi: 'VI',
  jp: 'JP',
  kr: 'KR',
  fr: 'FR',
  default: 'EN',
};

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

export async function handleShiyuDraw() {
  return 'https://media.discordapp.net/attachments/1361321499549499432/1361321500000000000/image.png';
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
  //     const userLocale =
  //       (await getUserLang(interaction.user.id)) ||
  //       toI18nLang(interaction.locale) ||
  //       "en";
  //     const shiyuData = await zzz.record.shiyuDefense(schedule);
  //     if (!shiyuData.has_data)
  //       return failedReply(interaction, tr("NonData"), tr("NonDataDesc"));
  //     const requestEndTime = Date.now();
  //     // Generate
  //     const drawStartTime = Date.now();
  //     const imageBuffer = await drawShiyuImage(tr, userLocale, shiyuData);
  //     if (!imageBuffer) throw new Error(tr("profile_NoImageData"));
  //     const drawEndTime = Date.now();
  //     // bla bla bla Builder
  //     const image = new AttachmentBuilder(imageBuffer, {
  //       name: `Shiyu_${zzz.uid}.png`,
  //     });
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
}

// async function drawShiyuImage(tr, userLocale, shiyuData) {
//   try {
//     const selectedFont = fonts[userLocale] || fonts.default;

//     // 減少每層高度
//     const floorDetails = shiyuData.all_floor_detail.slice(0, 3);
//     const floorCount = floorDetails.length;
//     const baseHeight = 360; // 從380減少到360
//     const floorHeight = 360; // 從380減少到360
//     const canvasHeight = baseHeight + floorCount * floorHeight;

//     const canvas = createCanvas(1000, canvasHeight);
//     const ctx = canvas.getContext("2d");

//     // 更新圖片路徑，區分評級統計和層級評級使用的圖片
//     const imagePaths = [
//       // 評級統計圖片
//       `./src/assets/images/icons/shiyu/layerGradeA.png`,
//       `./src/assets/images/icons/shiyu/layerGradeB.png`,
//       `./src/assets/images/icons/shiyu/layerGradeS.png`,
//       // 層級評級圖片
//       `./src/assets/images/icons/shiyu/gradeA.png`,
//       `./src/assets/images/icons/shiyu/gradeB.png`,
//       `./src/assets/images/icons/shiyu/gradeS.png`,
//       // 節點圖標
//       `./src/assets/images/icons/shiyu/team1.png`,
//       `./src/assets/images/icons/shiyu/team2.png`,
//     ];

//     // 添加角色和援助圖標路徑
//     for (const floor of shiyuData.all_floor_detail) {
//       // 確保節點數據存在且格式正確
//       if (floor.node_1 && floor.node_1.avatars) {
//         for (const avatar of floor.node_1.avatars) {
//           if (avatar.role_square_url) {
//             imagePaths.push(avatar.role_square_url);
//           } else {
//             imagePaths.push(`./src/assets/images/agents/${avatar.id}.webp`);
//           }
//         }

//         if (floor.node_1.buddy && floor.node_1.buddy.bangboo_rectangle_url) {
//           imagePaths.push(floor.node_1.buddy.bangboo_rectangle_url);
//         } else if (floor.node_1.buddy) {
//           imagePaths.push(`${bangbooRectangleUrl}${floor.node_1.buddy.id}.png`);
//         }
//       }

//       // 處理節點2 (確保數據存在)
//       if (floor.node_2 && floor.node_2.avatars) {
//         for (const avatar of floor.node_2.avatars) {
//           if (avatar.role_square_url) {
//             imagePaths.push(avatar.role_square_url);
//           } else {
//             imagePaths.push(`./src/assets/images/agents/${avatar.id}.webp`);
//           }
//         }

//         if (floor.node_2.buddy && floor.node_2.buddy.bangboo_rectangle_url) {
//           imagePaths.push(floor.node_2.buddy.bangboo_rectangle_url);
//         } else if (floor.node_2.buddy) {
//           imagePaths.push(`${bangbooRectangleUrl}${floor.node_2.buddy.id}.png`);
//         }
//       }
//     }

//     // 元素圖標
//     const elementImages = await Promise.all([
//       loadImageAsync(`./src/assets/images/icons/element/physic.webp`),
//       loadImageAsync(`./src/assets/images/icons/element/fire.webp`),
//       loadImageAsync(`./src/assets/images/icons/element/ice.webp`),
//       loadImageAsync(`./src/assets/images/icons/element/thunder.webp`),
//       loadImageAsync(`./src/assets/images/icons/element/ether.webp`),
//     ]);

//     // 加載所有圖像
//     const images = await Promise.all(
//       imagePaths.map((path) =>
//         loadImageAsync(path).catch((err) => {
//           console.error(`Error loading image from ${path}:`, err);
//           // 返回一個1x1的透明圖像作為替代
//           const errorCanvas = createCanvas(1, 1);
//           return errorCanvas;
//         })
//       )
//     );

//     const [
//       layerGradeA,
//       layerGradeB,
//       layerGradeS,
//       gradeA,
//       gradeB,
//       gradeS,
//       team1,
//       team2,
//       ...restImages
//     ] = images;

//     // 區分兩種不同用途的評級圖片
//     const layerRatingImages = {
//       S: layerGradeS,
//       A: layerGradeA,
//       B: layerGradeB,
//     };

//     const gradeRatingImages = {
//       S: gradeS,
//       A: gradeA,
//       B: gradeB,
//     };

//     // 绘制背景
//     ctx.fillStyle = "#1A1A1A";
//     ctx.fillRect(0, 0, canvas.width, canvas.height);

//     // 绘制标题
//     ctx.fillStyle = "white";
//     ctx.textAlign = "center";
//     ctx.font = `48px ${selectedFont}`;
//     ctx.fillText(tr("ShiyuDefense") || "式輿防衛戰", canvas.width / 2, 80);

//     // 绘制挑战期间
//     const beginDate = new Date(
//       parseInt(shiyuData.hadal_begin_time.year),
//       parseInt(shiyuData.hadal_begin_time.month) - 1,
//       parseInt(shiyuData.hadal_begin_time.day)
//     );
//     const endDate = new Date(
//       parseInt(shiyuData.hadal_end_time.year),
//       parseInt(shiyuData.hadal_end_time.month) - 1,
//       parseInt(shiyuData.hadal_end_time.day)
//     );

//     const dateFormat = new Intl.DateTimeFormat(userLocale, {
//       month: "short",
//       day: "numeric",
//     });

//     ctx.font = `24px ${selectedFont}`;
//     ctx.fillText(
//       `${dateFormat.format(beginDate)} - ${dateFormat.format(endDate)}`,
//       canvas.width / 2,
//       120
//     );

//     // 繪製評級統計
//     const boxColor = "rgba(48, 48, 48, 255)";
//     drawRoundedRect(ctx, canvas.width / 2 - 180, 140, 360, 80, 20, boxColor);

//     ctx.textAlign = "center";
//     ctx.font = `28px ${selectedFont}`;
//     ctx.fillText(tr("RatingStats") || "評級統計", canvas.width / 2, 170);

//     // 檢查是否只有一種評級
//     const ratingCount = shiyuData.rating_list.length;

//     // 重新排列評級統計圖標和文字
//     if (ratingCount === 1) {
//       // 只有一種評級，置中顯示
//       const rating = shiyuData.rating_list[0].rating;
//       const times = shiyuData.rating_list[0].times;

//       // 使用 layerGrade 圖片，置中
//       const ratingImg = layerRatingImages[rating];
//       const centerX = canvas.width / 2 - 45;
//       ctx.drawImage(ratingImg, centerX, 160, 40, 40);

//       // 數量顯示在右側，白色
//       ctx.fillStyle = "white";
//       ctx.textAlign = "left";
//       ctx.font = `24px ${selectedFont}`;
//       ctx.fillText(`×${times}`, centerX + 50, 190);
//     } else {
//       // 多種評級，平均分布
//       let totalRatings = shiyuData.rating_list.length;
//       let startX = canvas.width / 2 - totalRatings * 60;

//       for (const ratingItem of shiyuData.rating_list) {
//         const rating = ratingItem.rating;
//         const times = ratingItem.times;

//         // 使用 layerGrade 圖片
//         const ratingImg = layerRatingImages[rating];
//         ctx.drawImage(ratingImg, startX, 160, 40, 40);

//         // 顯示次數在右側，白色
//         ctx.fillStyle = "white";
//         ctx.textAlign = "left";
//         ctx.font = `24px ${selectedFont}`;
//         ctx.fillText(`×${times}`, startX + 50, 190);

//         startX += 120; // 增加間距
//       }
//     }

//     ctx.textAlign = "center"; // 恢復文字對齊設置

//     // 改進快速通關時間顯示 - 使用更醒目的樣式
//     ctx.fillStyle = "#A0E9FF"; // 使用藍色突出顯示
//     ctx.font = `24px ${selectedFont}`;
//     ctx.textAlign = "center";

//     // 確保 fast_layer_time 存在
//     if (shiyuData.fast_layer_time) {
//       const minutes = Math.floor(shiyuData.fast_layer_time / 60);
//       const seconds = (shiyuData.fast_layer_time % 60)
//         .toString()
//         .padStart(2, "0");

//       // 快速通關時間放在專屬區域，有獨立的背景
//       const fastTimeBoxColor = "rgba(40, 40, 40, 255)";
//       drawRoundedRect(
//         ctx,
//         canvas.width / 2 - 160,
//         230,
//         320,
//         50,
//         15,
//         fastTimeBoxColor
//       );

//       ctx.fillText(
//         `${tr("FastestTime") || "最快通關時間"}: ${minutes}:${seconds}`,
//         canvas.width / 2,
//         265
//       );
//     }

//     // 恢復顏色設置
//     ctx.fillStyle = "white";
//     let currentY = 380;

//     // 繪製 buff (只顯示一次)
//     if (
//       floorDetails.length > 0 &&
//       floorDetails[0].buffs &&
//       floorDetails[0].buffs.length > 0
//     ) {
//       const buff = floorDetails[0].buffs[0];

//       // 先计算文本需要的高度
//       ctx.font = `18px ${selectedFont}`;
//       const estimatedHeight = estimateTextHeight(
//         ctx,
//         buff.text,
//         canvas.width - 120,
//         selectedFont
//       );

//       const buffBoxHeight = Math.max(120, estimatedHeight + 40);

//       const boxColor = "rgba(48, 48, 48, 255)";

//       // 调整 buff 框位置和高度
//       drawRoundedRect(
//         ctx,
//         50,
//         230,
//         canvas.width - 100,
//         buffBoxHeight,
//         20,
//         boxColor
//       );

//       ctx.fillStyle = "#FDE68A"; // buff 标题使用金色
//       ctx.font = `24px ${selectedFont}`;
//       ctx.textAlign = "left";
//       ctx.fillText(`${buff.title}`, 70, 262.5);

//       // 处理 buff 文本 - 增加可用宽度
//       drawBuffText(ctx, buff.text, 65, 292.5, canvas.width + 720, selectedFont);

//       // 根据 buff 框的实际高度调整后续内容的位置
//       currentY = 230 + buffBoxHeight + 30; // 添加一些额外间距
//     } else {
//       currentY = 380; // 保持原来的默认值
//     }

//     // 繪製各層信息
//     let imageIndex = 0;

//     // 每層之間的間距也要調整
//     for (let floorIndex = 0; floorIndex < floorDetails.length; floorIndex++) {
//       const floor = floorDetails[floorIndex];

//       // 繪製層級框
//       const layerBoxColor = "rgba(48, 48, 48, 255)";
//       drawRoundedRect(
//         ctx,
//         50,
//         currentY,
//         canvas.width - 100,
//         80,
//         20,
//         layerBoxColor
//       );

//       // 使用 gradeRatingImages 繪製評級 - 放在名稱左側
//       const ratingImg = gradeRatingImages[floor.rating];
//       if (ratingImg) {
//         ctx.drawImage(ratingImg, 65, currentY + 12.5, 60, 60);
//       }

//       // 繪製層級名稱 - 右移
//       ctx.fillStyle = "white";
//       ctx.textAlign = "left";
//       ctx.font = `26px ${selectedFont}`;
//       ctx.fillText(`${floor.zone_name}`, 135, currentY + 50);

//       // 繪製通關時間 - 右側顯示（改為顯示兩個節點的戰鬥時間總和）
//       // 計算兩個節點的總戰鬥時間
//       if (floor.node_1 && floor.node_2) {
//         const node1Time = floor.node_1.battle_time || 0;
//         const node2Time = floor.node_2.battle_time || 0;
//         const totalTime = node1Time + node2Time;

//         // 格式化總時間
//         const totalMinutes = Math.floor(totalTime / 60);
//         const totalSeconds = (totalTime % 60).toString().padStart(2, "0");

//         // 右側時間顯示
//         ctx.textAlign = "right";
//         ctx.fillStyle = "#E3E3E3";
//         ctx.font = `22px ${selectedFont}`;
//         ctx.fillText(
//           `${tr("CostTime") || "花費時間"} ${totalMinutes}:${totalSeconds}`,
//           canvas.width - 70,
//           currentY + 47.5
//         );

//         // 恢復設置
//         ctx.textAlign = "left";
//         ctx.fillStyle = "white";
//       }

//       // 使用通用函數繪製節點1
//       imageIndex = await drawNode(
//         tr,
//         ctx,
//         floor.node_1,
//         50, // x座標
//         currentY - 10, // 調整Y座標使節點更靠近層級框
//         440, // 寬度
//         200, // 高度
//         tr("EnemyWeakness") || "敵人弱點", // 直接使用"敵人弱點"作為標題
//         team1,
//         elementImages,
//         selectedFont,
//         imageIndex,
//         restImages
//       );

//       // 使用通用函數繪製節點2
//       imageIndex = await drawNode(
//         tr,
//         ctx,
//         floor.node_2,
//         510, // x座標
//         currentY - 10, // 調整Y座標使節點更靠近層級框
//         440, // 寬度
//         200, // 高度
//         tr("EnemyWeakness") || "敵人弱點", // 直接使用"敵人弱點"作為標題
//         team2,
//         elementImages,
//         selectedFont,
//         imageIndex,
//         restImages
//       );

//       // 計算下一層的Y位置，減少層間距
//       if (floorIndex < floorDetails.length - 1) {
//         currentY += floorHeight - 10;
//       }
//     }

//     return canvas.toBuffer("image/png");
//   } catch (error) {
//     console.log(error);
//     console.error("Error generating image:", error);
//     throw error;
//   }
// }

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

// // 添加估算文本高度的辅助函数
// function estimateTextHeight(ctx, text, maxWidth, fontFamily) {
//   // 保存当前上下文状态
//   const originalFont = ctx.font;

//   // 设置字体
//   ctx.font = `18px ${fontFamily}`;
//   const lineHeight = 18;

//   // 替换换行符
//   text = text.replace(/\\n/g, "\n");

//   // 移除颜色标签，获取纯文本
//   let plainText = text.replace(/<color=#[A-Fa-f0-9]+>|<\/color>/g, "");

//   // 分割成行
//   const lines = plainText.split("\n");
//   let totalLines = 0;

//   // 计算每行需要的行数
//   for (const line of lines) {
//     const chars = Array.from(line);
//     let currentLine = "";

//     for (const char of chars) {
//       const testLine = currentLine + char;
//       const metrics = ctx.measureText(testLine);

//       if (metrics.width > maxWidth) {
//         // 需要换行
//         currentLine = char;
//         totalLines++;
//       } else {
//         currentLine = testLine;
//       }
//     }

//     // 每个原始行至少占一行
//     totalLines++;
//   }

//   // 恢复上下文状态
//   ctx.font = originalFont;

//   // 返回估计的高度
//   return totalLines * lineHeight + (totalLines - 1) * (lineHeight * 0.5);
// }

// // 改进 drawBuffText 函数
// function drawBuffText(ctx, text, x, y, maxWidth, fontFamily) {
//   // 替換換行符為實際的斷行
//   text = text.replace(/\\n/g, "\n");

//   // 保存原始填充樣式和字體
//   const originalFillStyle = ctx.fillStyle;
//   const originalFont = ctx.font;

//   ctx.font = `18px ${fontFamily}`;
//   ctx.fillStyle = "#E3E3E3"; // 默認文本顏色
//   const lineHeight = 23; // 保持緊湊的行高

//   // 分割成行處理
//   const lines = text.split("\n");
//   let currentY = y;

//   for (const line of lines) {
//     // 預處理：收集所有顏色標籤的位置和顏色信息
//     const colorSegments = [];
//     let plainText = "";
//     let remainingText = line;
//     let offset = 0;

//     // 解析所有顏色標籤
//     while (remainingText.length > 0) {
//       const colorTagMatch = remainingText.match(/<color=#([A-Fa-f0-9]+)>/);

//       if (!colorTagMatch) {
//         // 沒有更多顏色標籤，添加剩餘文本
//         plainText += remainingText;
//         break;
//       }

//       // 添加顏色標籤前的文本
//       const beforeColorText = remainingText.substring(0, colorTagMatch.index);
//       plainText += beforeColorText;
//       offset += beforeColorText.length;

//       // 查找結束標籤
//       const endTagIndex = remainingText.indexOf(
//         "</color>",
//         colorTagMatch.index
//       );
//       if (endTagIndex === -1) {
//         // 沒有結束標籤，添加剩餘文本
//         plainText += remainingText.substring(
//           colorTagMatch.index + colorTagMatch[0].length
//         );
//         break;
//       }

//       // 獲取彩色文本
//       const coloredText = remainingText.substring(
//         colorTagMatch.index + colorTagMatch[0].length,
//         endTagIndex
//       );
//       plainText += coloredText;

//       // 記錄顏色段
//       colorSegments.push({
//         start: offset,
//         end: offset + coloredText.length,
//         color: `#${colorTagMatch[1]}`,
//       });

//       // 更新偏移量
//       offset += coloredText.length;

//       // 處理剩餘文本
//       remainingText = remainingText.substring(endTagIndex + 8); // 8 = '</color>'.length
//     }

//     // 現在按字符處理純文本，應用顏色標籤信息
//     const chars = Array.from(plainText);
//     let currentLine = "";
//     let currentX = x;
//     let currentCharIndex = 0;

//     for (let i = 0; i < chars.length; i++) {
//       const char = chars[i];
//       const testLine = currentLine + char;
//       const metrics = ctx.measureText(testLine);

//       // 檢查是否超出最大寬度
//       if (currentX + metrics.width > x + maxWidth) {
//         // 繪製當前行，使用正確的顏色
//         drawColoredLine(
//           ctx,
//           currentLine,
//           currentX - ctx.measureText(currentLine).width,
//           currentY,
//           colorSegments,
//           currentCharIndex - currentLine.length
//         );

//         // 重置為新行
//         currentLine = char;
//         currentX = x + ctx.measureText(char).width;
//         currentY += lineHeight;
//         currentCharIndex = i;
//       } else {
//         // 添加字符到當前行
//         currentLine += char;
//         currentX = x + metrics.width;
//         currentCharIndex++;
//       }
//     }

//     // 繪製最後一行
//     if (currentLine) {
//       drawColoredLine(
//         ctx,
//         currentLine,
//         x,
//         currentY,
//         colorSegments,
//         currentCharIndex - currentLine.length
//       );
//     }

//     // 行之間添加間距
//     currentY += lineHeight;
//   }

//   // 恢復原始填充樣式和字體
//   ctx.fillStyle = originalFillStyle;
//   ctx.font = originalFont;

//   return currentY;

//   // 輔助函數：繪製帶顏色的文本行
//   function drawColoredLine(ctx, line, lineX, lineY, colorSegments, startIndex) {
//     let currentX = lineX;
//     const chars = Array.from(line);

//     for (let i = 0; i < chars.length; i++) {
//       const charIndex = startIndex + i;
//       const char = chars[i];

//       // 檢查當前字符是否在某個顏色段內
//       let charColor = "#E3E3E3"; // 默認顏色
//       for (const segment of colorSegments) {
//         if (charIndex >= segment.start && charIndex < segment.end) {
//           charColor = segment.color;
//           break;
//         }
//       }

//       // 設置顏色並繪製字符
//       ctx.fillStyle = charColor;
//       ctx.fillText(char, currentX, lineY);
//       currentX += ctx.measureText(char).width;
//     }

//     // 恢復默認顏色
//     ctx.fillStyle = "#E3E3E3";
//   }
// }

// // 修改節點繪製函數參數
// async function drawNode(
//   tr,
//   ctx,
//   nodeData,
//   x,
//   currentY, // 只接收 currentY 參數
//   width,
//   height,
//   title,
//   teamIcon,
//   elementImages,
//   selectedFont,
//   imageIndex,
//   restImages
// ) {
//   // 繪製節點框 - 直接使用 currentY + 120
//   drawRoundedRect(
//     ctx,
//     x,
//     currentY + 120,
//     width,
//     200,
//     15,
//     "rgba(35, 35, 35, 255)"
//   );

//   // 收集所有怪物的弱點 - 移到前面收集
//   const allWeaknesses = {};
//   if (nodeData.monster_info && nodeData.monster_info.list) {
//     for (const monster of nodeData.monster_info.list) {
//       if (monster.physics_weakness > 0) allWeaknesses.physics = true;
//       if (monster.fire_weakness > 0) allWeaknesses.fire = true;
//       if (monster.ice_weakness > 0) allWeaknesses.ice = true;
//       if (monster.elec_weakness > 0) allWeaknesses.elec = true;
//       if (monster.ether_weakness > 0) allWeaknesses.ether = true;
//     }
//   }

//   // 繪製節點標題
//   ctx.fillStyle = "white";
//   ctx.font = `22px ${selectedFont}`;
//   ctx.drawImage(teamIcon, x + 20, currentY + 150, 30, 30);
//   ctx.fillText(title, x + 60, currentY + 172.5);

//   // 在標題旁邊繪製弱點圖標
//   let weaknessX = x + 152.5; // 從標題後面開始
//   const weaknessY = currentY + 150;

//   if (allWeaknesses.physics) {
//     ctx.drawImage(elementImages[0], weaknessX, weaknessY, 30, 30);
//     weaknessX += 27.5;
//   }
//   if (allWeaknesses.fire) {
//     ctx.drawImage(elementImages[1], weaknessX, weaknessY, 30, 30);
//     weaknessX += 27.5;
//   }
//   if (allWeaknesses.ice) {
//     ctx.drawImage(elementImages[2], weaknessX, weaknessY, 30, 30);
//     weaknessX += 27.5;
//   }
//   if (allWeaknesses.elec) {
//     ctx.drawImage(elementImages[3], weaknessX, weaknessY, 30, 30);
//     weaknessX += 27.5;
//   }
//   if (allWeaknesses.ether) {
//     ctx.drawImage(elementImages[4], weaknessX, weaknessY, 30, 30);
//   }

//   let avatarX = x + 30;
//   let returnImgIndex = imageIndex;

//   // 繪製角色
//   if (nodeData.avatars) {
//     for (let i = 0; i < nodeData.avatars.length; i++) {
//       const avatar = nodeData.avatars[i];

//       // 獲取角色圖像
//       let avatarImg;
//       try {
//         if (avatar.role_square_url) {
//           avatarImg = await loadImageAsync(avatar.role_square_url);
//         } else {
//           avatarImg = restImages[returnImgIndex++];
//         }
//       } catch (err) {
//         avatarImg = restImages[returnImgIndex++] || createCanvas(1, 1);
//         console.error(
//           `Failed to load avatar image: ${avatar.role_square_url}`,
//           err
//         );
//       }

//       // 繪製角色圖標
//       drawCircleImage(ctx, avatarImg, avatarX, currentY + 200, 80);

//       // 繪製元素圖標 - 移到左上角並添加黑色圓形背景
//       const elementIndex = avatar.element_type
//         ? [200, 201, 202, 203, 205].indexOf(avatar.element_type)
//         : 0;

//       if (elementIndex >= 0) {
//         // 先繪製黑色圓形背景
//         ctx.beginPath();
//         ctx.arc(avatarX + 10, currentY + 215, 16, 0, Math.PI * 2);
//         ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
//         ctx.fill();

//         // 再繪製元素圖標
//         ctx.drawImage(
//           elementImages[elementIndex],
//           avatarX - 5,
//           currentY + 200,
//           30,
//           30
//         );
//       }

//       // 顯示角色等級
//       if (avatar.level) {
//         ctx.fillStyle = "#E3E3E3";
//         ctx.font = `16px ${selectedFont}`;
//         ctx.textAlign = "center";
//         ctx.fillText(
//           tr("levelFormat", { level: avatar.level }),
//           avatarX + 35,
//           currentY + 300
//         );
//         ctx.textAlign = "left";
//       }

//       avatarX += 105;
//     }
//   }

//   // 繪製 Buddy
//   if (nodeData.buddy) {
//     try {
//       // 計算 buddy 的位置
//       const lastAvatarX = x + 30 + (nodeData.avatars.length - 1) * 105;
//       const buddyX = lastAvatarX + 100;
//       const buddyY = currentY + 205;

//       // 加載 buddy 圖像
//       let buddyImg;
//       if (nodeData.buddy.bangboo_rectangle_url) {
//         buddyImg = await loadImageAsync(nodeData.buddy.bangboo_rectangle_url);
//       } else {
//         buddyImg = await loadImageAsync(
//           `${bangbooRectangleUrl}${nodeData.buddy.id}.png`
//         );
//       }

//       // 繪製 buddy 圖像
//       drawCircleImage(ctx, buddyImg, buddyX, buddyY, 70);

//       // 顯示 buddy 的等級
//       if (nodeData.buddy.level) {
//         ctx.fillStyle = "#E3E3E3";
//         ctx.font = `14px ${selectedFont}`;
//         ctx.textAlign = "center";
//         ctx.fillText(
//           tr("levelFormat", { level: nodeData.buddy.level }),
//           buddyX + 30,
//           buddyY + 85
//         );
//         ctx.fillStyle = "white";
//         ctx.textAlign = "left";
//       }
//     } catch (err) {
//       console.error(`Error drawing buddy:`, err);
//     }
//   }

//   // 顯示戰鬥時間 - 更醒目的樣式
//   if (nodeData.battle_time) {
//     ctx.font = `20px ${selectedFont}`; // 增大字體
//     ctx.fillStyle = "#E3E3E3";
//     ctx.textAlign = "right"; // 靠右對齊

//     // 戰鬥時間格式化
//     const battleMinutes = Math.floor(nodeData.battle_time / 60);
//     const battleSeconds = (nodeData.battle_time % 60)
//       .toString()
//       .padStart(2, "0");

//     // 添加小圖標或提示
//     ctx.fillText(
//       `${tr("CostTime")} ${battleMinutes}:${battleSeconds}`,
//       x + width - 20, // 靠右顯示
//       currentY + 172.5 // 與標題在同一行
//     );

//     // 恢復設置
//     ctx.textAlign = "left";
//     ctx.fillStyle = "white";
//   }

//   return returnImgIndex;
// }
