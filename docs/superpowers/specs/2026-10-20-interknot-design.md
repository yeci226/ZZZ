# 繩網（Inter-Knot）設計：子專案 A — 渲染器 + 使用者發文

日期：2026-10-20
狀態：設計已逐節確認，待審閱 spec

## 目標

把遊戲內的繩網做成 Discord 上真正可以「聯機」的版本：畫面盡量和遊戲一模一樣，所有使用 bot 的伺服器共用同一個繩網，玩家可以發文、留言、送 ♥。

參考影片：<https://www.youtube.com/shorts/h-UW5mYw9gw>（繩網段落 0:00–0:27）。像素尺寸以使用者提供的遊戲原生解析度截圖為準（見「待辦：截圖量測」）。

## 整體拆分

| 子專案 | 內容 | 狀態 |
|---|---|---|
| **A（本文件）** | 動態牆與詳情渲染、使用者發文／留言／♥、身分、審核 | 本 spec |
| B | 官方劇情貼文：資料來源、匯入、舊版詳情（兩個回覆選項，選了變成自己的留言） | 另開 spec，需先研究資料來源 |

## 影片觀察（設計依據）

- **動態牆（新版，0:20–0:24）**：全螢幕 5 欄瀑布流、深色圓角卡片。看過的文封面右上有灰色「已讀」；滑鼠移上去的卡片有黃色外框。
- **卡片**：封面左上角是瀏覽數，一般用 👁，熱門文用橘色 🔥；新文有黃色「NEW」；下面是圓形頭像、暱稱、粗體 `[標籤]` 標題、一行灰色摘要。
- **標籤**：`[灌水]` `[情報]` `[求助]` `[同人]` `[廣告]`。
- **詳情（新版三欄，0:18–0:22）**：上方是頭像、暱稱、♥ 聲望徽章、紅色 ✕（hover 變綠）。下方三欄：封面｜標題和內文（▼ 展開）｜留言串（頭像、暱稱、右側 `1F`…`NF` 徽章；樓主前綴 `[樓主]`；底部「— 已無更多評論 —」；▲▼ 捲動）。
- 0:07–0:12 的 INTER-KNOT 網頁畫面是粉絲網站，不列入範圍。

## 範圍

### 包含

| 功能 | 說明 |
|---|---|
| 動態牆 | 新版 5 欄瀑布流，卡片元素如上；回到牆時，剛看過的卡片加黃色外框 |
| 詳情 | 新版三欄；內文太長或留言太多時分頁 |
| 發文 | modal：標籤、標題、內文、封面（選填，1 張）、匿名 |
| 留言 | modal：內容、匿名；樓層自動編號 |
| ♥ 與聲望 | 每人每篇最多送一次，可以收回，不能送給自己；聲望 = 作者收到的 ♥ 總數 |
| 身分 | 繩網暱稱（不可重複）+ 繩網頭像（IconInterKnot 系列） |
| 範圍篩選 | 全域／本伺服器 |
| 刪除 | 作者可刪除自己的文和留言 |
| 審核 | 先發後審、檢舉、自動隱藏、開發者私訊處理、封鎖、頻率限制 |
| 多語系 | 按鈕文字和圖上的固定文字走 `tr()`，7 個語系都要有 |

### 不包含（YAGNI）

搜尋、追蹤、私訊、通知、Discord Activity、留言附圖、巢狀回覆、粉絲網站式的個人卡片、官方貼文（子專案 B）。

## 資料模型與儲存

照現有 store 的寫法：`InterknotStore` 類別 + `getInterknotStore()`，檔案是 `data/interknot.sqlite`，`journal_mode = WAL`、`busy_timeout = 5000`、`foreign_keys = ON`，用 `CREATE TABLE IF NOT EXISTS` 建表。bot 用 hybrid-sharding 跑多個 process，WAL 讓它們可以同時讀寫同一個檔案。

| 表 | 欄位 | 約束／用途 |
|---|---|---|
| `ik_profiles` | user_id PK, nickname, avatar_id, banned_until, created_at | `nickname` 唯一（不分大小寫） |
| `ik_posts` | id PK, author_id, guild_id, tag, title, body, cover_hash, anonymous, status, created_at, edited_at | `status` ∈ visible / hidden / deleted；在私訊發文時 `guild_id` 為 NULL |
| `ik_comments` | id PK, post_id FK, author_id, floor, body, anonymous, status, created_at | UNIQUE(post_id, floor) |
| `ik_hearts` | post_id, user_id, created_at | PK(post_id, user_id) |
| `ik_reads` | user_id, post_id, read_at | PK(user_id, post_id) |
| `ik_reports` | target_type, target_id, reporter_id, reason, note, created_at | PK(target_type, target_id, reporter_id) |

