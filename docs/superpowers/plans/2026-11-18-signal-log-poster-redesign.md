# 調頻紀錄圖改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/調頻 紀錄` 改成海報風格的四個畫面（全頻道首頁、S 牆、依版本、保底週期），官方綁定帳號的資料改用 HoYoLAB 新的調頻統計 API。

**Architecture:** 新 API 的回傳存進現有的封存資料庫，和封存的逐抽紀錄一起轉成同一種 `SignalLogModel`，繪圖只吃這個模型。新的繪圖入口 `renderSignalLogImage` 先和舊的 `renderSignalLog` 並存，Task 13 把 Discord 切過去，Task 14 才刪舊程式，所以每個任務結束時型別檢查和測試都是綠的。

**Tech Stack:** TypeScript (ESM)、`@napi-rs/canvas`、discord.js、better-sqlite3、Jest（ts-jest）。

**Spec:** `docs/superpowers/specs/2026-11-18-signal-log-poster-redesign-design.md`

## Global Constraints

- 畫布寬 1000，`OUTPUT_SCALE = 2`。任何畫面的高度不得超過 1100，不得低於 560。
- 左側海報面板寬 264；右側內容區 `x = 284`、寬 700、上下左右留白 16。
- 色票：紙底 `#f4eee7`、卡片 `rgba(255,255,255,.8)`、線 `#ddd5cb`、墨 `#171719`、次要 `#817a75`、軌道 `#e4ddd3`。
- 抽數顏色依「抽數 ÷ 硬保底」：≥ 0.84 `#d9473b`、≥ 0.58 `#c9870f`、其餘 `#2f8f6f`。色塊上的數字是白色。
- UP 角標：底 `#ffd21f`、字與外框 `#171719`、文字固定「UP」。只有限定頻道（獨家、重映、音擎、迴響）且 `isUp === true` 才畫。
- 沒有「歪」標籤，資料不明的 S 不加任何角標。
- 新 API：`https://sg-act-public-api.hoyolab.com/event/nap_gacha_record`，GET，查詢參數 `uid`、`region`、`lang`，只帶 HoYoLAB cookie。請求間隔 250 ms，單一請求逾時 8 秒。
- `gacha_type` 查詢值：常駐 1、獨家 2、音擎 3、邦布 5、獨家重映 102、音擎迴響 103。
- 「限定頻道可抽」= `floor(菲林 / 160) + 加密母帶`，不計菲林底片。
- 圖片載入失敗一律當成沒有圖並退回下一個來源，renderer 不得因缺圖丟錯。
- 七種語言：`SIGNAL_EN`（英文兼後備）加 `SIGNAL` 的 tw、cn、jp、kr、fr、vi。量文字寬度要用實際繪製的語言字型（`getZzzOfficialFont(locale)`）。
- 不要把真帳號的 API 回傳放進版本庫；測試樣本一律手寫。
- `src/assets/gacha-simulation/` 整個資料夾被 git 忽略（正式環境和開發機另外持有）。要進版本庫的新檔案不得放在裡面；讀它的程式和測試必須在檔案不存在時照常運作。
- 目前 `main` 上有不相干的未提交修改。在新分支上做，`git add` 只加各任務列出的檔案，不要用 `git add -A`。
- 單檔測試：`npx jest <path> --runInBand`；型別檢查：`npx tsc --noEmit`。

## Review Focus

1. **同步到一半失敗**（總覽成功、某個歷史版本逾時或 cookie 過期回 `-100`）：使用者預期仍看到圖，內容是上次存下來的統計或封存紀錄，並標成同步失敗。測試在 Task 4 和 Task 13。
2. **API 的數字欄位不是數字**（空字串、`null`、`"0.0"`、缺欄位）：轉成數字或 `null`，畫面不得出現 `NaN`。測試在 Task 2。
3. **卡池裡的 S 加起來和 `s_count` 對不上**（例如常駐頻道目前版本的 S 沒被任何端點回傳）：該頻道改用封存紀錄，不顯示少一截的清單。測試在 Task 5。
4. **剛上線的新角色**（不在屬性表、專屬音擎表，也沒有全身立繪）：海報走退回順序、屬性色用預設值、S 格仍畫得出來。測試在 Task 8。
5. **超長文字與大量資料**（長玩家名、法文頻道名放進 264 寬的海報；單一版本 40 個 S）：文字縮字或截斷不溢出；依版本把該段拆頁。測試在 Task 8 和 Task 11。

---

## 檔案結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `src/utilities/zzz/gachaAnalysis.ts` | 修改 | `GachaSummary` 加 `upWins`、`upEligible`、`averageUpCost` |
| `src/utilities/zzz/hoyolabCookie.ts` | 新增 | 把 SDK 或字串形式的 cookie 轉成 HTTP cookie 表 |
| `src/utilities/zzz/discProfileBatch.ts` | 修改 | 改用 `hoyolabCookie.ts` |
| `src/utilities/zzz/gachaStatApi.ts` | 新增 | 新 API 的三個端點和回傳正規化 |
| `src/utilities/zzz/gachaArchive.ts` | 修改 | 兩張新資料表與存取方法；`view` 欄位的新值 |
| `src/utilities/zzz/gachaStatSync.ts` | 新增 | 抓新 API 並存檔，已定案的版本不重抓 |
| `src/utilities/zzz/signalLogModel.ts` | 新增 | `SignalLogModel` 以及從兩種來源建立它 |
| `src/scripts/syncAgentPortraits.ts` | 新增 | 下載缺少的全身立繪、產生專屬音擎對照表 |
| `src/assets/signature-weapons.json` | 新增 | 音擎 ID → 角色 ID |
| `src/utilities/zzz/signalLogPagination.ts` | 修改 | 四種 view、各 view 的頁數 |
| `src/utilities/zzz/recordText.ts` | 修改 | 新字串 |
| `src/utilities/zzz/signalLogPaper.ts` | 修改 | 新色階、UP 角標、抽數色塊、語言字型量測 |
| `src/utilities/zzz/signalLogPoster.ts` | 新增 | 海報主角的選擇與繪製 |
| `src/utilities/zzz/signalLogStatus.ts` | 新增 | 頻道頁上方的墊抽卡與數據格 |
| `src/utilities/zzz/signalLogWall.ts` | 新增 | S 格與 S 牆 |
| `src/utilities/zzz/signalLogHome.ts` | 新增 | 全頻道首頁 |
| `src/utilities/zzz/signalLogVersions.ts` | 新增 | 依版本的分頁與繪製 |
| `src/utilities/zzz/signalLogCycles.ts` | 修改 | 保底週期換成新外框 |
| `src/utilities/zzz/signalLogRenderer.ts` | 修改 | 新入口 `renderSignalLogImage` |
| `src/utilities/zzz/signalLogView.ts` | 修改 | session、同步、建立模型、元件與處理 |
| `src/utilities/zzz/signalLogOverview.ts` | 刪除 | 被 S 牆取代 |
| `src/assets/images/zzz/official-record/icon-top.140345aa.png` | 刪除 | 被 UP 角標取代 |
| `previews/signal-log-design/render-previews.ts` | 修改 | 輸出新畫面 |
| `previews/signal-log-spike/` | 刪除 | 拋棄式預覽 |

---

### Task 1: 統計欄位

**Files:**
- Modify: `src/utilities/zzz/gachaAnalysis.ts`
- Test: `tests/gachaAnalysis.test.ts`

**Interfaces:**
- Produces: `GachaSummary` 新增 `upWins: number`、`upEligible: number`、`averageUpCost: number | null`。

- [ ] **Step 1: 寫失敗的測試**（加在 `tests/gachaAnalysis.test.ts`）

```ts
it("counts UP wins and the average cost per UP including lost pulls", () => {
  // 獨家頻道，S 依序出在第 80（UP）、第 150（歪）、第 230（UP）、第 250（UP）抽
  const summary = analyzeGachaRecords({ records: limitedFixture([80, 150, 230, 250], [true, false, true, true]), category: "character_up" });
  expect(summary.upWins).toBe(3);
  expect(summary.upEligible).toBe(4);
  // 第一個 UP 沒有前一個 UP，不列入；其餘是 230-80=150 與 250-230=20
  expect(summary.averageUpCost).toBe(85);
});

it("leaves UP statistics empty for channels without an UP concept", () => {
  const summary = analyzeGachaRecords({ records: limitedFixture([80], [null]), category: "standard" });
  expect(summary.upWins).toBe(0);
  expect(summary.upEligible).toBe(0);
  expect(summary.averageUpCost).toBeNull();
});
```

`limitedFixture(sPositions: number[], isUp: Array<boolean | null>)` 是測試檔內的小工具：產生連續的逐抽紀錄，指定位置是 S 並帶上對應的 `isUp`，其餘是 B。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/gachaAnalysis.test.ts --runInBand`
Expected: FAIL，`upWins` 是 `undefined`。

- [ ] **Step 3: 在 `analyzeGachaRecords` 的回傳補上三個欄位**

`upWins`、`upEligible` 沿用函式裡已有的 `wins`、`eligible`；`averageUpCost` 是選定範圍內 `isUp === true` 且 `pullsSincePreviousUp !== null` 的平均，`Math.round`。非限定頻道三者是 0、0、`null`。現有欄位不動。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/gachaAnalysis.test.ts --runInBand` → PASS；`npx tsc --noEmit` → 無錯誤（其他建立 `GachaSummary` 的測試工具要補上新欄位）。

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/gachaAnalysis.ts tests/gachaAnalysis.test.ts tests/signalLogRenderer.test.ts tests/signalLogPagination.test.ts
git commit -m "feat(gacha): add UP win counts and average UP cost to the summary"
```

---

### Task 2: 新 API 客戶端

**Files:**
- Create: `src/utilities/zzz/hoyolabCookie.ts`、`src/utilities/zzz/gachaStatApi.ts`、`tests/fixtures/gachaStat.ts`
- Add（已存在、尚未納入版本庫）: `src/scripts/probeGachaRecordApi.ts`，驗證 API 格式用的唯讀探測腳本，內容不改
- Modify: `src/utilities/zzz/discProfileBatch.ts`
- Test: `tests/gachaStatApi.test.ts`、`tests/discProfileBatch.test.ts`（不改，必須照舊通過）

**Interfaces:**
- Produces:

```ts
// hoyolabCookie.ts
export function hoyolabCookieJar(cookie: unknown): Map<string, string>;

