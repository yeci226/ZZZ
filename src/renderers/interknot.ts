import { client } from '@/index';
import { EmbedBuilder, AttachmentBuilder, Events, ButtonStyle, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder } from 'discord.js';
import { drawInQueueReply, getUserLang } from '@/utilities';
import Queue from 'queue';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { join } from 'path';

const userStates = new Map(); // 儲存每個使用者的狀態
const renderQueue = new Queue({ autostart: true });

const fontPaths = {
  EN: 'en-us.ttf',
  TW: 'zh-tw.ttf',
  CN: 'zh-cn.ttf',
  VI: 'vi-vn.ttf',
  JP: 'ja-jp.ttf',
  KR: 'ko-kr.ttf',
  FR: 'fr-fr.ttf',
  Nunito: 'Nunito-BlackItalic.ttf',
  seguiemj: 'seguiemj.ttf',
};

for (const [key, value] of Object.entries(fontPaths)) GlobalFonts.registerFromPath(join('.', 'src', 'assets', value), key);

const fonts = {
  tw: 'TW',
  cn: 'CN',
  vi: 'VI',
  jp: 'JP',
  kr: 'KR',
  fr: 'FR',
  default: 'EN',
};

// function getUserState(userId) {
//   if (!userStates.has(userId)) {
//     userStates.set(userId, {
//       page: 0,
//       category: 0,
//       totalPages: 1,
//       isScrolling: false,
//       canvasCache: new Map(),
//     });
//   }
//   return userStates.get(userId);
// }

// async function loadImageAsync(url, fallbackUrl) {
//   try {
//     return await loadImage(url);
//   } catch {
//     return await loadImage(fallbackUrl || './src/assets/images/None.png');
//   }
// }

export async function handleInterknotDraw() {
  return 'https://media.discordapp.net/attachments/1149960935654559835/1185194443322687528/cookieT.png';
  // const drawTask = async () => {
  //   try {
  //     const drawStartTime = Date.now();
  //     const imageBuffer = await renderPage(interaction, tr, userLocale, userState);
  //     if (!imageBuffer) throw new Error('Image buffer is empty.');
  //     const drawEndTime = Date.now();
  //     const image = new AttachmentBuilder(imageBuffer, {
  //       name: `interknot-${Math.floor(new Date() / 1000)}.png`,
  //     });
  //     const row = new ActionRowBuilder().addComponents(
  //       new ButtonBuilder().setCustomId('post_scrollUp').setLabel('⬆️').setStyle(ButtonStyle.Primary),
  //       new ButtonBuilder().setCustomId('post_scrollDown').setLabel('⬇️').setStyle(ButtonStyle.Primary),
  //       new ButtonBuilder().setCustomId('post_refresh').setLabel('更新').setStyle(ButtonStyle.Success),
  //     );
  //     const row2 = new ActionRowBuilder().addComponents(
  //       new StringSelectMenuBuilder().setCustomId('post_categorySelect').setPlaceholder('選擇類別').addOptions(
  //         {
  //           label: '全部',
  //           emoji: '🔔',
  //           value: '0',
  //         },
  //         {
  //           label: '官方',
  //           emoji: '🔔',
  //           value: '1',
  //         },
  //         {
  //           label: '討論',
  //           emoji: '🔥',
  //           value: '2',
  //         },
  //         {
  //           label: '提問',
  //           emoji: '🗞️',
  //           value: '3',
  //         },
  //         {
  //           label: '資訊',
  //           emoji: '🗞️',
  //           value: '4',
  //         },
  //       ),
  //     );
  //     // const row3 = new ActionRowBuilder().addComponents(
  //     //   new StringSelectMenuBuilder()
  //     //     .setCustomId("postSelect")
  //     //     .setPlaceholder("選擇文章")
  //     //     .addOptions()
  //     // );
  //     interaction.replied
  //       ? await interaction.editReply({
  //           content: `繪製時間：${drawEndTime - drawStartTime}ms`,
  //           embeds: [],
  //           components: [row2, row],
  //           files: [image],
  //           fetchReply: true,
  //         })
  //       : interaction.message.edit({
  //           content: `繪製時間：${drawEndTime - drawStartTime}ms`,
  //           embeds: [],
  //           components: [row2, row],
  //           files: [image],
  //           fetchReply: true,
  //         });
  //   } catch (error) {
  //     const errorMessage = new EmbedBuilder()
  //       .setColor('#E76161')
  //       .setTitle(tr('DrawError'))
  //       .setDescription(`\`${error}\``)
  //       .setThumbnail('https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png');
  //     interaction.replied
  //       ? await interaction.editReply({
  //           embeds: [errorMessage],
  //           fetchReply: true,
  //         })
  //       : interaction.message.edit({
  //           embeds: [errorMessage],
  //         });
  //   }
  // };
  // renderQueue.push(drawTask);
  // if (renderQueue.length !== 1) {
  //   drawInQueueReply(interaction, tr('DrawInQueue', { position: renderQueue.length - 1 }));
  // }
}

