# 繩網（Inter-Knot）子專案 A 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Discord 上做一個畫面照抄遊戲 3.2 版、所有伺服器共用的繩網：可以瀏覽動態牆和詳情、發文、留言、送 ♥，並有審核機制。

**Architecture:** 分層如下。純邏輯層（`rules`、`customId`）、資料層（`store`，better-sqlite3）、檔案層（`covers`）、canvas 渲染層（`drawing`、`*Renderer`）、訊息組裝層（`views`）、流程層（`actions`、`moderation`），最上面是 Discord 入口（指令和事件）。瀏覽狀態放在 customId 裡，瀏覽訊息一律是 ephemeral。

**Tech Stack:** TypeScript（ESM）、discord.js 14.26（modal 用 `LabelBuilder`、`FileUploadBuilder`、`StringSelectMenuBuilder`）、better-sqlite3、@napi-rs/canvas、jest（ts-jest）。

**Spec:** `docs/superpowers/specs/2026-10-20-interknot-design.md`

## Global Constraints

- **畫布**：1920×1080。
- **動態牆**：卡片外框 320px（含 5px 黑框）；欄位 x 為 93、446、800、1154、1507；第一列 y = 208；列距 26px。
- **配色**：卡片 `#222222`、標題 `#dadada`、摘要 `#8f8f8d`、分隔線 `#353535`（3px）、NEW! `#ffff02`、選中頁籤 `#f6db00`、✕ `#c32607`、詳情標題 `#ffffff`、詳情內文 `#b4b4b4`、留言暱稱 `#959595`、留言內文 `#989898`、樓層膠囊 `#60605f`。
- **詳情面板**：x 258–1662，y 170–905。
- **標籤**：`灌水` `情報` `求助` `同人` `廣告`，標題前綴顯示成 `[標籤]`。
- **長度上限**：標題 ≤ 40、內文 ≤ 1000、留言 ≤ 300；暱稱 2–12 字，不可重複（不分大小寫）。
- **封面**：只收 `image/*`，≤ 8MB，縮到最寬 1024px，存成 webp；路徑 `data/interknot/covers/<sha256>.webp`。
- **常數**：
  - `NEW_WINDOW_MS = 24h`
  - `REPORT_HIDE_THRESHOLD = 3`（不同人）
  - 發文：每 5 分鐘 1 篇、每天 10 篇
  - 留言：每 15 秒 1 則
- **資料庫**：`data/interknot.sqlite`，`journal_mode = WAL`、`busy_timeout = 5000`、`foreign_keys = ON`。
- **customId**：前綴 `ik:`，長度 ≤ 100。
- **3.2 版沒有的東西不做**：👁 瀏覽數、🔥 熱門、返回鍵、繩網委託。
- **已讀**：作者名改成灰色（使用者已確認）。
- **審核**：開發者名單沿用 `contactDev`，通知用私訊。
- **指令**：`/interknot` 維持 `developmentOnly: true`。
- **文字**：使用者看得到的字都走 `tr()`；7 個語系（`tw` `cn` `en` `jp` `kr` `fr` `vi`）都要加 key。
- **頭像**：id 是 1–11，對應 `src/assets/images/interknot/IconInterKnot00NN.png`；匿名一律用 id 1。

## Review Focus

1. **在私訊裡開 `/interknot`**（沒有 guild）：「本伺服器」要停用；私訊發的文（`guild_id` NULL）不能出現在任何伺服器的「本伺服器」裡。→ Task 2、Task 7 的測試。
2. **打開 modal 之後、送出之前，文被刪除或隱藏**：留言、檢舉、送 ♥ 都要回「這篇文已不存在」，不能寫進資料庫。→ Task 8 的測試。
3. **超長沒有空白的字串、emoji、全形字**（標題、暱稱、留言）：換行和截斷不能超出欄位，也不能丟錯。→ Task 4、Task 5 的測試。
4. **假冒的圖片**：content-type 寫 image 但內容不是圖、或解碼後尺寸超大（例如 20000×20000）：要拒絕，而且貼文不能建立。→ Task 3、Task 8 的測試。
5. **被封鎖或觸發頻率限制時**，發文、留言、送 ♥ 三個入口都要擋下。→ Task 8 的測試。

---

### Task 1：規則與 customId（純函式）

**Files:**
- Create: `src/utilities/interknot/rules.ts`
- Create: `src/utilities/interknot/customId.ts`
- Test: `tests/interknotRules.test.ts`、`tests/interknotCustomId.test.ts`

**Interfaces:**
- Produces（rules.ts）:
  - `TAGS = ["灌水","情報","求助","同人","廣告"] as const`；`type Tag = typeof TAGS[number]`
  - `LIMITS = { title: 40, body: 1000, comment: 300, nicknameMin: 2, nicknameMax: 12, coverBytes: 8 * 1024 * 1024, coverWidth: 1024 }`
  - `NEW_WINDOW_MS`、`REPORT_HIDE_THRESHOLD`、`POST_COOLDOWN_MS = 300_000`、`POSTS_PER_DAY = 10`、`COMMENT_COOLDOWN_MS = 15_000`
  - `isNew(createdAt: number, read: boolean, now: number): boolean`
  - `checkPostRate(recentPostTimes: number[], now: number): { ok: true } | { ok: false; retryAt: number }`。`recentPostTimes` 是最近 24 小時內的發文時間。
  - `checkCommentRate(lastCommentAt: number | null, now: number)`，回傳型別同上
  - `validatePost(i: { tag: string; title: string; body: string }): string[]`：回傳錯誤 key；空陣列表示通過
  - `validateComment(body: string): string[]`
  - `validateNickname(n: string): string | null`：回傳錯誤 key 或 null
  - `shouldHide(distinctReporters: number): boolean`