// gachaStatApi.ts
export type GachaStatCategory = Exclude<GachaChannelCategory, "unknown">;
export const GACHA_STAT_TYPE_IDS: Record<GachaStatCategory, number>; // standard 1, character_up 2, weapon_up 3, bangboo 5, character_return 102, weapon_return 103
export interface GachaStatRecord { itemId: string; name: string; icon: string; itemType: string; rarity: string; isUp: boolean; upTag: string; count: number; sort: number; recordTime: number }
export interface GachaStatPool { category: GachaStatCategory; version: string; state: "in_progress" | "ended" | "not_started" | "unknown"; startTs: number; endTs: number; upItems: GachaStatRecord[]; records: GachaStatRecord[] }
export interface GachaStatType { category: GachaStatCategory; totalCount: number; sCount: number; upCount: number; averageUp: number | null; currentPity: number; toHardPity: number; versions: string[] }
export interface GachaStatTickets { monochrome: number; polychrome: number; encrypted: number; original: number; boopon: number }
export interface GachaStatIndex { totalCount: number; totalS: number; currentVersion: string; tickets: GachaStatTickets; types: GachaStatType[] }
export interface GachaStatClient {
  index(): Promise<GachaStatIndex>;
  currentPools(category: GachaStatCategory): Promise<GachaStatPool[]>;
  historyPools(category: GachaStatCategory, versions: string[]): Promise<GachaStatPool[]>;
}
export class GachaStatError extends Error { readonly retcode: number | null }
export function createGachaStatClient(client: { uid?: unknown; region?: unknown; lang?: unknown; cookie?: unknown }, fetcher?: typeof fetch): GachaStatClient | undefined;
```

- [ ] **Step 1: 寫手寫樣本** `tests/fixtures/gachaStat.ts`

匯出三個常數，欄位名稱和型別照 spec「已驗證」一節的實際格式（數字多半是字串）：

- `rawIndex`：`cur_ver: "3.3"`、`total_gacha_count: "360"`、`total_s_count: "5"`；`cur_tickets` 五種票券依序 100、1600、3、0、7；`type_stats` 兩筆：
  - `GACHA_TYPE_CHARACTER_UP`：`total_count "300"`、`s_count "4"`、`up_count "3"`、`avr_up_count "100.0"`、`next_s_cur_times 20`、`new_s_max_times 70`、`has_data_vers ["3.3","3.2","3.1"]`
  - `GACHA_TYPE_PERMANENT`：`total_count "60"`、`s_count "1"`、`up_count "0"`、`avr_up_count "60.0"`、`next_s_cur_times 10`、`new_s_max_times 80`、`has_data_vers ["3.1"]`
- `rawCurrentCharacter`：`{ cur_ver: "3.3", list: [...] }` 兩期。進行中那期 `start_ts 1794369600`、`end_ts 1796108399`、`cur_item_list` 一個 `1631`（`up_tag "UP_TAG_NEW"`）、`cur_records` 空；已結束那期 `start_ts 1792544400`、`end_ts 1794369599`、`cur_item_list` 一個 `1641`、`cur_records` 一筆 `{ item_id "1641", count "76", sort "280", is_up true, record_time "1792553604" }`。
- `rawHistoryCharacter`：`{ list: [...] }` 只有 `version "3.1"` 一筆，`start_ts 0`、`end_ts 0`、`cur_item_list` 空，`cur_records` 三筆，新到舊：`1581` count 30 sort 204 UP、`1221` count 18 sort 174 非 UP、`1581` count 76 sort 156 UP。

- [ ] **Step 2: 寫失敗的測試** `tests/gachaStatApi.test.ts`

```ts
const client = { uid: 1300000001, region: "prod_gf_jp", lang: "zh-tw", cookie: { ltoken_v2: "t", ltuid_v2: "1" } };
const ok = (data: unknown) => ({ ok: true, json: async () => ({ retcode: 0, message: "OK", data }), headers: { getSetCookie: () => [] } });

it("requests the index with uid, region, lang and the HoYoLAB cookie only", async () => {
  const fetcher = jest.fn().mockResolvedValue(ok(rawIndex));
  const index = await createGachaStatClient(client, fetcher as any)!.index();
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://sg-act-public-api.hoyolab.com/event/nap_gacha_record/api/zzz/index?uid=1300000001&region=prod_gf_jp&lang=zh-tw");
  expect(options.method ?? "GET").toBe("GET");
  expect(options.headers.Cookie).toBe("ltoken_v2=t; ltuid_v2=1");
  expect(index).toMatchObject({ totalCount: 360, totalS: 5, currentVersion: "3.3",
    tickets: { monochrome: 100, polychrome: 1600, encrypted: 3, original: 0, boopon: 7 } });
  expect(index.types[0]).toEqual({ category: "character_up", totalCount: 300, sCount: 4, upCount: 3,
    averageUp: 100, currentPity: 20, toHardPity: 70, versions: ["3.3", "3.2", "3.1"] });
  expect(index.types[1]!.category).toBe("standard");
});

it("maps pools and records, converting string numbers", async () => {
  const fetcher = jest.fn().mockResolvedValueOnce(ok(rawCurrentCharacter)).mockResolvedValueOnce(ok(rawHistoryCharacter));
  const api = createGachaStatClient(client, fetcher as any)!;
  const current = await api.currentPools("character_up");
  expect(fetcher.mock.calls[0][0]).toContain("/api/zzz/cur_pool_stat?uid=1300000001&region=prod_gf_jp&lang=zh-tw&gacha_type=2");
  expect(current.map((pool) => [pool.state, pool.version, pool.startTs, pool.upItems[0]!.itemId, pool.records.length]))
    .toEqual([["in_progress", "3.3", 1794369600, "1631", 0], ["ended", "3.3", 1792544400, "1641", 1]]);
  expect(current[1]!.records[0]).toMatchObject({ itemId: "1641", count: 76, sort: 280, isUp: true, recordTime: 1792553604 });
  const history = await api.historyPools("character_up", ["3.2", "3.1"]);
  expect(fetcher.mock.calls[1][0]).toContain("gacha_type=2&vers=3.2%2C3.1");
  expect(history).toHaveLength(1);
  expect(history[0]!.records.map((record) => record.isUp)).toEqual([true, false, true]);
});

it("splits history into requests of at most eight versions", async () => {
  const fetcher = jest.fn().mockResolvedValue(ok({ list: [] }));
  await createGachaStatClient(client, fetcher as any)!.historyPools("standard", Array.from({ length: 19 }, (_, i) => `1.${i}`));
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[0][0]).toContain("gacha_type=1&");
});

it("turns malformed numbers into 0 or null instead of NaN", async () => {
  const broken = { ...rawIndex, total_gacha_count: "", type_stats: [{ gacha_type: "GACHA_TYPE_WEAPON_UP", total_count: null, s_count: "x", avr_up_count: "", has_data_vers: null }] };
  const index = await createGachaStatClient(client, jest.fn().mockResolvedValue(ok(broken)) as any)!.index();
  expect(index.totalCount).toBe(0);
  expect(index.types[0]).toEqual({ category: "weapon_up", totalCount: 0, sCount: 0, upCount: 0, averageUp: null, currentPity: 0, toHardPity: 0, versions: [] });
});

it("throws a typed error on a login rejection and returns no client without a cookie", async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ retcode: -100, message: "Please log in", data: null }), headers: { getSetCookie: () => [] } });
  await expect(createGachaStatClient(client, fetcher as any)!.index()).rejects.toMatchObject({ name: "GachaStatError", retcode: -100 });
  expect(createGachaStatClient({ ...client, cookie: "" })).toBeUndefined();
  expect(createGachaStatClient({ ...client, region: "bad" })).toBeUndefined();
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx jest tests/gachaStatApi.test.ts --runInBand` → FAIL，找不到模組。

- [ ] **Step 4: 實作**
- `hoyolabCookieJar`：把 `discProfileBatch.ts` 第 19–31 行建立 cookie 表的邏輯原樣搬過來（字串用 `;` 切；物件把 SDK 的 camelCase 名稱轉回 snake_case）。`discProfileBatch.ts` 改成呼叫它。
- `createGachaStatClient`：`uid` 須是 10 位數字、`region` 須符合 `/^prod_gf_(us|eu|jp|sg)$/`、cookie 表非空，否則回 `undefined`。請求標頭和 `discProfileBatch.ts` 相同（`x-rpc-lang`、`x-rpc-language`、`Cookie`、`Origin`、`Referer`），`redirect: "error"`、`AbortSignal.timeout(8_000)`。HTTP 非 200 或 `retcode !== 0` 丟 `GachaStatError`，錯誤訊息不得包含 cookie。
- 頻道字串用 `gachaSync.ts` 的 `normalizeGachaCategory`，結果是 `unknown` 的 `type_stats` 丟棄。
- `state`：包含 `IN_PROGRESS` → `in_progress`，`ENDED` → `ended`，`NOT_START` → `not_started`，其餘 `unknown`。
- 數字一律 `Number()` 後檢查 `Number.isFinite`；`averageUp` 不是有限數字或為 0 時是 `null`，其餘無效值是 0。
- 客戶端本身不做 250 ms 間隔，由 Task 4 負責。

- [ ] **Step 5: 跑測試確認通過**

Run: `npx jest tests/gachaStatApi.test.ts tests/discProfileBatch.test.ts --runInBand` → PASS；`npx tsc --noEmit` → 無錯誤。

- [ ] **Step 6: Commit**

```bash
git add src/utilities/zzz/hoyolabCookie.ts src/utilities/zzz/gachaStatApi.ts src/utilities/zzz/discProfileBatch.ts src/scripts/probeGachaRecordApi.ts tests/fixtures/gachaStat.ts tests/gachaStatApi.test.ts
git commit -m "feat(gacha): add a client for the official signal statistics API"
```

---

### Task 3: 儲存新 API 的資料

**Files:**
- Modify: `src/utilities/zzz/gachaArchive.ts`
- Test: `tests/gachaArchive.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `GachaStatIndex`、`GachaStatPool`、`GachaStatCategory`。
- Produces（`GachaArchiveStore` 的方法）：

```ts
saveOfficialStatIndex(ownerId: string, uid: string, index: GachaStatIndex): void;
getOfficialStatIndex(ownerId: string, uid: string): { index: GachaStatIndex; fetchedAt: string } | null;
saveOfficialStatPools(ownerId: string, uid: string, category: GachaStatCategory, version: string, pools: GachaStatPool[], final: boolean): void;
listOfficialStatPools(ownerId: string, uid: string): Array<{ category: GachaStatCategory; version: string; final: boolean; pools: GachaStatPool[] }>;
```

- [ ] **Step 1: 寫失敗的測試**

