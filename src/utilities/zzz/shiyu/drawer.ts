import { createCanvas } from "@napi-rs/canvas";
import { ShiyuContext, ShiyuFloor, ShiyuNode } from "./types.js";
import {
  drawRoundedRect,
  drawRoundedRectPath,
  drawCircleImage,
  estimateTextHeight,
  drawBuffText,
  loadImageAsync,
} from "./utils.js";
import { bangbooRectangleUrl } from "./assets.js";

interface ShiyuAssets {
  elementImages: any[];
  buffImg: any;
  ratingCornerA: any;
  ratingCornerB: any;
  ratingCornerS: any;
  ratingA: any;
  ratingB: any;
  ratingS: any;
  ratingSPlus: any;
  team1: any;
  team2: any;
  team3: any;
}

export async function drawShiyuCanvas(
  floors: ShiyuFloor[],
  hadalData: any,
  context: ShiyuContext,
  assets: ShiyuAssets,
  dynamicImages: any[]
) {
  const { tr, selectedFont, userLocale } = context;
  const {
    elementImages,
    buffImg,
    ratingCornerA,
    ratingCornerB,
    ratingCornerS,
    ratingA,
    ratingB,
    ratingS,
    ratingSPlus,
    team1,
    team2,
    team3,
  } = assets;

  const layerRatingImages = {
    S: ratingCornerS,
    A: ratingCornerA,
    B: ratingCornerB,
  };

  const gradeRatingImages = {
    "S+": ratingSPlus,
    S: ratingS,
    A: ratingA,
    B: ratingB,
  };

  // Determine canvas width
  let maxNodes = 0;
  floors.forEach((f) => (maxNodes = Math.max(maxNodes, f.nodes.length)));

  const nodeWidth = 440;
  const nodeGap = 30;
  const sidePadding = 50;
  const computedWidth =
    sidePadding * 2 + maxNodes * nodeWidth + (maxNodes - 1) * nodeGap;
  const canvasWidth = Math.max(1000, computedWidth);

  // Pre-calculate Height and Layout
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  let layoutY = 80;

  for (const floor of floors) {
    if (floor.level === 5) {
      layoutY += 220; // Title + Stats + Spacing
    } else {
      if (floor.buffs && floor.buffs.length > 0) {
        const buff = floor.buffs[0];
        tempCtx.font = `18px ${selectedFont}`;
        const estimatedHeight = estimateTextHeight(
          tempCtx,
          buff.text,
          canvasWidth - 120,
          selectedFont
        );
        const buffBoxHeight = Math.max(120, estimatedHeight + 40);
        layoutY += buffBoxHeight + 20;
      }
      layoutY += 100; // Floor Title Box
    }

    let maxNodeHeight = 220;
    let rowMaxBufferHeight = 0;

    if (floor.level === 5) {
      for (const node of floor.nodes) {
        const nodeBuffer = node.buffer;
        if (nodeBuffer) {
          tempCtx.font = `18px ${selectedFont}`;
          const estimatedHeight = estimateTextHeight(
            tempCtx,
            nodeBuffer.text,
            nodeWidth - 40,
            selectedFont
          );
          const buffBoxHeight = Math.max(120, estimatedHeight + 40);
          if (buffBoxHeight > rowMaxBufferHeight)
            rowMaxBufferHeight = buffBoxHeight;
        }
      }
    }

    for (const node of floor.nodes) {
      let nodeHeight = 0;
      if (floor.level === 5) {
        nodeHeight = 280;
        if (node.monster_pic) nodeHeight += 140;
      } else {
        nodeHeight = 230;
      }

      const nodeBuffer = floor.level === 5 && node.buffer ? node.buffer : null;
      if (nodeBuffer) {
        nodeHeight += rowMaxBufferHeight + 10;
      }
      if (nodeHeight > maxNodeHeight) maxNodeHeight = nodeHeight;
    }
    layoutY += maxNodeHeight;
    if (floor.level === 5) {
      layoutY += 120;
    } else {
      layoutY += 60;
    }
  }

  const canvasHeight = layoutY + 50;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#1A1A1A";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header Title
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.font = `48px ${selectedFont}`;
  ctx.fillText(tr("ShiyuDefense") || "式輿防衛戰", canvas.width / 2, 80);

  // Date
  const beginDate = new Date(
    parseInt(hadalData.hadal_info_v2.hadal_begin_time.year),
    parseInt(hadalData.hadal_info_v2.hadal_begin_time.month) - 1,
    parseInt(hadalData.hadal_info_v2.hadal_begin_time.day)
  );
  const endDate = new Date(
    parseInt(hadalData.hadal_info_v2.hadal_end_time.year),
    parseInt(hadalData.hadal_info_v2.hadal_end_time.month) - 1,
    parseInt(hadalData.hadal_info_v2.hadal_end_time.day)
  );
  const dateFormat = new Intl.DateTimeFormat(userLocale, {
    month: "short",
    day: "numeric",
  });
  ctx.font = `24px ${selectedFont}`;
  ctx.fillText(
    `${dateFormat.format(beginDate)} - ${dateFormat.format(endDate)}`,
    canvas.width / 2,
    120
  );

  let currentY = 160;
  let dynamicImageIndex = 0;

  for (const floor of floors) {
    if (floor.level === 5) {
      currentY += 20;
      // Floor 5 Header
      const headerBoxColor = "rgba(40, 40, 40, 255)";
      drawRoundedRect(
        ctx,
        50,
        currentY,
        canvas.width - 100,
        160,
        20,
        headerBoxColor
      );

      const leftX = 80;
      let topY = currentY + 50;

      // Title
      ctx.fillStyle = "white";
      ctx.font = `bold 28px ${selectedFont}`;
      ctx.textAlign = "left";
      ctx.fillText(floor.zone_name, leftX, topY);

      // Score + Rank Badge
      const scoreY = topY + 60;
      ctx.font = `bold 48px ${selectedFont}`;
      const scoreStr = `${hadalData.hadal_info_v2.brief?.score || 0}`;
      ctx.fillStyle = "white";
      ctx.fillText(scoreStr, leftX, scoreY);
      const scoreWidth = ctx.measureText(scoreStr).width;

      const rankPercent =
        parseFloat(hadalData.hadal_info_v2.brief?.rank_percent) / 100;
      if (rankPercent) {
        const badgeText = `${rankPercent}%`;
        ctx.font = `bold 20px ${selectedFont}`;
        const val = rankPercent;
        let rankBgPath = "./src/assets/images/icons/deadly/rankbg-4.png";
        if (val > 20)
          rankBgPath = "./src/assets/images/icons/deadly/rankbg-5.png";
        else if (val > 5)
          rankBgPath = "./src/assets/images/icons/deadly/rankbg-4.png";
        else if (val > 2)
          rankBgPath = "./src/assets/images/icons/deadly/rankbg-3.png";
        else if (val > 1)
          rankBgPath = "./src/assets/images/icons/deadly/rankbg-2.png";
        else rankBgPath = "./src/assets/images/icons/deadly/rankbg-1.png";

        try {
          const bgImg = await loadImageAsync(rankBgPath);
          const badgeWidth = ctx.measureText(badgeText).width + 50;
          const badgeX = leftX + scoreWidth + 15;
          const badgeY = scoreY - 32;
          ctx.drawImage(bgImg, badgeX, badgeY, badgeWidth, 36);
          ctx.fillStyle = "black";
          ctx.textAlign = "center";
          ctx.fillText(badgeText, badgeX + badgeWidth / 2 - 10, badgeY + 25);
          ctx.textAlign = "left";
        } catch (e) {
          console.error("Failed to load rank bg", e);
        }
      }

      // Date Time
      let dateStr = "";
      if (hadalData.hadal_info_v2.brief?.challenge_time) {
        const ct = hadalData.hadal_info_v2.brief?.challenge_time;
        dateStr = `${ct.year}/${ct.month.toString().padStart(2, "0")}/${ct.day
          .toString()
          .padStart(2, "0")} ${ct.hour.toString().padStart(2, "0")}:${ct.minute
          .toString()
          .padStart(2, "0")}:${ct.second.toString().padStart(2, "0")}`;
      }
      ctx.fillStyle = "#A0A0A0";
      ctx.font = `20px ${selectedFont}`;
      ctx.textAlign = "left";
      ctx.fillText(dateStr, leftX, currentY + 140);

      const rightX = canvas.width - 80;
      const globalRating = hadalData.hadal_info_v2.brief?.rating || "A";
      const rImg =
        gradeRatingImages[globalRating as keyof typeof gradeRatingImages];
      if (rImg) {
        ctx.drawImage(rImg, rightX - 160, currentY + 20, 160, 80);
      }

      const globalTime = hadalData.hadal_info_v2.brief?.battle_time || 0;
      const gMinutes = Math.floor(globalTime / 60)
        .toString()
        .padStart(2, "0");
      const gSeconds = (globalTime % 60).toString().padStart(2, "0");
      ctx.textAlign = "right";
      ctx.fillStyle = "#A0A0A0";
      ctx.font = `22px ${selectedFont}`;
      ctx.fillText(
        `${tr("TotalTime") || "總通關用時"}：${gMinutes}:${gSeconds}`,
        rightX,
        currentY + 140
      );

      currentY += 95;
    } else {
      // Floor 1-4 Header
      if (floor.buffs && floor.buffs.length > 0) {
        const buff = floor.buffs[0];
        ctx.font = `18px ${selectedFont}`;
        const estimatedHeight = estimateTextHeight(
          ctx,
          buff.text,
          canvas.width - 120,
          selectedFont
        );
        const buffBoxHeight = Math.max(120, estimatedHeight + 40);
        const verticalOffset = Math.max(
          0,
          (buffBoxHeight - (estimatedHeight + 50)) / 2
        );

        drawRoundedRect(
          ctx,
          50,
          currentY,
          canvas.width - 100,
          buffBoxHeight,
          20,
          "rgba(48, 48, 48, 255)"
        );

        ctx.fillStyle = "#FDE68A";
        ctx.font = `24px ${selectedFont}`;
        ctx.textAlign = "left";
        ctx.fillText(`${buff.title}`, 70, currentY + 32.5 + verticalOffset);

        if (buffImg) {
          ctx.drawImage(buffImg, canvas.width - 100, currentY - 3, 50, 26);
        }

        drawBuffText(
          ctx,
          buff.text,
          65,
          currentY + 62.5 + verticalOffset,
          canvas.width - 140,
          selectedFont
        );
        currentY += buffBoxHeight + 20;
      }

      drawRoundedRect(
        ctx,
        50,
        currentY,
        canvas.width - 100,
        80,
        20,
        "rgba(48, 48, 48, 255)"
      );

      const ratingImg =
        gradeRatingImages[floor.rating as keyof typeof gradeRatingImages];
      if (ratingImg) {
        ctx.drawImage(
          ratingImg,
          canvas.width - 50 - 160 * 0.7,
          currentY + 10,
          160 * 0.7,
          80 * 0.7
        );
      }

      ctx.fillStyle = "white";
      ctx.textAlign = "left";
      ctx.font = `26px ${selectedFont}`;
      ctx.fillText(`${floor.zone_name}`, 70, currentY + 50);

      const totalMinutes = Math.floor(floor.totalTime / 60);
      const totalSeconds = (floor.totalTime % 60).toString().padStart(2, "0");
      ctx.fillStyle = "#A0A0A0";
      const titleWidth = ctx.measureText(`${floor.zone_name}`).width;
      ctx.font = `22px ${selectedFont}`;
      ctx.fillText(
        `${tr("SpentTime") || "通關用時"}：${totalMinutes}:${totalSeconds}`,
        70 + titleWidth + 20,
        currentY + 47.5
      );
      ctx.textAlign = "center";
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "white";

    let currentNodeWidth = nodeWidth;
    if (floor.level !== 5 && floor.nodes.length === 2) {
      currentNodeWidth = 675;
    }

    const nodesWidth =
      floor.nodes.length * currentNodeWidth +
      (floor.nodes.length - 1) * nodeGap;
    let startX = (canvasWidth - nodesWidth) / 2;

    let rowMaxBufferHeight = 0;
    if (floor.level === 5) {
      for (const node of floor.nodes) {
        const nodeBuffer = node.buffer;
        if (nodeBuffer) {
          ctx.font = `18px ${selectedFont}`;
          const estimatedHeight = estimateTextHeight(
            ctx,
            nodeBuffer.text,
            currentNodeWidth - 40,
            selectedFont
          );
          const buffBoxHeight = Math.max(120, estimatedHeight + 40);
          if (buffBoxHeight > rowMaxBufferHeight)
            rowMaxBufferHeight = buffBoxHeight;
        }
      }
    }

    let maxNodeHeight = 220;

    for (let i = 0; i < floor.nodes.length; i++) {
      const node = floor.nodes[i];
      const nodeDataForDraw = {
        ...node,
        avatars: node.avatar_list || node.avatars,
      };

      const nodeBuffer = floor.level === 5 && node.buffer ? node.buffer : null;
      const teamIcon =
        i === 0 ? team1 : i === 1 ? team2 : i === 2 ? team3 : team1;

      const result = await drawNode(
        tr,
        ctx,
        nodeDataForDraw,
        startX,
        currentY - 10,
        currentNodeWidth,
        floor.level === 5 ? 280 : 230,
        teamIcon,
        elementImages,
        selectedFont,
        dynamicImageIndex,
        dynamicImages,
        nodeBuffer,
        rowMaxBufferHeight,
        buffImg,
        node.rating,
        layerRatingImages,
        floor.level === 5
      );

      dynamicImageIndex = result.nextImageIndex;
      if (result.usedHeight > maxNodeHeight) maxNodeHeight = result.usedHeight;
      startX += currentNodeWidth + nodeGap;
    }
    currentY += maxNodeHeight;
    if (floor.level === 5) {
      currentY += 120;
    } else {
      currentY += 60;
    }
  }

  return canvas.toBuffer("image/png");
}

async function drawNode(
  tr: (key: string, args?: any) => string,
  ctx: any,
  nodeData: any,
  x: number,
  currentY: number,
  width: number,
  height: number,
  teamIcon: any,
  elementImages: any[],
  selectedFont: string,
  imageIndex: number,
  dynamicImages: any[],
  nodeBuffer: any = null,
  forcedBufferHeight: number = 0,
  buffImg: any = null,
  nodeRating: string = "",
  ratingImages: any = {},
  showScore: boolean = false
) {
  let drawY = currentY;

  if (nodeBuffer) {
    const boxColor = "rgba(48, 48, 48, 255)";
    ctx.font = `18px ${selectedFont}`;

    let buffBoxHeight = 0;
    if (forcedBufferHeight > 0) {
      buffBoxHeight = forcedBufferHeight;
    } else {
      const estimatedHeight = estimateTextHeight(
        ctx,
        nodeBuffer.text,
        width - 40,
        selectedFont
      );
      buffBoxHeight = Math.max(120, estimatedHeight + 40);
    }
    const estimatedHeightForOffset = estimateTextHeight(
      ctx,
      nodeBuffer.text,
      width - 40,
      selectedFont
    );
    const verticalOffset =
      (buffBoxHeight - (estimatedHeightForOffset + 50)) / 2;
    const finalOffset = Math.max(0, verticalOffset);

    drawRoundedRect(ctx, x, drawY + 110, width, buffBoxHeight, 15, boxColor);

    ctx.fillStyle = "#FDE68A";
    ctx.font = `24px ${selectedFont}`;
    ctx.textAlign = "left";
    ctx.fillText(
      `${nodeBuffer.title}`,
      x + 20,
      drawY + 110 + 32.5 + finalOffset
    );

    if (buffImg) {
      ctx.drawImage(buffImg, x + width - 50, drawY + 110 - 3, 50, 26);
    }

    drawBuffText(
      ctx,
      nodeBuffer.text,
      x + 15,
      drawY + 110 + 62.5 + finalOffset,
      width * 2 - 60,
      selectedFont
    );

    drawY += buffBoxHeight + 10;
  }

  let nodeBoxHeight = showScore ? 280 : 230;
  if (showScore && nodeData.monster_pic) {
    nodeBoxHeight += 120;
  }

  drawRoundedRect(
    ctx,
    x,
    drawY + 120,
    width,
    nodeBoxHeight,
    15,
    "rgba(35, 35, 35, 255)"
  );

  if (showScore && nodeData.monster_pic) {
    try {
      const monsterImg = await loadImageAsync(nodeData.monster_pic);
      const sW = monsterImg.width;
      const sH = monsterImg.height * 0.4;
      const drawW = width;
      const ratio = width / sW;
      const drawH = sH * ratio;
      const monsterY = drawY + 120 + nodeBoxHeight - drawH + 20;

      const maskCanvas = createCanvas(drawW, drawH);
      const maskCtx = maskCanvas.getContext("2d");
      maskCtx.drawImage(monsterImg, 0, 0, sW, sH, 0, 0, drawW, drawH);
      maskCtx.globalCompositeOperation = "destination-out";
      const gradient = maskCtx.createLinearGradient(0, 0, 0, 180);
      gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      maskCtx.fillStyle = gradient;
      maskCtx.fillRect(0, 0, drawW, 180);

      ctx.save();
      ctx.beginPath();
      drawRoundedRectPath(ctx, x, drawY + 120, width, nodeBoxHeight, 15);
      ctx.clip();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(maskCanvas, x, monsterY);
      ctx.restore();
    } catch (e) {
      console.error("Failed to draw monster pic", e);
    }
  }

  if (showScore) {
    ctx.fillStyle = "white";
    ctx.font = `bold 32px ${selectedFont}`;
    ctx.textAlign = "left";
    const score = nodeData.score || 0;
    ctx.fillText(`${score}`, x + 25, drawY + 120 + 40);
  }

  ctx.drawImage(
    teamIcon,
    x + 25,
    showScore ? drawY + 175 : drawY + 140,
    92,
    32
  );

  const battleTime = nodeData.battle_time || 0;
  const bMin = Math.floor(battleTime / 60)
    .toString()
    .padStart(2, "0");
  const bSec = (battleTime % 60).toString().padStart(2, "0");
  ctx.font = `20px ${selectedFont}`;
  ctx.fillStyle = "#A0A0A0";
  ctx.fillText(
    `${tr("SpentTime") || "通關用時"}：${bMin}:${bSec}`,
    x + 15,
    showScore ? drawY + 120 + 110 : drawY + 120 + 75
  );

  if (nodeRating && ratingImages) {
    const rImg = ratingImages[nodeRating as keyof typeof ratingImages];
    if (rImg) {
      const rSize = 64;
      const rX = x + width - rSize;
      const rY = drawY + 120;
      ctx.drawImage(rImg, rX, rY, rSize, rSize);
    }
  }

  let avatarX = x + 30;
  let returnImgIndex = imageIndex;

  if (nodeData.avatars) {
    for (const avatar of nodeData.avatars) {
      let avatarImg = dynamicImages[returnImgIndex++] || dynamicImages[0]; // fallback
      if (!avatarImg) {
        // Extra fallback logic if array is empty or index OOB
        try {
          avatarImg = await loadImageAsync("./src/assets/images/None.png");
        } catch {
          avatarImg = createCanvas(1, 1);
        }
      }

      const avatarY = showScore ? drawY + 250 : drawY + 230;
      drawCircleImage(ctx, avatarImg, avatarX, avatarY, 80);

      const elementIndex = avatar.element_type
        ? [200, 201, 202, 203, 205].indexOf(avatar.element_type)
        : 0;

      if (elementIndex >= 0) {
        ctx.beginPath();
        ctx.arc(avatarX + 10, avatarY + 15, 16, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fill();
        ctx.drawImage(
          elementImages[elementIndex],
          avatarX - 5,
          avatarY,
          30,
          30
        );
      }

      if (avatar.level) {
        ctx.fillStyle = "#E3E3E3";
        ctx.font = `16px ${selectedFont}`;
        ctx.textAlign = "center";
        ctx.fillText(
          tr("levelFormat", { level: avatar.level }),
          avatarX + 35,
          showScore ? drawY + 350 : drawY + 330
        );
        ctx.textAlign = "left";
      }

      if (avatar.rank) {
        ctx.beginPath();
        const rankBgY = showScore ? drawY + 265 : drawY + 245;
        ctx.arc(avatarX + 70, rankBgY, 14, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.font = `16px ${selectedFont}`;
        ctx.textAlign = "center";
        const rankY = showScore ? drawY + 270 : drawY + 250;
        ctx.fillText(avatar.rank.toString(), avatarX + 70, rankY);
        ctx.textAlign = "left";
      }
      avatarX += 105;
    }
  }

  if (nodeData.buddy) {
    const lastAvatarX =
      x + 30 + (nodeData.avatars ? (nodeData.avatars.length - 1) * 105 : 0);
    // Correction: if avatars is empty?
    const safeAvatarX =
      nodeData.avatars && nodeData.avatars.length > 0 ? lastAvatarX : x + 30;
    // Wait, if avatars empty, buddy might be at start?
    // Previous logic: lastAvatarX is valid only if loop ran.
    // Let's rely on imageIndex incrementing.
    // Actually, we need to fetch buddy image from dynamicImages too.
    // In assets.ts, we pushed avatars then buddies.
    // So returnImgIndex should point to buddy image next.
    let buddyImg = dynamicImages[returnImgIndex++] || dynamicImages[0];

    const buddyX =
      nodeData.avatars && nodeData.avatars.length > 0
        ? lastAvatarX + 100
        : x + 130; // some default
    const buddyY = showScore ? drawY + 255 : drawY + 240;

    drawCircleImage(ctx, buddyImg, buddyX, buddyY, 70);

    if (nodeData.buddy.level) {
      ctx.fillStyle = "#E3E3E3";
      ctx.font = `14px ${selectedFont}`;
      ctx.textAlign = "center";
      ctx.fillText(
        tr("levelFormat", { level: nodeData.buddy.level }),
        buddyX + 30,
        buddyY + 85
      );
      ctx.fillStyle = "white";
      ctx.textAlign = "left";
    }
  }

  const usedHeight = drawY - currentY + 40 + nodeBoxHeight;
  return { nextImageIndex: returnImgIndex, usedHeight };
}
