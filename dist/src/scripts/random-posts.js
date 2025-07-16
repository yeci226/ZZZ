"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("@/index");
const testTitle = [
    '怎麼會有錢博爾阿 超好笑',
    'Hello, World!',
    '[提問] 這是一個問題嗎？',
    '如何在 Discord 上建立一個機器人???',
    '這是一個很長很長的標題，但是我們可以處理它嗎？',
    '這是一個很短的標題',
    '大家给小龙起了什么名字？',
    '最近天天啥群也不看了，就蹲在绳网刷新看帖子，聊天分享的。',
    '亮色的不太习惯，还是喜欢新艾利都同款的绳网，但是不知道怎么调',
    '最好是啊哈被阿基维利始乱终弃的抹布本，这么看起来真的很瑟',
    '一想到荧那愤怒且想打我的神情就忍不住想要被荧的玉足好好折磨呜呜呜。如果能穿上白袜就好了。',
    '測試',
    '简·杜马上就来啦，大家觉得是优先专武还是1命呢',
];
const testUsername = ['測試嗯呢', '衝浪小龍', '網絡小白', '嚕嚕米', '包子超人', '草莓牛奶', '黑曜之刃', '去錦鯉麵館借開水泡麵', '紅豆派', '沼蝦先生', '一號機'];
const categories = ['general', 'official', 'discussion', 'question', 'info'];
index_1.database.set('posts', Array.from({ length: 1000 }, (_, i) => ({
    post_id: i,
    post_author_id: '123456789',
    post_author_name: testUsername[getRandomNumber(11) - 1] || '測試嗯呢嗯呢！',
    post_author_avatar: `./src/assets/images/interknot/IconInterKnot${getRandomNumber(11).toString().padStart(2, '0')}.png`,
    post_title: testTitle[i] || '測試嗯呢嗯呢！',
    post_content: testTitle[i] || '測試嗯呢嗯呢！',
    post_image: `./src/assets/images/interknot/testCover${getRandomNumber(8).toString().padStart(2, '0')}.png` || './src/assets/images/interknot/postDefault.webp',
    post_category: categories[getRandomNumber(5) - 1] || 'general',
    post_reactions: [],
    post_comments: [],
    post_created_at: Date.now(),
    post_edited_at: Date.now(),
    post_edited_times: 0,
    post_viewed_times: Math.floor(Math.random() * 5000),
    post_reported_times: false,
    post_is_pinned: false,
    post_is_hidden: false,
    post_is_disabled: false,
}))); // 初始化 posts
console.log('Random posts generated successfully!');
function getRandomNumber(maxNum = 10) {
    const number = Math.floor(Math.random() * maxNum) + 1;
    return number;
}