```ts
describe("official statistics storage", () => {
  const pool = (version: string, sort: number): GachaStatPool => ({ category: "character_up", version, state: "ended", startTs: 0, endTs: 0, upItems: [],
    records: [{ itemId: "1581", name: "", icon: "", itemType: "ItemType_Avatar", rarity: "S", isUp: true, upTag: "UP_TAG_NONE", count: 30, sort, recordTime: 1785292496 }] });
  beforeEach(() => store.upsertAccount({ ownerId: "owner", uid: "1300000001", source: "official", region: "prod_gf_jp" }));
  it("round-trips the index and replaces it on the next save", () => {
    expect(store.getOfficialStatIndex("owner", "1300000001")).toBeNull();
    store.saveOfficialStatIndex("owner", "1300000001", sampleIndex(300));
    store.saveOfficialStatIndex("owner", "1300000001", sampleIndex(310));
    expect(store.getOfficialStatIndex("owner", "1300000001")!.index.totalCount).toBe(310);
  });
  it("keeps one row per channel and version, so saving twice does not duplicate", () => {
    store.saveOfficialStatPools("owner", "1300000001", "character_up", "3.1", [pool("3.1", 204)], true);
    store.saveOfficialStatPools("owner", "1300000001", "character_up", "3.1", [pool("3.1", 204)], true);
    store.saveOfficialStatPools("owner", "1300000001", "character_up", "3.3", [], false);
    expect(store.listOfficialStatPools("owner", "1300000001").map((row) => [row.version, row.final, row.pools.length]))
      .toEqual(expect.arrayContaining([["3.1", true, 1], ["3.3", false, 0]]));
    expect(store.listOfficialStatPools("owner", "1300000001")).toHaveLength(2);
  });
  it("removes statistics when the official archive or the account is cleared", () => {
    store.saveOfficialStatIndex("owner", "1300000001", sampleIndex(300));
    store.saveOfficialStatPools("owner", "1300000001", "character_up", "3.1", [pool("3.1", 204)], true);
    store.clear("owner", "1300000001", "official");
    expect(store.getOfficialStatIndex("owner", "1300000001")).toBeNull();
    expect(store.listOfficialStatPools("owner", "1300000001")).toEqual([]);
  });
});
```

`sampleIndex(total)` 是測試內的小工具，回傳一個合法的 `GachaStatIndex`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/gachaArchive.test.ts --runInBand` → FAIL，方法不存在。

- [ ] **Step 3: 實作**

在 `migrate()` 加兩張表，都以 `(owner_id, uid)` 外鍵連到 `archive_accounts` 並 `ON DELETE CASCADE`：

- `official_stat_index(owner_id, uid, payload TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY (owner_id, uid))`
- `official_stat_pools(owner_id, uid, category TEXT, version TEXT, final INTEGER NOT NULL, payload TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY (owner_id, uid, category, version))`

`payload` 存 JSON。兩個 save 用 `INSERT ... ON CONFLICT DO UPDATE`。`clear(ownerId, uid, "official")` 的交易裡加上刪除這兩張表該帳號的列；不帶 `source` 的 `clear` 靠外鍵連鎖刪除。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/gachaArchive.test.ts --runInBand` → PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/gachaArchive.ts tests/gachaArchive.test.ts
git commit -m "feat(gacha): store official signal statistics in the archive"
```

---

### Task 4: 同步新 API

**Files:**
- Create: `src/utilities/zzz/gachaStatSync.ts`
- Test: `tests/gachaStatSync.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `GachaStatClient`；Task 3 的四個方法。
- Produces:

```ts
export async function syncOfficialGachaStats(options: {
  client: GachaStatClient; ownerId: string; uid: string; archive?: GachaArchiveStore; delayMs?: number;
}): Promise<{ requests: number }>;
```

- [ ] **Step 1: 寫失敗的測試**

用記憶體資料庫和一個假的 `GachaStatClient`（三個方法都是 `jest.fn()`），`delayMs: 0`。假的 index：`currentVersion "3.3"`，`character_up` 的 `versions ["3.3","3.2","3.1"]`，`standard` 的 `versions ["3.1"]`，其餘頻道不在 `types` 裡。`currentPools("character_up")` 回兩個 `3.3` 的池（其中一個有一筆紀錄），其餘頻道回空陣列。`historyPools` 只回 `3.1` 那一個池。

`poolWith(version, records)` 產生一個 `GachaStatPool`；`sameRecordAsCurrent` 是和 `currentPools` 那筆紀錄 `itemId`、`recordTime`、`sort` 都相同的紀錄。

```ts
it("fetches the index, current pools and unseen history, then stores them", async () => {
  await syncOfficialGachaStats({ client: fake, ownerId: "owner", uid: "1300000001", archive: store, delayMs: 0 });
  expect(fake.currentPools.mock.calls.map(([category]) => category)).toEqual(["character_up", "standard"]);
  expect(fake.historyPools.mock.calls).toEqual([["character_up", ["3.3", "3.2", "3.1"]], ["standard", ["3.1"]]]);
  const rows = store.listOfficialStatPools("owner", "1300000001");
  // 目前版本不定案；過去的版本定案，包含有抽但沒出 S 的 3.2
  expect(rows.filter((row) => row.category === "character_up").map((row) => [row.version, row.final, row.pools.length]).sort())
    .toEqual([["3.1", true, 1], ["3.2", true, 0], ["3.3", false, 2]]);
});

it("does not refetch finalised versions", async () => {
  await syncOfficialGachaStats({ client: fake, ownerId: "owner", uid: "1300000001", archive: store, delayMs: 0 });
  fake.historyPools.mockClear();
  await syncOfficialGachaStats({ client: fake, ownerId: "owner", uid: "1300000001", archive: store, delayMs: 0 });
  expect(fake.historyPools.mock.calls).toEqual([["character_up", ["3.3"]]]);
});

it("merges current-version records from both endpoints without duplicates", async () => {
  fake.historyPools.mockResolvedValueOnce([poolWith("3.3", [sameRecordAsCurrent])]);
  await syncOfficialGachaStats({ client: fake, ownerId: "owner", uid: "1300000001", archive: store, delayMs: 0 });
  const current = store.listOfficialStatPools("owner", "1300000001").find((row) => row.category === "character_up" && row.version === "3.3")!;
  expect(current.pools.flatMap((item) => item.records)).toHaveLength(1);
});

it("keeps what was already stored when a later request fails", async () => {
  fake.historyPools.mockRejectedValueOnce(new GachaStatError("timeout", null));
  await expect(syncOfficialGachaStats({ client: fake, ownerId: "owner", uid: "1300000001", archive: store, delayMs: 0 })).rejects.toThrow("timeout");
  expect(store.getOfficialStatIndex("owner", "1300000001")).not.toBeNull();
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/gachaStatSync.test.ts --runInBand` → FAIL，找不到模組。

- [ ] **Step 3: 實作 `syncOfficialGachaStats`**

依序：

1. `client.index()`，立刻 `saveOfficialStatIndex`。
2. 依 `GACHA_CATEGORY_ORDER` 走過 `index.types` 裡有、且 `versions` 非空的頻道。
3. 每個頻道先 `currentPools(category)`。
4. 要抓歷史的版本 = 該頻道 `versions` 扣掉資料庫裡已 `final` 的版本，順序照 `versions`。目前版本若在 `versions` 裡，因為從不定案，所以每次都會抓。清單為空就不呼叫。
5. 存檔：目前版本存「`currentPools` 的結果加上 `historyPools` 中 `version === currentVersion` 的那些」，`final = false`；同一筆 S（`itemId`、`recordTime`、`sort` 都相同）只留一次，重複時把歷史那筆的紀錄從該池移除。其餘請求過的版本各存一列，`final = true`；回傳裡沒有的版本存空陣列。
6. 每個請求之間 `delayMs`（預設 250）。
7. 任何請求失敗直接往外丟，不回滾已經存好的列。

`requests` 回傳實際呼叫的次數。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/gachaStatSync.test.ts --runInBand` → PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/gachaStatSync.ts tests/gachaStatSync.test.ts
git commit -m "feat(gacha): sync official signal statistics incrementally"
```

---

### Task 5: 統一資料模型

**Files:**
- Create: `src/utilities/zzz/signalLogModel.ts`
- Test: `tests/signalLogModel.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `GachaSummary` 新欄位；Task 2 的型別；Task 3 `listOfficialStatPools` 的回傳型別。
- Produces:

```ts
export type SignalItemKind = "character" | "weapon" | "bangboo" | "unknown";
export interface SignalSEntry { itemId: string; kind: SignalItemKind; pity: number | null; isUp: boolean | null; pulledAt: string | null }
export interface SignalSegment { key: string; version: string; upNames: string[]; startAt: string | null; endAt: string | null; ongoing: boolean; pulls: number | null; entries: SignalSEntry[] }
export interface SignalChannelModel {
  category: GachaStatCategory; limited: boolean; hasRecords: boolean;
  total: number; sCount: number; upCount: number | null; averageS: number | null; averageUpCost: number | null;
  currentPity: number | null; hardPity: number; toHardPity: number | null; guaranteed: boolean | null; pityEstimated: boolean;
  entries: SignalSEntry[];      // 新到舊
  segments: SignalSegment[];    // 新到舊
  firstRecordAt: string | null;
}
export interface SignalTickets { monochrome: number | null; polychrome: number; encrypted: number; original: number; boopon: number; pullsAvailable: number }
export interface SignalLogModel { channels: Record<GachaStatCategory, SignalChannelModel>; tickets: SignalTickets | null }
export function isLimitedCategory(category: GachaStatCategory): boolean;
export function modelFromOfficialStats(index: GachaStatIndex, stored: Array<{ category: GachaStatCategory; version: string; pools: GachaStatPool[] }>): { model: SignalLogModel; incomplete: GachaStatCategory[] };
export function channelFromArchive(input: { category: GachaStatCategory; summary: GachaSummary; pityEstimated: boolean; banners: GachaArchiveBanner[]; unclassifiedLabel: string }): SignalChannelModel;
export function ticketsFromDetails(details: any): SignalTickets | null;
export function emptyChannel(category: GachaStatCategory): SignalChannelModel;
```

- [ ] **Step 1: 寫失敗的測試**

`index` 是 Task 2 的 `rawIndex` 正規化後的結果。`stored` 手寫成正規化後的物件，共四列：`character_up` 的 `3.3`（Task 2 `rawCurrentCharacter` 的兩個池）、`3.2`（空陣列）、`3.1`（`rawHistoryCharacter` 的那個池），以及 `standard` 的 `3.1`（一個池、一筆 `1021`，`count 50`、`sort 50`、`isUp false`）。

```ts
it("builds a limited channel from official statistics", () => {
  const { model, incomplete } = modelFromOfficialStats(index, stored);
  const channel = model.channels.character_up;
  expect(incomplete).toEqual([]);
  expect(channel).toMatchObject({ limited: true, hasRecords: true, total: 300, sCount: 4, upCount: 3,
    averageS: 70, averageUpCost: 100, currentPity: 20, hardPity: 90, toHardPity: 70, pityEstimated: false });
  // 最新的 S 是 UP，所以是小保底
  expect(channel.guaranteed).toBe(false);
  expect(channel.entries.map((entry) => [entry.itemId, entry.pity, entry.isUp])).toEqual([["1641", 76, true], ["1581", 30, true], ["1221", 18, false], ["1581", 76, true]]);
  expect(channel.entries[0]!.pulledAt).toBe("2026-10-21T03:33:24.000Z");
  expect(channel.firstRecordAt).not.toBeNull();
});

it("splits the current version by pool and keeps one segment per past version", () => {
  const segments = modelFromOfficialStats(index, stored).model.channels.character_up.segments;
  expect(segments.map((segment) => [segment.version, segment.ongoing, segment.upNames.length, segment.entries.length, segment.pulls]))
    .toEqual([["3.3", true, 1, 0, null], ["3.3", false, 1, 1, null], ["3.2", false, 0, 0, null], ["3.1", false, 0, 3, null]]);
  expect(segments[0]!.startAt).toBe("2026-11-11T04:00:00.000Z");
  expect(segments[3]!.startAt).toBeNull();
});

