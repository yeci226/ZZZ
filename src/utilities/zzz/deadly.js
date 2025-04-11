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
  failedReply,
} from "../utilities.js";
import { toI18nLang } from "../core/i18n.js";
import emoji from "../../assets/emoji.js";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import fs from "fs";
import { join } from "path";
const db = client.db;
const drawQueue = new Queue({ autostart: true });

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

export async function handleDeadlyDraw(interaction, tr, user, zzz, schedule) {
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

      // Request
      const requestStartTime = Date.now();
      const userLocale =
        (await getUserLang(interaction.user.id)) ||
        toI18nLang(interaction.locale) ||
        "en";
      const deadlyData = await zzz.record.deadlyAssault(schedule);
      if (!deadlyData.has_data)
        return failedReply(interaction, tr("NonData"), tr("NonDataDesc"));
      const requestEndTime = Date.now();

      // Generate
      const drawStartTime = Date.now();
      const imageBuffer = await drawDeadlyImage(tr, userLocale, deadlyData);
      if (!imageBuffer) throw new Error(tr("profile_NoImageData"));
      const drawEndTime = Date.now();

      // bla bla bla Builder
      const image = new AttachmentBuilder(imageBuffer, {
        name: `Deadly_${zzz.uid}.png`,
      });

      interaction.editReply({
        embeds: [
          new EmbedBuilder().setImage(`attachment://${image.name}`).setFooter({
            text: tr("TimeSpent", {
              requestTime: ((requestEndTime - requestStartTime) / 1000).toFixed(
                2
              ),
              drawTime: ((drawEndTime - drawStartTime) / 1000).toFixed(2),
            }),
          }),
        ],
        files: [image],
      });
    } catch (error) {
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

async function drawDeadlyImage(tr, userLocale, deadlyData) {
  try {
    const selectedFont = fonts[userLocale] || fonts.default;

    // 计算画布高度 - 考虑到每个战斗记录可能有BUFF
    const recordCount = deadlyData.list ? deadlyData.list.length : 0;
    const baseHeight = 400; // 顶部信息区域高度
    const recordHeight = 300; // 每个战斗记录的高度（增加以容纳BUFF）
    const canvasHeight = baseHeight + recordCount * recordHeight;

    const canvas = createCanvas(1000, canvasHeight);
    const ctx = canvas.getContext("2d");

    // 加载所需图像
    const starImg = await loadImageAsync(
      "./src/assets/images/icons/deadly/star.png"
    );

    // 0% ~ ?% rankbg-1
    // ?% ~ ?% rankbg-2
    // ?% ~ ?% rankbg-3
    // ?% ~ 50% rankbg-4
    // 50%+ rankbg-5
    const percent = deadlyData.rank_percent / 100;
    let rankbg;
    if (percent >= 50) {
      rankbg = await loadImageAsync(
        "./src/assets/images/icons/deadly/rankbg-5.png"
      );
    } else {
      rankbg = await loadImageAsync(
        "./src/assets/images/icons/deadly/rankbg-4.png"
      );
    }

    // 加载 buff 图标
    const buffImg = await loadImageAsync(
      "./src/assets/images/icons/deadly/buff.png"
    );

    // 加载元素图标
    const elementImages = await Promise.all([
      loadImageAsync(`./src/assets/images/icons/element/physic.png`),
      loadImageAsync(`./src/assets/images/icons/element/fire.png`),
      loadImageAsync(`./src/assets/images/icons/element/ice.png`),
      loadImageAsync(`./src/assets/images/icons/element/thunder.png`),
      loadImageAsync(`./src/assets/images/icons/element/ether.png`),
    ]);

    // 加载角色和助手图像
    const avatarImages = {};
    const buddyImages = {};
    const bossImages = {};
    const bossBgImages = {};
    const raceIcons = {};

    // 预加载所有角色、助手和Boss图像
    if (deadlyData.list) {
      for (const battle of deadlyData.list) {
        if (battle.avatar_list) {
          for (const avatar of battle.avatar_list) {
            if (!avatarImages[avatar.id] && avatar.role_square_url) {
              try {
                avatarImages[avatar.id] = await loadImageAsync(
                  avatar.role_square_url,
                  `./src/assets/images/agents/${avatar.id}.webp`
                );
              } catch (err) {
                console.error(
                  `Failed to load avatar image for ${avatar.id}:`,
                  err
                );
              }
            }
          }
        }

        if (battle.buddy && battle.buddy.id) {
          if (
            !buddyImages[battle.buddy.id] &&
            battle.buddy.bangboo_rectangle_url
          ) {
            try {
              buddyImages[battle.buddy.id] = await loadImageAsync(
                battle.buddy.bangboo_rectangle_url,
                `./src/assets/images/bangboos/${battle.buddy.id}.png`
              );
            } catch (err) {
              console.error(
                `Failed to load buddy image for ${battle.buddy.id}:`,
                err
              );
            }
          }
        }

        // 加载Boss图像和种族图标
        if (battle.boss && battle.boss.length > 0) {
          for (const boss of battle.boss) {
            if (!bossImages[boss.name] && boss.icon) {
              try {
                bossImages[boss.name] = await loadImageAsync(
                  boss.icon,
                  `./src/assets/images/bosses/default.png`
                );

                // 加載Boss背景
                if (boss.bg_icon && !bossBgImages[boss.name]) {
                  bossBgImages[boss.name] = await loadImageAsync(
                    boss.bg_icon,
                    `./src/assets/images/bosses/bg_default.png`
                  );
                }

                // 加载种族图标
                if (boss.race_icon && !raceIcons[boss.name]) {
                  raceIcons[boss.name] = await loadImageAsync(
                    boss.race_icon,
                    `./src/assets/images/bosses/race_default.png`
                  );
                }
              } catch (err) {
                console.error(
                  `Failed to load boss image for ${boss.name}:`,
                  err
                );
              }
            }
          }
        }
      }
    }

    // 绘制背景
    ctx.fillStyle = "#1A1A1A";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制标题
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.font = `48px ${selectedFont}`;
    ctx.fillText(tr("DeadlyAssault") || "危局強襲戰", canvas.width / 2, 80);

    // 绘制挑战期间
    if (deadlyData.start_time && deadlyData.end_time) {
      const beginDate = new Date(
        parseInt(deadlyData.start_time.year),
        parseInt(deadlyData.start_time.month) - 1,
        parseInt(deadlyData.start_time.day)
      );
      const endDate = new Date(
        parseInt(deadlyData.end_time.year),
        parseInt(deadlyData.end_time.month) - 1,
        parseInt(deadlyData.end_time.day)
      );

      ctx.font = `24px ${selectedFont}`;
      ctx.fillText(
        `${beginDate.getMonth() + 1}月${beginDate.getDate()}日 - ${
          endDate.getMonth() + 1
        }月${endDate.getDate()}日`,
        canvas.width / 2,
        120
      );
    }

    // 绘制分数区域背景
    const scoreBoxColor = "rgba(35, 35, 35, 255)";
    drawRoundedRect(ctx, 50, 140, canvas.width - 100, 140, 20, scoreBoxColor);

    // 绘制总分数
    ctx.textAlign = "center";
    ctx.font = `bold 60px ${selectedFont}`;
    ctx.fillStyle = "white";
    ctx.fillText(
      deadlyData.total_score ? deadlyData.total_score.toString() : "0",
      canvas.width / 2,
      210
    );

    // 绘制"总得分"标签
    const totalScoreText = tr("TotalScore") || "總得分";
    const totalScoreWidth = ctx.measureText(
      deadlyData.total_score.toString()
    ).width;
    const totalScoreX = canvas.width / 2 - totalScoreWidth + 50;
    ctx.font = `24px ${selectedFont}`;
    ctx.fillStyle = "#A0A0A0";
    ctx.fillText(totalScoreText, totalScoreX, 200);

    // 绘制排名百分比
    if (deadlyData.rank_percent) {
      const percentText = `${(deadlyData.rank_percent / 100).toFixed(2)}%`;
      ctx.font = `16px ${selectedFont}`;
      ctx.fillStyle = "black"; // 蓝色

      // 绘制排名百分比背景
      ctx.drawImage(
        rankbg,
        canvas.width / 2 + totalScoreWidth - 110,
        160,
        81 * 1.2,
        20 * 1.2
      );
      ctx.fillText(
        percentText,
        canvas.width / 2 + totalScoreWidth - 72.5,
        177.5
      );
    }

    // 绘制总星星数
    if (deadlyData.total_star) {
      const starX = canvas.width / 2 - 60;
      const starY = 230;

      ctx.drawImage(starImg, starX, starY, 40, 40);
      ctx.font = `24px ${selectedFont}`;
      ctx.fillStyle = "white";
      ctx.textAlign = "left";
      ctx.fillText(`×${deadlyData.total_star}`, starX + 45, starY + 25);
    }

    // 绘制战斗记录
    let currentY = 310;

    if (deadlyData.list) {
      for (const battle of deadlyData.list) {
        // 绘制BUFF（如果有）
        if (battle.buffer && battle.buffer.length > 0) {
          for (const buffer of battle.buffer) {
            // 绘制BUFF框背景
            const buffBoxColor = "rgba(48, 48, 48, 255)";
            const buffY = currentY;

            // 先计算文本需要的高度
            ctx.font = `18px ${selectedFont}`;
            const estimatedHeight = estimateTextHeight(
              ctx,
              buffer.desc,
              canvas.width - 120,
              selectedFont
            );

            // 根据文本高度动态调整 buff 框高度
            const buffBoxHeight = Math.max(100, estimatedHeight + 40);

            drawRoundedRect(
              ctx,
              50,
              buffY,
              canvas.width - 100,
              buffBoxHeight,
              20,
              buffBoxColor
            );

            // 绘制BUFF标题
            ctx.fillStyle = "#FDE68A"; // 金色
            ctx.font = `22px ${selectedFont}`;
            ctx.textAlign = "left";
            ctx.fillText(buffer.name || "BUFF", 70, buffY + 30);

            // 在右上角绘制BUFF图标
            if (buffImg) {
              // 计算图标位置 - 右上角
              const buffIconX = canvas.width - 100; // 距离右边框的距离
              const buffIconY = buffY - 3; // 距离上边框的距离

              // 绘制BUFF图标
              ctx.drawImage(buffImg, buffIconX, buffIconY, 50, 26);
            }

            // 绘制BUFF描述
            drawBuffText(
              ctx,
              buffer.desc,
              65,
              buffY + 60,
              canvas.width + 720,
              selectedFont
            );

            // 调整下一个战斗记录的位置
            currentY += buffBoxHeight + 20;
          }
        }

        // 绘制战斗记录背景
        const recordBoxColor = "rgba(35, 35, 35, 255)";
        drawRoundedRect(
          ctx,
          50,
          currentY,
          canvas.width - 100,
          160,
          20,
          recordBoxColor
        );

        // 绘制Boss方形图像在左侧
        let bossName = tr("BattleRecord") || "戰鬥記錄";
        if (battle.boss && battle.boss.length > 0) {
          const boss = battle.boss[0];
          bossName = boss.name;

          // 绘制方形Boss图像
          if (bossImages[bossName]) {
            // 绘制方形边框
            const bossBoxWidth = 103;
            const bossBoxHeight = 141;
            const bossX = 80;
            const bossY = currentY + 10;

            // 繪製Boss背景
            ctx.drawImage(
              bossBgImages[bossName],
              bossX,
              bossY,
              bossBoxWidth,
              bossBoxHeight
            );

            // 绘制边框
            ctx.strokeStyle = "#444444";
            ctx.lineWidth = 3;
            ctx.strokeRect(
              bossX - 2,
              bossY - 2,
              bossBoxWidth + 4,
              bossBoxHeight + 4
            );

            // 绘制Boss图像
            ctx.drawImage(
              bossImages[bossName],
              bossX,
              bossY,
              bossBoxWidth,
              bossBoxHeight
            );

            // 绘制种族图标（如果有）
            if (raceIcons[bossName]) {
              ctx.drawImage(raceIcons[bossName], bossX + 5, bossY + 5, 30, 30);
            }
          }

          // 绘制Boss名称
          ctx.font = `24px ${selectedFont}`;
          ctx.fillStyle = "white";
          ctx.textAlign = "left";
          ctx.fillText(bossName, 210, currentY + 40);
        }

        // 绘制挑战时间
        if (battle.challenge_time) {
          const challengeDate = new Date(
            parseInt(battle.challenge_time.year),
            parseInt(battle.challenge_time.month) - 1,
            parseInt(battle.challenge_time.day),
            parseInt(battle.challenge_time.hour),
            parseInt(battle.challenge_time.minute),
            parseInt(battle.challenge_time.second)
          );

          const timeStr = `${tr("ChallengeTime") || "挑戰時間"} ${challengeDate.toLocaleString()}`;

          ctx.font = `20px ${selectedFont}`;
          ctx.fillStyle = "#E3E3E3";
          ctx.textAlign = "right";
          ctx.fillText(timeStr, canvas.width - 70, currentY + 40);
        }

        // 绘制角色 - 从Boss右侧开始
        let avatarX = 210; // 调整起始位置，避开Boss图像
        if (battle.avatar_list) {
          for (const avatar of battle.avatar_list) {
            if (avatarImages[avatar.id]) {
              drawCircleImage(
                ctx,
                avatarImages[avatar.id],
                avatarX,
                currentY + 55,
                80
              );

              // 绘制元素图标
              if (avatar.element_type) {
                const elementIndex = [200, 201, 202, 203, 205].indexOf(
                  avatar.element_type
                );
                if (elementIndex >= 0) {
                  // 绘制元素背景
                  ctx.beginPath();
                  ctx.arc(avatarX + 10, currentY + 70, 16, 0, Math.PI * 2);
                  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
                  ctx.fill();

                  // 绘制元素图标
                  ctx.drawImage(
                    elementImages[elementIndex],
                    avatarX - 5,
                    currentY + 55,
                    30,
                    30
                  );
                }
              }

              // 绘制角色等级
              if (avatar.level) {
                ctx.fillStyle = "#E3E3E3";
                ctx.font = `16px ${selectedFont}`;
                ctx.textAlign = "center";
                ctx.fillText(
                  tr("levelFormat", { level: avatar.level }) ||
                    `Lv.${avatar.level}`,
                  avatarX + 40,
                  currentY + 150
                );
              }

              // 绘制角色稀有度
              if (avatar.rank) {
                // 绘制元素背景
                ctx.beginPath();
                ctx.arc(avatarX + 70, currentY + 70, 14, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
                ctx.fill();

                ctx.fillStyle = "white";
                ctx.font = `16px ${selectedFont}`;
                ctx.textAlign = "center";
                ctx.fillText(
                  avatar.rank.toString(),
                  avatarX + 70,
                  currentY + 75
                );
              }

              avatarX += 100;
            }
          }
        }

        // 绘制助手
        if (battle.buddy && buddyImages[battle.buddy.id]) {
          drawCircleImage(
            ctx,
            buddyImages[battle.buddy.id],
            avatarX,
            currentY + 50,
            70
          );

          // 绘制助手等级
          if (battle.buddy.level) {
            ctx.fillStyle = "#E3E3E3";
            ctx.font = `16px ${selectedFont}`;
            ctx.textAlign = "center";
            ctx.fillText(
              tr("levelFormat", { level: battle.buddy.level }) ||
                `Lv.${battle.buddy.level}`,
              avatarX + 40,
              currentY + 140
            );
          }
        }

        // 绘制星级评分
        if (battle.star) {
          const starX = canvas.width / 2 + 115;
          const starY = currentY + 60;

          for (let i = 0; i < battle.star; i++) {
            ctx.drawImage(starImg, starX + i * 35, starY, 30, 30);
          }
        }

        // 绘制分数
        ctx.font = `bold 36px ${selectedFont}`;
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.fillText(
          battle.score ? battle.score.toString() : "0",
          canvas.width / 2 + 117.5,
          currentY + 130
        );

        // 更新Y坐标
        currentY += recordHeight - 100;
      }
    }

    return canvas.toBuffer("image/png");
  } catch (error) {
    console.error("Error generating deadly assault image:", error);
    throw error;
  }
}

// 绘制圆角矩形
function drawRoundedRect(
  ctx,
  x,
  y,
  width,
  height,
  radius,
  color,
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

// 绘制圆形图像
function drawCircleImage(ctx, img, x, y, size, scaleFactor = 1.2) {
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

// 估算文本高度的辅助函数
function estimateTextHeight(ctx, text, maxWidth, fontFamily) {
  // 保存当前上下文状态
  const originalFont = ctx.font;

  // 设置字体
  ctx.font = `18px ${fontFamily}`;
  const lineHeight = 18;

  // 替换换行符
  text = text.replace(/\\n/g, "\n");

  // 移除颜色标签，获取纯文本
  let plainText = text.replace(/<color=#[A-Fa-f0-9]+>|<\/color>/g, "");

  // 分割成行
  const lines = plainText.split("\n");
  let totalLines = 0;

  // 计算每行需要的行数
  for (const line of lines) {
    const chars = Array.from(line);
    let currentLine = "";

    for (const char of chars) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth) {
        // 需要换行
        currentLine = char;
        totalLines++;
      } else {
        currentLine = testLine;
      }
    }

    // 每个原始行至少占一行
    totalLines++;
  }

  // 恢复上下文状态
  ctx.font = originalFont;

  // 返回估计的高度
  return totalLines * lineHeight + (totalLines - 1) * (lineHeight * 0.5);
}

// 绘制BUFF文本函数
function drawBuffText(ctx, text, x, y, maxWidth, fontFamily) {
  // 替換換行符為實際的斷行
  text = text.replace(/\\n/g, "\n");

  // 保存原始填充樣式和字體
  const originalFillStyle = ctx.fillStyle;
  const originalFont = ctx.font;

  ctx.font = `18px ${fontFamily}`;
  ctx.fillStyle = "#E3E3E3"; // 默認文本顏色
  const lineHeight = 21; // 行高設置

  // 分割成行處理
  const lines = text.split("\n");
  let currentY = y;

  for (const line of lines) {
    // 預處理：收集所有顏色標籤的位置和顏色信息
    const colorSegments = [];
    let plainText = "";
    let remainingText = line;
    let offset = 0;

    // 解析所有顏色標籤
    while (remainingText.length > 0) {
      const colorTagMatch = remainingText.match(/<color=#([A-Fa-f0-9]+)>/);

      if (!colorTagMatch) {
        // 沒有更多顏色標籤，添加剩餘文本
        plainText += remainingText;
        break;
      }

      // 添加顏色標籤前的文本
      const beforeColorText = remainingText.substring(0, colorTagMatch.index);
      plainText += beforeColorText;
      offset += beforeColorText.length;

      // 查找結束標籤
      const endTagIndex = remainingText.indexOf(
        "</color>",
        colorTagMatch.index
      );
      if (endTagIndex === -1) {
        // 沒有結束標籤，添加剩餘文本
        plainText += remainingText.substring(
          colorTagMatch.index + colorTagMatch[0].length
        );
        break;
      }

      // 獲取彩色文本
      const coloredText = remainingText.substring(
        colorTagMatch.index + colorTagMatch[0].length,
        endTagIndex
      );
      plainText += coloredText;

      // 記錄顏色段
      colorSegments.push({
        start: offset,
        end: offset + coloredText.length,
        color: `#${colorTagMatch[1]}`,
      });

      // 更新偏移量
      offset += coloredText.length;

      // 處理剩餘文本
      remainingText = remainingText.substring(endTagIndex + 8); // 8 = '</color>'.length
    }

    // 現在按字符處理純文本，應用顏色標籤信息
    const chars = Array.from(plainText);
    let currentLine = "";
    let currentX = x;
    let currentCharIndex = 0;

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);

      // 檢查是否超出最大寬度
      if (currentX + metrics.width > x + maxWidth) {
        // 繪製當前行，使用正確的顏色
        drawColoredLine(
          ctx,
          currentLine,
          currentX - ctx.measureText(currentLine).width,
          currentY,
          colorSegments,
          currentCharIndex - currentLine.length
        );

        // 重置為新行
        currentLine = char;
        currentX = x + ctx.measureText(char).width;
        currentY += lineHeight;
        currentCharIndex = i;
      } else {
        // 添加字符到當前行
        currentLine += char;
        currentX = x + metrics.width;
        currentCharIndex++;
      }
    }

    // 繪製最後一行
    if (currentLine) {
      drawColoredLine(
        ctx,
        currentLine,
        x,
        currentY,
        colorSegments,
        currentCharIndex - currentLine.length
      );
    }

    // 行之間添加間距
    currentY += lineHeight;
  }

  // 恢復原始填充樣式和字體
  ctx.fillStyle = originalFillStyle;
  ctx.font = originalFont;

  return currentY;

  // 輔助函數：繪製帶顏色的文本行
  function drawColoredLine(ctx, line, lineX, lineY, colorSegments, startIndex) {
    let currentX = lineX;
    const chars = Array.from(line);

    for (let i = 0; i < chars.length; i++) {
      const charIndex = startIndex + i;
      const char = chars[i];

      // 檢查當前字符是否在某個顏色段內
      let charColor = "#E3E3E3"; // 默認顏色
      for (const segment of colorSegments) {
        if (charIndex >= segment.start && charIndex < segment.end) {
          charColor = segment.color;
          break;
        }
      }

      // 設置顏色並繪製字符
      ctx.fillStyle = charColor;
      ctx.fillText(char, currentX, lineY);
      currentX += ctx.measureText(char).width;
    }

    // 恢復默認顏色
    ctx.fillStyle = "#E3E3E3";
  }
}
