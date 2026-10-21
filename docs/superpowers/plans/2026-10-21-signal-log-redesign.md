# 抽卡紀錄圖重新設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/調頻` 抽卡紀錄圖改成 formal profile 系列的直式總覽，新增「保底週期條」完整紀錄 view，並在 Discord 加上切換按鈕。

**Architecture:** `renderSignalLog(input)` 介面不變，依 `input.view` 分派到 `signalLogOverview.ts` 或 `signalLogCycles.ts`；共用畫布、橫幅與文字工具放在 `signalLogPaper.ts`。週期資料由純函式 `buildPityCycles(summary)` 從現有 `GachaSummary` 轉出。`signalLogView.ts` 的 session 新增 `view` 欄位（存進 SQLite），頁數依 view 計算。

**Tech Stack:** TypeScript (ESM)、`@napi-rs/canvas`、discord.js、better-sqlite3、Jest。

**Spec:** `docs/superpowers/specs/2026-10-21-signal-log-redesign-design.md`

## Global Constraints

- 畫布寬 1000，`OUTPUT_SCALE = 2`（輸出 PNG 寬 2000）。
- 色票：紙底 `#f4eee7`、亮紙 `#fbf7f0`、墨 `#171719`、次要 `#817a75`；S `#f08a24`、A `#8d55bb`、B `#e8e1d7`；「歪」紅底白字 `#de493e`；無 UP 時 accent 預設 `#de493e`。
- 數字字型 Nunito（`getZzzCanvasFont` / formal 同源）；中日韓文字用 `getZzzOfficialFont(locale)`。
- 抽數顏色一律用既有 `progressColor(position, hardPity)`。
- 每頁 10 筆：總覽 10 個 S（2 欄 × 5 列），週期圖 10 個週期。
- 圖片載入失敗一律回 `null` 並退回下一個來源，最後是純紙底或「?」佔位；renderer 不因缺圖丟錯。
- 不改 `analyzeGachaRecords`；`profileCharacterFormal.ts` 只把 `safeAccent` 改成 export。
- 7 種語言：`SIGNAL_EN`（英文兼後備）+ `SIGNAL` 的 tw、cn、jp、kr、fr、vi。
- 單檔測試指令：`npx jest <path> --runInBand`；型別檢查：`npx tsc --noEmit`。

## Review Focus

1. **「全部紀錄」角色池沒有 UP 資料**（`input.banner` 為 undefined，這是預設畫面）：使用者預期仍看到立繪，而不是空白紙底 → 橫幅來源在 UP 圖缺席時，對所有池型都退回「最近一次 S 角色立繪」，最後才純紙底。測試在 Task 4。
2. **新角色還沒有本地立繪**（`ui/characters/{id}.png` 不存在）：不丟錯，退回下一個來源。測試在 Task 4。
3. **週期長度超過 `hardPity`**（手動匯入推算的 `pityPosition` 異常，例如 95）：進度軌只畫 `hardPity` 格且不溢出，右側數字照實顯示。測試在 Task 1（資料）與 Task 6（渲染不丟錯）。
4. **切換 view 後舊頁碼超出範圍**（總覽第 3 頁切到週期圖、或資料庫留下的舊頁碼）：頁碼歸 0 並 clamp。測試在 Task 2。
5. **超長名稱**（多個 UP 合併標題、長玩家名、法文/越南文標籤）：文字縮字或換行，不壓到相鄰卡片。測試在 Task 5（`fitWithFont` 寬度斷言）。

---

## 檔案結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `src/utilities/zzz/signalLogCycles.ts` | 新增 | `PityCycle`、`buildPityCycles`、`renderSignalCycles` |
| `src/utilities/zzz/signalLogPaper.ts` | 新增 | 畫布、紙底、橫幅、卡片、文字工具、物品小方塊、accent 與橫幅圖來源 |
| `src/utilities/zzz/signalLogOverview.ts` | 新增 | `renderSignalOverview` |
| `src/utilities/zzz/signalLogRenderer.ts` | 改寫 | 只剩 `SignalLogRenderInput`、`renderSignalLog` 分派、`__signalLogRendererInternals` |
| `src/utilities/zzz/signalLogPagination.ts` | 修改 | 加 `signalLogPageCount`、`switchSignalLogView` |
| `src/utilities/zzz/gachaArchive.ts` | 修改 | session 的 `view` 欄位與 migration |
| `src/utilities/zzz/signalLogView.ts` | 修改 | session `view`、切換按鈕、頁數 |
| `src/utilities/zzz/recordText.ts` | 修改 | 新增/刪除文字 |
| `src/utilities/zzz/profileCharacterFormal.ts` | 修改 | `export function safeAccent` |
| `previews/signal-log-design/render-previews.ts` | 修改 | 輸出三張新圖 |
| `tests/zzzOfficialVisualRegression.test.ts` | 修改 | 新檔名 |

