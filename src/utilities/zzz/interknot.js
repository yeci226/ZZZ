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

export async function handleInterknotDraw(interaction, tr) {
  const drawTask = async () => {
    try {
      const userLocale =
        (await getUserLang(interaction.user.id)) ||
        toI18nLang(interaction.locale) ||
        "en";

      const imageBuffer = await drawInterknotImage(interaction, tr);
      if (!imageBuffer) throw new Error("Image buffer is empty.");

      const image = new AttachmentBuilder(imageBuffer, {
        name: `singalLog_${interaction.user.id}.png`,
      });

      interaction.editReply({
        content: "",
        files: [image],
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

export async function drawInterknotImage(interaction, tr, userLocale) {
  try {
    const selectedFont = fonts[userLocale] || fonts.default;
    const canvas = createCanvas(1920, 1080);
    const ctx = canvas.getContext("2d");

    // Load all assets
    const imagePaths = [
      "./src/assets/images/bgDark.jpg",
      interaction.user.displayAvatarURL({ format: "png", size: 4096 }),
    ];
    const images = await Promise.all(imagePaths.map((path) => loadImage(path)));
    const [bg, userAvatar] = images;

    // Draw Backgound Image and blur 50%
    ctx.filter = "blur(10px)";
    ctx.drawImage(bg, 0, 0, ctx.width, ctx.height);
    ctx.filter = "none";

    // Draw User Avatar and Name
    drawRoundedRectImage(ctx, userAvatar, 50, 50, 100, 100, 10); // (ctx, img, x, y, width, height, radius)
    ctx.font = `50px ${selectedFont}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(interaction.user.displayName, 160, 100);

    // Return the buffer
    return canvas.toBuffer("image/png");
  } catch (e) {
    console.error(e);
    return null;
  }
}

// Draw circle image function
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
