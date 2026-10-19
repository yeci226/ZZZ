# 繩網（Inter-Knot）設計：子專案 A — 渲染器 + 使用者發文

日期：2026-10-20
狀態：設計已逐節確認，並依遊戲 3.2 原生截圖修正；待審閱 spec

## 目標

把遊戲內的繩網做成 Discord 上真正可以「聯機」的版本：畫面盡量和遊戲一模一樣，所有使用 bot 的伺服器共用同一個繩網，玩家可以發文、留言、送 ♥。

## 參考資料

| 來源 | 用途 |
|---|---|
| `previews/interknot-reference/feed.png` | 遊戲 3.2 動態牆，1920×1080（已被 gitignore，只放本機） |
| `previews/interknot-reference/detail.png` | 一般貼文詳情 |
| `previews/interknot-reference/detail_story.png` | 劇情貼文詳情（含關鍵字提示列，子專案 B 參考） |
| <https://www.youtube.com/shorts/h-UW5mYw9gw> 0:00–0:27 | 舊版繩網（👁 瀏覽數、已讀標籤）；**以截圖為準，影片只當輔助** |

## 整體拆分

| 子專案 | 內容 | 狀態 |
|---|---|---|
| **A（本文件）** | 動態牆與詳情渲染、使用者發文／留言／♥、身分、審核 | 本 spec |
| B | 官方劇情貼文：資料來源、匯入、詳情底部的兩個回覆選項（選了會變成自己的留言）、關鍵字提示列 | 另開 spec；版面沿用 A 的三欄詳情 |

## 遊戲畫面觀察（3.2 截圖）

### 動態牆

- **頂部左側**：紅色返回鍵、玩家資訊條（圓形頭像、名稱、等級、MAX 進度條）。
- **頂部右側**有兩排頁籤：
  - 主頁籤：推播／情報板／行程。
  - 子頁籤：全部／Fairy精選／求助資訊。
  - 選中的頁籤是黃色斜角塊；頁籤上可以掛斜體黃字「NEW!」。
- **背景**：黑底，上面有斜向的大型 INTER-KNOT 字樣紋理。
- **5 欄瀑布流**。每張卡片是 `#222222` 底，外圍有 5px 黑框；左上、右上、左下是圓角，右下是直角。
- **封面**：
  - 左上角可能有藍色膠囊標籤，例如「◎ Fairy精選」「繩網委託」。
  - 新文在卡片右上角外側有斜體黃字「NEW!」（`#ffff02`）。
- **封面下方**：
  - 圓形頭像壓在封面底邊上，右側是作者名。
  - 作者名是白色；推測已讀的文會變灰色。
  - 名字下方有 3px 分隔線（`#353535`）。
  - 再下面是 `[標籤]` 標題（`#dadada`，粗體，最多 2 行），最後是一行摘要（`#8f8f8d`，結尾 `…`）。
- `[委託]` 類的標題前面有一個「!」圖示。
- **3.2 版沒有** 👁 瀏覽數、🔥 熱門和「已讀」標籤，那些是舊版才有的。

### 詳情

- 彈窗蓋在模糊的動態牆上方，彈窗本身是深色面板，有斜線紋理。
- **標頭**：
  - 左邊是圓形頭像、灰色作者名，下面一個 `♥393` 灰色膠囊（作者聲望）。
  - 右上角是紅色斜角 ✕ 按鈕（`#c32607`）。
- **三欄**：
  - 第一欄是封面框，封面上一樣可能有標籤。
  - 第二欄是標題（白色粗體）和內文（`#b4b4b4`）。
  - 第三欄是留言串：每則有頭像、灰色暱稱、右側灰色「1 F」膠囊、內文，留言之間有分隔線，可以捲動的話底部有 ▼。
- **劇情文**的留言欄底部有兩個回覆選項（深色膠囊、斜體白字）；三欄上方可能還有一條關鍵字提示列。這兩個都屬於子專案 B。

## 範圍

### 包含