### 統計數字（直接查表，不存快取欄位）

| 項目 | 規則 |
|---|---|
| 👁 瀏覽數 | 讀過這篇的不重複人數（`ik_reads`） |
| 🔥 熱門 | 瀏覽數 ≥ `HOT_VIEWS`（100）或 ♥ ≥ `HOT_HEARTS`（10） |
| NEW | 發文後 `NEW_WINDOW`（24 小時）內，而且這個人還沒讀過 |
| 已讀 | `ik_reads` 有 (user, post) |
| ♥ 聲望 | 作者所有 visible 貼文收到的 ♥ 總數 |
| [樓主] | 留言者 = 發文者（匿名文也照真實作者判斷，但不揭露身分） |

### 匿名

資料庫仍然存真實的 `author_id`，給審核和封鎖使用；畫面上顯示「匿名」和預設頭像。

### 封面圖片

1. 從 Discord 附件下載：只接受 `image/*`，最大 8MB。
2. 用 `@napi-rs/canvas` 解碼後縮到最寬 1024px，重新編碼成 webp。這一步會去掉 EXIF，格式不對的檔案也會在這裡被擋掉。
3. 以 sha256 為檔名存到 `data/interknot/covers/<hash>.webp`，相同的圖只存一份。
4. 刪文時，如果沒有其他貼文引用這張圖，就刪掉檔案。
5. 不存 Discord 附件網址，因為簽章網址會過期。

### 備份

實作時要確認 Mac 現有的備份流程有包含 `data/interknot.sqlite` 和 `data/interknot/`，沒有就補上。

## Discord 互動流程

### 原則

- 只有一個入口：`/interknot`。開發完成驗收前維持 `developmentOnly: true`。
- **瀏覽訊息是 ephemeral**，只有自己看得到。NEW／已讀是個人狀態，這樣也不會洗版。
- **狀態放在 customId**（`ik:<screen>:<args>`，不超過 100 字元），不放在記憶體裡。因為有多個 cluster，記憶體狀態會不同步，重啟也會消失。現在原型用的 in-memory `Map` 要拿掉。

### 畫面 0：建立身分（第一次使用）

- 訊息：頭像總覽圖（每個頭像有編號）+ `[建立繩網帳號]`。
- modal：暱稱 + 頭像（下拉選單）。完成後進入動態牆。

### 畫面 1：動態牆

```
[▼ 選擇貼文：本頁的文（標題｜作者·👁·♥）]
[▼ 標籤：全部 / 灌水 / 情報 / 求助 / 同人 / 廣告]
[⬆ 上一頁] [⬇ 下一頁] [🌐 全域 ⇄ 🏠 本伺服器] [✏ 發文] [🔄]
[👤 我的繩網]
```

選了一篇就直接開詳情。在私訊裡開的話，「本伺服器」按鈕不顯示。

### 畫面 2：詳情

```
[▼ 展開內文]（被截斷時才出現） [▲ 留言上頁] [▼ 留言下頁]
[💬 留言] [♥ 送心 N] [⚠ 檢舉] [✕ 返回]
[🗑 刪除]（作者本人才看得到；刪留言時會跳出選單選樓層）
```

打開詳情時寫入 `ik_reads`。

### Modal

| Modal | 欄位（上限 5 個） |
|---|---|
| 發文 | 標籤（下拉）、標題（≤ 40 字）、內文（≤ 1000 字）、封面（上傳，選填）、匿名（是／否） |
| 留言 | 內容（≤ 300 字）、匿名（是／否） |
| 檢舉 | 目標（本文或本頁看得到的樓層）、原因（色情／騷擾／洗版廣告／其他）、補充（選填） |
| 我的繩網 | 暱稱、頭像 |

### 審核（先發後審）

- 開發者名單沿用 `contactDev` 的 `CONTACT_DEV_IDS` / `DEVIDS` / `DEVELOPER_ID`，通知用私訊送。
- **每篇新文**都私訊給開發者，附 `[刪除]` `[刪除並封鎖 7 天]` `[永久封鎖]`。
- 同一則內容被 **`REPORT_HIDE_THRESHOLD`（3）個不同的人**檢舉，就自動設為 `hidden`，並私訊通知，附 `[恢復]` `[刪除]` `[封鎖]`。
- 處理按鈕會檢查 `isDeveloper`。
- 被封鎖的人可以瀏覽，但不能發文、留言或送 ♥。

