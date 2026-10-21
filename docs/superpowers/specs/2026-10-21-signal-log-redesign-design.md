# 抽卡紀錄圖（Signal Log）重新設計

日期：2026-10-21
狀態：設計已確認，待寫實作計畫

## 目標

重做 `/調頻` 抽卡紀錄圖，解決三件事：

1. 外觀沒有特色：改成與預設 profile 角色資料圖（formal 樣式）同一系列的視覺。
2. 資訊密度和可讀性不佳：總覽改成直式緊湊版，重點數據放大。
3. 完整紀錄圖不好用：改成「保底週期條」，一眼看出出金和出紫的位置。這個 view 目前沒有接進 Discord UI，要一起接上。

成功標準：截圖一看就認得是本 bot 的系列圖。總覽一頁能看到關鍵數據和 10 個 S，週期圖一頁能看到 10 次出金各在第幾抽、有沒有歪、期間的 A 出在哪。

## 不做的事

- 不保留舊樣式，也不加新舊切換設定。
- 不改 `analyzeGachaRecords` 和統計口徑，不新增統計指標。
- 不重構 `profileCharacterFormal.ts`，只補一個 export。

## 架構

`renderSignalLog(input: SignalLogRenderInput): Promise<Buffer>` 的介面不變，`signalLogView.ts` 照舊呼叫它。

`src/utilities/zzz/signalLogRenderer.ts`（約 980 行）拆成：

| 檔案 | 職責 |
|---|---|
| `signalLogRenderer.ts` | 入口 `renderSignalLog`，依 `view` 分派；保留測試用的 `__signalLogRendererInternals` |
| `signalLogPaper.ts` | 共用元素：畫布建立、紙底、立繪橫幅、半透明卡片、文字工具（`fitWithFont`、`wrapNameLines` 等移過來）、物品小方塊（沿用 `prepareGtCard`/`loadSquareItemImage`） |
| `signalLogOverview.ts` | 總覽 view |
| `signalLogCycles.ts` | 週期 view 與純函式 `buildPityCycles` |

外部依賴（全部是現有程式碼）：
- `canvasFonts.ts`：`ensureZzzCanvasFonts`、`getZzzCanvasFont`，數字用 Nunito（與 formal 相同）。
- `profileColors.ts`：`getPaperAccent`。
- `profileCharacterFormal.ts`：把 `safeAccent`（屬性色表）改成 export，邏輯不變。

## 視覺規格

### 共用

- 寬 1000，輸出 2 倍解析度（`OUTPUT_SCALE = 2`）。
- 紙底 `#f4eee7`，亮紙 `#fbf7f0`，墨色 `#171719`，次要文字 `#817a75`，與 formal 的 `C` 色票一致。
- accent 色：取 UP 物品的 `elementType` 套 `safeAccent`，再經 `getPaperAccent` 轉成紙上可讀色。沒有 UP 物品時用 formal 預設 accent `#de493e`。
- 稀有度色：S 橘 `#f08a24`、A 紫 `#8d55bb`、B 淡紙色 `#e8e1d7`。「歪」標籤是紅底白字 `#de493e`。
- 抽數顏色沿用現有的 `progressColor(position, hardPity)`。

### 立繪橫幅（兩個 view 共用，高度不同）

- 左側是 accent 斜切色塊（形狀同 formal 的 `polygon` 斜切），立繪出血覆蓋其上。
- 左下是粗黑標題，標題規則沿用現有 `drawHeader`：UP 名稱 → 池名 → `bannerLabel`。後面接斜體副標「版本 · 頻道名」，下緣是 accent 色帶。
- 右上是半透明白卡，放玩家名、UID、更新時間。`stale` 時更新時間顯示同步失敗字樣並用紅字。
- 橫幅圖來源依池型：

| 池型 | 橫幅圖 |
|---|---|
| 角色池（`character_up`/`character_return`） | UP 角色 `src/assets/gacha-simulation/ui/characters/{id}.png` |
| 音擎池（`weapon_up`/`weapon_return`） | UP 音擎 `src/assets/images/icons/gacha/weapon-big/{id}.webp` |
| 邦布池 | `input.headerItem`（最新 S 邦布）的邦布圖 |
| 常駐池 | 最近一次 S 角色的立繪（同上路徑） |
| 上列來源缺席或檔案不存在（任何池型，含「全部紀錄」沒有 UP 資料時） | 最近一次 S 角色的立繪 |
| 以上都沒有 | 純紙底加 accent 斜切色塊，不放圖 |

### 總覽 view（由上到下）

1. 立繪橫幅，高約 300。
2. 資源列：菲林、加密母帶、母帶、邦布券的圖示和數量，只有在 `source === "official"` 且 `details.tickets` 有資料時才畫。圖示沿用現有資源。
3. 數據列 5 格：總抽數、平均出金、平均 UP、不歪率、目前墊抽。
   - 目前墊抽那格用 accent 外框，附 `currentPity / hardPity` 進度條。`nextGuaranteed` 為真時加「大保底」字樣。
   - 只在第 1 頁顯示目前墊抽格（沿用現行行為），其他頁那格留空。
   - 不適用的指標顯示「—」，判斷沿用現有 `statsEntries`。
4. 區段標題「S 級紀錄 N 個 · 新→舊」。右側一排「頭像 ×N」本池 S 統計，資料沿用 `sItemCounts`，UP 物品排前面。
5. S 清單 2 欄 × 5 列，每頁 10 個（`summary.sRecords` 分頁）。每個 S 顯示物品小方塊、名稱、`isUp === false` 時的「歪」標籤、`pityPosition / hardPity` 進度條、抽數。
6. 頁尾「第 x / y 頁」。
7. 沒有 S 時，清單區顯示空狀態文字。

### 週期 view（保底週期條）