| 功能 | 說明 |
|---|---|
| 動態牆 | 照截圖畫：玩家資訊條、兩排頁籤、5 欄瀑布流、卡片元素 |
| 玩家資訊條 | 自己的繩網頭像和暱稱；遊戲裡等級的位置改顯示 ♥ 聲望；不畫返回鍵 |
| 主頁籤 | **推播**（全域）／**本伺服器**／**我的**（自己發的文） |
| 子頁籤 | **全部**／**Fairy精選**（開發者標記的精選文）／**求助資訊**（`[求助]` 標籤） |
| 卡片標籤 | 精選文顯示「◎ Fairy精選」藍色膠囊。「繩網委託」是遊戲的委託系統，不做 |
| NEW! | 發文後 24 小時內，而且這個人還沒讀過 |
| 已讀 | 作者名改成灰色 |
| 回到牆 | 剛看過的那張卡片加黃色外框 |
| 詳情 | 三欄；使用者文沒有回覆選項，留言欄延伸到底；內文太長或留言太多時分頁 |
| 發文 | modal：標籤、標題、內文、封面（選填，1 張）、匿名 |
| 標籤 | `[灌水]` `[情報]` `[求助]` `[同人]` `[廣告]`，顯示在標題前面 |
| 留言 | modal：內容、匿名；樓層自動編號 |
| ♥ 與聲望 | 每人每篇最多送一次，可以收回，不能送給自己；聲望 = 作者收到的 ♥ 總數 |
| 身分 | 繩網暱稱（不可重複）+ 繩網頭像（IconInterKnot 系列） |
| 刪除 | 作者可刪除自己的文和留言 |
| 審核 | 先發後審、檢舉、自動隱藏、開發者私訊處理、封鎖、頻率限制 |
| 多語系 | 按鈕文字和圖上的固定文字走 `tr()`，7 個語系都要有 |

### 不包含（YAGNI）

👁 瀏覽數和 🔥 熱門（3.2 已移除）、搜尋、追蹤、私訊、通知、Discord Activity、留言附圖、巢狀回覆、粉絲網站式的個人卡片、繩網委託、返回鍵、官方貼文（子專案 B）。

## 資料模型與儲存

照現有 store 的寫法：`InterknotStore` 類別 + `getInterknotStore()`，檔案是 `data/interknot.sqlite`，`journal_mode = WAL`、`busy_timeout = 5000`、`foreign_keys = ON`，用 `CREATE TABLE IF NOT EXISTS` 建表。bot 用 hybrid-sharding 跑多個 process，WAL 讓它們可以同時讀寫同一個檔案。

| 表 | 欄位 | 約束／用途 |
|---|---|---|
| `ik_profiles` | user_id PK, nickname, avatar_id, banned_until, created_at | `nickname` 唯一（不分大小寫） |
| `ik_posts` | id PK, author_id, guild_id, tag, title, body, cover_hash, anonymous, featured, status, created_at, edited_at | `status` ∈ visible / hidden / deleted；`featured` 由開發者設定；在私訊發文時 `guild_id` 為 NULL |
| `ik_comments` | id PK, post_id FK, author_id, floor, body, anonymous, status, created_at | UNIQUE(post_id, floor) |
| `ik_hearts` | post_id, user_id, created_at | PK(post_id, user_id) |
| `ik_reads` | user_id, post_id, read_at | PK(user_id, post_id) |
| `ik_reports` | target_type, target_id, reporter_id, reason, note, created_at | PK(target_type, target_id, reporter_id) |

### 衍生狀態（直接查表，不存快取欄位）

| 項目 | 規則 |
|---|---|
| NEW! | 發文後 `NEW_WINDOW`（24 小時）內，而且 `ik_reads` 沒有 (user, post) |
| 已讀（作者名變灰） | `ik_reads` 有 (user, post) |
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

圖上的頁籤標示目前狀態；按鈕和圖上的頁籤一一對應。

```
[▼ 選擇貼文：本頁的文（[標籤]標題｜作者·♥）]
[推播] [本伺服器] [我的]              ← 主頁籤，選中的用 Primary 樣式
[全部] [Fairy精選] [求助資訊]         ← 子頁籤
[⬆ 上一頁] [⬇ 下一頁] [✏ 發文] [🔄] [👤 我的繩網]
```

- 選了一篇就直接開詳情。
- 在私訊裡開的話，`[本伺服器]` 按鈕停用。

### 畫面 2：詳情

```
[▼ 展開內文]（被截斷時才出現） [▲ 留言上頁] [▼ 留言下頁]
[💬 留言] [♥ 送心 N] [⚠ 檢舉] [✕ 返回]
[🗑 刪除]（作者本人才看得到） [★ 精選]（開發者才看得到）
```