### 頻率限制

| 動作 | 限制 |
|---|---|
| 發文 | 每 5 分鐘 1 篇，每天 10 篇 |
| 留言 | 每 15 秒 1 則 |

都是 `rules.ts` 裡的常數。

## 程式架構

依賴方向由上往下，`rules` / `store` / `customId` / `covers` / renderer 都不 import discord.js。

```
src/commands/slash/zzz/interknot.ts     /interknot 入口
src/events/interknotInteraction.ts      收 ik: 按鈕／選單／modal，交給 actions
src/utilities/interknot/
  actions.ts         各操作的流程（發文、留言、♥、檢舉、刪除、身分）
  moderation.ts      開發者私訊、審核按鈕處理
  views.ts           組畫面 0／1／2 的訊息（圖 + 元件）
  feedRenderer.ts    5 欄動態牆（由 utilities/zzz/interknot.ts 搬過來改）
  detailRenderer.ts  三欄詳情
  setupRenderer.ts   頭像總覽圖
  drawing.ts         圓角矩形、文字截斷、頭像、徽章、配色常數
  store.ts           InterknotStore
  rules.ts           頻率限制、🔥/NEW、欄位驗證、檢舉門檻
  customId.ts        ik: 狀態的編碼／解碼
  covers.ts          封面下載、驗證、縮圖、存檔、清除
```

### 會動到的現有檔案

| 檔案 | 改動 |
|---|---|
| `src/utilities/zzz/interknot.ts` | 刪除（搬到 `interknot/feedRenderer.ts`） |
| `src/events/modal.ts` | 開頭的「交給其他檔案處理」清單加上 `ik:` |
| `src/utilities/contactDev.ts` | export `getDeveloperIds`、`isDeveloper` |
| `src/assets/languages/*.ts` | 7 個語系加上繩網文字 key |
| `tests/interknot.test.ts` | 改指向 `feedRenderer` |

## 錯誤處理

| 狀況 | 處理 |
|---|---|
| 渲染或流程出錯 | `console.warn("[interknot] …")`，用 ephemeral 回「繩網連線失敗，請稍後再試」，不讓互動卡住 |
| 寫入 DB | 發文、留言包在 transaction；DB 失敗時刪掉已經存下的封面檔 |
| 封面不合格 | 告訴使用者原因，貼文不會只送出一半 |
| 樓層衝突 | 撞到 UNIQUE(post_id, floor) 就重試一次 |
| 文章已刪除或隱藏 | 顯示「這篇文已不存在」，帶回動態牆 |
| 被封鎖或超過頻率 | ephemeral 告知要等多久，或封鎖到什麼時候 |
| 非開發者按審核按鈕 | 拒絕 |
| 圖片載入失敗 | 改用預設圖，不讓整張圖失敗 |

## 測試

| 測試檔 | 內容 |
|---|---|
| `interknotStore.test.ts` | 用 `:memory:` 測：發文、樓層連號、♥ 唯一和收回、已讀和瀏覽數、聲望、全域／本伺服器、hidden／deleted 不出現、匿名仍保留 author_id |
| `interknotRules.test.ts` | 頻率限制邊界、🔥/NEW、欄位長度、檢舉門檻 |
| `interknotCustomId.test.ts` | 編碼再解碼要一致；最長情況 ≤ 100 字元 |
| `interknotCovers.test.ts` | 縮圖、轉 webp、EXIF 被移除、非圖片被拒、相同圖只存一份、沒人用的圖被清掉 |
| `interknot.test.ts` | 瀑布流版面 |
| `interknotRenderer.test.ts` | 三張圖用假資料渲染：尺寸正確、不會丟錯 |
| 視覺比對 | 截圖到位後，用 `pixelDifferenceRatio` 對基準圖比對 |

**手動驗收**（`NODE_ENV=dev`）：建立身分 → 發一篇有圖的文 → 換一個帳號留言、送 ♥、檢舉 → 確認開發者私訊有收到，而且按鈕能處理。

## 待辦：截圖量測

卡片寬度、圓角、字級、間距、配色，都要等使用者提供遊戲原生解析度的截圖（動態牆、詳情、NEW／已讀／🔥 卡片、「已無更多評論」）後才能定。在那之前 `drawing.ts` 先用原型的數值，並在程式碼裡標 `shortcut:`。