---

### Task 1: 週期資料 `buildPityCycles`

**Files:**
- Create: `src/utilities/zzz/signalLogCycles.ts`
- Test: `tests/signalLogCycles.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PityCycle {
    length: number;
    aPositions: number[];          // 1 起算，升冪
    sRecord: AnalyzedGachaRecord | null; // null = 墊抽中
    lost: boolean;                 // sRecord?.isUp === false
    partial: boolean;
  }
  export function buildPityCycles(summary: GachaSummary, pityEstimated?: boolean): PityCycle[];
  ```

演算法（`summary.records` 是新→舊）：從舊往新走，遇到 S 就結束當前週期。每個週期內第 i 筆（舊→新，1 起算）是 A 時記入 `aPositions`。結尾 S 的 `length` 取 `sRecord.pityPosition ?? 實際筆數`；最後一段沒有 S 且筆數 > 0 時是墊抽中週期，`length = summary.currentPity ?? 實際筆數`。最舊週期在 `pityEstimated` 為真，或其 `length` 大於實際筆數（表示開頭在紀錄之外）時標 `partial`。回傳新→舊，墊抽中週期在第 0 個。

- [ ] **Step 1: Write the failing tests**

在 `tests/signalLogCycles.test.ts` 寫一個 helper `rec(rank: "S"|"A"|"B", extra?: Partial<AnalyzedGachaRecord>)` 產生最小 `AnalyzedGachaRecord`，`summary(records新→舊, extra?)` 產生 `GachaSummary`（`hardPity: 90`）。測試：

```ts
it("splits records at each S and returns newest first with the in-progress cycle on top", () => {
  // 舊→新: B,A,S(pity 3) | B,B,A,B,S(pity 5, isUp false) | B,A (current 2)
  const cycles = buildPityCycles(summary(newestFirst, { currentPity: 2 }));
  expect(cycles.map(c => c.length)).toEqual([2, 5, 3]);
  expect(cycles[0].sRecord).toBeNull();
  expect(cycles[0].aPositions).toEqual([2]);
  expect(cycles[1]).toMatchObject({ aPositions: [3], lost: true });
  expect(cycles[2]).toMatchObject({ aPositions: [2], lost: false, partial: false });
});
it("has no in-progress cycle when the newest record is an S", () => { /* cycles[0].sRecord !== null */ });
it("marks the oldest cycle partial when pity is estimated", () => {
  expect(buildPityCycles(s, true).at(-1)!.partial).toBe(true);
});
it("marks the oldest cycle partial when its S pityPosition exceeds the records present", () => {
  // 舊→新: B,S(pityPosition 40) → partial true, length 40
});
it("keeps an out-of-range pityPosition as the cycle length", () => {
  // S pityPosition 95 on hardPity 90 → length 95（渲染端負責截斷）
});
it("returns an empty list for an empty summary", () => { expect(buildPityCycles(summary([]))).toEqual([]); });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/signalLogCycles.test.ts --runInBand`
Expected: FAIL，`Cannot find module '../src/utilities/zzz/signalLogCycles.js'`

- [ ] **Step 3: Implement `buildPityCycles` in `src/utilities/zzz/signalLogCycles.ts`**（依上方演算法，純函式，只 import 型別）

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/signalLogCycles.test.ts --runInBand`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogCycles.ts tests/signalLogCycles.test.ts
git commit -m "feat(gacha): derive pity cycles from signal log summary"
```

---

### Task 2: 依 view 分頁與切換

**Files:**
- Modify: `src/utilities/zzz/signalLogPagination.ts`
- Test: `tests/signalLogPagination.test.ts`