- Produces（customId.ts）:
  - `type MainTab = "all" | "guild" | "mine"`
  - `type SubTab = "all" | "featured" | "help"`
  - `interface IkState { main: MainTab; sub: SubTab; page: number; postId?: number; cpage?: number; expanded?: boolean; last?: number }`
  - `encodeIkId(action: string, s: IkState): string`
  - `decodeIkId(id: string): { action: string; state: IkState } | null`：不是 `ik:` 開頭或格式壞掉時回 null

- [ ] **Step 1：寫會失敗的測試**

```ts
// tests/interknotRules.test.ts
expect(isNew(now - 23 * 3600e3, false, now)).toBe(true);
expect(isNew(now - 25 * 3600e3, false, now)).toBe(false);
expect(isNew(now, true, now)).toBe(false);
expect(checkPostRate([now - 299_000], now)).toEqual({ ok: false, retryAt: now + 1_000 });
expect(checkPostRate([now - 301_000], now)).toEqual({ ok: true });
// 10 篇都在 24h 內 → 擋到最早那篇滿 24h
expect(checkPostRate(Array.from({ length: 10 }, (_, i) => now - 3600e3 * (i + 1)), now))
  .toEqual({ ok: false, retryAt: now - 3600e3 * 10 + 24 * 3600e3 });
expect(checkCommentRate(now - 14_000, now).ok).toBe(false);
expect(checkCommentRate(null, now).ok).toBe(true);
expect(validatePost({ tag: "灌水", title: "a".repeat(41), body: "x" })).toContain("interknot_TitleTooLong");
expect(validatePost({ tag: "攻略", title: "t", body: "x" })).toContain("interknot_BadTag");
expect(validatePost({ tag: "灌水", title: "  ", body: "x" })).toContain("interknot_TitleEmpty");
expect(validateNickname("a")).toBe("interknot_NicknameLength");
expect(validateNickname("繩網".repeat(7))).toBe("interknot_NicknameLength");
expect(validateNickname("🐱🐱")).toBeNull(); // 依字元（code point）計數，不依 UTF-16 長度
expect(shouldHide(2)).toBe(false); expect(shouldHide(3)).toBe(true);
```

```ts
// tests/interknotCustomId.test.ts
const s = { main: "guild", sub: "featured", page: 99, postId: 2147483647, cpage: 99, expanded: true, last: 2147483647 } as const;
expect(decodeIkId(encodeIkId("detail", s))).toEqual({ action: "detail", state: s });
expect(encodeIkId("commentDelete", s).length).toBeLessThanOrEqual(100);
expect(decodeIkId("gsim:x")).toBeNull();
expect(decodeIkId("ik:feed:zz")).toBeNull();
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx jest tests/interknotRules.test.ts tests/interknotCustomId.test.ts`
Expected: FAIL，訊息是 Cannot find module。

- [ ] **Step 3：實作 `rules.ts` 和 `customId.ts`**

字數用 `[...str].length` 計算。customId 用 `ik:<action>:<main>.<sub>.<page>.<postId>.<cpage>.<e>.<last>` 這種短格式，數字用 base36，省略的欄位留空。

- [ ] **Step 4：執行，確認通過**

Run: `npx jest tests/interknotRules.test.ts tests/interknotCustomId.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/utilities/interknot/rules.ts src/utilities/interknot/customId.ts tests/interknotRules.test.ts tests/interknotCustomId.test.ts
git commit -m "feat(interknot): add rules and customId state encoding"
```

---

### Task 2：InterknotStore

**Files:**
- Create: `src/utilities/interknot/store.ts`
- Test: `tests/interknotStore.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Tag`、`MainTab`、`SubTab`
- Produces:
  - `interface Profile { userId: string; nickname: string; avatarId: number; bannedUntil: number | null; createdAt: number }`
  - `type Status = "visible" | "hidden" | "deleted"`
  - `interface Post { id: number; authorId: string; guildId: string | null; tag: Tag; title: string; body: string; coverHash: string | null; anonymous: boolean; featured: boolean; status: Status; createdAt: number }`
  - `interface FeedItem extends Post { nickname: string; avatarId: number; read: boolean }`：匿名文的 nickname／avatarId 由 views 改寫，store 回傳真實值
  - `interface Comment { id: number; postId: number; authorId: string; floor: number; body: string; anonymous: boolean; status: Status; createdAt: number; nickname: string; avatarId: number }`
  - `class InterknotStore`，`constructor(filename = resolve("data/interknot.sqlite"))`，方法如下：
    - `getProfile(userId): Profile | null`
    - `saveProfile(userId, nickname, avatarId, now): "ok" | "nickname_taken"`
    - `setBan(userId, until: number | null): void`
    - `createPost(p: { authorId; guildId; tag; title; body; coverHash; anonymous }, now): number`
    - `getPost(id): Post | null`：任何 status 都會回傳
    - `listFeed(q: { viewerId: string; main: MainTab; sub: SubTab; guildId: string | null }): FeedItem[]`：只回 visible 的文，新的在前，最多 300 筆
    - `addComment(postId, authorId, body, anonymous, now): number`：回傳樓層號
    - `listComments(postId): Comment[]`：只回 visible 的留言，依樓層排序
    - `setPostStatus(id, s)`、`setCommentStatus(id, s)`、`setFeatured(id, on)`
    - `toggleHeart(postId, userId, now): boolean`：回傳操作後是否為「已送 ♥」
    - `heartCount(postId): number`、`hasHeart(postId, userId): boolean`
    - `reputation(userId): number`
    - `markRead(userId, postId, now)`
    - `addReport(type: "post" | "comment", targetId, reporterId, reason, note, now): number`：回傳不重複檢舉人數
    - `getComment(id): Comment | null`
    - `recentPostTimes(userId, since): number[]`、`lastCommentAt(userId): number | null`
    - `coverRefCount(hash): number`：計算 status ≠ deleted 的引用數
  - `getInterknotStore(): InterknotStore`（singleton）

