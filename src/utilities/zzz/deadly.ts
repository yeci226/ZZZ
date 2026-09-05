import {
  ActionRowBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import Queue from "queue";
import { toI18nLang } from "../core/i18n.js";
import { ELEMENT_TYPES, getElementIconPath } from "./elements.js";
import {
  formatBattleRecordDate,
  formatBattleRecordTime,
} from "./recordDisplay.js";
import {
  buildDeadlyModeSelectData,
  DeadlyAssaultViewMode,
  DeadlyModeContext,
  getDeadlyModeBattle,
  getDeadlyModeLabels,
} from "./deadlyMode.js";
import {
  createCanvas,
  loadImage,
  GlobalFonts,
  SKRSContext2D,
  Image,
} from "@napi-rs/canvas";
import { join } from "path";
import { drawDeadlyCombinedImage } from "./deadlyCombined.js";
import { saveDeadlyHistory } from "./recordCache.js";
const drawQueue = new Queue({ autostart: true });
const DEADLY_DETAIL_V2_API =
  "https://sg-public-api.hoyolab.com/event/game_record_zzz/api/zzz/hadal_mem_detail_v2";
const DEADLY_ABSTRACT_INFO_API =
  "https://sg-public-api.hoyolab.com/event/game_record_zzz/api/zzz/hadal_mem_abstract_info";

async function getDeadlyDetailV2(zzz: any, schedule: number) {
  try {
    const request = zzz?.record?.request;
    if (!request) return null;
    request
      .setQueryParams({
        region: zzz.region,
        uid: zzz.uid,
        schedule_type: schedule,
        lang: zzz.lang || "zh-tw",
        need_all: "true",
      })
      .setDs();
    const { response } = await request.send(DEADLY_DETAIL_V2_API);
    return response?.retcode === 0 ? response.data : null;
  } catch {
    return null;
  }
}

async function getDeadlyAbstractInfo(zzz: any, schedule: number) {
  try {
    const request = zzz?.record?.request;
    if (!request) return null;
    request
      .setQueryParams({
        region: zzz.region,
        uid: zzz.uid,
        schedule_type: schedule,
        lang: zzz.lang || "zh-tw",
        need_all: "true",
      })
      .setDs();
    const { response } = await request.send(DEADLY_ABSTRACT_INFO_API);
    return response?.retcode === 0 ? response.data : null;
  } catch {
    return null;
  }
}

GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "en-us.ttf"),
  "EN",
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "zh-tw.ttf"),
  "TW",
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "zh-cn.ttf"),
  "CN",
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "vi-vn.ttf"),
  "VI",
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "ja-jp.ttf"),
  "JP",
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "ko-kr.ttf"),
  "KR",
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "fr-fr.ttf"),
  "FR",
);
GlobalFonts.registerFromPath(
  join(".", "src", ".", "assets", "Nunito-BlackItalic.ttf"),
  "Nunito",
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
      throw new Error();
    } catch {
      return await loadImage("./src/assets/images/None.png");
    }
  }
}