**Interfaces:**
- Consumes: `buildPityCycles`（Task 1）
- Produces:
  ```ts
  export type SignalLogView = "overview" | "records";
  export const SIGNAL_LOG_PAGE_SIZE = 10;
  export function signalLogPageCount(summary: GachaSummary, view: SignalLogView, pityEstimated?: boolean): number; // 最少 1
  export function switchSignalLogView(view: SignalLogView): { view: SignalLogView; page: 0 };
  export function normalizeSignalLogView(value: unknown): SignalLogView; // 非 "records" 一律 "overview"
  ```

- [ ] **Step 1: Write the failing tests**（加在既有檔案新的 `describe("signal log view pages")`）

```ts
it("counts overview pages from S records and cycle pages from pity cycles", () => {
  // 11 個 S + 墊抽中 3 抽
  expect(signalLogPageCount(s, "overview")).toBe(2);   // ceil(11/10)
  expect(signalLogPageCount(s, "records")).toBe(2);    // ceil(12/10)
  // 正好 10 個 S + 墊抽中
  expect(signalLogPageCount(s10, "overview")).toBe(1);
  expect(signalLogPageCount(s10, "records")).toBe(2);
});
it("never returns fewer than one page", () => {
  expect(signalLogPageCount(empty, "overview")).toBe(1);
  expect(signalLogPageCount(empty, "records")).toBe(1);
});
it("switches view and resets the page to zero", () => {
  expect(switchSignalLogView("overview")).toEqual({ view: "records", page: 0 });
  expect(switchSignalLogView("records")).toEqual({ view: "overview", page: 0 });
});
it("normalizes unknown persisted views to overview", () => {
  expect(normalizeSignalLogView("records")).toBe("records");
  expect(normalizeSignalLogView("grid")).toBe("overview");
  expect(normalizeSignalLogView(null)).toBe("overview");
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest tests/signalLogPagination.test.ts --runInBand`，Expected: FAIL（函式未 export）
- [ ] **Step 3: Implement the four exports in `signalLogPagination.ts`**
- [ ] **Step 4: Run to verify pass** — 同上指令，Expected: PASS（原 3 + 新 4）
- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogPagination.ts tests/signalLogPagination.test.ts
git commit -m "feat(gacha): page signal log by view"
```

---

### Task 3: session 保存 `view`

**Files:**
- Modify: `src/utilities/zzz/gachaArchive.ts`（`PersistedSignalLogSession` 約 103 行、migration 約 308 行、`saveSignalLogSession` 約 837 行、`getSignalLogSession` 約 882 行）
- Test: `tests/gachaArchive.test.ts`

**Interfaces:**
- Consumes: `SignalLogView`、`normalizeSignalLogView`（Task 2）
- Produces: `PersistedSignalLogSession.view?: SignalLogView`（存檔時缺省寫 `"overview"`，讀檔時一律有值）

- [ ] **Step 1: Write the failing tests**

在既有 durable session 測試旁新增：

```ts
it("persists the signal log view and defaults legacy rows to overview", () => {
  // 存 view: "records" → 重開 store 讀回 view === "records"
  // 存時不帶 view → 讀回 "overview"
  // 用 db 直接 UPDATE signal_log_sessions SET view = 'bogus' → 讀回 "overview"
});
it("adds the view column to an existing signal_log_sessions table", () => {
  // 先用 better-sqlite3 建出不含 view 欄的舊表（欄位照現行 CREATE TABLE），
  // 插入一列後用 GachaArchiveStore 開啟 → getSignalLogSession 回傳 view === "overview"
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest tests/gachaArchive.test.ts --runInBand`，Expected: FAIL（`view` undefined / no such column）
- [ ] **Step 3: Implement**：`CREATE TABLE signal_log_sessions` 加 `view TEXT NOT NULL DEFAULT 'overview'`；照 `gacha_records` 的 `tableColumns` 模式對 `signal_log_sessions` 補 `ALTER TABLE ... ADD COLUMN view TEXT NOT NULL DEFAULT 'overview'`；INSERT / ON CONFLICT / run 參數加 `view`；讀取用 `normalizeSignalLogView(row.view)`。
- [ ] **Step 4: Run to verify pass** — 同上，Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/gachaArchive.ts tests/gachaArchive.test.ts
git commit -m "feat(gacha): persist signal log view"
```

---

### Task 4: 共用紙底元件 `signalLogPaper.ts`

**Files:**
- Create: `src/utilities/zzz/signalLogPaper.ts`
- Modify: `src/utilities/zzz/profileCharacterFormal.ts:297`（`function safeAccent` → `export function safeAccent`）
- Modify: `src/utilities/zzz/signalLogRenderer.ts`（把下列文字、圖片、資料 helper 移出並改 import；舊畫法暫時保留，**舊 renderer 繼續用自己的 `WIDTH = 1044` 與 `createScaledCanvas`**，直到 Task 5/6 刪除）
- Test: `tests/signalLogPaper.test.ts`

**Interfaces:**
- Consumes: `SignalLogRenderInput`（type-only import from `signalLogRenderer.ts`）、`safeAccent`、`getPaperAccent`
- Produces（全部 export）：
  ```ts
  export const WIDTH = 1000, OUTPUT_SCALE = 2;
  export const PAPER: { paper; paperBright; ink; muted; s; a; b; lost; defaultAccent }; // Global Constraints 的色值
  export function createScaledCanvas(height: number): { canvas: Canvas; ctx: SKRSContext2D };
  export function drawPaper(ctx, height: number): void;
  export function drawGlassCard(ctx, x, y, w, h, options?: { border?: string; radius?: number }): void;
  export function text(...); fitWithFont(...); wrapNameLines(...); wrappedName(...); drawWrappedName(...); fittedNumberSize(...); // 從 signalLogRenderer.ts 原樣搬移
  export function progressColor(position: number | null, hardPity: number): string; // 原樣搬移
  export function formatDate(...); remoteImage(...); loadSquareItemImage(...); prepareGtCard(...); gtCardKind(...); gtCardSource(...); bannerUpItems(...); // 原樣搬移
  export function signalAccent(input: SignalLogRenderInput): string;
  export async function resolveHeroArt(input: SignalLogRenderInput): Promise<Image | null>;
  export async function drawHeroBanner(ctx, input: SignalLogRenderInput, height: number, subtitle: string): Promise<void>;
  ```

`signalAccent`：第一個 UP 物品有 `elementType` 時 `getPaperAccent(safeAccent(undefined, elementType))`，否則 `PAPER.defaultAccent`。

`resolveHeroArt` 依序嘗試，第一個成功載入的勝出：
1. 角色池（`character_up`/`character_return`）：UP 角色 `src/assets/gacha-simulation/ui/characters/{id}.png`
2. 音擎池：`src/assets/images/icons/gacha/weapon-big/{id}.webp`
3. 邦布池：`input.headerItem` 的 `resolveGachaBangbooIcon(id)`
4. 任何池型：`summary.sRecords` 中最新一個角色（`gtCardKind === "character"`）的 `ui/characters/{id}.png`
5. `null`

檔案用 `existsSync` 先檢查再 `safeGtCardImage` 載入。

`drawHeroBanner`：accent 斜切多邊形 `[[0,0],[W*0.68,0],[W*0.6,h],[0,h]]`、立繪 cover 填滿右 3/4 並淡入、左下標題（沿用舊 `drawHeader` 的 UP 名 → 池名 → `bannerLabel` 規則）＋斜體副標、底部 10px accent 色帶到 `W*0.6`、右上玻璃卡放玩家名 / `UID` / 更新時間（`stale` 時用 `copy.syncFailed` 並以 `PAPER.lost` 上色）。

- [ ] **Step 1: Write the failing tests**

```ts
it("derives the accent from the first UP item's element", () => {
  expect(signalAccent(withUp({ elementType: 202 }))).toBe(getPaperAccent("#05777a"));
  expect(signalAccent(withUp({}))).toBe("#de493e");
});
it("uses the UP agent portrait for character pools", async () => {
  expect(await resolveHeroArt(input({ category: "character_up", up: "1091" }))).not.toBeNull();
});
it("falls back to the newest S agent when the banner has no UP art", async () => {
  // category character_up, banner undefined, sRecords[0] = 1021 → 非 null
});
it("falls back to the newest S agent when the UP portrait file is missing", async () => {
  // up "9999" 不存在、sRecords 有 1091 → 非 null；且不丟錯
});
it("returns null when nothing resolves", async () => {
  expect(await resolveHeroArt(input({ category: "weapon_up", up: "99999", sRecords: [] }))).toBeNull();
});
it("fits long titles within their width", () => {
  const { ctx } = createScaledCanvas(10);
  const fitted = fitWithFont(ctx, "很長的卡池名稱".repeat(10), 300, 32);
  ctx.font = `32px ${getZzzOfficialFont("tw")}`;
  expect(ctx.measureText(fitted).width).toBeLessThanOrEqual(300);
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest tests/signalLogPaper.test.ts --runInBand`，Expected: FAIL（module not found）
- [ ] **Step 3: Implement `signalLogPaper.ts`；搬移 helper 並讓 `signalLogRenderer.ts` 改從這裡 import；export `safeAccent`**
- [ ] **Step 4: Run to verify pass** — `npx jest tests/signalLogPaper.test.ts tests/signalLogRenderer.test.ts tests/profileDiscRenderer.test.ts --runInBand`，Expected: PASS（舊 renderer 測試仍綠，代表搬移沒改行為）
- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogPaper.ts src/utilities/zzz/signalLogRenderer.ts src/utilities/zzz/profileCharacterFormal.ts tests/signalLogPaper.test.ts
git commit -m "refactor(gacha): extract signal log paper primitives"
```

---

### Task 5: 總覽 view

**Files:**
- Create: `src/utilities/zzz/signalLogOverview.ts`
- Modify: `src/utilities/zzz/signalLogRenderer.ts`（overview 分派到新函式，刪除舊 overview 程式碼）
- Modify: `src/utilities/zzz/recordText.ts`（新增鍵）
- Test: `tests/signalLogRenderer.test.ts`（改寫 overview 相關測試）

**Interfaces:**
- Consumes: Task 4 全部 export、`signalText`
- Produces: `export async function renderSignalOverview(input: SignalLogRenderInput): Promise<Buffer>`
- `SignalText` 新增鍵（Task 6、7 會用）：`viewRecords`、`pityCycles`、`legendS`、`legendA`、`legendB`、`pageOf`（含 `{page}`、`{pages}` 佔位）、`bigGuarantee`、`lost`。

文字（tw / en，其他語言照同義翻譯，術語對齊各語言既有 `SIGNAL` 用詞）：

| 鍵 | tw | en |
|---|---|---|
| viewRecords | 完整紀錄 | Full History |
| pityCycles | 保底週期 | Pity Cycles |
| legendS / legendA / legendB | S 級 / A 級 / B 級 | S-Rank / A-Rank / B-Rank |
| pageOf | 第 {page} / {pages} 頁 | Page {page} / {pages} |
| bigGuarantee | 大保底 | Guaranteed |
| lost | 歪 | Lost |

版面（y 座標為設計值，可 ±10 微調）：橫幅 0–300；資源列（僅 `source === "official"` 且 `details.tickets` 非空）高 64；數據列 5 格高 96；S 區標題列高 48（右側 `sItemCounts` 頭像 ×N，最多 6 個）；S 清單 2 欄 × 5 列，每格高 76、間距 10；頁尾 40。圖高依實際區塊加總。目前墊抽格僅 `page === 0` 有內容。

- [ ] **Step 1: Rewrite the overview tests**（刪除舊 overview 斷言，保留 records 舊測試到 Task 6）

```ts
it("renders official overview with a resource row and manual overview without one", async () => {
  // 同舊測試的 shared input
  expect(official.width).toBe(2000);
  expect(official.height - manual.height).toBe(64 * 2);
});
it("draws the current pity card only on the first page", async () => {
  // 以 page 0 / page 1 渲染同一資料，對 pity 格區域取像素，第 1 頁應為紙色
});
it("shows a dash for UP-only stats in the standard pool", () => {
  const label = signalText("tw").averageUp;
  expect(__signalLogRendererInternals.statsEntries(summary, "standard", "tw").find(([l]) => l === label)?.[1]).toBe("—");
});
it("renders without throwing when no hero art resolves", async () => {
  await expect(renderSignalLog({ ...shared, category: "weapon_up", banner: undefined })).resolves.toBeInstanceOf(Buffer);
});
it("renders an empty-state overview at a positive height", async () => { /* emptySummary → height > 300*2 */ });
```

- [ ] **Step 2: Run to verify failure** — `npx jest tests/signalLogRenderer.test.ts --runInBand`，Expected: FAIL（寬 2088 ≠ 2000 等）
- [ ] **Step 3: Implement `renderSignalOverview` 與 recordText 新鍵；`statsEntries` 搬到 `signalLogOverview.ts` 並在 internals export**
- [ ] **Step 4: Run to verify pass** — 同上，Expected: PASS
- [ ] **Step 5: Render a preview and eyeball it**

Run: `ZZZ_PREVIEW_OUTPUT_ROOT=<scratchpad> npx tsx previews/signal-log-design/render-previews.ts`
Expected: `官方限定總覽.png` 與 spec「總覽 view」各區塊一致；把圖給使用者看。

- [ ] **Step 6: Commit**

```bash
git add src/utilities/zzz/signalLogOverview.ts src/utilities/zzz/signalLogRenderer.ts src/utilities/zzz/recordText.ts tests/signalLogRenderer.test.ts
git commit -m "feat(gacha): redesign signal log overview in formal paper style"
```

---

### Task 6: 週期 view

**Files:**
- Modify: `src/utilities/zzz/signalLogCycles.ts`（加 `renderSignalCycles`）
- Modify: `src/utilities/zzz/signalLogRenderer.ts`（records 分派到新函式，刪除舊格子程式碼與其常數）
- Test: `tests/signalLogRenderer.test.ts`（刪除 5×4 格子相關測試，新增週期測試）

**Interfaces:**
- Consumes: `buildPityCycles`（Task 1）、Task 4 export、Task 5 文字鍵
- Produces: `export async function renderSignalCycles(input: SignalLogRenderInput): Promise<Buffer>`；internals 加 `cycleTrackCells(cycle: PityCycle, hardPity: number): Array<"s" | "a" | "b" | "current" | "empty">`

版面：橫幅高 150；標題列 48（右側圖例）；每列高 64、間距 8，10 列；頁尾 40。每列：左 48×48 物品方塊（墊抽中為 accent 虛線框 + 「?」）、中間進度軌寬 = 1000 − 左右邊距 − 方塊 − 數字區，`hardPity` 格等分、格距 1；右側抽數（`partial` 時前綴 `~`）＋ `lost` 時「歪」標。

- [ ] **Step 1: Write the failing tests**

```ts
it("maps a cycle onto exactly hardPity track cells", () => {
  const cells = cycleTrackCells({ length: 5, aPositions: [3], sRecord: s, lost: false, partial: false }, 80);
  expect(cells).toHaveLength(80);
  expect(cells.slice(0, 6)).toEqual(["b", "b", "a", "b", "s", "empty"]);
});
it("marks in-progress cells as current", () => {
  expect(cycleTrackCells({ length: 2, aPositions: [], sRecord: null, lost: false, partial: false }, 90).slice(0, 3))
    .toEqual(["current", "current", "empty"]);
});
it("clamps cycles longer than hardPity without overflowing", () => {
  const cells = cycleTrackCells({ length: 95, aPositions: [], sRecord: s, lost: false, partial: true }, 90);
  expect(cells).toHaveLength(90);
  expect(cells.at(-1)).toBe("s");
});
it("renders ten cycles per page at the expected size", async () => {
  // 12 個週期，page 0 → 寬 2000；page 1 圖高 < page 0 圖高
});
it("renders an empty cycle page without throwing", async () => {
  await expect(renderSignalLog({ ...shared, view: "records", summary: emptySummary() })).resolves.toBeInstanceOf(Buffer);
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest tests/signalLogRenderer.test.ts --runInBand`，Expected: FAIL（`cycleTrackCells` undefined）
- [ ] **Step 3: Implement `renderSignalCycles` / `cycleTrackCells`；`renderSignalLog` 改為 `input.view === "records" ? renderSignalCycles(input) : renderSignalOverview(input)`；`SignalLogRenderInput.view` 型別改用 `SignalLogView`**
- [ ] **Step 4: Run to verify pass** — 同上，Expected: PASS；`npx tsc --noEmit` 無錯誤
- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogCycles.ts src/utilities/zzz/signalLogRenderer.ts tests/signalLogRenderer.test.ts
git commit -m "feat(gacha): add pity cycle history view"
```

---

### Task 7: Discord 切換按鈕

**Files:**
- Modify: `src/utilities/zzz/signalLogView.ts`（`SignalLogSession` 約 43 行、`controls` 約 169 行、`buildSignalLogMessage` 約 216–276 行、`createSignalLogSession` 約 321 行、`handleSignalLogComponent` 約 408–424 行）

**Interfaces:**
- Consumes: `SignalLogView`、`signalLogPageCount`、`switchSignalLogView`（Task 2）；`PersistedSignalLogSession.view`（Task 3）；`copy.viewRecords`、`copy.overview`（Task 5）

- [ ] **Step 1: Implement**
  - `SignalLogSession` 加 `view: SignalLogView`；`createSignalLogSession` 初始 `view: "overview"`；`sessionFrom` 從 persisted 帶入（Task 3 已保證有值）。
  - `buildSignalLogMessage`：`const pageCount = signalLogPageCount(summary, session.view, pityEstimated)` 取代第 248–249 行；把 `pityEstimated` 先算成區域變數，同時傳給 renderer；`view: session.view`。
  - `controls` 第 3 列末尾加 `new ButtonBuilder().setCustomId(\`glog-view:${token}\`).setLabel(session.view === "overview" ? copy.viewRecords : copy.overview).setStyle(ButtonStyle.Primary)`。
  - handler 加分支 `else if (interaction.customId.startsWith("glog-view:")) Object.assign(session, switchSignalLogView(session.view));`。
  - 切換類型 / 卡池的分支不改 `session.view`。
- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → 無錯誤
Run: `npx jest tests/signalLogPagination.test.ts tests/gachaArchive.test.ts tests/signalLogRenderer.test.ts --runInBand` → PASS
Run: `grep -n "glog-" src/events/selectMenu.ts` → 確認第 184 行前綴路由涵蓋 `glog-view:`（不需改）。

- [ ] **Step 3: Commit**

```bash
git add src/utilities/zzz/signalLogView.ts
git commit -m "feat(gacha): toggle between signal log overview and pity cycles"
```

---

### Task 8: 清理、預覽與視覺基準

**Files:**
- Modify: `src/utilities/zzz/recordText.ts`（刪 `perPage10`、`dateRange`、`page`）
- Modify: `src/utilities/zzz/signalLogRenderer.ts` / `signalLogPaper.ts`（刪掉沒人用的搬移 helper，例如 `drawCircleItem`、`drawImagePanel`、`loadAssets` 中的舊資產）
- Modify: `previews/signal-log-design/render-previews.ts`
- Modify: `tests/zzzOfficialVisualRegression.test.ts:53-60`

- [ ] **Step 1: 刪除舊字串前確認無人使用**

Run: `grep -rn "perPage10\|dateRange\|copy\.page\b" src --include=*.ts`
Expected: 只剩 `recordText.ts` 的定義（其他模組的 `copy.page` 屬於不同 copy 物件，逐一確認來源後才刪）。刪除型別與 7 種語言中的這些鍵。

- [ ] **Step 2: 刪除未使用的 helper 與資產載入**

Run: `npx eslint src/utilities/zzz/signalLog*.ts` 與 `npx tsc --noEmit --noUnusedLocals`（只看 signalLog* 檔的輸出）
Expected: 無未使用的 local / import。

- [ ] **Step 3: 更新預覽腳本**：`renderSignalPreviews` 回傳 `{ officialOverview, manualOverview, cycles }`；`cycles` 用 `view: "records"`；輸出 `官方限定總覽.png`、`手動匯入總覽.png`、`保底週期.png`。
- [ ] **Step 4: 更新視覺回歸測試**：`"signal-log-design/完整紀錄20格.png"` 改為 `"signal-log-design/保底週期.png"`，測試名稱改成 "keeps both Signal Log layouts below 2%"（不變）。
- [ ] **Step 5: 產生 baseline 給使用者審核**

Run: `npx tsx previews/signal-log-design/render-previews.ts`
Expected: `previews/signal-log-design/` 出現三張 PNG。把三張圖給使用者看，**取得同意後**才進下一步。

- [ ] **Step 6: Full verification**

Run: `npx tsc --noEmit` → 無錯誤
Run: `npx jest --runInBand` → 全部 PASS（含 `test:visual`）

- [ ] **Step 7: Commit**

```bash
git add src/utilities/zzz/recordText.ts src/utilities/zzz/signalLogRenderer.ts src/utilities/zzz/signalLogPaper.ts previews/signal-log-design tests/zzzOfficialVisualRegression.test.ts
git commit -m "chore(gacha): remove legacy signal log grid and refresh baselines"
```