export async function renderPage() {
  // try {
  //   const selectedFont = fonts[userLocale] || fonts.default;
  //   /**
  //    * posts = [
  //    *  {
  //    *   post_id: 0, // Unique ID (int)
  //    *   post_author_id: "123456789", // Author ID (string) (Discord User ID)
  //    *   post_title: "Hello, World!", // Post Title (string)
  //    *   post_content: "This is a test post.", // Post Content (string)
  //    *   post_image: "", // Post Image URL (string)
  //    *   post_category: "general", // Post Category (string) (general, official, discussion, question, info)
  //    *   post_reactions: []  // Post Reactions (array)
  //    *   post_comments: []  // Post Comments (array)
  //    *   post_created_at: Date.now(), // Post Created At (timestamp)
  //    *   post_edited_at: Date.now(), // Post Edited At (timestamp)
  //    *   post_edited_times: 0, // Post Edited (int) Times ✎114514
  //    *   post_viewed_times: 0, // Post Viewed (int) Times 👁114514
  //    *   post_reported_times: false, // Post Reported (int) Times
  //    *   post_is_pinned: false, // Post is Pinned
  //    *   post_is_hidden: false, // Post is Hidden ()
  //    *   post_is_disabled: false, // Post is Disabled
  //    *  }
  //    * ]
  //    */
  //   // Config
  //   const [canvas_width, canvas_height] = [1920, 1080]; // 畫布寬高
  //   const columnCount = 5; // 列數
  //   const categoriesTranslate = {
  //     general: '全部',
  //     official: '官方',
  //     discussion: '討論',
  //     question: '提問',
  //     info: '資訊',
  //   }; // 類別名稱
  //   const categories = ['general', 'official', 'discussion', 'question', 'info']; // 類別
  //   const page_height = 980; // 一頁的高度
  //   const [page_padding_x, page_padding_y] = [92, 120];
  //   const post_width = 320;
  //   const post_margin_x = 34;
  //   const post_margin_y = 25;
  //   const post_radius = 30;
  //   const category_option_width = 800 / categories.length;
  //   const images = await Promise.all(['./src/assets/images/interknot/bgDark.jpg', interaction.user.displayAvatarURL({ format: 'png', size: 4096 })].map((path) => loadImageAsync(path)));
  //   // Define variable
  //   let totalPages = Math.min(userState.totalPages, 100);
  //   let currentPage = Math.max(userState.page, 0); // 確保 userState 大於 0
  //   let currentcategory_index = userState.category;
  //   // Check if the image is already cached
  //   if (userState.canvasCache.has(`post_${currentcategory_index}_${currentPage}`)) {
  //     console.log(`正在使用 ${interaction.user.displayName} 第 ${currentPage + 1} 頁的快取圖片 (類別: ${categoriesTranslate[categories[currentcategory_index]]})`);
  //     return userState.canvasCache.get(`post_${currentcategory_index}_${currentPage}`);
  //   } else {
  //     console.log(`正在渲染 ${interaction.user.displayName} 第 ${currentPage + 1} 頁的圖片 (類別: ${categoriesTranslate[categories[currentcategory_index]]})`);
  //   }
  //   //////////////////
  //   // Start Render //
  //   //////////////////
  //   console.log(userState);
  //   // Create canvas
  //   const canvas = createCanvas(canvas_width, canvas_height);
  //   const ctx = canvas.getContext('2d');
  //   // Render backgound
  //   const renderBackground = () => {
  //     console.log(`正在渲染背景圖片`);
  //     const backgound_image = images[0];
  //     // Draw background image
  //     ctx.drawImage(backgound_image, 0, 0, canvas_width, canvas_height);
  //     ctx.filter = 'none';
  //   };
  //   renderBackground();
  //   // Render posts
  //   const renderPostPage = async () => {
  //     try {
  //       // Check if the image is already cached
  //       if (userState.canvasCache.has(`post_${currentcategory_index}`)) {
  //         console.log(`正在使用 Posts 快取圖片 (類別: ${categoriesTranslate[categories[currentcategory_index]]})`);
  //         return userState.canvasCache.get(`post_${currentcategory_index}`);
  //       } else {
  //         console.log(`正在渲染 Posts 圖片 (類別: ${categoriesTranslate[categories[currentcategory_index]]})`);
  //       }
  //       // Load post
  //       const posts = (await db.get('posts')).filter((post) => categories[currentcategory_index] === 'general' || post.post_category === categories[currentcategory_index]);
  //       const post_images = await Promise.all(posts.map((post) => loadImageAsync(post.post_image || './src/assets/images/interknot/postDefault.webp')));
  //       const post_author_avatars = await Promise.all(posts.map((post) => loadImageAsync(post.post_author_avatar)));
  //       // Define variable
  //       let next_x = page_padding_x; // 下一個 Post 的 X 位置 (初始值 page_padding_x)
  //       let next_y = page_padding_y; // 下一個 Post 的 Y 位置 (初始值 page_padding_x)
  //       let last_post = 0; // 最後一次選染的 Post index
  //       let column_heights = Array(columnCount).fill(next_y); // 記錄每列的總高度 (初始值 next_y)
  //       let column_widths = Array.from({ length: columnCount }, (_, i) => {
  //         return next_x + i * (post_width + post_margin_x);
  //       }); // 記錄每列的寬度 (靠左)
  //       // Create canvas
  //       const postCanvas = createCanvas(canvas_width, canvas_height * 100);
  //       const postCtx = postCanvas.getContext('2d');
  //       for (; last_post < posts.length; last_post++) {
  //         // Find the shortest column
  //         let shortestColumnIndex = column_heights.indexOf(Math.min(...column_heights));
  //         // Calcualte Offset
  //         next_x = column_widths[shortestColumnIndex];
  //         next_y = column_heights[shortestColumnIndex];
  //         // Post
  //         const post = posts[last_post];
  //         // Author
  //         const maxLength = Math.floor((post_width - 40 - 80) / 24);
  //         const author = post.post_author_name.slice(0, maxLength);
  //         // Avatar
  //         const avatar = post_author_avatars[last_post];
  //         // Image
  //         const image = post_images[last_post];
  //         const image_width = post_width;
  //         const image_height = Math.floor((image.naturalHeight * post_width) / image.naturalWidth);
  //         // Title
  //         const title = post.post_title;
  //         const titleLines = sliceStr(title, post_width - 40, 2, '24px');
  //         // Content
  //         const content = post.post_content;
  //         const contentLines = sliceStr(content, post_width - 40, 1, '20px');
  //         // Slice
  //         function sliceStr(str, maxWidth, lines, fontSize) {
  //           postCtx.font = `${fontSize} ${selectedFont}`;
  //           const slicedStrLines = [];
  //           let line = '';
  //           for (let i = 0; i < str.length; i++) {
  //             if (postCtx.measureText(line + str[i]).width > maxWidth) {
  //               slicedStrLines.push(line);
  //               line = str[i];
  //             } else line += str[i];
  //           }
  //           slicedStrLines.push(line);
  //           if (slicedStrLines.length > lines) {
  //             slicedStrLines[lines - 1] = slicedStrLines[lines - 1].slice(0, -1) + '...';
  //           }
  //           return slicedStrLines.slice(0, lines);
  //         }
  //         const post_height =
  //           Math.max(image_height, 100) + // 圖片的高度(最少100px)
  //           40 * titleLines.length + // 標題行數的高度
  //           40 * contentLines.length + // 內容行數的高度
  //           50; // 額外填充的高度
  //         // 更新該列的高度
  //         column_heights[shortestColumnIndex] += post_height + post_margin_y;
  //         // Draw post background
  //         drawRoundedRect(postCtx, next_x, next_y, post_width, post_height, post_radius, {
  //           roundedCorners: ['topLeft', 'topRight', 'bottomLeft'],
  //           color: '#222222',
  //         });
  //         // Draw post image
  //         drawRoundedRect(postCtx, next_x, next_y, image_width, image_height, post_radius, {
  //           roundedCorners: ['topLeft', 'topRight'],
  //           img: image,
  //         });
  //         // Draw border
  //         drawRoundedRect(postCtx, next_x, next_y, post_width, post_height, post_radius, {
  //           roundedCorners: ['topLeft', 'topRight', 'bottomLeft'],
  //           borderColor: '#000000',
  //           borderWidth: 6,
  //         });
  //         // Display title
  //         postCtx.font = `24px ${selectedFont}`;
  //         postCtx.textAlign = 'left';
  //         postCtx.fillStyle = '#FFFFFF';
  //         titleLines.forEach((line, index) => {
  //           postCtx.fillText(line, next_x + 20, next_y + post_height - 10 - 40 * (titleLines.length - index));
  //         });
  //         // Display content
  //         postCtx.font = `20px ${selectedFont}`;
  //         postCtx.fillStyle = '#A2A2A2';
  //         contentLines.forEach((line, index) => {
  //           postCtx.fillText(line, next_x + 20, next_y + post_height - 15);
  //         });
  //         // Draw author avatar backgound
  //         drawRoundedRect(postCtx, next_x + 16, next_y + post_height - 20 - 40 * titleLines.length - 94, 78, 78, 39, {
  //           color: '#222222',
  //         });
  //         // Draw post avatar on title
  //         drawRoundedRect(postCtx, next_x + 20, next_y + post_height - 20 - 40 * titleLines.length - 90, 70, 70, 35, {
  //           img: avatar,
  //         });
  //         // Draw post author name
  //         postCtx.font = `24px ${selectedFont}`;
  //         postCtx.fillStyle = '#636363';
  //         postCtx.fillText(author, next_x + 20 + 40 + 40, next_y + post_height - 20 - 40 * titleLines.length - 35);
  //         // Draw hr
  //         postCtx.strokeStyle = '#333333';
  //         postCtx.lineWidth = 4;
  //         postCtx.beginPath();
  //         postCtx.moveTo(next_x + 20 + 40 + 40, next_y + post_height - 20 - 40 * titleLines.length - 23);
  //         postCtx.lineTo(next_x + post_width - 20, next_y + post_height - 20 - 40 * titleLines.length - 23);
  //         postCtx.stroke();
  //         // Draw view count
  //         postCtx.font = `24px seguiemj`;
  //         postCtx.fillStyle = '#FFFFFF';
  //         postCtx.textAlign = 'left';
  //         const viewEmoji = '🔥';
  //         const viewEmojiWidth = postCtx.measureText(viewEmoji).width;
  //         postCtx.fillText(viewEmoji, next_x + 20, next_y + 40);
  //         postCtx.font = `24px ${selectedFont}`;
  //         postCtx.fillText(`${post.post_viewed_times}`, next_x + 20 + viewEmojiWidth, next_y + 40);
  //       }
  //       // 計算高度
  //       const heighestColumn_height = Math.max(...column_heights);
  //       totalPages = Math.min(Math.ceil(heighestColumn_height / page_height), 100);
  //       userState.totalPages = totalPages;
  //       // Save and return
  //       userState.canvasCache.set(`post_${currentcategory_index}`, postCanvas);
  //       return postCanvas;
  //     } catch (e) {
  //       console.error(e);
  //       return null;
  //     }
  //   };
  //   ctx.drawImage(await renderPostPage(), 0, -1 * currentPage * page_height);
  //   // Render header
  //   const renderHeader = () => {
  //     console.log(`正在渲染標頭`);
  //     ctx.font = `24px ${selectedFont}`;
  //     ctx.fillStyle = '#FFFFFF';
  //     const user_avatar = images[1];
  //     const user_name = interaction.user.displayName;
  //     const userInfo_width = ctx.measureText(user_name).width + 110;
  //     const title_text = `第 ${currentPage + 1} 頁 | 共 ${totalPages} 頁`;
  //     // Draw background
  //     ctx.fillStyle = '#000000';
  //     ctx.fillRect(0, 0, 1920, 100);
  //     // Draw user info background
  //     drawRoundedRect(ctx, 20, 20, userInfo_width, 60, 30, {
  //       color: '#212221',
  //     });
  //     // Draw user avatar
  //     drawRoundedRect(ctx, 28, 25, 50, 50, 25, { img: user_avatar });
  //     // Display username
  //     ctx.fillStyle = '#FFFFFF';
  //     ctx.textAlign = 'left';
  //     ctx.textBaseline = 'middle';
  //     ctx.fillText(user_name, 88, 50);
  //     // Display page counter
  //     ctx.fillStyle = '#FFFFFF';
  //     ctx.textAlign = 'left';
  //     ctx.fillText(title_text, userInfo_width + 50, 50);
  //     // Display timestamp
  //     ctx.fillStyle = '#A2A2A2';
  //     ctx.fillText(
  //       `上次更新：${new Date().toLocaleString('zh-TW', {
  //         timeZone: 'Asia/Taipei',
  //         hour12: false,
  //         Format: 'HH:mm:ss',
  //       })}`,
  //       userInfo_width + ctx.measureText(title_text).width + 70,
  //       50,
  //     );
  //     // Draw category list
  //     drawRoundedRect(ctx, 1060, 20, 800, 60, 30, {
  //       color: '#000000',
  //       borderColor: '#212221',
  //       borderWidth: 6,
  //     });
  //     // Draw category option
  //     for (let i = 0; i < categories.length; i++) {
  //       const category = categoriesTranslate[categories[i]];
  //       const rect_x = 1060 + i * category_option_width;
  //       const text_x = 1060 + (i + 0.5) * category_option_width;
  //       const text_y = 50;
  //       if (i === currentcategory_index) {
  //         drawRoundedRect(ctx, rect_x, 20, category_option_width, 60, 30, {
  //           color: '#F2D900',
  //           borderColor: '#F2D900',
  //           borderWidth: 10,
  //         });
  //         ctx.fillStyle = '#000000';
  //         ctx.textAlign = 'center';
  //         ctx.textBaseline = 'middle';
  //         ctx.fillText(category, text_x, text_y);
  //       } else {
  //         ctx.fillStyle = '#FFFFFF';
  //         ctx.textAlign = 'center';
  //         ctx.textBaseline = 'middle';
  //         ctx.fillText(category, text_x, text_y);
  //       }
  //     }
  //   };
  //   renderHeader();
  //   console.log(`渲染完成`);
  //   // Save and return
  //   const imageBuffer = canvas.toBuffer('image/png');
  //   userState.canvasCache.set(`post_${userState.category}_${userState.page}`, imageBuffer);
  //   return imageBuffer;
  // } catch (e) {
  //   console.error(e);
  //   return null;
  // }
}