export async function handleDeadlyDraw(
  interaction: any,
  tr: any,
  zzz: any,
  schedule: any,
  modeContext?: DeadlyModeContext,
  requestedMode: DeadlyAssaultViewMode = "normal",
) {
  // 延後載入含 client 的互動工具，讓 Canvas renderer 可獨立供測試與預覽使用。
  const {
    drawInQueueReply,
    failedReply,
    getRandomColor,
    getUserLang,
  } = await import("../utilities.js");
  const drawTask = async () => {
    try {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(tr("Searching"))
            .setColor(getRandomColor() as any)
            .setImage(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif",
            ),
        ],
        withResponse: true,
      });

      // Request
      const requestStartTime = Date.now();
      const userLocale =
        modeContext?.locale ||
        (await getUserLang(interaction.user.id)) ||
        toI18nLang(interaction.locale) ||
        "en";
      const deadlyData =
        modeContext?.dataOverride ??
        ((await getDeadlyDetailV2(zzz, schedule)) ||
          (await zzz.record.deadlyAssault(schedule)));
      if (!deadlyData || deadlyData.has_data === false)
        return failedReply(interaction, tr("NonData"), tr("NonDataDesc"));
      if (!modeContext?.dataOverride) {
        const abstractInfo = await getDeadlyAbstractInfo(zzz, schedule);
        if (abstractInfo) (deadlyData as any).abstract_info = abstractInfo;
        if (modeContext?.db && modeContext.targetUserId) {
          try {
            await saveDeadlyHistory(
              modeContext.db,
              modeContext.targetUserId,
              modeContext.accountIndex,
              schedule,
              deadlyData,
            );
          } catch (cacheError) {
            console.warn("[deadly] failed to save history", cacheError);
          }
        }
      }
      const requestEndTime = Date.now();

      // Generate
      const drawStartTime = Date.now();
      const imageBuffer = await drawDeadlyCombinedImage(
        tr,
        userLocale,
        deadlyData,
      );
      if (!imageBuffer) throw new Error(tr("profile_NoImageData"));
      const drawEndTime = Date.now();

      // bla bla bla Builder
      const image = new AttachmentBuilder(imageBuffer, {
        name: `Deadly_${zzz.uid}.png`,
      });

      interaction.editReply({
        embeds: [],
        files: [image],
        components: [],
      });
    } catch (error: any) {
      if (error?.code == "-501000") {
        interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(tr("note_Error"))
              .setConfig("#E76161", "sob")
              .setImage(
                "https://media.discordapp.net/attachments/1149960935654559835/1258313139078955039/image.png",
              )
              .setDescription(
                tr("note_Error_Description") + "\n\n" + `\`${error.message}\``,
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
                "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png",
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
      tr("DrawInQueue", { position: drawQueue.length - 1 }),
    );
  }
}

export function buildDeadlyModeComponents(
  userLocale: string,
  deadlyData: any,
  mode: DeadlyAssaultViewMode,
  context: DeadlyModeContext,
) {
  const selectData = buildDeadlyModeSelectData(
    userLocale,
    deadlyData,
    mode,
    context,
  );
  if (!selectData) return [];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(selectData.customId)
    .setPlaceholder(selectData.placeholder)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(selectData.options);
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
}

export async function drawDeadlyImage(
  tr: any,
  userLocale: string,
  deadlyData: any,
  _requestedMode: DeadlyAssaultViewMode = "normal",
) {
  return drawDeadlyCombinedImage(tr, userLocale, deadlyData);
}