it("hides UP information on channels without an UP concept", () => {
  const channel = modelFromOfficialStats(index, stored).model.channels.standard;
  expect(channel).toMatchObject({ limited: false, upCount: null, averageUpCost: null, guaranteed: null });
  expect(channel.entries.every((entry) => entry.isUp === null)).toBe(true);
});

it("reports a channel whose pools do not add up to its S count", () => {
  const short = stored.filter((row) => !(row.category === "character_up" && row.version === "3.1"));
  expect(modelFromOfficialStats(index, short).incomplete).toEqual(["character_up"]);
});

it("computes tickets and available pulls without monochrome", () => {
  expect(modelFromOfficialStats(index, stored).model.tickets)
    .toEqual({ monochrome: 100, polychrome: 1600, encrypted: 3, original: 0, boopon: 7, pullsAvailable: 13 });
});

it("fills channels the account never pulled on with an empty model", () => {
  expect(modelFromOfficialStats(index, stored).model.channels.bangboo)
    .toMatchObject({ hasRecords: false, total: 0, sCount: 0, entries: [], segments: [] });
});

it("builds a channel from archived pulls, grouped by banner with pull counts", () => {
  const channel = channelFromArchive({ category: "character_up", summary, pityEstimated: true, banners, unclassifiedLabel: "未分類" });
  expect(channel).toMatchObject({ total: summary.total, sCount: summary.sRecords.length, upCount: summary.upEligible ? summary.upWins : null,
    averageUpCost: summary.averageUpCost, guaranteed: summary.nextGuaranteed, pityEstimated: true });
  expect(channel.segments.at(-1)).toMatchObject({ key: "__unclassified__", version: "", upNames: ["未分類"] });
  expect(channel.segments[0]!.pulls).toBeGreaterThan(0);
});
```

封存那個測試的 `summary` 用 `analyzeGachaRecords` 對一組含兩個 `bannerId` 加上幾筆 `bannerId: null` 的紀錄算出來；`banners` 是對應的兩筆 `GachaArchiveBanner`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/signalLogModel.test.ts --runInBand` → FAIL。

- [ ] **Step 3: 實作**

`modelFromOfficialStats`：

- `averageS = sCount ? round1((total - currentPity) / sCount) : null`。
- `hardPity = currentPity + toHardPity`；兩者都是 0（資料異常）時退回 `hardPityFor(category)`。
- `entries`：該頻道所有池的 `records`，依 `sort` 由大到小。`kind` 由 `item_type` 判斷（`Avatar` → character、`Weapon` → weapon、`Bangboo` 或 `Buddy` → bangboo），判斷不出來時用 `signalLogPaper.ts` 的 `gtCardKind("", itemId)`。`pulledAt` 是 `recordTime` 秒轉 ISO。
- 非限定頻道：`upCount`、`averageUpCost`、`guaranteed` 是 `null`，每個 entry 的 `isUp` 是 `null`。
- 限定頻道：`averageUpCost = upCount ? Math.round(averageUp) : null`；`guaranteed` 在沒有 entry 時是 `null`，否則是 `!entries[0].isUp`。
- `segments`：依該頻道 `versions` 的順序。某版本的池若有 `startTs > 0`，每個池一段（依 `startTs` 由大到小），`upNames` 取 `upItems` 的 `name`，`ongoing = state === "in_progress"`；否則該版本合成一段。`versions` 裡有、但沒有任何池的版本也要有一段空的。`key` 用 `${version}:${startTs}`。
- `incomplete`：`entries.length !== sCount` 的頻道。
- `tickets.pullsAvailable = Math.floor(polychrome / 160) + encrypted`。
- 六個頻道都要有；`index.types` 裡沒有的用 `emptyChannel`（`hardPity` 用 `hardPityFor`）。

`channelFromArchive`：`entries` 來自 `summary.sRecords`（`pity = pityPosition`）；非限定頻道的 `isUp` 一律改成 `null`（封存分析會把邦布的 S 都標成 UP）；`segments` 依 `summary.records` 的 `bannerId` 分組，套上 `banners` 的版本、UP 名稱、日期，`pulls` 是該組的紀錄筆數，依 `startAt` 新到舊，`bannerId` 為空的歸到最後一段 `__unclassified__`。`toHardPity = currentPity === null ? null : hardPity - currentPity`。

`ticketsFromDetails`：沿用 `signalLogOverview.ts` 的 `TICKET_MATCHERS` 邏輯（搬到這個檔），`details.tickets` 不是非空陣列時回 `null`，`monochrome` 一律 `null`。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/signalLogModel.test.ts --runInBand` → PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogModel.ts tests/signalLogModel.test.ts
git commit -m "feat(gacha): add one view model for official and archived signal data"
```

---

### Task 6: 立繪與專屬音擎對照

**Files:**
- Create: `src/scripts/syncAgentPortraits.ts`、`src/assets/signature-weapons.json`、`src/assets/images/agents/*.webp`（約 27 張）
- Test: `tests/agentPortraits.test.ts`

**Interfaces:**
- Produces:

```ts
export function planPortraitDownloads(index: Record<string, { Image?: string }>, existingIds: ReadonlySet<string>): Array<{ id: string; url: string }>;
export function signatureWeaponMap(index: Record<string, { WeaponId?: number | string }>): Record<string, string>; // 音擎 ID → 角色 ID
```

- `signature-weapons.json` 的內容就是 `signatureWeaponMap` 的結果。

- [ ] **Step 1: 寫失敗的測試**

```ts
it("plans downloads only for agents without local art", () => {
  const index = { "1091": { Image: "/ui/zzz/IconRole13.png" }, "1321": { Image: "/ui/zzz/IconRole37.png" }, "9999": {} };
  expect(planPortraitDownloads(index, new Set(["1091"]))).toEqual([{ id: "1321", url: "https://enka.network/ui/zzz/IconRole37.png" }]);
});

it("maps signature W-Engines to their agent and skips agents without one", () => {
  expect(signatureWeaponMap({ "1091": { WeaponId: 14109 }, "1011": {} })).toEqual({ "14109": "1091" });
});

// catalog.json 在被 git 忽略的資料夾裡；乾淨的 checkout 沒有它，這時略過這個案例
const hasCatalog = existsSync("src/assets/gacha-simulation/catalog.json");
(hasCatalog ? it : it.skip)("has art and a signature mapping for every catalogued S-rank", () => {
  const catalog = JSON.parse(readFileSync("src/assets/gacha-simulation/catalog.json", "utf8"));
  const map = JSON.parse(readFileSync("src/assets/signature-weapons.json", "utf8"));
  const items = Object.values(catalog.items) as Array<{ id: string; rank: string; kind: string }>;
  for (const item of items.filter((entry) => entry.rank === "S" && entry.kind === "character")) {
    expect(existsSync(`src/assets/images/agents/${item.id}.webp`)).toBe(true);
  }
  for (const item of items.filter((entry) => entry.rank === "S" && entry.kind === "weapon")) {
    expect(map[item.id]).toMatch(/^\d{4}$/);
  }
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/agentPortraits.test.ts --runInBand` → FAIL。

- [ ] **Step 3: 實作腳本**
- 索引網址：`https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/zzz/avatars.json`。
- 兩個純函式如上，從腳本檔匯出。只有直接執行時才跑主流程（用 `previews/signal-log-design/render-previews.ts` 結尾同樣的 `import.meta.url` 判斷）。
- 主流程：讀索引 → 列出 `src/assets/images/agents/` 已有的 ID → 逐一下載缺的（間隔 300 ms，逾時 30 秒）→ 用 `@napi-rs/canvas` 的 `loadImage` 解碼後以原尺寸畫到畫布，`canvas.toBuffer("image/webp", 90)` 存成 `{id}.webp` → 寫出 `signature-weapons.json`（鍵排序、兩格縮排）。
- 只取 `Image`，不取 `Skins`。已存在的檔案不覆蓋。
- `--dry-run`：只印出會下載的清單，不寫任何檔案。
- 單一角色下載或解碼失敗：印出並繼續，最後以非 0 結束碼結束。

- [ ] **Step 4: 執行腳本**

Run: `npx tsx src/scripts/syncAgentPortraits.ts --dry-run`，確認清單約 27 筆；再 `npx tsx src/scripts/syncAgentPortraits.ts`。
Expected: 結束碼 0，`src/assets/images/agents/` 多出對應的 `.webp`，每張寬高比約 0.7。

- [ ] **Step 5: 跑測試確認通過**

Run: `npx jest tests/agentPortraits.test.ts --runInBand` → PASS。

- [ ] **Step 6: Commit**

```bash
git add src/scripts/syncAgentPortraits.ts src/assets/signature-weapons.json src/assets/images/agents tests/agentPortraits.test.ts
git commit -m "feat(gacha): sync full-body agent art and signature W-Engine mapping"
```

---

### Task 7: 四種 view、頁數與字串

**Files:**
- Modify: `src/utilities/zzz/signalLogPagination.ts`、`src/utilities/zzz/recordText.ts`、`src/utilities/zzz/gachaArchive.ts`（只有 `view` 的型別註解）
- Test: `tests/signalLogPagination.test.ts`、`tests/gachaArchive.test.ts`、`tests/recordText.test.ts`（新增）

**Interfaces:**
- Produces:

```ts
export type SignalLogView = "home" | "wall" | "versions" | "cycles";
export const WALL_PAGE_SIZE = 35;
export const CYCLE_PAGE_SIZE = 10;
export function normalizeSignalLogView(value: unknown): SignalLogView; // "overview"→"wall"、"records"→"cycles"、不認得→"home"
export function legacyToggleView(view: SignalLogView): SignalLogView;  // "cycles"→"wall"，其餘→"cycles"
export function wallPageCount(sCount: number, hasLiveCell: boolean): number;
```

- `SignalText` 新增的鍵（tw 文案）：`homeTitle` 調頻總覽、`allChannels` 全頻道、`monochrome` 菲林底片、`pullsAvailable` 限定頻道可抽、`pullUnit` 抽、`sCountOf` `{n} 個 S`、`sCount` S 數量、`toHardPity` `距硬保底 {n} 抽`、`smallGuarantee` 小保底、`upOverS` UP / S、`averageUpCost` 每個 UP 平均、`averageSShort` 平均出 S、`pityNow` 目前墊抽、`viewWall` S 牆、`viewVersions` 依版本、`newestFirst` 新 → 舊、`recordsSince` `紀錄自 {date}`、`ongoing` 進行中、`noSInVersion` 沒出 S、`continued` （續）、`upCountOf` `{n} UP`、`homeOption` 全頻道總覽。
- 舊的 `signalLogPageCount`、`switchSignalLogView`、`SIGNAL_LOG_PAGE_SIZE` 這個任務先保留，Task 14 才刪。

- [ ] **Step 1: 寫失敗的測試**