1. 立繪橫幅，高約 150。
2. 區段標題「保底週期 · 新→舊」，右側是圖例（■S ■A ■B）。
3. 每頁 10 列，一列一個週期：
   - 左側：結尾 S 的物品小方塊。墊抽中的週期改成 accent 虛線框加「?」。
   - 中間：進度軌，格數等於 `summary.hardPity`（角色池 90，音擎和邦布池 80）。第 1 至 `length` 格依該抽稀有度上色（B 淡紙色、A 紫、S 橘），墊抽中的格子用 accent 色，超過 `length` 的格子留白。
   - 右側：抽數（`progressColor` 上色），歪時加「歪」標籤。
   - 不完整的週期在抽數前加「~」。
4. 頁尾「第 x / y 頁」。
5. 沒有任何紀錄時只顯示空狀態文字。

## 資料

### `buildPityCycles(summary: GachaSummary, pityEstimated?: boolean): PityCycle[]`

```ts
interface PityCycle {
  length: number;            // 本週期抽數（墊抽中 = 目前已墊）
  aPositions: number[];      // 期間 A 出在第幾抽（1 起算）
  sRecord: AnalyzedGachaRecord | null; // 結尾 S；null = 墊抽中
  lost: boolean;             // sRecord?.isUp === false
  partial: boolean;          // 最舊週期且開頭不在紀錄內（pityEstimated 或第一筆不是第 1 抽）
}
```

- 輸入是 `summary.records`（新→舊），輸出依新→舊排序，墊抽中的週期如果有的話放第一個。
- 只依每筆紀錄的稀有度和順序切段，不重算保底。`length` 對結尾 S 使用其 `pityPosition`；墊抽中的週期使用 `summary.currentPity`。兩者為 null 時才退回用實際筆數。
- 純函式，不讀檔、不呼叫 API。

## Discord 串接（`signalLogView.ts`）

- `SignalLogSession` 加 `view: "overview" | "records"`，預設 `"overview"`。
- 頁數依 view 計算（取代目前 `signalLogView.ts:248` 寫死的 `sRecords / 10`）：
  - overview：`ceil(sRecords.length / 10)`
  - records：`ceil(buildPityCycles(summary).length / 10)`
  - 兩者最少 1 頁，`session.page` 照舊 clamp。
- `controls()` 第 3 列加第 5 個按鈕，customId `glog-view:${token}`。按鈕文字在 overview 時是「完整紀錄」，在 records 時是「總覽」。
- handler 的 if 鏈加分支：切換 `session.view`，`session.page = 0`。
- 切換池型或池子時保留目前的 view。
- 持久化：`gachaArchive.ts` 的 `signal_log_sessions` 照現有 `ALTER TABLE ... ADD COLUMN` 模式加 `view TEXT NOT NULL DEFAULT 'overview'`。`saveSignalLogSession` 和 `getSignalLogSession` 各補該欄位，不合法的值當作 `"overview"`。
- 路由：`selectMenu.ts:184` 已把 `glog-` 前綴導向 signal log handler，不需要改。

## 多語系

在 `recordText.ts` 補新文字：`SIGNAL_EN` 是英文和後備，`SIGNAL` 表涵蓋 tw、cn、jp、kr、fr、vi，合計 7 種語言。新增的鍵：
- `viewRecords`（完整紀錄）
- `pityCycles`（保底週期）、`legendS` / `legendA` / `legendB`
- `pageOf`（第 x / y 頁）
- `bigGuarantee`（大保底）、`lost`（歪）

直接沿用的現有鍵：`overview`（返回總覽，作為切回總覽的按鈕文字）、`sRecords`、`total`、`averageS`、`averageUp`、`winRate`、`currentPity`、`estimated`、`polychrome`、`encrypted`、`original`、`boopon`、`noS`、`noRecords`、`syncFailed`、`updatedAt`。

新版不再使用的舊字串（`perPage10`，以及只有舊格子圖用到的 `dateRange`、`page`）從 `SignalText` 型別和所有語言刪除。刪除前先 grep 確認沒有其他使用者。

## 錯誤處理

- 任何圖片載入失敗都回 `null`，依上面的退回順序處理，最後退到純紙底或「?」佔位，renderer 不因缺圖丟錯（同現有 `remoteImage`）。
- 文字過長時沿用 `fitWithFont` 縮小、`wrapNameLines` 換行，不超出卡片。
- 空資料有明確的空狀態畫面，不會產生 0 高度或 NaN 尺寸。

## 測試

- `tests/signalLogRenderer.test.ts` 改寫，刪除 5×4 格子相關測試，新增：
  - 總覽：官方來源有資源列、手動沒有；第 2 頁不畫目前墊抽格；常駐池的平均 UP 和不歪率顯示「—」；橫幅缺圖時退回純紙底且不丟錯；輸出尺寸是寬 1000 × `OUTPUT_SCALE`。
  - 週期圖：80 抽池的進度軌格數；空資料可渲染。
- 新增 `buildPityCycles` 單元測試：一般切段、墊抽中的週期在首位、A 位置、`lost`、`partial`（`pityEstimated` 與第一筆不是第 1 抽）、80 抽池。
- `tests/signalLogPagination.test.ts`：依 view 計算頁數、切換 view 時頁碼歸 0。
- `gachaArchive` 測試：舊 session（無 `view` 欄）讀出來是 `"overview"`；存取 `view` 來回一致。
- 視覺回歸：`previews/signal-log-design/render-previews.ts` 改成輸出 `官方限定總覽.png`、`手動匯入總覽.png`、`保底週期.png`，`tests/zzzOfficialVisualRegression.test.ts` 的檔名同步更新。目前該資料夾沒有 baseline PNG，實作完成後重新產生，經使用者看過才定案。
