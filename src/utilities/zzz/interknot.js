import { client } from "../../index.js";
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

const db = client.db;
const renderQueue = new Queue({ autostart: true });

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

export async function handleInterknotDraw(interaction, tr, userLocale) {
  const drawTask = async () => {
    try {
      const imageBuffer = await renderPage(interaction, tr, userLocale);
      if (!imageBuffer) throw new Error("Image buffer is empty.");

      const image = new AttachmentBuilder(imageBuffer, {
        name: `singalLog_${interaction.user.id}.png`,
      });

      interaction.editReply({
        content: "",
        embeds: [],
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

  renderQueue.push(drawTask);

  if (renderQueue.length !== 1) {
    drawInQueueReply(
      interaction,
      tr("DrawInQueue", { position: renderQueue.length - 1 })
    );
  }
}

export async function renderPage(interaction, tr, userLocale) {
  try {
    const selectedFont = fonts[userLocale] || fonts.default;
    const canvas = createCanvas(1920, 1080);
    const ctx = canvas.getContext("2d");

    // Load all assets
    const imagePaths = [
      "./src/assets/images/interknot/bgDark.jpg",
      interaction.user.displayAvatarURL({ format: "png", size: 4096 }),
    ];
    const images = await Promise.all(imagePaths.map((path) => loadImage(path)));
    const [bg, userAvatar] = images;

    // Render backgound
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.drawImage(bg, 0, 100, ctx.width, ctx.height);
    ctx.filter = "none";

    // Render user avatar & name
    const username = `${interaction.user.displayName}從天降`;
    drawRoundedRect(
      ctx,
      20,
      20,
      120 + ctx.measureText(username).width * 2 + 20,
      60,
      30,
      {
        color: "#212221",
      }
    ); // Backgound (ctx, x, y, width, height, radius, options = {})
    drawRoundedRect(ctx, 28, 25, 50, 50, 25, { img: userAvatar }); // Avatar (ctx, x, y, width, height, radius, options = {})
    ctx.font = `24px ${selectedFont}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(username, 88, 50);

    // Render catagory list
    const catagories = ["全部", "官方", "討論", "提問", "資訊"];

    drawRoundedRect(ctx, 1060, 20, 800, 60, 30, {
      color: "#000000",
      borderColor: "#212221",
      borderWidth: 6,
    });

    // Render catagory option
    const option_width = 800 / catagories.length;

    for (let i = 0; i < catagories.length; i++) {
      const catagory = catagories[i];
      const text_x = 1060 + (i + 0.5) * option_width;
      const text_y = 50;

      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(catagory, text_x, text_y);
    }

    // Render active catagory option
    const optionIndex = 0; // can be changed by selecting catagory

    const catagory = catagories[optionIndex];
    const rect_x = 1060 + optionIndex * option_width;
    const text_x = 1060 + (optionIndex + 0.5) * option_width;
    const text_y = 50;

    drawRoundedRect(ctx, rect_x, 20, option_width, 60, 30, {
      color: "#F2D900",
      borderColor: "#F2D900",
      borderWidth: 10,
    });

    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(catagory, text_x, text_y);

    // Load posts
    const posts = (await db.get("posts")) || [];

    // Generate test posts
    const testTitle = [
      "Hello, World!",
      "[提問] 這是一個問題嗎？",
      "如何在 Discord 上建立一個機器人???",
      "這是一個很長很長的標題，但是我們可以處理它嗎？",
      "這是一個很短的標題",
      "大家给小龙起了什么名字？",
      "最近天天啥群也不看了，就蹲在绳网刷新看帖子，聊天分享的。",
      "亮色的不太习惯，还是喜欢新艾利都同款的绳网，但是不知道怎么调",
      "最好是啊哈被阿基维利始乱终弃的抹布本，这么看起来真的很瑟",
      "一想到荧那愤怒且想打我的神情就忍不住想要被荧的玉足好好折磨呜呜呜。如果能穿上白袜就好了。",
      "測試",
      "简·杜马上就来啦，大家觉得是优先专武还是1命呢",
    ];

    for (let i = 0; i < 12; i++) {
      posts.push({
        post_id: i,
        post_author_id: "123456789",
        post_title: testTitle[i],
        post_content: testTitle[i],
        post_image: "",
        post_reactions: [],
        post_comments: [],
        post_created_at: Date.now(),
        post_edited_at: Date.now(),
        post_edited_times: 0,
        post_viewed_times: 0,
        post_reported_times: false,
        post_is_pinned: false,
        post_is_hidden: false,
        post_is_disabled: false,
      });
    }

    /*
      Post formation
      * Height: 320px
      * Width: auto
    */

    // Render posts
    const page = 0;
    const postsPerPage = 20;
    const start = page * postsPerPage;
    const end = (page + 1) * postsPerPage;
    const postsToRender = posts.slice(start, end);

    let next_x = 92;
    let next_y = 120;
    let last_post = 0; // the last post that is rendered

    for (; last_post < postsToRender.length; last_post++) {
      const post = postsToRender[last_post];

      // Title
      const title = post.post_title;
      const titleLine = sliceStr(title, (post_width - 40) * 2);
      const titleheight = 20 * (ctx.measureText(title).width / maxWidth);

      const titleLines = [];
      // let titleLine = "";

      // Change line
      // function changeLine(str)

      const maxWidth = post_width - 40;
      title.split("").forEach((char) => {
        const newLine = titleLine + char;
        if (ctx.measureText(newLine).width > maxWidth) {
          titleLines.push(titleLine);
          titleLine = char;
        } else titleLine = newLine;
      });
      if (titleLine) titleLines.push(titleLine);

      // // Slice lines
      // const maxLines = 2;
      // if (titleLines.length > maxLines) {
      //   titleLines.splice(maxLines);
      //   titleLines[maxLines - 1] = titleLines[maxLines - 1].slice(
      //     0,
      //     titleLines[maxLines - 1].length - 3
      //   );
      //   titleLines[maxLines - 1] += "...";
      // }

      // Content
      const content = post.post_content;
      const contentLine = sliceStr(content, post_width - 40);
      const contentHeight = 20;

      // Slice
      function sliceStr(str, maxWidth) {
        return ctx.measureText(str).width > maxWidth
          ? (() => {
              let i = 0;
              while (
                ctx.measureText(str.slice(0, i + 1) + "...").width <=
                  maxWidth &&
                i < str.length
              ) {
                i++;
              }
              return str.slice(0, i) + "...";
            })()
          : str;
      }

      // Post
      const post_image = post.post_image;
      post_image.width = 320; // rescale post image (width to 320px)
      post_image.height =
        post_image.naturalHeight * (320 / post_image.naturalWidth); // rescale post image (height to auto)
      const post_width = 320;
      const post_height = Math.floor(Math.random() * 200) + 200; // Calculate post height (use random for test)
      //const post_height = post_image.height + titleHeight + contentHeight
      const post_margin_x = 34;
      const post_margin_y = 25;
      const post_radius = 30;

      // Check height
      if (next_y + post_height > 1080) {
        next_y = 120; // Reset Y
        next_x += post_width + post_margin_x; // Next column
      }
      if (next_x > 1920 - post_width) break; // Break

      // Display post
      drawRoundedRect(
        ctx,
        next_x,
        next_y,
        post_width,
        post_height,
        post_radius,
        {
          color: "#222222",
          borderColor: "#000000",
          borderWidth: 6,
        }
      );

      ctx.font = `28px ${selectedFont}`;
      ctx.textAlign = "left";
      ctx.fillStyle = "#FFFFFF";

      // Display title
      titleLines.forEach((line, index) => {
        ctx.fillText(
          line,
          next_x + 20,
          next_y + post_height - 20 - 40 * (titleLines.length - index)
        );
      });

      // Display content
      ctx.font = `24px ${selectedFont}`;
      ctx.fillStyle = "#A2A2A2";
      ctx.fillText(contentLine, next_x + 20, next_y + post_height - 25);

      // Draw post author name & avatar & split line on title
      const post_author_avatar = await loadImage(
        "../assets/images/interknot/avatar.pngprofile-photo.webp"
      );
      drawRoundedRect(
        ctx,
        next_x + 20,
        next_y + post_height - 20 - 40 * (titleLines.length - index) - 20,
        40,
        40,
        20,
        {
          img: post_author_avatar,
        }
      ); // Draw post author avatar (ctx, x, y, width, height, radius, options = {})

      ctx.font = `24px ${selectedFont}`;
      ctx.fillStyle = "#636363";
      const post_author_name = "測試嗯呢";
      ctx.fillText(
        post_author_name,
        next_x + 20 + 40 + 10,
        next_y + post_height - 20 - 40 * (titleLines.length - index) - 20
      );

      // place post image

      // place post author name & avatar

      // place viewed times

      // Offset next_y
      next_y += post_height + post_margin_y;
    }

    /**
     * posts = [
     *  {
     *   post_id: 0, // Unique ID (int)
     *   post_author_id: "123456789", // Author ID (string) (Discord User ID)
     *   post_title: "Hello, World!", // Post Title (string)
     *   post_content: "This is a test post.", // Post Content (string)
     *   post_image: "", // Post Image URL (string)
     *   post_category: "general", // Post Category (string) (general, official, discussion, question, info)
     *   post_reactions: []  // Post Reactions (array)
     *   post_comments: []  // Post Comments (array)
     *   post_created_at: Date.now(), // Post Created At (timestamp)
     *   post_edited_at: Date.now(), // Post Edited At (timestamp)
     *   post_edited_times: 0, // Post Edited (int) Times ✎114514
     *   post_viewed_times: 0, // Post Viewed (int) Times 👁114514
     *   post_reported_times: false, // Post Reported (int) Times
     *   post_is_pinned: false, // Post is Pinned
     *   post_is_hidden: false, // Post is Hidden ()
     *   post_is_disabled: false, // Post is Disabled
     *  }
     * ]
     */

    // Return the buffer
    return canvas.toBuffer("image/png");
  } catch (e) {
    console.error(e);
    return null;
  }
}

// Draw rounded rect with optional image or color fill
function drawRoundedRect(ctx, x, y, width, height, radius, options = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();

  if (options.color) {
    ctx.fillStyle = options.color;
    ctx.fill();
  }

  if (options.borderColor) {
    ctx.strokeStyle = options.borderColor;
    ctx.lineWidth = options.borderWidth || 1;
    ctx.stroke();
  }

  if (options.img) {
    ctx.clip();
    ctx.drawImage(options.img, x, y, width, height);
    ctx.restore();
  }
}