```ts
it("maps stored and unknown view values", () => {
  expect(["overview", "records", "home", "wall", "versions", "cycles", "", null, "x"].map(normalizeSignalLogView))
    .toEqual(["wall", "cycles", "home", "wall", "versions", "cycles", "home", "home", "home"]);
});

it("keeps old toggle buttons working between the wall and pity cycles", () => {
  expect(["wall", "cycles", "home", "versions"].map((view) => legacyToggleView(view as any))).toEqual(["cycles", "wall", "cycles", "cycles"]);
});

it("counts wall pages with the live pity cell taking one slot on the first page", () => {
  expect([[0, true], [34, true], [35, true], [35, false], [36, false], [0, false]].map(([s, live]) => wallPageCount(s as number, live as boolean)))
    .toEqual([1, 1, 2, 1, 2, 1]);
});
```

`tests/gachaArchive.test.ts`：存一個 `view: "versions"` 的 session 讀回來仍是 `"versions"`；直接對資料表寫入 `view = 'overview'` 的列，讀出來是 `"wall"`。

`tests/recordText.test.ts`：對七種語言逐一檢查上列每個新鍵都是非空字串；`toHardPity`、`sCountOf`、`recordsSince`、`upCountOf` 含有對應的 `{n}` 或 `{date}`；tw 的 `viewVersions` 等於「依版本」。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/signalLogPagination.test.ts tests/gachaArchive.test.ts tests/recordText.test.ts --runInBand` → FAIL。

- [ ] **Step 3: 實作**

`SIGNAL_EN` 補英文，六種語言各補一份翻譯。資料表不改結構（欄位預設值 `'overview'` 讀出來會轉成 `wall`）。`signalLogView.ts` 目前把 `view` 當成 `"overview" | "records"` 使用的地方，這個任務先用 `normalizeSignalLogView` 加上暫時的對應讓型別通過，行為不變（Task 13 會整段重寫）。

- [ ] **Step 4: 跑測試確認通過**

Run: 同 Step 2 → PASS；`npx tsc --noEmit` → 無錯誤；`npx jest tests/signalLogRenderer.test.ts --runInBand` → PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogPagination.ts src/utilities/zzz/recordText.ts src/utilities/zzz/gachaArchive.ts src/utilities/zzz/signalLogView.ts tests/signalLogPagination.test.ts tests/gachaArchive.test.ts tests/recordText.test.ts
git commit -m "feat(gacha): add signal log views, wall paging and copy"
```

---

### Task 8: 繪圖基礎與海報面板

**Files:**
- Modify: `src/utilities/zzz/signalLogPaper.ts`
- Create: `src/utilities/zzz/signalLogPoster.ts`
- Test: `tests/signalLogPaper.test.ts`、`tests/signalLogPoster.test.ts`

**Interfaces:**
- Consumes: Task 5 的模型型別；Task 6 的 `signature-weapons.json`。
- Produces:

```ts
// signalLogPaper.ts（新增，舊的匯出先不動）
export const POSTER_WIDTH = 264;
export const CONTENT_X = 284;
export const CONTENT_WIDTH = 700;
export const PAGE_MARGIN = 16;
export const MIN_IMAGE_HEIGHT = 560;
export const MAX_IMAGE_HEIGHT = 1100;
export function pityTone(position: number | null, hardPity: number): string;
export function drawUpTag(ctx: SKRSContext2D, right: number, top: number, size: number): void;
export function drawPityPill(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, label: string, color: string): void;
export function localeText(ctx: SKRSContext2D, locale: string | undefined, value: unknown, x: number, y: number, size: number, color: string, options?: { align?: CanvasTextAlign; bold?: boolean; maxWidth?: number }): number; // 回傳實際繪製寬度
export function prepareSCard(entry: Pick<SignalSEntry, "itemId" | "kind">): ReturnType<typeof prepareGtCard>;

// signalLogPoster.ts
export type PosterArt = { type: "full" | "wide" | "icon" | "none"; image: Image | null; crop?: [number, number, number, number] };
export interface PosterSubject { agentId: string | null; iconItem: { id: string; kind: SignalItemKind } | null; accent: string }
export function resolvePosterSubject(input: { view: SignalLogView; model: SignalLogModel; category: GachaStatCategory; banner?: Pick<GachaArchiveBanner, "upItems"> }): PosterSubject;
export async function loadPosterArt(subject: PosterSubject): Promise<PosterArt>;
export async function drawPoster(ctx: SKRSContext2D, height: number, input: { subject: PosterSubject; title: string; chip: string; playerName: string; uid: string; locale?: string }): Promise<void>;
```

- [ ] **Step 1: 寫失敗的測試**

`tests/signalLogPaper.test.ts`（新增案例）：

```ts
it("uses the new tone thresholds", () => {
  expect([75, 76, 52, 53, 1].map((position) => pityTone(position, 90))).toEqual(["#c9870f", "#d9473b", "#2f8f6f", "#c9870f", "#2f8f6f"]);
  expect(pityTone(null, 90)).toBe("#817a75");
});

it("shrinks or truncates text to the given width in the drawing locale", () => {
  const ctx = createCanvas(400, 100).getContext("2d");
  expect(localeText(ctx, "fr", "Résonance Amplificateur exclusive très longue", 0, 20, 30, "#000", { maxWidth: 120 })).toBeLessThanOrEqual(120);
});
```

`tests/signalLogPoster.test.ts`：

```ts
it("picks the newest S-rank agent across channels for the home page", () => {
  expect(resolvePosterSubject({ view: "home", model, category: "character_up" }).agentId).toBe("1641");
});

it("prefers the newest UP on a channel and falls back to the newest S", () => {
  expect(resolvePosterSubject({ view: "wall", model, category: "character_up" }).agentId).toBe("1641");
  expect(resolvePosterSubject({ view: "wall", model: noUpModel, category: "character_up" }).agentId).toBe(noUpModel.channels.character_up.entries[0]!.itemId);
});

it("uses the signature agent for W-Engines", () => {
  expect(resolvePosterSubject({ view: "wall", model: weaponModel, category: "weapon_up" }).agentId).toBe("1091"); // 14109 → 1091
});

it("uses the banner's S-rank UP when pity cycles are filtered to one banner", () => {
  expect(resolvePosterSubject({ view: "cycles", model, category: "character_up", banner: { upItems: [{ id: "1321", name: "", icon: "", rarity: "S" }] } }).agentId).toBe("1321");
});

it("keeps the bangboo as an icon subject", () => {
  expect(resolvePosterSubject({ view: "wall", model: bangbooModel, category: "bangboo" })).toMatchObject({ agentId: null, iconItem: { kind: "bangboo" } });
});

it("survives an agent unknown to every lookup table", async () => {
  const subject = resolvePosterSubject({ view: "wall", model: unknownAgentModel /* itemId "1999" */, category: "character_up" });
  expect(subject).toMatchObject({ agentId: "1999", accent: "#de493e" });
  await expect(loadPosterArt(subject)).resolves.toMatchObject({ type: "none", image: null });
});

it("falls back from full art to the wide portrait", async () => {
  const subject = { agentId: "1091", iconItem: null, accent: "#05777a" };
  expect((await loadPosterArt(subject)).type).toBe("full");
  process.env.ZZZ_AGENT_ART_DIR = mkdtempSync(join(tmpdir(), "zzz-art-"));   // 空目錄：1091 沒有全身圖
  try { expect((await loadPosterArt(subject)).type).toBe("wide"); }
  finally { delete process.env.ZZZ_AGENT_ART_DIR; }
});

it("draws every fallback and long names without throwing", async () => {
  for (const subject of [fullSubject, wideSubject, iconSubject, emptySubject]) {
    const { canvas, ctx } = createScaledCanvas(700);
    await drawPoster(ctx, 700, { subject, title: "Résonance Amplificateur", chip: "3.3 賽維里安／諾姆／很長的卡池名稱", playerName: "名字非常非常非常非常長的繩匠", uid: "1300000001", locale: "fr" });
    expect((await loadImage(canvas.toBuffer("image/png"))).width).toBe(2000);
  }
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/signalLogPaper.test.ts tests/signalLogPoster.test.ts --runInBand` → FAIL。

- [ ] **Step 3: 實作**
- `pityTone`：門檻和顏色見 Global Constraints。舊的 `progressColor` 改成直接回傳 `pityTone` 的結果。
- `drawUpTag`、`drawPityPill`、海報的繪製方式照 `previews/signal-log-spike/render-b.ts` 的 `upTag`、`pill`、`drawPoster`（只參考畫法，不要沿用它的檔案結構和假資料）。
- `localeText`：用 `getZzzOfficialFont(locale)` 設字型並量測；超過 `maxWidth` 先逐級縮字到原字級的 0.7，仍超過就截斷加「…」。
- `prepareSCard`：包住現有的 `prepareGtCard`，把 `kind` 轉成它要的 `itemType` 字串。
- `resolvePosterSubject` 的規則照 spec「主角怎麼選」那張表。主角是音擎時查 `signature-weapons.json`；查不到就當成 `iconItem`。屬性：先看 `banner.upItems` 中該角色的 `elementType`，再查 `src/assets/disc-leaderboard-elements.json`，都沒有就用 `#de493e`；有屬性時 `getPaperAccent(safeAccent(undefined, elementType))`。
- `loadPosterArt` 的順序：`{ZZZ_AGENT_ART_DIR ?? src/assets/images/agents}/{id}.webp` → `src/assets/gacha-simulation/ui/characters/{id}.png` 加 catalog 的 `crop` → `iconItem` 的方形圖 → `none`。任何載入失敗都往下一層。
- 海報上的 `title` 用 46px 粗體、`chip` 15px、`playerName` 17px，三者都以 `maxWidth = POSTER_WIDTH - 40` 經 `localeText` 繪製。

- [ ] **Step 4: 跑測試確認通過**

Run: 同 Step 2 → PASS；`npx jest tests/signalLogRenderer.test.ts tests/signalLogCycles.test.ts --runInBand` → PASS（舊畫面顏色改變不影響現有斷言；若有斷言寫死舊色碼，改成新色碼）。

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogPaper.ts src/utilities/zzz/signalLogPoster.ts tests/signalLogPaper.test.ts tests/signalLogPoster.test.ts
git commit -m "feat(gacha): add poster panel and shared signal log primitives"
```

---

### Task 9: 狀態區與 S 牆

**Files:**
- Create: `src/utilities/zzz/signalLogStatus.ts`、`src/utilities/zzz/signalLogWall.ts`
- Modify: `src/utilities/zzz/signalLogRenderer.ts`
- Test: `tests/signalLogWall.test.ts`

**Interfaces:**
- Consumes: Task 5、7、8。
- Produces:

```ts
// signalLogRenderer.ts
export interface SignalLogImageInput {
  locale?: string; uid: string; playerName?: string | null; archivedAt?: string | null; stale?: boolean;
  view: SignalLogView; page: number; category: GachaStatCategory; model: SignalLogModel;
  cycles?: { summary: GachaSummary; pityEstimated: boolean; openCycleIsLive: boolean; bannerLabel: string | null; banner?: Pick<GachaArchiveBanner, "name" | "version" | "upItems"> };
}
export async function renderSignalLogImage(input: SignalLogImageInput): Promise<Buffer>;
export function signalLogImagePageCount(input: Pick<SignalLogImageInput, "view" | "category" | "model" | "cycles">): number;