// Kept temporarily for safe rollback while the combined layout is being reviewed.
async function drawDeadlyLegacyImage(
  tr: any,
  userLocale: string,
  deadlyData: any,
  requestedMode: DeadlyAssaultViewMode = "normal",
) {
  try {
    const selectedFont =
      fonts[userLocale as keyof typeof fonts] || fonts.default;
    const selection = getDeadlyModeBattle(deadlyData, requestedMode);
    if (selection.mode === "extreme") {
      return drawDeadlyExtremeImage(
        tr,
        userLocale,
        deadlyData,
        selection.battle,
      );
    }
    const battleEntries = selection.battles.map((battle: any) => ({ battle }));

    // 计算画布高度 - 动态计算每个战斗记录和BUFF的实际高度
    const baseHeight = 400; // 顶部信息区域高度
    const recordBaseHeight = 200; // 每个战斗记录的基础高度（不含BUFF）
    let totalDynamicHeight = 0;
    const tempCanvas = createCanvas(1000, 1);
    const tempCtx = tempCanvas.getContext("2d");

    if (battleEntries.length > 0) {
      for (const { battle } of battleEntries) {
        // 计算BUFF的高度
        if (battle.buffer && battle.buffer.length > 0) {
          for (const buffer of battle.buffer) {
            tempCtx.font = `18px ${selectedFont}`;
            const estimatedHeight = estimateTextHeight(
              tempCtx,
              buffer.desc,
              1000 - 120,
              selectedFont,
            );
            const buffBoxHeight = Math.max(100, estimatedHeight + 40);
            totalDynamicHeight += buffBoxHeight + 20;
          }
        }
        totalDynamicHeight += recordBaseHeight;
      }
    }
    const canvasHeight = baseHeight + totalDynamicHeight;

    const canvas = createCanvas(1000, canvasHeight);
    const ctx = canvas.getContext("2d");

    // 加载所需图像
    const starImg = await loadImageAsync(
      "./src/assets/images/icons/deadly/star.png",
    );
    const starDarkImg = await loadImageAsync(
      "./src/assets/images/icons/deadly/star_dark.png",
    );

    // 0% ~ 1% rankbg-1
    // 1% ~ 2% rankbg-2
    // 2% ~ 5% rankbg-3
    // 5% ~ 20% rankbg-4
    // 20%+ rankbg-5
    const percent = deadlyData.rank_percent / 100;
    let rankbg;
    if (percent >= 20) {
      rankbg = await loadImageAsync(
        "./src/assets/images/icons/deadly/rankbg-5.png",
      );
    } else if (percent >= 5) {
      rankbg = await loadImageAsync(
        "./src/assets/images/icons/deadly/rankbg-4.png",
      );
    } else if (percent >= 2) {
      rankbg = await loadImageAsync(
        "./src/assets/images/icons/deadly/rankbg-3.png",
      );
    } else if (percent >= 1) {
      rankbg = await loadImageAsync(
        "./src/assets/images/icons/deadly/rankbg-2.png",
      );
    } else {
      rankbg = await loadImageAsync(
        "./src/assets/images/icons/deadly/rankbg-4.png",
      );
    }

    // 加载 buff 图标
    const buffImg = await loadImageAsync(
      "./src/assets/images/icons/deadly/buff.png",
    );

    // 加载元素图标
    const elementImages = await Promise.all(
      ELEMENT_TYPES.map((type) =>
        loadImageAsync(getElementIconPath(type)),
      ),
    );

    // 加载角色和助手图像
    const avatarImages: Record<string, Image> = {};
    const buddyImages: Record<string, Image> = {};
    const bossImages: Record<string, Image> = {};
    const bossBgImages: Record<string, Image> = {};
    const raceIcons: Record<string, Image> = {};

    // 预加载所有角色、助手和Boss图像
    if (battleEntries.length > 0) {
      for (const { battle } of battleEntries) {
        if (battle.avatar_list) {
          for (const avatar of battle.avatar_list) {
            if (!avatarImages[avatar.id] && avatar.role_square_url) {
              try {
                avatarImages[avatar.id] = await loadImageAsync(
                  avatar.role_square_url,
                  `./src/assets/images/agents/${avatar.id}.webp`,
                );
              } catch (err) {
                console.error(
                  `Failed to load avatar image for ${avatar.id}:`,
                  err,
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
                `./src/assets/images/bangboos/${battle.buddy.id}.png`,
              );
            } catch (err) {
              console.error(
                `Failed to load buddy image for ${battle.buddy.id}:`,
                err,
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
                  `./src/assets/images/bosses/default.png`,
                );

                // 加載Boss背景
                if (boss.bg_icon && !bossBgImages[boss.name]) {
                  bossBgImages[boss.name] = await loadImageAsync(
                    boss.bg_icon,
                    `./src/assets/images/bosses/bg_default.png`,
                  );
                }

                // 加载种族图标
                if (boss.race_icon && !raceIcons[boss.name]) {
                  raceIcons[boss.name] = await loadImageAsync(
                    boss.race_icon,
                    `./src/assets/images/bosses/race_default.png`,
                  );
                }
              } catch (err) {
                console.error(
                  `Failed to load boss image for ${boss.name}:`,
                  err,
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
    const period = deadlyData.zone_id % 100;
    const title =
      tr("DeadlyAssault_Period", { period }) ||
      tr("DeadlyAssault") ||
      "危局強襲戰";
    ctx.fillText(title, canvas.width / 2, 80);

    // 绘制挑战期间
    if (deadlyData.start_time && deadlyData.end_time) {
      ctx.font = `24px ${selectedFont}`;
      ctx.fillText(
        `${formatBattleRecordDate(deadlyData.start_time, userLocale)} - ${formatBattleRecordDate(deadlyData.end_time, userLocale)}`,
        canvas.width / 2,
        120,
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
      210,
    );

    // 绘制"总得分"标签
    const totalScoreText = tr("TotalScore") || "總得分";
    const totalScoreWidth = ctx.measureText(
      deadlyData.total_score.toString(),
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
        20 * 1.2,
      );
      ctx.fillText(
        percentText,
        canvas.width / 2 + totalScoreWidth - 72.5,
        177.5,
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

    if (battleEntries.length > 0) {
      for (const { battle } of battleEntries) {
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
              selectedFont,
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
              buffBoxColor,
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
              selectedFont,
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
          recordBoxColor,
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
              bossBoxHeight,
            );

            // 绘制边框
            ctx.strokeStyle = "#444444";
            ctx.lineWidth = 3;
            ctx.strokeRect(
              bossX - 2,
              bossY - 2,
              bossBoxWidth + 4,
              bossBoxHeight + 4,
            );

            // 绘制Boss图像
            ctx.drawImage(
              bossImages[bossName],
              bossX,
              bossY,
              bossBoxWidth,
              bossBoxHeight,
            );

            // 绘制种族图标（如果有）
            if (raceIcons[bossName]) {
              ctx.drawImage(raceIcons[bossName], bossX + 5, bossY + 5, 30, 30);
            }
          }

          // 一般模式維持原本的多關直列，不混入絕境關卡。
          ctx.font = `24px ${selectedFont}`;
          ctx.fillStyle = "white";
          ctx.textAlign = "left";
          ctx.fillText(bossName, 210, currentY + 38);
        }

        // 绘制挑战时间
        const formattedBattleTime = formatBattleRecordTime(
          battle.challenge_time,
          battle.battle_time,
          userLocale,
        );
        if (formattedBattleTime) {
          const timeStr = `${tr("ChallengeTime") || "過關時刻"} ${formattedBattleTime}`;

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
                80,
              );

              // 绘制元素图标
              if (avatar.element_type) {
                const elementIndex = ELEMENT_TYPES.indexOf(avatar.element_type);
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
                    30,
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
                  currentY + 150,
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
                  currentY + 75,
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
            70,
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
              currentY + 140,
            );
          }
        }

        // 绘制星级评分
        if (battle.star !== undefined) {
          const starX = canvas.width / 2 + 115;
          const starY = currentY + 60;
          const maxStars = 3; // 總共顯示 3 顆星

          for (let i = 0; i < maxStars; i++) {
            if (i < battle.star) {
              ctx.drawImage(starImg, starX + i * 30, starY, 30, 30); // 亮星
            } else {
              ctx.drawImage(starDarkImg, starX + i * 30, starY, 30, 30); // 暗星
            }
          }
        }

        // 绘制分数
        ctx.font = `bold 36px ${selectedFont}`;
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.fillText(
          battle.score ? battle.score.toString() : "0",
          canvas.width / 2 + 117.5,
          currentY + 130,
        );

        // 更新Y坐标
        currentY += recordBaseHeight;
      }
    }

    return canvas.toBuffer("image/png");
  } catch (error) {
    console.error("Error generating deadly assault image:", error);
    throw error;
  }
}

export async function drawDeadlyExtremeImage(
  tr: any,
  userLocale: string,
  deadlyData: any,
  battle: any,
) {
  const selectedFont =
    fonts[userLocale as keyof typeof fonts] || fonts.default;
  const labels = getDeadlyModeLabels(userLocale);
  const boss = Array.isArray(battle?.boss) ? battle.boss[0] : undefined;
  const buffs = Array.isArray(battle?.buffer) ? battle.buffer : [];
  const weaknesses = getExtremeWeaknesses(battle, boss);
  const buffHeight = buffs.reduce((height: number, buff: any) => {
    const plainText = stripColorTags(buff?.desc || buff?.text || "");
    return height + Math.max(110, Math.ceil(plainText.length / 48) * 27 + 58);
  }, 0);
  const weaknessHeight = weaknesses.length > 0 ? 105 : 0;
  const canvasHeight = 640 + weaknessHeight + buffHeight + 260;
  const canvas = createCanvas(1200, canvasHeight);
  const ctx = canvas.getContext("2d");

  const background = ctx.createLinearGradient(0, 0, 1200, canvasHeight);
  background.addColorStop(0, "#120E18");
  background.addColorStop(0.48, "#1B171F");
  background.addColorStop(1, "#100D12");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 絕境模式使用獨立的大卡版型，不與一般模式關卡串接。
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.font = `bold 48px ${selectedFont}`;
  const period = Number(deadlyData?.zone_id || 0) % 100;
  const title =
    tr("DeadlyAssault_Period", { period }) ||
    tr("DeadlyAssault") ||
    "危局強襲戰";
  ctx.fillText(title, canvas.width / 2, 70);
  if (deadlyData?.start_time && deadlyData?.end_time) {
    ctx.fillStyle = "#B8AFBD";
    ctx.font = `22px ${selectedFont}`;
    ctx.fillText(
      `${formatBattleRecordDate(deadlyData.start_time, userLocale)} - ${formatBattleRecordDate(deadlyData.end_time, userLocale)}`,
      canvas.width / 2,
      108,
    );
  }

  const heroX = 60;
  const heroY = 145;
  const heroWidth = 1080;
  const heroHeight = 430;
  const heroGradient = ctx.createLinearGradient(heroX, heroY, heroX + heroWidth, heroY);
  heroGradient.addColorStop(0, "#302232");
  heroGradient.addColorStop(0.58, "#251C29");
  heroGradient.addColorStop(1, "#4D1E2C");
  drawRoundedRect(
    ctx,
    heroX,
    heroY,
    heroWidth,
    heroHeight,
    28,
    heroGradient as any,
    2,
    "#7A4658",
  );

  const bossBg = boss?.bg_icon
    ? await loadImageAsync(boss.bg_icon, "./src/assets/images/None.png")
    : null;
  const bossImage = boss?.icon
    ? await loadImageAsync(boss.icon, "./src/assets/images/None.png")
    : null;

  ctx.save();
  roundedRectPath(ctx, heroX, heroY, heroWidth, heroHeight, 28);
  ctx.clip();
  if (bossBg) drawImageCover(ctx, bossBg, heroX + 510, heroY, 570, heroHeight);
  const heroFade = ctx.createLinearGradient(heroX + 420, 0, heroX + heroWidth, 0);
  heroFade.addColorStop(0, "#251C29");
  heroFade.addColorStop(0.45, "rgba(37, 28, 41, 0.35)");
  heroFade.addColorStop(1, "rgba(37, 28, 41, 0.05)");
  ctx.fillStyle = heroFade;
  ctx.fillRect(heroX + 400, heroY, heroWidth - 400, heroHeight);
  if (bossImage) drawImageContain(ctx, bossImage, heroX + 690, heroY + 28, 350, 380);
  ctx.restore();

  drawRoundedRect(
    ctx,
    95,
    180,
    126,
    38,
    19,
    "rgba(255, 98, 139, 0.2)",
    1,
    "#FF628B",
  );
  ctx.fillStyle = "#FF91AE";
  ctx.textAlign = "center";
  ctx.font = `bold 18px ${selectedFont}`;
  ctx.fillText(labels.extreme, 158, 206);

  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  drawFittedText(
    ctx,
    boss?.name || "絕境首領",
    95,
    270,
    610,
    38,
    selectedFont,
  );

  ctx.fillStyle = "#B8AFBD";
  ctx.font = `20px ${selectedFont}`;
  ctx.fillText(labels.score, 98, 325);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 58px ${selectedFont}`;
  ctx.fillText(String(battle?.score ?? 0), 95, 382);

  const starImg = await loadImageAsync("./src/assets/images/icons/deadly/star.png");
  const starDarkImg = await loadImageAsync(
    "./src/assets/images/icons/deadly/star_dark.png",
  );
  ctx.fillStyle = "#B8AFBD";
  ctx.font = `20px ${selectedFont}`;
  ctx.fillText(labels.stars, 350, 325);
  const starCount = Math.max(0, Math.min(3, Number(battle?.star || 0)));
  for (let index = 0; index < 3; index++) {
    ctx.drawImage(
      index < starCount ? starImg : starDarkImg,
      350 + index * 46,
      345,
      38,
      38,
    );
  }

  const clearTime = formatBattleRecordTime(
    battle?.challenge_time,
    battle?.battle_time,
    userLocale,
  );
  if (clearTime) {
    ctx.fillStyle = "#D8D0DB";
    ctx.font = `21px ${selectedFont}`;
    ctx.fillText(`${labels.clearTime}：${clearTime}`, 98, 455);
  }

  let currentY = 605;
  if (weaknesses.length > 0) {
    drawRoundedRect(
      ctx,
      60,
      currentY,
      1080,
      85,
      20,
      "rgba(42, 37, 47, 0.94)",
    );
    ctx.fillStyle = "#FFCF70";
    ctx.font = `bold 23px ${selectedFont}`;
    ctx.textAlign = "left";
    ctx.fillText(labels.weakness, 88, currentY + 51);
    let weaknessX = 190;
    for (const weakness of weaknesses.slice(0, 6)) {
      if (weakness.elementType !== null) {
        const image = await loadImageAsync(
          getElementIconPath(weakness.elementType),
        );
        ctx.drawImage(image, weaknessX, currentY + 20, 46, 46);
        weaknessX += 58;
      } else {
        ctx.fillStyle = "#EFE8F1";
        ctx.font = `20px ${selectedFont}`;
        ctx.fillText(weakness.label, weaknessX, currentY + 51);
        weaknessX += ctx.measureText(weakness.label).width + 28;
      }
    }
    currentY += 105;
  }

  for (const buff of buffs) {
    const name = buff?.name || buff?.title || labels.buff;
    const description = stripColorTags(buff?.desc || buff?.text || "");
    const boxHeight = Math.max(
      110,
      Math.ceil(description.length / 48) * 27 + 58,
    );
    drawRoundedRect(
      ctx,
      60,
      currentY,
      1080,
      boxHeight - 15,
      20,
      "rgba(42, 37, 47, 0.94)",
    );
    ctx.fillStyle = "#FFCF70";
    ctx.font = `bold 22px ${selectedFont}`;
    ctx.textAlign = "left";
    ctx.fillText(name, 88, currentY + 35);
    ctx.fillStyle = "#E8E1EA";
    ctx.font = `19px ${selectedFont}`;
    drawWrappedPlainText(ctx, description, 88, currentY + 68, 1010, 27);
    currentY += boxHeight;
  }

  drawRoundedRect(
    ctx,
    60,
    currentY,
    1080,
    225,
    24,
    "rgba(35, 31, 40, 0.98)",
    1,
    "#574A5B",
  );
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 25px ${selectedFont}`;
  ctx.textAlign = "left";
  ctx.fillText(labels.team, 88, currentY + 42);

  let avatarX = 92;
  const avatars = Array.isArray(battle?.avatar_list) ? battle.avatar_list : [];
  for (const avatar of avatars.slice(0, 3)) {
    const avatarImage = await loadImageAsync(
      avatar?.role_square_url || `./src/assets/images/agents/${avatar?.id}.webp`,
      `./src/assets/images/agents/${avatar?.id}.webp`,
    );
    drawCircleImage(ctx, avatarImage, avatarX, currentY + 65, 105, 1.1);
    if (
      avatar?.element_type &&
      ELEMENT_TYPES.includes(avatar.element_type)
    ) {
      const elementImage = await loadImageAsync(
        getElementIconPath(avatar.element_type),
      );
      ctx.drawImage(elementImage, avatarX - 4, currentY + 62, 34, 34);
    }
    ctx.fillStyle = "#E9E3EB";
    ctx.font = `16px ${selectedFont}`;
    ctx.textAlign = "center";
    const avatarLabel =
      avatar?.name_mi18n || avatar?.name || `等級 ${avatar?.level || "-"}`;
    drawFittedText(
      ctx,
      avatarLabel,
      avatarX + 52,
      currentY + 193,
      125,
      16,
      selectedFont,
      "center",
    );
    avatarX += 155;
  }

  if (battle?.buddy) {
    const buddy = battle.buddy;
    const buddyImage = await loadImageAsync(
      buddy?.bangboo_rectangle_url ||
        `./src/assets/images/bangboos/${buddy?.id}.png`,
      `./src/assets/images/bangboos/${buddy?.id}.png`,
    );
    const buddyX = 660;
    ctx.fillStyle = "#B8AFBD";
    ctx.font = `18px ${selectedFont}`;
    ctx.textAlign = "left";
    ctx.fillText(labels.bangboo, buddyX, currentY + 42);
    drawCircleImage(ctx, buddyImage, buddyX, currentY + 68, 100, 1.05);
    ctx.fillStyle = "#E9E3EB";
    ctx.font = `16px ${selectedFont}`;
    ctx.textAlign = "center";
    drawFittedText(
      ctx,
      buddy?.name || `等級 ${buddy?.level || "-"}`,
      buddyX + 50,
      currentY + 193,
      150,
      16,
      selectedFont,
      "center",
    );
  }

  return canvas.toBuffer("image/png");
}

function stripColorTags(text: string): string {
  return String(text || "")
    .replace(/\\n/g, "\n")
    .replace(/<color=#[A-Fa-f0-9]+>|<\/color>/g, "");
}

function getExtremeWeaknesses(battle: any, boss: any) {
  const raw =
    boss?.weakness_list ||
    boss?.weakness ||
    battle?.weakness_list ||
    battle?.weakness ||
    [];
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries
    .map((entry: any) => {
      const value = Number(
        typeof entry === "object"
          ? entry?.element_type ?? entry?.id ?? entry?.type
          : entry,
      );
      if (ELEMENT_TYPES.includes(value)) {
        return { elementType: value, label: "" };
      }
      const rawLabel =
        typeof entry === "object"
          ? entry?.name || entry?.label
          : String(entry || "");
      return { elementType: null, label: localizeElementLabel(rawLabel) };
    })
    .filter((entry: any) => entry.elementType !== null || entry.label);
}

function localizeElementLabel(label: string): string {
  const localized: Record<string, string> = {
    physical: "物理",
    physic: "物理",
    fire: "火屬性",
    ice: "冰屬性",
    electric: "電屬性",
    thunder: "電屬性",
    ether: "以太屬性",
    wind: "風屬性",
  };
  return localized[label.toLowerCase()] || label;
}

function roundedRectPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawImageCover(
  ctx: SKRSContext2D,
  image: Image,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  ctx.drawImage(
    image,
    (image.width - sourceWidth) / 2,
    (image.height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function drawImageContain(
  ctx: SKRSContext2D,
  image: Image,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawFittedText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  align: "left" | "center" = "left",
) {
  let size = fontSize;
  ctx.textAlign = align;
  ctx.font = `bold ${size}px ${fontFamily}`;
  while (size > 13 && ctx.measureText(String(text)).width > maxWidth) {
    size -= 1;
    ctx.font = `bold ${size}px ${fontFamily}`;
  }
  ctx.fillText(String(text), x, y);
}

function drawWrappedPlainText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  let line = "";
  let currentY = y;
  for (const char of Array.from(text)) {
    if (char === "\n" || ctx.measureText(line + char).width > maxWidth) {
      if (line) ctx.fillText(line, x, currentY);
      line = char === "\n" ? "" : char;
      currentY += lineHeight;
    } else {
      line += char;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
}

// 绘制圆角矩形
function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
  outlineWidth = 0,
  outlineColor = "black",
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
function drawCircleImage(
  ctx: SKRSContext2D,
  img: Image,
  x: number,
  y: number,
  size: number,
  scaleFactor = 1.2,
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

// 估算文本高度的辅助函数
function estimateTextHeight(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  fontFamily: string,
) {
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
function drawBuffText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontFamily: string,
) {
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

      if (colorTagMatch && colorTagMatch.index !== undefined) {
        // 添加顏色標籤前的文本
        const beforeColorText = remainingText.substring(0, colorTagMatch.index);
        plainText += beforeColorText;
        offset += beforeColorText.length;

        // 查找結束標籤
        const endTagIndex = remainingText.indexOf(
          "</color>",
          colorTagMatch.index,
        );
        if (endTagIndex === -1) {
          // 沒有結束標籤，添加剩餘文本
          plainText += remainingText.substring(
            colorTagMatch.index + colorTagMatch[0].length,
          );
          break;
        }

        // 獲取彩色文本
        const coloredText = remainingText.substring(
          colorTagMatch.index + colorTagMatch[0].length,
          endTagIndex,
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
      } else {
        plainText += remainingText;
        break;
      }
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
          currentCharIndex - currentLine.length,
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
        currentCharIndex - currentLine.length,
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
  function drawColoredLine(
    ctx: SKRSContext2D,
    line: string,
    lineX: number,
    lineY: number,
    colorSegments: any[],
    startIndex: number,
  ) {
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