- [ ] **Step 1：寫會失敗的測試**（全部用 `new InterknotStore(":memory:")`）

```ts
it("nickname unique case-insensitively", () => {
  expect(s.saveProfile("u1","Yeci",1,t)).toBe("ok");
  expect(s.saveProfile("u2","yeci",2,t)).toBe("nickname_taken");
  expect(s.saveProfile("u1","YECI",3,t)).toBe("ok"); // 自己改大小寫可以
});
it("floors are sequential per post", () => {
  expect([s.addComment(p,"u2","a",false,t), s.addComment(p,"u3","b",false,t)]).toEqual([1,2]);
});
it("heart toggles once per user and feeds reputation", () => {
  expect(s.toggleHeart(p,"u2",t)).toBe(true);
  expect(s.toggleHeart(p,"u2",t)).toBe(false);
  s.toggleHeart(p,"u2",t); s.toggleHeart(p,"u3",t);
  expect(s.reputation("u1")).toBe(2);
  s.setPostStatus(p,"deleted"); expect(s.reputation("u1")).toBe(0);
});
it("feed tabs", () => {
  // a: guild g1, 灌水；b: guild null(DM), 求助；c: guild g2, featured；d: hidden
  expect(ids(s.listFeed({viewerId:"v",main:"all",sub:"all",guildId:"g1"}))).toEqual([c,b,a]);
  expect(ids(s.listFeed({viewerId:"v",main:"guild",sub:"all",guildId:"g1"}))).toEqual([a]);
  expect(ids(s.listFeed({viewerId:"v",main:"guild",sub:"all",guildId:null}))).toEqual([]);
  expect(ids(s.listFeed({viewerId:"u1",main:"mine",sub:"all",guildId:"g1"}))).toEqual([b,a]);
  expect(ids(s.listFeed({viewerId:"v",main:"all",sub:"featured",guildId:null}))).toEqual([c]);
  expect(ids(s.listFeed({viewerId:"v",main:"all",sub:"help",guildId:null}))).toEqual([b]);
});
it("read flag", () => { s.markRead("v",a,t); expect(s.listFeed({...q,viewerId:"v"}).find(x=>x.id===a)!.read).toBe(true); });
it("anonymous keeps real author", () => { const id = s.createPost({...base, anonymous:true}, t); expect(s.getPost(id)!.authorId).toBe("u1"); });
it("reports count distinct reporters", () => {
  s.addReport("post",p,"r1","spam","",t); expect(s.addReport("post",p,"r1","spam","",t)).toBe(1);
  expect(s.addReport("post",p,"r2","spam","",t)).toBe(2);
});
it("hidden comments are excluded", () => { s.setCommentStatus(cid,"hidden"); expect(s.listComments(p)).toHaveLength(1); });
it("survives reopen on disk", () => { /* mkdtemp 檔案路徑，寫入後重新 new，資料仍在 */ });
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx jest tests/interknotStore.test.ts`
Expected: FAIL

- [ ] **Step 3：實作 `store.ts`**

照 `src/utilities/zzz/discLeaderboardStore.ts` 的開檔和 pragma 寫法，建立 spec 的 6 張表。

- 暱稱唯一：建立 `nickname COLLATE NOCASE` 的 UNIQUE 索引。
- `addComment`：在 transaction 裡用 `MAX(floor)+1`，撞到 UNIQUE 就重試一次。
- `listFeed` 用 SQL 篩選：
  - `main = "guild"` 時：`guild_id = ?`；guildId 為 null 時直接回空陣列
  - `main = "mine"` 時：`author_id = viewerId`
  - `sub = "featured"` 時：`featured = 1`
  - `sub = "help"` 時：`tag = '求助'`

- [ ] **Step 4：執行，確認通過**

Run: `npx jest tests/interknotStore.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/utilities/interknot/store.ts tests/interknotStore.test.ts
git commit -m "feat(interknot): add sqlite store"
```

---

### Task 3：封面處理

**Files:**
- Create: `src/utilities/interknot/covers.ts`
- Test: `tests/interknotCovers.test.ts`

**Interfaces:**
- Consumes: `LIMITS`
- Produces:
  - `class CoverError extends Error { reason: "type" | "size" | "decode" | "dimensions" }`
  - `downloadCover(a: { url: string; contentType: string | null; size: number }): Promise<Buffer>`：先檢查 type 和 size，再下載（timeout 15s）
  - `storeCover(buf: Buffer, dir = resolve("data/interknot/covers")): Promise<string>`：解碼後縮到最寬 1024、轉 webp、以 sha256 為檔名存檔；回傳 hash
  - `coverPath(hash: string, dir?): string`
  - `removeCoverIfUnused(hash: string, refCount: number, dir?): Promise<void>`

- [ ] **Step 1：寫會失敗的測試**（dir 用 `mkdtempSync`）