- 打開詳情時寫入 `ik_reads`。
- 作者刪留言時會跳出選單選樓層。

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
- 處理按鈕和 `[★ 精選]` 都會檢查 `isDeveloper`。
- 被封鎖的人可以瀏覽，但不能發文、留言或送 ♥。

### 頻率限制

| 動作 | 限制 |
|---|---|
| 發文 | 每 5 分鐘 1 篇，每天 10 篇 |
| 留言 | 每 15 秒 1 則 |

都是 `rules.ts` 裡的常數。

## 版面規格（1920×1080，依 3.2 截圖量測）

### 動態牆

| 項目 | 數值 |
|---|---|
| 卡片外框寬 | 320px（含 5px 黑框；內容 310px） |
| 欄位 x（外框左緣） | 93、446、800、1154、1507 |
| 欄距／列距 | 33～34px／26px |
| 第一列卡片頂端 | y = 208 |
| 卡片底色 | `#222222` |
| 標題 | `#dadada` 粗體，約 24px，最多 2 行 |
| 摘要 | `#8f8f8d`，約 20px，1 行 |
| 分隔線 | `#353535`，3px |
| NEW! | `#ffff02` 斜體，卡片右上角外側 |
| 選中頁籤 | `#f6db00` |

### 詳情

| 項目 | 數值 |
|---|---|
| 面板 | x 258–1662，y 170–905 |
| 標頭頭像 | 中心約 (338, 230)，直徑約 76 |
| ✕ 按鈕 | 約 x 1545–1632，y 205–260，`#c32607` |
| 封面框 | 約 x 315–728 |
| 標題／內文欄 | 約 x 752–1070；標題 `#ffffff`，內文 `#b4b4b4` |
| 留言欄 | 約 x 1110–1620；暱稱 `#959595`，內文 `#989898`，樓層膠囊 `#60605f` |

上面的字級和座標是從截圖量出的近似值。實作時把參考圖疊在自己的渲染結果上校正，數值集中寫在 `drawing.ts` 的常數。

## 程式架構

依賴方向由上往下，`rules` / `store` / `customId` / `covers` / renderer 都不 import discord.js。

```
src/commands/slash/zzz/interknot.ts     /interknot 入口
src/events/interknotInteraction.ts      收 ik: 按鈕／選單／modal，交給 actions
src/utilities/interknot/
  actions.ts         各操作的流程（發文、留言、♥、檢舉、刪除、精選、身分）
  moderation.ts      開發者私訊、審核按鈕處理
  views.ts           組畫面 0／1／2 的訊息（圖 + 元件）
  feedRenderer.ts    動態牆（由 utilities/zzz/interknot.ts 搬過來改）
  detailRenderer.ts  三欄詳情
  setupRenderer.ts   頭像總覽圖
  drawing.ts         圓角矩形、文字截斷、頭像、徽章、頁籤、版面與配色常數
  store.ts           InterknotStore
  rules.ts           頻率限制、NEW、欄位驗證、檢舉門檻
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
| 非開發者按審核或精選按鈕 | 拒絕 |
| 圖片載入失敗 | 改用預設圖，不讓整張圖失敗 |

## 測試

| 測試檔 | 內容 |
|---|---|
| `interknotStore.test.ts` | 用 `:memory:` 測：發文、樓層連號、♥ 唯一和收回、已讀、聲望、推播／本伺服器／我的、Fairy精選／求助篩選、hidden／deleted 不出現、匿名仍保留 author_id |
| `interknotRules.test.ts` | 頻率限制邊界、NEW 視窗、欄位長度、檢舉門檻 |
| `interknotCustomId.test.ts` | 編碼再解碼要一致；最長情況 ≤ 100 字元 |
| `interknotCovers.test.ts` | 縮圖、轉 webp、EXIF 被移除、非圖片被拒、相同圖只存一份、沒人用的圖被清掉 |
| `interknot.test.ts` | 瀑布流版面（欄位 x 和第一列 y 要符合量測值） |
| `interknotRenderer.test.ts` | 三張圖用假資料渲染：尺寸 1920×1080、不會丟錯 |
| 視覺比對 | 第一版通過人工比對參考圖後，存成基準圖，再用 `pixelDifferenceRatio` 防止版面跑掉 |

**手動驗收**（`NODE_ENV=dev`）：建立身分 → 發一篇有圖的文 → 換一個帳號留言、送 ♥、檢舉 → 確認開發者私訊有收到、按鈕能處理、精選後會出現在 Fairy精選頁籤。