// Draw rounded rect with options
// function drawRoundedRect(ctx, x, y, width, height, radius, options = {}) {
//   const { roundedCorners = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'], color, borderColor, borderWidth, img } = options;

//   ctx.save();
//   ctx.beginPath();

//   // 上邊緣
//   ctx.moveTo(x + (roundedCorners.includes('topLeft') ? radius : 0), y);
//   if (roundedCorners.includes('topRight')) {
//     ctx.arcTo(x + width, y, x + width, y + radius, radius);
//   } else {
//     ctx.lineTo(x + width, y);
//   }

//   // 右邊緣
//   if (roundedCorners.includes('bottomRight')) {
//     ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
//   } else {
//     ctx.lineTo(x + width, y + height);
//   }

//   // 下邊緣
//   if (roundedCorners.includes('bottomLeft')) {
//     ctx.arcTo(x, y + height, x, y + height - radius, radius);
//   } else {
//     ctx.lineTo(x, y + height);
//   }

//   // 左邊緣
//   if (roundedCorners.includes('topLeft')) {
//     ctx.arcTo(x, y, x + radius, y, radius);
//   } else {
//     ctx.lineTo(x, y);
//   }

//   ctx.closePath();

//   // 填充顏色
//   if (color) {
//     ctx.fillStyle = color;
//     ctx.fill();
//   }