```ts
it("resizes to 1024 wide webp", async () => {
  const h = await storeCover(pngOf(2048, 1024), dir);
  const img = await loadImage(coverPath(h, dir)); expect([img.width, img.height]).toEqual([1024, 512]);
  expect(readFileSync(coverPath(h, dir)).subarray(8, 12).toString()).toBe("WEBP");
});
it("dedupes identical content", async () => { expect(await storeCover(b, dir)).toBe(await storeCover(b, dir)); });
it("strips EXIF", async () => { const h = await storeCover(jpegWithExif(), dir); expect(readFileSync(coverPath(h, dir)).includes(Buffer.from("Exif"))).toBe(false); });
it("rejects non-image bytes", async () => { await expect(storeCover(Buffer.from("not an image"), dir)).rejects.toMatchObject({ reason: "decode" }); });
it("rejects huge dimensions", async () => { await expect(storeCover(pngHeader(20000, 20000), dir)).rejects.toMatchObject({ reason: "dimensions" }); });
it("pre-download validation", async () => {
  await expect(downloadCover({ url: "x", contentType: "text/plain", size: 1 })).rejects.toMatchObject({ reason: "type" });
  await expect(downloadCover({ url: "x", contentType: "image/png", size: 8 * 1024 * 1024 + 1 })).rejects.toMatchObject({ reason: "size" });
});
it("removes only unused", async () => { await removeCoverIfUnused(h, 1, dir); expect(existsSync(coverPath(h, dir))).toBe(true);
  await removeCoverIfUnused(h, 0, dir); expect(existsSync(coverPath(h, dir))).toBe(false); });
```

`jpegWithExif()` 可以用一張最小的 JPEG，在 SOI 之後插入一段帶 `Exif\0\0` 的 APP1 區段。

- [ ] **Step 2：執行，確認失敗**

Run: `npx jest tests/interknotCovers.test.ts`
Expected: FAIL

- [ ] **Step 3：實作 `covers.ts`**

- 解碼前先讀圖檔標頭拿寬高：用 `@napi-rs/canvas` 的 `loadImage`，或自己解析 PNG/JPEG/WebP/GIF 的標頭。寬或高超過 8000 就丟 `dimensions`。
- 重新編碼用 `canvas.encode("webp", 85)`，畫布重繪本身就不會保留 EXIF。
- 寫檔時先寫成暫存檔，再 rename 成正式檔名。

- [ ] **Step 4：執行，確認通過**

Run: `npx jest tests/interknotCovers.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/utilities/interknot/covers.ts tests/interknotCovers.test.ts
git commit -m "feat(interknot): add cover validation and storage"
```

---

### Task 4：共用繪圖 + 動態牆渲染

**Files:**
- Create: `src/utilities/interknot/drawing.ts`
- Create: `src/utilities/interknot/feedRenderer.ts`（由 `src/utilities/zzz/interknot.ts` 改寫）
- Delete: `src/utilities/zzz/interknot.ts`
- Modify: `tests/interknot.test.ts`（改指向 `feedRenderer`，並改成量測值）
- Test: `tests/interknotRenderer.test.ts`（這個 task 先放 feed 的部分）

**Interfaces:**
- Produces（drawing.ts）:
  - `FEED = { colX: [93, 446, 800, 1154, 1507], top: 208, cardW: 320, border: 5, gapY: 26, pageH: 872 }`：`pageH` = 1080 − 208
  - `COLORS = {...}`：Global Constraints 裡的所有色碼
  - `roundedRect(ctx, x, y, w, h, r, opts: { corners?: Corner[]; fill?: string; stroke?: string; lineWidth?: number; img?: Image })`
  - `wrapLines(ctx, text, maxWidth, maxLines): string[]`：逐個 code point 換行，超出最後一行加 `…`
  - `cachedImage(path: string): Promise<Image>`：載入失敗時改用 `./src/assets/images/None.png`
  - `avatarPath(id: number): string`
  - `drawTabs(ctx, x, y, labels: string[], selected: number, size: "main" | "sub")`
  - `drawNewBadge(ctx, x, y)`
  - `drawFeaturedPill(ctx, x, y, label)`
- Produces（feedRenderer.ts）:
  - `layoutPosts(heights: number[]): { boxes: { x: number; y: number; h: number }[]; bottom: number }`
  - `interface FeedCard { id: number; title: string; excerpt: string; nickname: string; avatarId: number; coverPath: string | null; featured: boolean; isNew: boolean; read: boolean }`：`title` 已經包含 `[標籤]`
  - `renderFeed(i: { viewer: { nickname: string; avatarId: number; reputation: number }; mainLabels: string[]; subLabels: string[]; main: number; sub: number; cards: FeedCard[]; page: number; highlightId?: number; featuredLabel: string; locale: string }): Promise<{ buffer: Buffer; totalPages: number; page: number; visibleIds: number[] }>`

- [ ] **Step 1：寫會失敗的測試**

```ts
// tests/interknot.test.ts
const { boxes } = layoutPosts([300, 300, 300, 300, 300, 100]);
expect(boxes.slice(0, 5).map(b => b.x)).toEqual([93, 446, 800, 1154, 1507]);
expect(boxes.slice(0, 5).every(b => b.y === 208)).toBe(true);
expect(boxes[5].y).toBe(208 + 300 + 26);
```

```ts
// tests/interknotRenderer.test.ts（feed 部分）
it("renders 1920x1080 and reports visible ids", async () => {
  const r = await renderFeed(input(40 cards));
  const img = await loadImage(r.buffer); expect([img.width, img.height]).toEqual([1920, 1080]);
  expect(r.visibleIds.length).toBeGreaterThan(0); expect(r.totalPages).toBeGreaterThan(1);
});
it("clamps page beyond end", async () => { const r = await renderFeed({ ...input(3), page: 50 }); expect(r.page).toBe(0); });
it("empty feed still renders", async () => { expect((await renderFeed(input(0))).visibleIds).toEqual([]); });
it("survives long unbroken text, emoji, missing cover", async () => {
  await expect(renderFeed(input(1, { title: "[灌水]" + "啊".repeat(200), nickname: "🐱".repeat(12), excerpt: "x".repeat(500), coverPath: "/nope.webp" }))).resolves.toBeDefined();
});
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx jest tests/interknot.test.ts tests/interknotRenderer.test.ts`
Expected: FAIL