// signalLogStatus.ts
export const STATUS_HEIGHT = 172; // 墊抽卡 84 + 間距 10 + 數據格 78
export function statusTiles(channel: SignalChannelModel, locale?: string): Array<{ label: string; value: string; unit: string }>;
export function drawChannelStatus(ctx: SKRSContext2D, input: { channel: SignalChannelModel; locale?: string; accent: string; y: number }): void;

// signalLogWall.ts
export const S_CELL = { columns: 7, gap: 9, avatar: 76, pill: 27, height: 126 } as const;
export function drawSCell(ctx: SKRSContext2D, x: number, y: number, width: number, entry: SignalSEntry, hardPity: number, limited: boolean, card: Awaited<ReturnType<typeof prepareSCard>>, assets: GtCardAssets): void;
export function drawLiveCell(ctx: SKRSContext2D, x: number, y: number, width: number, pity: number, hardPity: number, accent: string): void;
export function wallHeight(rows: number): number;
export async function renderSignalWall(input: SignalLogImageInput): Promise<Buffer>;
```

- [ ] **Step 1: 寫失敗的測試**

```ts
it("shows four tiles on limited channels and three elsewhere", () => {
  expect(statusTiles(limitedChannel, "tw").map((tile) => [tile.label, tile.value, tile.unit]))
    .toEqual([["總抽數", "300", ""], ["平均出 S", "70", "抽"], ["UP / S", "3/4", ""], ["每個 UP 平均", "100", "抽"]]);
  expect(statusTiles(standardChannel, "tw").map((tile) => tile.label)).toEqual(["總抽數", "平均出 S", "S 數量"]);
  expect(statusTiles({ ...limitedChannel, sCount: 0, upCount: 0, averageS: null, averageUpCost: null }, "tw").map((tile) => tile.value))
    .toEqual(["300", "—", "0/0", "—"]);
});

it("sizes the wall between three and five rows", () => {
  expect([1, 3, 5].map(wallHeight)).toEqual([680, 680, 950]);
});

it("pages 34 S-ranks after the live cell, then 35 per page", () => {
  const model = modelWith(80 /* S */, { currentPity: 20 });
  expect(signalLogImagePageCount({ view: "wall", category: "character_up", model })).toBe(3); // 1+34, 35, 11
});

it("renders the wall at 2x width within the height limits", async () => {
  for (const [count, pity] of [[0, null], [3, 20], [80, 20]] as const) {
    const image = await loadImage(await renderSignalLogImage({ uid: "1300000001", view: "wall", page: 0, category: "character_up", model: modelWith(count, { currentPity: pity }) }));
    expect(image.width).toBe(2000);
    expect(image.height).toBeGreaterThanOrEqual(1120);
    expect(image.height).toBeLessThanOrEqual(2200);
  }
});

it("clamps a page beyond the last one", async () => {
  await expect(renderSignalLogImage({ uid: "1", view: "wall", page: 99, category: "character_up", model: modelWith(3, { currentPity: 1 }) })).resolves.toBeInstanceOf(Buffer);
});
```

`modelWith(count, { currentPity })` 是測試內的工具：六個頻道用 `emptyChannel`，再把 `character_up` 換成有 `count` 個 entry 的頻道。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/signalLogWall.test.ts --runInBand` → FAIL。

- [ ] **Step 3: 實作**
- 版面數值照 `previews/signal-log-spike/render-b.ts` 的 `renderWall`：上緣 16、墊抽卡高 84、數據格高 78、區段標題 44、頁尾 42，格高 126、列距 9。`wallHeight(rows) = 16 + 84 + 10 + 78 + 10 + 44 + rows × 126 + (rows − 1) × 9 + 42`，`rows` 夾在 3 到 5。
- 墊抽卡：`currentPity` 是 `null` 時數字顯示「—」，不畫進度條和「距硬保底」。`pityEstimated` 時標籤後加 `copy.estimated`。`guaranteed` 是 `true` 畫紅底的大保底標籤，`false` 畫外框的小保底，`null` 不畫。
- 「?」格只在第 1 頁、且 `currentPity !== null` 時出現。
- 沒有 S 也沒有「?」格時，牆的位置畫一張空狀態卡，文字用 `copy.noS`。
- 頁尾右側：`pageOf`，加上 `recordsSince`（`firstRecordAt` 取到月）；`stale` 時改成紅字的 `copy.syncFailed`。
- `renderSignalLogImage` 這個任務只處理 `wall`，其他 view 先丟 `Error("view not implemented")`，後面的任務補上。
- `signalLogImagePageCount`：`wall` 用 `wallPageCount(entries.length, currentPity !== null)`；其他 view 這個任務先回 1。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/signalLogWall.test.ts --runInBand` → PASS；`npx tsc --noEmit` → 無錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogStatus.ts src/utilities/zzz/signalLogWall.ts src/utilities/zzz/signalLogRenderer.ts tests/signalLogWall.test.ts
git commit -m "feat(gacha): render the S-rank wall with the channel status block"
```

---

### Task 10: 全頻道首頁

**Files:**
- Create: `src/utilities/zzz/signalLogHome.ts`
- Modify: `src/utilities/zzz/signalLogRenderer.ts`
- Test: `tests/signalLogHome.test.ts`

**Interfaces:**
- Consumes: Task 5、8、9（`drawSCell` 不用；首頁的小頭像自己畫，但用 `prepareSCard`、`drawUpTag`、`drawPityPill`）。
- Produces:

```ts
export function homeHeight(model: SignalLogModel): number;
export function ticketCells(tickets: SignalTickets, locale?: string): Array<{ label: string; value: string }>;
export async function renderSignalHome(input: SignalLogImageInput): Promise<Buffer>;
```

- [ ] **Step 1: 寫失敗的測試**

```ts
it("lists five tickets, or four when monochrome is unknown", () => {
  const tickets = { monochrome: 100, polychrome: 1600, encrypted: 3, original: 0, boopon: 7, pullsAvailable: 13 };
  expect(ticketCells(tickets, "tw")).toEqual([{ label: "菲林底片", value: "100" }, { label: "菲林", value: "1,600" }, { label: "加密母帶", value: "3" }, { label: "原裝母帶", value: "0" }, { label: "邦布券", value: "7" }]);
  expect(ticketCells({ ...tickets, monochrome: null }, "tw").map((cell) => cell.label)).toEqual(["菲林", "加密母帶", "原裝母帶", "邦布券"]);
});

it("uses half-height rows for empty channels and never goes below the minimum height", () => {
  expect(homeHeight(allEmptyModel)).toBe(560);                       // 16 + 6×44 + 5×9 + 42 = 367 → 560
  expect(homeHeight(fourActiveWithTickets)).toBe(16 + 66 + 10 + 4 * 94 + 2 * 44 + 5 * 9 + 42);
  expect(homeHeight({ ...fourActiveWithTickets, tickets: null })).toBe(16 + 4 * 94 + 2 * 44 + 5 * 9 + 42);
});

it("renders the home page for full, ticketless and empty accounts", async () => {
  for (const model of [fourActiveWithTickets, { ...fourActiveWithTickets, tickets: null }, allEmptyModel]) {
    const image = await loadImage(await renderSignalLogImage({ uid: "1300000001", view: "home", page: 0, category: "character_up", model }));
    expect(image.width).toBe(2000);
    expect(image.height).toBeLessThanOrEqual(2200);
  }
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/signalLogHome.test.ts --runInBand` → FAIL。

- [ ] **Step 3: 實作**

版面數值照 `render-b.ts` 的 `renderHome`：票券列高 66、有紀錄的列高 94、空列高 44、列距 9、頁尾 42。

- 票券列：`ticketCells` 的格子等寬排在左邊，右邊固定 164 寬的「限定頻道可抽」卡，用主角屬性色外框。`tickets` 是 `null` 時整列不畫。圖示沿用 `signalLogOverview.ts` 現在用的四張；菲林底片先試 `src/assets/images/zzz/official-record/icon-film-summary.06b22800.png`，載入失敗就不畫圖示、只畫文字。
- 頻道列固定依 `GACHA_CATEGORY_ORDER`。`hasRecords` 為 false 畫空列。
- 有紀錄的列：頻道名（`signalCategoryText`，`maxWidth` 150）、`total` 加 `sCountOf`、墊抽數字加 `/hardPity`、限定頻道的大小保底標籤、進度條寬 196、最近 4 個 entry（頭像 52、UP 角標、色塊）。`currentPity` 是 `null` 時數字顯示「—」。
- 頁尾：所有頻道 `firstRecordAt` 最早的月份（`recordsSince`）加更新時間；`stale` 時紅字 `syncFailed`。
- 海報：`title = copy.homeTitle`、`chip = copy.allChannels`。
- `renderSignalLogImage` 接上 `home`；`signalLogImagePageCount` 對 `home` 回 1。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/signalLogHome.test.ts --runInBand` → PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogHome.ts src/utilities/zzz/signalLogRenderer.ts tests/signalLogHome.test.ts
git commit -m "feat(gacha): render the all-channel home page"
```

---

### Task 11: 依版本

**Files:**
- Create: `src/utilities/zzz/signalLogVersions.ts`
- Modify: `src/utilities/zzz/signalLogRenderer.ts`
- Test: `tests/signalLogVersions.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `SignalSegment`；Task 9 的 `S_CELL`、`drawSCell`、`drawChannelStatus`。
- Produces:

```ts
export const VERSION_PAGE_BUDGET = 666;   // 5 列 S 牆的高度：5×126 + 4×9
export const SEGMENT_HEADER_HEIGHT = 34;
export const SEGMENT_GAP = 12;
export interface SegmentSlice { segment: SignalSegment; entries: SignalSEntry[]; continued: boolean }
export function sliceHeight(slice: SegmentSlice): number;
export function paginateSegments(segments: SignalSegment[]): SegmentSlice[][];
export function segmentTitle(segment: SignalSegment, locale?: string): string;
export function segmentSummary(segment: SignalSegment, limited: boolean, locale?: string): string;
export async function renderSignalVersions(input: SignalLogImageInput): Promise<Buffer>;
```

- [ ] **Step 1: 寫失敗的測試**

`seg(version, count, extra?)` 是測試內的工具，產生有 `count` 個 entry 的 `SignalSegment`。

```ts
it("measures a slice by its header and rows", () => {
  expect([0, 1, 7, 8].map((count) => sliceHeight({ segment: seg("3.1", count), entries: seg("3.1", count).entries, continued: false })))
    .toEqual([34, 34 + 126, 34 + 126, 34 + 126 + 9 + 126]);
});

it("packs whole segments into a page and starts a new page when the next one does not fit", () => {
  // 每段 1 列 = 160，加段距 12：四段 = 676 > 666，所以第四段到下一頁
  const pages = paginateSegments([seg("3.4", 7), seg("3.3", 7), seg("3.2", 7), seg("3.1", 7)]);
  expect(pages.map((page) => page.map((slice) => slice.segment.version))).toEqual([["3.4", "3.3", "3.2"], ["3.1"]]);
});