//   // 邊框
//   if (borderColor) {
//     ctx.strokeStyle = borderColor;
//     ctx.lineWidth = borderWidth || 1;
//     ctx.stroke();
//   }

//   // 畫圖
//   if (img) {
//     ctx.clip();
//     ctx.drawImage(img, x, y, width, height);
//   }

//   ctx.restore();
// }

// client.on(Events.InteractionCreate, async (interaction) => {
//   const { customId, user, values } = interaction;
//   if (!interaction.isStringSelectMenu() || !customId.startsWith('post_')) return;

//   const command = customId.split('_')[1];
//   const userId = user.id;
//   const userState = getUserState(userId);
//   const userLocale = (await getUserLang(interaction.user.id)) || toI18nLang(interaction.locale) || 'en';
//   const tr = createTranslator(userLocale);

//   if (interaction.isButton()) {
//     if (userState.isScrolling) return;
//     userState.isScrolling = true;

//     if (command === 'scrollUp') {
//       userState.page = Math.max(0, userState.page - 1);
//     } else if (command === 'scrollDown') {
//       userState.page = Math.min(userState.page + 1, userState.totalPages - 1);
//     } else if (command === 'refresh') {
//       userState.page = 0;
//       userState.canvasCache.clear();
//     }

//     await handleInterknotDraw(interaction, tr, userLocale, userState);

//     setTimeout(() => {
//       userState.isScrolling = false; // 恢復滾動狀態
//     }, 250); // 加入延遲，避免頻繁觸發
//   }

//   if (interaction.isStringSelectMenu()) {
//     if (command === 'categorySelect') {
//       userState.category = parseInt(values[0]);
//       userState.page = 0;
//     }

//     await handleInterknotDraw(interaction, tr, userLocale, userState);
//   }
// });