- [ ] **Step 3：實作 `drawing.ts` 和 `feedRenderer.ts`**

- 卡片的畫法照 spec「遊戲畫面觀察」：左上、右上、左下是圓角，右下是直角；頭像壓在封面底邊；作者名、3px 分隔線、標題最多 2 行、摘要 1 行。
- 已讀時作者名用摘要色 `#8f8f8d`。
- `highlightId` 對應的卡片加 `#f6db00` 外框。
- `visibleIds`：這一頁 y 範圍內看得到的卡片，依由上到下、由左到右排序，最多 25 個（Discord 下拉選單的上限）。
- 頂部依序畫：玩家資訊條（頭像、暱稱、`♥{reputation}`）、主頁籤、子頁籤；背景先用 `bgDark.jpg`。
- 移除原型的 in-memory `Map` 和 Discord 相關的程式碼。
- 版面和顏色數值只寫在 `drawing.ts` 的常數裡。

- [ ] **Step 4：執行，確認通過，並人工比對**

Run: `npx jest tests/interknot.test.ts tests/interknotRenderer.test.ts`
Expected: PASS

用 scratch script 渲染一張圖，跟 `previews/interknot-reference/feed.png` 並排比對，修正字級和位置。

- [ ] **Step 5：Commit**

```bash
git add -A src/utilities/interknot/drawing.ts src/utilities/interknot/feedRenderer.ts src/utilities/zzz/interknot.ts tests/interknot.test.ts tests/interknotRenderer.test.ts
git commit -m "feat(interknot): render feed to match in-game 3.2 layout"
```

---

### Task 5：詳情與頭像總覽渲染

**Files:**
- Create: `src/utilities/interknot/detailRenderer.ts`
- Create: `src/utilities/interknot/setupRenderer.ts`
- Test: `tests/interknotRenderer.test.ts`（追加）

**Interfaces:**
- Consumes: `drawing.ts`
- Produces:
  - `interface DetailComment { floor: number; nickname: string; avatarId: number; body: string; isOp: boolean }`
  - `renderDetail(i: { author: { nickname: string; avatarId: number; reputation: number }; title: string; body: string; coverPath: string | null; featured: boolean; featuredLabel: string; comments: DetailComment[]; expanded: boolean; commentPage: number; endLabel: string; opLabel: string; locale: string }): Promise<{ buffer: Buffer; bodyTruncated: boolean; commentPages: number; commentPage: number; visibleFloors: number[] }>`
  - `AVATAR_IDS: number[]`：值是 1..11
  - `renderAvatarSheet(): Promise<Buffer>`

- [ ] **Step 1：寫會失敗的測試**

```ts
it("detail 1920x1080; truncation and paging", async () => {
  const short = await renderDetail(d({ body: "短", comments: [] }));
  expect(short.bodyTruncated).toBe(false); expect(short.commentPages).toBe(1); expect(short.visibleFloors).toEqual([]);
  const long = await renderDetail(d({ body: "長".repeat(1000), comments: many(30) }));
  expect(long.bodyTruncated).toBe(true); expect(long.commentPages).toBeGreaterThan(1);
  expect((await renderDetail(d({ body: "長".repeat(1000), expanded: true }))).bodyTruncated).toBe(false);
  expect((await renderDetail(d({ comments: many(30), commentPage: 99 }))).commentPage).toBe(long.commentPages - 1);
});
it("detail survives emoji/unbroken text", async () => { await expect(renderDetail(d({ title: "🐱".repeat(40), comments: [{ floor: 1, nickname: "x".repeat(12), avatarId: 99, body: "a".repeat(300), isOp: true }] }))).resolves.toBeDefined(); });
it("avatar sheet renders", async () => { const img = await loadImage(await renderAvatarSheet()); expect(img.width).toBeGreaterThan(0); });
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx jest tests/interknotRenderer.test.ts`
Expected: FAIL

- [ ] **Step 3：實作 detailRenderer 和 setupRenderer**

- 版面照 spec「詳情」表格：面板位置、標頭（頭像、灰色暱稱、`♥N` 膠囊、紅色 ✕ 只是裝飾）、三欄。
- 使用者文沒有回覆選項，留言欄延伸到面板底。
- 留言欄的最後一頁，底部加 `endLabel`（「— 已無更多評論 —」）。
- 留言者是樓主時，暱稱前面加 `opLabel`。
- `expanded` 為 true 時，第二欄只放內文、不截斷；內文仍然超出就照比例縮小字級，最小縮到 18px。
- 頭像總覽圖：11 個頭像排成網格，每個下面標編號。

- [ ] **Step 4：執行，確認通過，並人工比對**

Run: `npx jest tests/interknotRenderer.test.ts`
Expected: PASS

渲染一張圖跟 `previews/interknot-reference/detail.png` 並排比對並修正。

- [ ] **Step 5：Commit**

```bash
git add src/utilities/interknot/detailRenderer.ts src/utilities/interknot/setupRenderer.ts tests/interknotRenderer.test.ts
git commit -m "feat(interknot): render post detail and avatar sheet"
```

---

### Task 6：語系文字

**Files:**
- Modify: `src/assets/languages/{tw,cn,en,jp,kr,fr,vi}.ts`（加在 `langs` 物件的最後面）
- Test: `tests/interknotI18n.test.ts`