it("splits a segment that is larger than a page and marks the rest as continued", () => {
  const pages = paginateSegments([seg("2.1", 40)]);   // 6 列，一頁最多 4 列（34 + 4×126 + 3×9 = 565；5 列是 700）
  expect(pages.map((page) => page.map((slice) => [slice.entries.length, slice.continued]))).toEqual([[[28, false]], [[12, true]]]);
});

it("keeps empty versions as header-only slices and returns one empty page for no segments", () => {
  expect(paginateSegments([seg("3.2", 0)])[0]![0]!.entries).toEqual([]);
  expect(paginateSegments([])).toEqual([[]]);
});

it("titles and summarises segments", () => {
  expect(segmentTitle(seg("3.3", 1, { upNames: ["菲歐妮", "維琳娜"], startAt: "2026-10-21T02:00:00.000Z", endAt: "2026-11-11T03:59:59.000Z" }), "tw")).toBe("3.3  菲歐妮／維琳娜  10/21–11/11");
  expect(segmentTitle(seg("3.1", 4), "tw")).toBe("3.1");
  expect(segmentSummary(seg("3.1", 4 /* 3 UP */), true, "tw")).toBe("4 個 S · 3 UP");
  expect(segmentSummary(seg("3.1", 4), false, "tw")).toBe("4 個 S");
  expect(segmentSummary(seg("3.2", 0), true, "tw")).toBe("沒出 S");
  expect(segmentSummary(seg("3.0", 2, { pulls: 120 }), true, "tw")).toBe("120 抽 · 2 個 S · 2 UP");
});