**Interfaces:**
- Produces：所有 key 都以 `interknot_` 開頭，至少要有下面這些（views 和 actions 只能用這裡定義的 key）：
  - 頁籤：`Tab_Push`（推播）、`Tab_Guild`（本伺服器）、`Tab_Mine`（我的）、`Tab_All`（全部）、`Tab_Featured`（Fairy精選）、`Tab_Help`（求助資訊）
  - 標籤：`Tag_灌水`、`Tag_情報`、`Tag_求助`、`Tag_同人`、`Tag_廣告`
  - 畫面：`New`（NEW!）、`End`（— 已無更多評論 —）、`Op`（[樓主]）、`Anonymous`（匿名）、`SelectPost`、`Prev`、`Next`、`Compose`、`Refresh`、`Profile`
  - 詳情按鈕：`Expand`、`CommentPrev`、`CommentNext`、`Comment`、`Heart`（`♥ 送心 <n>`）、`Report`、`Back`、`Delete`、`Feature`
  - 身分：`CreateAccount`
  - modal 標題和欄位：`Modal_Post`、`Modal_Comment`、`Modal_Report`、`Modal_Profile`、`Field_Tag`、`Field_Title`、`Field_Body`、`Field_Cover`、`Field_Anonymous`、`Field_Nickname`、`Field_Avatar`、`Field_Target`、`Field_Reason`、`Field_Note`、`Field_Content`
  - 檢舉原因：`Reason_nsfw`、`Reason_harass`、`Reason_spam`、`Reason_other`
  - 錯誤訊息：`TitleTooLong`、`TitleEmpty`、`BodyTooLong`、`BodyEmpty`、`BadTag`、`CommentTooLong`、`CommentEmpty`、`NicknameLength`、`NicknameTaken`、`Cover_type`、`Cover_size`、`Cover_decode`、`Cover_dimensions`、`RateLimited`（`<time>`）、`Banned`（`<time>`）、`NotFound`、`Failed`、`NoProfile`、`SelfHeart`、`Reported`、`Deleted`、`NotDeveloper`

- [ ] **Step 1：寫會失敗的測試**

```ts
import tw from "../src/assets/languages/tw.js"; // 其餘 6 個語系同樣 import
const keys = Object.keys(tw).filter(k => k.startsWith("interknot_"));
expect(keys.length).toBeGreaterThanOrEqual(60);
for (const lang of [cn, en, jp, kr, fr, vi]) expect(keys.filter(k => !(k in lang))).toEqual([]);
expect(tw.interknot_Tab_Featured).toBe("Fairy精選");
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx jest tests/interknotI18n.test.ts`
Expected: FAIL

- [ ] **Step 3：7 個語系都加上 key**

`tw` 是主要版本，遊戲裡有的字照抄遊戲用字；`cn` 改成簡體；其他語言用遊戲該語言版本的用語，沒有的就自己翻譯。

- [ ] **Step 4：執行，確認通過**

Run: `npx jest tests/interknotI18n.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/assets/languages tests/interknotI18n.test.ts
git commit -m "feat(interknot): add localized copy"
```

---

### Task 7：views（組裝訊息和 modal）

**Files:**
- Create: `src/utilities/interknot/views.ts`
- Test: `tests/interknotViews.test.ts`

**Interfaces:**
- Consumes: Task 1、2、4、5、6
- Produces（全部回傳 discord.js 的 payload，不呼叫任何 API）:
  - `interface ViewCtx { store: InterknotStore; viewerId: string; guildId: string | null; isDeveloper: boolean; locale: string; tr: (k: string, o?: any) => string; now: number }`
  - `buildSetupMessage(ctx): Promise<MessagePayload>`：`MessagePayload = { content?: string; embeds: []; files: AttachmentBuilder[]; components: ActionRowBuilder<any>[]; attachments: [] }`
  - `buildFeedMessage(ctx, s: IkState): Promise<MessagePayload>`
  - `buildDetailMessage(ctx, s: IkState): Promise<MessagePayload | null>`：文不存在、或不是 visible（作者和開發者看自己的 hidden 文時例外）就回 null
  - `postModal(ctx, s)`、`commentModal(ctx, s)`、`reportModal(ctx, s, visibleFloors: number[])`、`profileModal(ctx, current: Profile | null)`：都回傳 `ModalBuilder`
  - `displayAuthor(p: { anonymous: boolean; nickname: string; avatarId: number }, tr): { nickname: string; avatarId: number }`

- [ ] **Step 1：寫會失敗的測試**（store 用 `:memory:`，`tr` 用真的 `createTranslator("tw")`）

```ts
const rows = (await buildFeedMessage(ctx, s)).components.map(r => r.toJSON());
expect(rows).toHaveLength(4);                       // 選文、主頁籤、子頁籤、操作列
expect(allCustomIds(rows).every(id => id.startsWith("ik:") && id.length <= 100)).toBe(true);
expect(button(rows, "Tab_Guild").disabled).toBe(true);           // ctx.guildId = null（私訊）
expect(button(rows, "Tab_Push").style).toBe(ButtonStyle.Primary); // 目前選中的頁籤
// 匿名文：下拉選單不洩漏真實暱稱
expect(JSON.stringify(rows)).not.toContain("RealName");
// 詳情：只有作者看得到刪除，只有開發者看得到精選
expect(labels(await detailAs("author"))).toContain("刪除"); expect(labels(await detailAs("other"))).not.toContain("刪除");
expect(labels(await detailAs("dev"))).toContain("精選");
expect(await buildDetailMessage(ctx, { ...s, postId: hiddenId })).toBeNull();
expect(postModal(ctx, s).toJSON().components).toHaveLength(5);
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx jest tests/interknotViews.test.ts`
Expected: FAIL

- [ ] **Step 3：實作 `views.ts`**

元件的排法照 spec「畫面 1」和「畫面 2」。

- 下拉選單的選項用 renderer 回傳的 `visibleIds`。
- 詳情每次渲染都會 `markRead`。
- 「展開」按鈕只在 `bodyTruncated` 為 true 時出現。
- `♥` 按鈕：已送時用 Danger 樣式，否則用 Secondary。
- modal 用 `LabelBuilder` 包住各欄位。發文的封面欄位用 `FileUploadBuilder`，設定成非必填、最多 1 個檔案。
- `reportModal` 的目標選項是「本文」加上 `visibleFloors`。

- [ ] **Step 4：執行，確認通過**

Run: `npx jest tests/interknotViews.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/utilities/interknot/views.ts tests/interknotViews.test.ts
git commit -m "feat(interknot): build feed, detail and modal views"
```

---

### Task 8：actions + moderation

**Files:**
- Create: `src/utilities/interknot/actions.ts`
- Create: `src/utilities/interknot/moderation.ts`
- Modify: `src/utilities/contactDev.ts`（把 `getDeveloperIds`、`isDeveloper` 改成 export）
- Test: `tests/interknotActions.test.ts`

**Interfaces:**
- Consumes: Task 1、2、3、7
- Produces:
  - `interface Notifier { newPost(postId: number): Promise<void>; autoHidden(type: "post" | "comment", id: number, reporters: number): Promise<void> }`
  - `type Result = { ok: true; postId?: number } | { ok: false; error: string; params?: Record<string, string> }`：`error` 是 i18n key
  - 服務函式：都不碰 Discord，`now` 由外部傳入
    - `submitPost(store, notifier, i: { userId; guildId; tag; title; body; anonymous; cover: Buffer | null }, now, coverDir?): Promise<Result>`
    - `submitComment(store, i: { userId; postId; body; anonymous }, now): Result`
    - `toggleHeartAction(store, userId, postId, now): Result`
    - `submitReport(store, notifier, i: { userId; type; targetId; reason; note }, now): Promise<Result>`
    - `deleteOwn(store, userId, type, id, coverDir?): Promise<Result>`
    - `setFeaturedAction(store, userId, postId, on, isDev: boolean): Result`
    - `saveProfileAction(store, userId, nickname, avatarId, now): Result`：驗證暱稱（`validateNickname`）和頭像 id（必須在 `AVATAR_IDS` 裡），失敗時回 `interknot_NicknameLength` 或 `interknot_NicknameTaken`；建立身分和改身分共用這個函式
  - `handleInterknotInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction, deps: { store: InterknotStore; notifier: Notifier }): Promise<void>`：把 customId 分派到 views 或服務函式。按鈕和選單用 `deferUpdate` 再 `editReply`；modal 用 `deferUpdate`，錯誤用 ephemeral `followUp`。
  - moderation.ts:
    - `createDevNotifier(client: Client, store): Notifier`：用 `client.users.fetch(id).send(...)` 私訊每個開發者，內容是 embed 加按鈕（`ik:mod:<action>:<type>:<id>`）
    - `handleModerationButton(interaction: ButtonInteraction, store): Promise<void>`：先檢查 `isDeveloper`；動作有 `restore` `delete` `ban7` `banPerm`

- [ ] **Step 1：寫會失敗的測試**（`:memory:` store、假 notifier 記錄每次呼叫、`coverDir` 用 mkdtemp）

```ts
it("post happy path notifies developer", async () => { const r = await submitPost(s, n, okPost, t); expect(r.ok).toBe(true); expect(n.calls).toEqual([["newPost", r.postId]]); });
it("no profile → NoProfile", async () => { expect(await submitPost(s, n, { ...okPost, userId: "nobody" }, t)).toEqual({ ok: false, error: "interknot_NoProfile" }); });
it("banned blocks post, comment, heart", async () => {
  s.setBan("u1", t + 3600e3);
  expect((await submitPost(s, n, okPost, t)).ok).toBe(false);
  expect(submitComment(s, { userId: "u1", postId: p, body: "x", anonymous: false }, t)).toMatchObject({ error: "interknot_Banned" });
  expect(toggleHeartAction(s, "u1", p, t)).toMatchObject({ error: "interknot_Banned" });
});
it("rate limits", async () => { await submitPost(s, n, okPost, t); expect(await submitPost(s, n, okPost, t + 1000)).toMatchObject({ error: "interknot_RateLimited" });
  submitComment(s, c, t); expect(submitComment(s, c, t + 14_000)).toMatchObject({ error: "interknot_RateLimited" }); });
it("bad cover creates no post and leaves no file", async () => {
  expect(await submitPost(s, n, { ...okPost, cover: Buffer.from("nope") }, t, dir)).toMatchObject({ error: "interknot_Cover_decode" });
  expect(s.listFeed(q)).toHaveLength(0); expect(readdirSync(dir)).toEqual([]);
});
it("actions on deleted/hidden post → NotFound", async () => {
  s.setPostStatus(p, "hidden");
  expect(submitComment(s, c, t)).toMatchObject({ error: "interknot_NotFound" });
  expect(toggleHeartAction(s, "u2", p, t)).toMatchObject({ error: "interknot_NotFound" });
  expect(await submitReport(s, n, rep("u2"), t)).toMatchObject({ error: "interknot_NotFound" });
});
it("self heart refused", () => { expect(toggleHeartAction(s, "u1", p, t)).toMatchObject({ error: "interknot_SelfHeart" }); });
it("third distinct report auto-hides and notifies", async () => {
  for (const r of ["a", "b", "b", "c"]) await submitReport(s, n, rep(r), t);
  expect(s.getPost(p)!.status).toBe("hidden"); expect(n.calls).toContainEqual(["autoHidden", "post", p, 3]);
});
it("deleteOwn only by author, removes unused cover", async () => { /* 別人刪 → NotFound；作者刪 → status deleted，封面檔被刪掉 */ });
it("profile validation", () => {
  expect(saveProfileAction(s, "u9", "a", 1, t)).toMatchObject({ error: "interknot_NicknameLength" });
  expect(saveProfileAction(s, "u9", "Yeci", 99, t).ok).toBe(false); // u1 已用 Yeci，且 99 不是合法頭像
  expect(saveProfileAction(s, "u9", "yeci", 2, t)).toMatchObject({ error: "interknot_NicknameTaken" });
  expect(saveProfileAction(s, "u9", "新代理人", 2, t).ok).toBe(true);
});
it("featured only by developer", () => { expect(setFeaturedAction(s, "u2", p, true, false).ok).toBe(false); expect(setFeaturedAction(s, "dev", p, true, true).ok).toBe(true); });
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx jest tests/interknotActions.test.ts`
Expected: FAIL