it("renders a version page within the height limits", async () => {
  const image = await loadImage(await renderSignalLogImage({ uid: "1", view: "versions", page: 0, category: "character_up", model: versionedModel }));
  expect(image.width).toBe(2000);
  expect(image.height).toBeLessThanOrEqual(2200);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/signalLogVersions.test.ts --runInBand` → FAIL。

- [ ] **Step 3: 實作**

`paginateSegments`：

```
頁 = []，已用高度 = 0
對每一段：
  剩下的 entries = 全部；continued = false
  重複：
    可用 = 666 − 已用高度 −（頁非空 ? 12 : 0）
    整段高度 = sliceHeight(剩下的)
    若 整段高度 <= 可用：放進這一頁，已用高度加上去，換下一段
    否則若 頁非空：換新頁，再試
    否則（頁是空的還是放不下）：算出這一頁放得下的最大列數 rows = floor((666 − 34 + 9) / (126 + 9)) = 4，
      放 rows × 7 個，換新頁，剩下的標成 continued
```

- 日期用 `Asia/Taipei` 時區的 `MM/DD`。
- 段落標題左側是 `segmentTitle`（`continued` 時後面加 `copy.continued`）；`ongoing` 時在標題後畫 `copy.ongoing` 標籤；右側是 `segmentSummary`。
- 圖片高度：`16 + 172 + 10 + 44 + 該頁內容高度 + 42`，不足 560 補到 560。
- 沒有任何段落時畫空狀態卡（`copy.noRecords`）。
- `renderSignalLogImage` 接上 `versions`；`signalLogImagePageCount` 對 `versions` 回 `paginateSegments(channel.segments).length`。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/signalLogVersions.test.ts --runInBand` → PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogVersions.ts src/utilities/zzz/signalLogRenderer.ts tests/signalLogVersions.test.ts
git commit -m "feat(gacha): render S-ranks grouped by version"
```

---

### Task 12: 保底週期換成新外框

**Files:**
- Modify: `src/utilities/zzz/signalLogCycles.ts`、`src/utilities/zzz/signalLogCycleData.ts`、`src/utilities/zzz/signalLogRenderer.ts`
- Test: `tests/signalLogCycles.test.ts`

**Interfaces:**
- Consumes: Task 8、9。
- Produces:

```ts
// signalLogCycleData.ts：新增第四個參數
export function buildPityCycles(summary: GachaSummary, pityEstimated?: boolean, openIsLive?: boolean, livePity?: number | null): PityCycle[];

// signalLogCycles.ts
export async function renderSignalCyclesPoster(input: SignalLogImageInput): Promise<Buffer>;
```

- 舊的 `renderSignalCycles` 先保留（Task 14 刪）。

- [ ] **Step 1: 寫失敗的測試**

```ts
it("uses the live pity for the open cycle when one is supplied", () => {
  const summary = summaryWithOpenPulls(18);            // 最後一個 S 之後有 18 筆紀錄
  expect(buildPityCycles(summary, false, true)[0]!.length).toBe(18);
  expect(buildPityCycles(summary, false, true, 20)[0]!.length).toBe(20);   // 紀錄比即時狀態慢 2 抽
  expect(buildPityCycles(summary, false, false, 20)[0]!.sRecord).not.toBeNull(); // 看舊卡池時沒有進行中的列
});

it("renders pity cycles inside the poster frame", async () => {
  const image = await loadImage(await renderSignalLogImage({ uid: "1", view: "cycles", page: 0, category: "character_up", model,
    cycles: { summary, pityEstimated: false, openCycleIsLive: true, bannerLabel: null } }));
  expect(image.width).toBe(2000);
  expect(image.height).toBeLessThanOrEqual(2200);
});

it("renders an empty state when there are no archived pulls", async () => {
  await expect(renderSignalLogImage({ uid: "1", view: "cycles", page: 0, category: "character_up", model,
    cycles: { summary: emptySummary(), pityEstimated: false, openCycleIsLive: true, bannerLabel: null } })).resolves.toBeInstanceOf(Buffer);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/signalLogCycles.test.ts --runInBand` → FAIL。

- [ ] **Step 3: 實作**
- `buildPityCycles`：只有在 `openIsLive` 且 `livePity` 是數字時，進行中那一列的 `length` 改用 `livePity`；`livePity > 0` 而紀錄裡沒有未結束的抽數時，也要補上一列進行中的週期。其他行為不變。
- `renderSignalCyclesPoster`：海報面板加 `drawChannelStatus`，下面是區段標題（`copy.pityCycles` 加 S／A／B 圖例）和每頁 10 列。列高 56、列距 8；每列左邊頭像 44（進行中是虛線「?」），中間進度軌（格數 = `hardPity`，`cycleTrackCells` 不變），右邊抽數；`isUp === true` 且限定頻道時在抽數旁畫 `drawUpTag`。
- 傳給 `buildPityCycles` 的 `livePity` 是 `input.model.channels[category].currentPity`，這樣進行中那一列、墊抽卡和 S 牆的「?」格是同一個數字。
- 海報：`chip` 是 `cycles.bannerLabel ?? copy.allRecords`；主角用 `resolvePosterSubject({ view: "cycles", banner: cycles.banner, ... })`。
- 圖片高度 `16 + 172 + 10 + 44 + 列數 × 56 + (列數 − 1) × 8 + 42`，不足 560 補到 560。
- `renderSignalLogImage` 接上 `cycles`（沒帶 `input.cycles` 時丟錯）；`signalLogImagePageCount` 對 `cycles` 回 `ceil(週期數 / 10)`，至少 1。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/signalLogCycles.test.ts --runInBand` → PASS；`npx tsc --noEmit` → 無錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogCycles.ts src/utilities/zzz/signalLogCycleData.ts src/utilities/zzz/signalLogRenderer.ts tests/signalLogCycles.test.ts
git commit -m "feat(gacha): move pity cycles into the poster frame"
```

---

### Task 13: 接上 Discord

**Files:**
- Modify: `src/utilities/zzz/signalLogView.ts`
- Test: `tests/signalLogView.test.ts`（新增）

**Interfaces:**
- Consumes: Task 2–5、7、9–12 的全部匯出。
- Produces（供測試使用，從 `signalLogView.ts` 匯出）：

```ts
export const HOME_CATEGORY_VALUE = "__home__";
export function buildSignalLogModel(input: { archive: GachaArchiveStore; ownerId: string; uid: string; details?: any; unclassifiedLabel: string }): { model: SignalLogModel; summaries: Record<GachaStatCategory, GachaSummary> };
export function signalLogControls(session: SignalLogSession, model: SignalLogModel, pageCount: number): ActionRowBuilder<any>[];
export function applySignalLogAction(session: SignalLogSession, customId: string, selected?: string): void;
export async function refreshOfficialStats(input: {
  zzz: unknown; ownerId: string; uid: string; archive: GachaArchiveStore;
  createClient?: typeof createGachaStatClient; sync?: typeof syncOfficialGachaStats;
}): Promise<"synced" | "skipped" | "failed">;
```

- [ ] **Step 1: 寫失敗的測試**

用記憶體資料庫的 `GachaArchiveStore`。

```ts
describe("building the model", () => {
  it("uses official statistics when they are stored and complete", () => {
    seedOfficialStats(store);                       // Task 3 的方法，內容同 Task 5 的樣本
    const { model } = buildSignalLogModel({ archive: store, ownerId: "owner", uid: "1300000001", unclassifiedLabel: "未分類" });
    expect(model.channels.character_up.total).toBe(300);
    expect(model.tickets!.monochrome).toBe(100);
  });
  it("falls back to archived pulls for a channel whose statistics are incomplete", () => {
    seedOfficialStats(store, { dropVersion: "3.1" });
    seedArchivedPulls(store, "character_up", 120);
    const { model } = buildSignalLogModel({ archive: store, ownerId: "owner", uid: "1300000001", unclassifiedLabel: "未分類" });
    expect(model.channels.character_up.total).toBe(120);
  });
  it("uses archived pulls alone for import-only accounts", () => {
    seedArchivedPulls(store, "standard", 60);
    const { model } = buildSignalLogModel({ archive: store, ownerId: "owner", uid: "1300000001", unclassifiedLabel: "未分類" });
    expect(model.channels.standard).toMatchObject({ total: 60, hasRecords: true });
    expect(model.tickets).toBeNull();
  });
});

describe("refreshing official statistics", () => {
  it("reports a failed sync without throwing and leaves the stored statistics usable", async () => {
    seedOfficialStats(store);
    const sync = jest.fn().mockRejectedValue(new Error("Please log in"));
    await expect(refreshOfficialStats({ zzz: {}, ownerId: "owner", uid: "1300000001", archive: store, createClient: () => ({}) as any, sync })).resolves.toBe("failed");
    expect(buildSignalLogModel({ archive: store, ownerId: "owner", uid: "1300000001", unclassifiedLabel: "未分類" }).model.channels.character_up.total).toBe(300);
  });
  it("skips accounts without a usable cookie and reports success otherwise", async () => {
    const sync = jest.fn().mockResolvedValue({ requests: 1 });
    await expect(refreshOfficialStats({ zzz: {}, ownerId: "owner", uid: "1300000001", archive: store, createClient: () => undefined, sync })).resolves.toBe("skipped");
    expect(sync).not.toHaveBeenCalled();
    await expect(refreshOfficialStats({ zzz: {}, ownerId: "owner", uid: "1300000001", archive: store, createClient: () => ({}) as any, sync })).resolves.toBe("synced");
  });
});

describe("controls", () => {
  it("shows only the channel menu on the home page, with a summary per channel", () => {
    const rows = signalLogControls({ ...session, view: "home" }, model, 1).map((row) => row.toJSON());
    expect(rows).toHaveLength(1);
    const options = rows[0]!.components[0].options;
    expect(options.map((option: any) => option.value)).toEqual(["__home__", "character_up", "character_return", "weapon_up", "weapon_return", "standard", "bangboo"]);
    expect(options[1].description).toBe("20/90 · 小保底");
    expect(options[2].description).toBe("尚無紀錄");
  });
  it("shows paging and three view buttons on channel views, with the current one disabled", () => {
    const rows = signalLogControls({ ...session, view: "wall" }, model, 3).map((row) => row.toJSON());
    expect(rows).toHaveLength(2);
    expect(rows[1]!.components.map((component: any) => component.custom_id.split(":")[0]))
      .toEqual(["glog-page-prev", "glog-page-next", "glog-view-wall", "glog-view-versions", "glog-view-cycles"]);
    expect(rows[1]!.components[2].disabled).toBe(true);
  });
  it("adds the banner menu only on pity cycles", () => {
    seedBanners(store, 2);
    expect(signalLogControls({ ...session, view: "cycles" }, model, 1)).toHaveLength(3);
    expect(signalLogControls({ ...session, view: "versions" }, model, 1)).toHaveLength(2);
  });
});

describe("actions", () => {
  it("moves between the home page and channels, keeping the view when changing channel", () => {
    const state = { ...session, view: "home" as const, page: 2 };
    applySignalLogAction(state, "glog-category:t", "weapon_up");
    expect(state).toMatchObject({ view: "wall", category: "weapon_up", page: 0 });
    applySignalLogAction(state, "glog-view-versions:t");
    applySignalLogAction(state, "glog-category:t", "standard");
    expect(state).toMatchObject({ view: "versions", category: "standard", page: 0 });
    applySignalLogAction(state, "glog-category:t", "__home__");
    expect(state.view).toBe("home");
  });
  it("resets the page when switching view and honours old toggle buttons", () => {
    const state = { ...session, view: "wall" as const, page: 4 };
    applySignalLogAction(state, "glog-view:t");
    expect(state).toMatchObject({ view: "cycles", page: 0 });
    applySignalLogAction(state, "glog-view:t");
    expect(state.view).toBe("wall");
  });
  it("ignores an unknown channel value", () => {
    const state = { ...session, view: "wall" as const, category: "character_up" as const };
    applySignalLogAction(state, "glog-category:t", "nonsense");
    expect(state.category).toBe("character_up");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/signalLogView.test.ts --runInBand` → FAIL。

- [ ] **Step 3: 實作**
- `SignalLogSession.view` 型別改成新的 `SignalLogView`；新 session 預設 `view: "home"`。
- `buildSignalLogModel`：
  1. 六個頻道各跑 `listTimeline` 加 `analyzeGachaRecords`（`bannerId` 不帶，`livePity`、`liveGuaranteed` 來自 `readLiveGachaState(details, category)`），再用 `channelFromArchive` 轉成封存版的頻道。
  2. 資料庫有 `getOfficialStatIndex` 時，`modelFromOfficialStats(index, listOfficialStatPools(...))`；`incomplete` 裡的頻道換成封存版，並 `console.warn` 一行（只寫頻道名和兩邊的數量，不寫 UID）。票券用官方的。
  3. 沒有官方統計時，六個頻道都用封存版，票券用 `ticketsFromDetails(details)`。
- `refreshOfficialStats`：`createClient(zzz)` 回 `undefined` 就回 `"skipped"`；否則呼叫 `sync`，成功回 `"synced"`，任何錯誤都接住並回 `"failed"`。
- `createSignalLogSession`：現有的官方同步之後呼叫 `refreshOfficialStats`；結果是 `"failed"` 時設 `session.stale = true`。
- `buildSignalLogMessage`：呼叫 `buildSignalLogModel`，用 `signalLogImagePageCount` 夾住 `session.page`，再呼叫 `renderSignalLogImage`。只有 `view === "cycles"` 時才準備 `cycles`（沿用現在的卡池篩選、`pityEstimated`、`openCycleIsLive` 計算）。
- `signalLogControls`：
  - 第 1 列頻道選單：`HOME_CATEGORY_VALUE`（`copy.homeOption`）加六個頻道。頻道選項的 `description`：有紀錄時是 `${currentPity ?? "—"}/${hardPity}`，限定頻道且 `guaranteed !== null` 時加 ` · 大保底` 或 ` · 小保底`；沒紀錄是 `copy.empty`。
  - `home` 只有第 1 列。
  - `cycles` 才有卡池選單，以及卡池超過一頁時的「較新／較舊卡池」那一列。
  - 按鈕列：上一頁、下一頁、`glog-view-wall`、`glog-view-versions`、`glog-view-cycles`；目前的 view 那顆 `ButtonStyle.Primary` 且 `disabled`，其餘 `Secondary`。
- `applySignalLogAction`：把 `handleSignalLogComponent` 裡那串 `if` 搬出來成純函式並補上新規則——選 `__home__` 進首頁；在首頁選頻道進 `wall`；切換頻道保留 view；切換 view 頁碼歸零；`glog-view:` 用 `legacyToggleView`；不認得的頻道值不動。`handleSignalLogComponent` 改成呼叫它。
- 離開 `cycles` 時把 `session.bannerId` 設回 `ALL_SIGNAL_BANNERS`。
- 權限檢查、`validateSession`、`hydrateLiveSession` 不動。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/signalLogView.test.ts tests/signalAccountAccess.test.ts --runInBand` → PASS；`npx tsc --noEmit` → 無錯誤；`npx jest --runInBand` 全部通過。

- [ ] **Step 5: Commit**

```bash
git add src/utilities/zzz/signalLogView.ts tests/signalLogView.test.ts
git commit -m "feat(gacha): serve the redesigned signal log from Discord"
```

---

### Task 14: 清掉舊程式、預覽與驗收

**Files:**
- Delete: `src/utilities/zzz/signalLogOverview.ts`、`src/assets/images/zzz/official-record/icon-top.140345aa.png`、`previews/signal-log-spike/`
- Modify: `src/utilities/zzz/signalLogRenderer.ts`、`signalLogPaper.ts`、`signalLogCycles.ts`、`signalLogPagination.ts`、`recordText.ts`、`previews/signal-log-design/render-previews.ts`、`tests/signalLogRenderer.test.ts`、`tests/signalLogPaper.test.ts`、`tests/signalLogPagination.test.ts`、`tests/zzzOfficialVisualRegression.test.ts`

**Interfaces:**
- Consumes: 前面全部。
- Produces: 沒有新介面；`renderSignalLogImage` 成為唯一的繪圖入口。

- [ ] **Step 1: 刪除舊程式**

移除：`renderSignalLog`、`SignalLogRenderInput`、`__signalLogRendererInternals` 裡只屬於舊畫面的項目、`signalLogOverview.ts` 整個檔、`drawHeroBanner`、`resolveHeroArt`、`HERO_HEIGHT`、`heroTitle`、`bannerUpItems`、`signalAccent`、舊的 `renderSignalCycles`、`signalLogPageCount`、`switchSignalLogView`、`SIGNAL_LOG_PAGE_SIZE`、`loadTopIcon`／`drawTopBadge`／`hasTopBadge`、`icon-top` 圖檔。`prepareGtCard`、`gtCardSource` 若只剩 `prepareSCard` 在用，合併成一個不需要 `SignalLogRenderInput` 的版本。

`recordText.ts`：`grep` 確認沒有其他使用者後，從 `SignalText` 和七種語言刪掉 `averageUp`、`winRate`、`viewRecords`、`overview`、`total`、`averageS`、`currentPity`（被新鍵取代的那些）；仍有人用的留著。

Run: `npx tsc --noEmit`
Expected: 無錯誤。有殘留引用就照編譯錯誤逐一清掉。

- [ ] **Step 2: 更新舊測試**

`tests/signalLogRenderer.test.ts`：刪掉針對舊總覽的案例，保留仍適用的工具函式測試（`itemIcon`、`gtCardKind`、`fittedNumberSize`），改從新的匯出位置引用。`tests/signalLogPagination.test.ts`：刪掉 `signalLogPageCount`、`switchSignalLogView` 的案例。

Run: `npx jest --runInBand`
Expected: 全部通過。

- [ ] **Step 3: 重寫預覽腳本**

`previews/signal-log-design/render-previews.ts` 改成用手寫的模型輸出這些檔案（`locale: "tw"`）：

| 檔名 | 內容 |
|---|---|
| `首頁.png` | 四個頻道有紀錄、兩個空、有票券 |
| `首頁-無紀錄.png` | 六個頻道都空、沒有票券 |
| `S牆-全身立繪.png` | 獨家頻道 45 個 S，主角有全身圖 |
| `S牆-退回半身圖.png` | 同上，但用 `ZZZ_AGENT_ART_DIR` 指到空目錄 |
| `S牆-音擎.png` | 音擎頻道 15 個 S |
| `S牆-邦布.png` | 邦布頻道 2 個 S |
| `依版本.png` | 目前版本兩期加四個過去版本，其中一個沒出 S |
| `保底週期.png` | 11 個週期加進行中 |
| `S牆-fr.png` | 同第三張，`locale: "fr"` |

`tests/zzzOfficialVisualRegression.test.ts` 裡的檔名清單同步更新。

Run: `npx tsx previews/signal-log-design/render-previews.ts`
Expected: 九張 PNG 產生，每張寬 2000、高不超過 2200。

- [ ] **Step 4: 請使用者看圖**

把九張圖傳給使用者確認。有要調的地方先改完並重新產生，再往下走。**沒有使用者確認不得進入 Step 5。**

- [ ] **Step 5: 刪除拋棄式預覽並更新文件**

刪除 `previews/signal-log-spike/`。spec 的狀態行改成「已實作」。

- [ ] **Step 6: 全部驗證**

Run: `npx tsc --noEmit && npx jest --runInBand`
Expected: 無型別錯誤，測試全部通過。

- [ ] **Step 7: Commit**

```bash
git add -u src/utilities/zzz src/assets/images/zzz/official-record tests previews/signal-log-design docs/superpowers/specs/2026-11-18-signal-log-poster-redesign-design.md
git commit -m "chore(gacha): remove the old signal log renderer and refresh previews"
```

---

## 上線前（不在自動執行範圍內）

部署到正式環境後，用真帳號跑一次 `/調頻 紀錄`，核對首頁的總抽數、S 數量和官方工具一致。需要重新確認 API 格式時，在正式環境執行：

```sh
ZZZ_PROBE_OWNER_ID=<discord id> ZZZ_PROBE_OUTPUT=/tmp/gacha-api-probe npx tsx src/scripts/probeGachaRecordApi.ts
```