- [ ] **Step 3：實作 `actions.ts`、`moderation.ts`，並把 contactDev 的兩個函式改成 export**

- `submitPost` 的順序：檢查身分 → 檢查封鎖 → 檢查頻率 → 驗證欄位 → `storeCover` → `createPost`。
- `createPost` 丟錯時呼叫 `removeCoverIfUnused(hash, coverRefCount(hash))`，再把錯誤往上丟。
- notifier 失敗時只 `console.warn("[interknot] notify failed")`，不影響發文結果。
- handler 讀 modal 值：`fields.getTextInputValue`、`getStringSelectValues`、`getUploadedFiles(..., false)`；有上傳封面時先呼叫 `downloadCover`。
- 錯誤用 ephemeral `followUp(tr(error, params))` 回覆。

- [ ] **Step 4：執行，確認通過**

Run: `npx jest tests/interknotActions.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/utilities/interknot/actions.ts src/utilities/interknot/moderation.ts src/utilities/contactDev.ts tests/interknotActions.test.ts
git commit -m "feat(interknot): add post/comment/heart/report actions and moderation"
```

---

### Task 9：Discord 接線、整體驗證、備份確認

**Files:**
- Modify: `src/commands/slash/zzz/interknot.ts`（改寫）
- Modify: `src/events/interknotInteraction.ts`（改寫）
- Modify: `src/events/modal.ts:36`（在略過的前綴清單加上 `interaction.customId.startsWith("ik:")`）
- Test: `tests/developmentCommandGate.test.ts`（追加）

**Interfaces:**
- Consumes: Task 7 的 `buildSetupMessage` / `buildFeedMessage`；Task 8 的 `handleInterknotInteraction`、`createDevNotifier`、`handleModerationButton`

- [ ] **Step 1：寫會失敗的測試**

```ts
it("keeps /interknot development-only until launch", () => {
  const src = readFileSync(join(process.cwd(), "src/commands/slash/zzz/interknot.ts"), "utf8");
  expect(src).toMatch(/developmentOnly:\s*true/);
});
it("generic modal handler skips ik: modals", () => {
  expect(readFileSync(join(process.cwd(), "src/events/modal.ts"), "utf8")).toMatch(/startsWith\("ik:"\)/);
});
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx jest tests/developmentCommandGate.test.ts`
Expected: FAIL（modal.ts 那條）

- [ ] **Step 3：接線**

- **指令**：`deferReply({ flags: Ephemeral })`。有 profile 就用 `buildFeedMessage(ctx, { main: "all", sub: "all", page: 0 })`，沒有就用 `buildSetupMessage`。
- **事件**：
  - `ik:mod:` 開頭的交給 `handleModerationButton`，其他 `ik:` 開頭的交給 `handleInterknotInteraction`，`deps` 用 `getInterknotStore()` 和 `createDevNotifier(client, store)`。
  - 錯誤一律 `console.warn("[interknot] interaction failed")`，再用 ephemeral 回 `interknot_Failed`。

- [ ] **Step 4：整體驗證**

Run: `npx tsc --noEmit -p .`
Expected: 沒有輸出，exit 0

Run: `npx eslint "src/utilities/interknot/**/*.ts" src/events/interknotInteraction.ts src/commands/slash/zzz/interknot.ts`
Expected: 沒有錯誤

Run: `npx jest`
Expected: 全部 PASS，而且既有的測試數量沒有減少

- [ ] **Step 5：確認 Mac 的備份有涵蓋**

Run: `ssh yeci@100.115.71.58 'cd ~/Desktop/bots/zzz && grep -rn "data/" ~/pm2-ops 2>/dev/null | head; crontab -l 2>/dev/null | grep -i backup'`

確認備份流程有涵蓋 `data/`。如果沒有，在 PR 說明裡寫清楚，請使用者決定；不要自己改正式機的備份設定。

- [ ] **Step 6：手動驗收**（`NODE_ENV=dev`，用開發用的 bot 帳號）

依序做：建立身分 → 發一篇有封面的匿名文 → 換一個帳號留言、送 ♥、檢舉 → 確認開發者有收到私訊、`[刪除]` 和 `[★ 精選]` 有效，精選後出現在 Fairy精選頁籤。另外在私訊裡開一次 `/interknot`，確認「本伺服器」是停用的。每一步截圖存到 `previews/interknot-acceptance/`。

- [ ] **Step 7：Commit**

```bash
git add src/commands/slash/zzz/interknot.ts src/events/interknotInteraction.ts src/events/modal.ts tests/developmentCommandGate.test.ts
git commit -m "feat(interknot): wire /interknot command and interactions"
```
