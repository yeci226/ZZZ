# 新聞訂閱與更新通知

`/news` 提供個人私訊訂閱、管理員共用頻道訂閱及官方文章瀏覽。通知分類可多選，不需要綁定 HoYoLAB 帳號。設定頁使用操作者限定的 Discord Components V2，15 分鐘失效，確認儲存前只修改草稿。

## 設定及資料

- 個人使用私訊；具「管理伺服器」權限的成員可設定文字／公告頻道。每個 Bot 的每個頻道只有一份訂閱，選擇頻道會載入其原設定。頻道狀態頁可直接停用／啟用。
- 九種分類：更新、預下載、維護、新角色公開、角色介紹／PV、卡池、活動、版本前瞻、其他。前四種預設勾選。
- 語言預設採用使用者目前 Bot 語言；頻道保存建立時所選語言，之後不隨管理員的個人偏好變動。身分組標記預設關閉，不允許選擇 `@everyone`。文章內的使用者、角色及群體標記皆不會觸發通知。
- HSR 支援繁中／簡中／英文，ZZZ 支援繁中／簡中／英文／日文／韓文／法文／越南文。
- 資料庫預設位於工作目錄 `data/hsr-news.sqlite` 或 `data/zzz-news.sqlite`，可用 `NEWS_DATABASE_PATH` 覆寫。兩個 Bot 必須使用各自的檔案；同一 Bot 各 shard 使用同一檔案。SQLite WAL 與設定版本檢查防止管理員互相覆寫。
- 新增資料庫，不遷移帳號、簽到、兌換或便箋提醒設定。既有使用者預設沒有新聞訂閱。

## 來源與判斷

- HoYoLAB：現有 `getNewsList`／`getPostFull`，HSR `gids=6`、官方帳號 `172534910`；ZZZ `gids=8`、官方帳號 `219270333`。只接收這兩個遊戲官方帳號的文章，不含玩家轉貼及 Mimo／HoYoFair 等其他帳號。
- 瀏覽保留「公告／活動／資訊」三類；訂閱依語言標題樣式分類。同篇文章命中多個分類只發一次。官方若新增命名樣式，應補充 `sources.ts` 的規則及真實標題測試。
- HoYoPlay 國際服 `getGameBranches` 的 `main.tag`／`pre_download.tag` 判斷更新與預下載。版本可下载不代表遊戲已開服。
- 維護參考 [hoyo-update-notifier 的來源設定](https://github.com/seriaati/hoyo-update-notifier/blob/main/hun/constants.py)。依需求，HSR 使用原專案中國服雲遊戲端點及 `hkrpg_cn`，假設兩邊同步維護；ZZZ 使用國際服 `nap_global`。這是來源狀態的推定，不是直接登入每個遊戲伺服器的驗證。
- 錯誤、非零 retcode、欄位缺漏均視為未知；不修改最後成功維護狀態，也不宣告開服。不使用預定結束時間判斷開服。

## 排程與投遞

只有 cluster 0 啟動來源輪詢：更新／維護每 2 分鐘、文章每 5 分鐘、投遞佇列每 15 秒。每輪禁止重疊；來源失敗及投遞暫時失敗採指數退避，最高一小時。Discord REST 負責限流等待，頻道發送不依賴所在 shard 的快取。

首次成功抓取來源建立基準，不補送舊資料；文章有官方發布時間，首次抓取仍會送出訂閱後才發布的新文章。新訂閱、重新啟用或新增分類使用各自的啟用時間。暫時離線後僅補送最近 24 小時的未送事件。文章原 ID 去重且編輯不重發；預下載版本撤下再出現不重發。

事件、來源檢查點與投遞任務在同一交易保存。投遞前確認目前訂閱版本；修改／停用會取消舊待送任務。發送使用穩定 Discord nonce，降低成功發送但尚未記錄就崩潰時的短期重送風險；Discord 的 nonce 去重有時間範圍限制，無法保證跨長時間故障的絕對恰好一次投遞。

私訊封鎖、頻道不存在、永久存取／發送權限錯誤會停用目的地並保留分類。回到 `/news` 修復設定可清除失效原因。每五分鐘輸出來源最後成功時間及投遞狀態計數；來源／投遞失敗另記錄 `[news]` 日誌。

## 驗證與啟用

```sh
npm run build
npx jest --config jest.config.cjs --runInBand tests/newsSubscriptions.test.ts tests/newsWizard.test.ts
npx tsx src/scripts/previewNews.ts zzz
npx tsx src/scripts/previewNews.ts hsr --live
```

預覽請在對應 Bot 目錄執行並指定 `hsr` 或 `zzz`。預設完全離線；`--live` 只讀公開 API。兩種模式都使用記憶體資料庫，不連線 Discord、不發訊息、不修改正式訂閱。輸出在 `previews/news/`，包含設定頁與各語言通知的 Discord JSON。

部署方式沿用各 Bot 原本的建置／程序啟動流程。新事件檔會自動被載入；Bot 下次正常啟動即開始建立來源基準，完成訂閱設定後才有推播。部署前備份新聞 SQLite，確認各 shard 指向相同工作目錄；不要讓 HSR、ZZZ 共用新聞檔案。

## Components V2 article reader

All live deliveries now pass through `NewsReader`, including update, preload and maintenance cards. `getPostFull` is cached per game/post/language, with structured Quill content preferred over HTML. The persistent document includes ordered Markdown, image and video blocks; the original article and rendered pages remain fixed for each message. Existing subscriptions, events and delivery records are retained.

`NewsMediaCache` stores originals and PNG crops beneath `data/news-media`. Each manifest references URL/content hashes and the crop algorithm version. Keep this directory together with the news SQLite database when moving the bot; reading states refer to these files. Animated images are kept intact. A failed image becomes an original-image/HoYoLAB link at the same position. Full-article failures use normal delivery retries.

Consecutive ordinary images are grouped before pagination: 1–4 each get a separate gallery, while 5+ share galleries of up to 10. Cropped images break the run and each crop gets one gallery. Pages cap at four galleries, ten items/attachments, 3,500 text characters, 40 components and a conservative 9 MiB total attachment budget. Long images use full-width slices near 1.8× width, choosing nearby uniform separator rows when possible. All rows are retained.

The independent `news:read:<game>:<token>:prev|next` route persists a message/destination binding, immutable document version and shared page number in SQLite. WAL-backed per-reader leases serialize edits across shards; private readers also verify the recipient. Edits replace attachments with only the new page's files and suppress all mentions. Only initial delivery can mention the configured role. Manual browsing uses the same reader with a return-to-home button; the original configuration session still expires after 15 minutes.

Both bots require Attach Files permission in selected channels in addition to the existing channel permissions. Production scheduling remains cluster 0 only. No separate hoyo-update-notifier service is introduced.

### Preview and verification

- `node dist/scripts/previewNews.js hsr|zzz [--live]` writes offline V2 payloads, including every page, without posting to Discord.
- `newsPreviewServer.ts` runs a dedicated test-token Gateway reader, with no production polling. It requires a distinct `TEST_TOKEN`, `NEWS_PREVIEW_BOT`, `NEWS_PREVIEW_GUILD`, and `NEWS_PREVIEW_CHANNEL`. `NEWS_PREVIEW_DIRECTORY` defaults to `previews/news` and contains the prepared manifest, SQLite database, media and receipts. `--send` sends prepared cards once; subsequent runs reuse saved message bindings.
- The authorized preview process is named `news-v2-preview` in PM2. It uses the HSR Beta bot for both games because that bot can access the specified test channel. `pm2 stop news-v2-preview` ends the preview reader after review; retain its database/media to resume existing buttons later.
- Fixed fixtures include HSR article 46570956 and ZZZ article 46486178. The latter has two images, 1080×13075 and 1080×11351; the live preparation produced seven and six full-width crops respectively, displayed across five pages with the attachment budget.

## Continuous messages (legacy layouts)

New deliveries use `NewsPublisher` and immutable `NewsMessageDocument.parts` instead of interactive pages. Each article has one linked title and its official author/publication timestamp on the first message; continuations contain only the remaining text and images. All new cards omit accent colors. Generated link labels omit emoji, and title labels escape brackets as well as ordinary Markdown. Video transport JSON is removed while real descriptions, image covers and usable video URLs are retained.

Update/preload/maintenance cards contain the linked event title, game name/version and an attached game thumbnail. The checked-in `src/assets/news/hsr.jpg` and `zzz.jpg` assets come from `https://github.com/seriaati/hoyo-update-notifier/tree/main/game_icons` (`icon_sr.jpg` and `icon_zzz.jpg`). Simulated cards are marked as tests.

Static long-image crops now use algorithm `v2-equal`: `n = ceil(height / (width * 1.8))`, with boundaries `round(i * height / n)`. Width is retained and heights differ by at most one pixel within each original. There is no whitespace-boundary search, padding or stretching. Existing crop manifests and legacy page documents remain available for old messages; the new layout uses a separate versioned cache key.

`news_publications` freezes each event/subscription/revision's document and destination. `news_delivery_parts` records the successful message ID of each part. Destination leases prevent concurrent groups from interleaving; a pending publication blocks newer groups until it succeeds, is cancelled, or expires after 24 hours. Successful parts are skipped on retry/restart, with a stable per-part Discord nonce protecting immediate retries. Subscription edits cancel pending publications, and every outgoing part checks the current revision. Only the first message can mention a role; subsequent messages set `SuppressNotifications` and disable all mentions. As with any Discord send, a process dying between a successful HTTP send and recording its ID is only protected for Discord's nonce retention window.

The existing `NewsReader` is retained solely for the previous pagination route and previews. Runtime notifications and manual reading both use `NewsPublisher`; manual reading edits the initial ephemeral message and follows with ephemeral, silent continuations. No new reading-session rows or page buttons are created.

`previewNews.ts` now exports all continuous parts. To post the authorized prepared set, `sendContinuousNewsPreview.ts` reads `v3-prepared.json` and writes `v3-receipts.json`; it uses the same explicit test bot/guild/channel checks as the legacy preview server. The previous `news-v2-preview` process can stay online to keep old preview buttons working. Production processes are not restarted by these preview scripts.

## Attachment grouping, video titles and pure status cards (retained behavior)

Layout `continuous-v3` separates the default 10 MiB per-file limit from the 24 MiB attachment budget per message (leaving headroom under Discord's 25 MiB request limit). Actual uploaded buffers are checked as well as stored media sizes. Ordinary image runs retain a run ID and single/multi presentation intent. The message packer merges adjacent fragments of the same multi-image run within a message, while single originals and crop slices always remain separate galleries. Existing crop files and the `v2-equal` slicing algorithm are unchanged.

`NewsVideoTitles` normalizes supported YouTube URLs to watch URLs, prefers valid article-provided video titles, and otherwise uses YouTube oEmbed. Successful metadata is cached by video ID for 24 hours, failed lookups for one minute, and in-flight lookups are shared. Failure falls back to a localized watch-video label plus the article title without blocking delivery. The resolved title, URL and title source are frozen into the article document; no additional thumbnail is inserted. Video labels use the same emoji removal and Markdown escaping as article-title links.

Status cards are now plain, localized status displays with a game-name caption, event heading, prominent version, one explanatory sentence and the existing attached game icon. They contain no HoYoLAB link, action link, timestamp or accent bar. Simulated events retain their test label. Official polling endpoints and maintenance transition logic are unchanged.

Publication IDs are now independent of the layout version. Previously deployed version-specific publication keys are recognized. Completed publications are skipped; publications with recorded parts resume the original document through the legacy renderer; those with no recorded parts switch to the current document under the destination lock. This prevents a layout upgrade from replaying or renumbering an in-progress article.

The preview sender accepts `NEWS_PREVIEW_SET=v4` (default remains `v3`) to select the corresponding prepared manifest, receipts and subscription revision. The targeted v4 set contains articles 46606927, 46328438 and 46570956, plus the four simulated status events for each game. Previous previews and their handler remain available. Production bots are not restarted.

## Single-message pagination (current: paged-v1)

New articles now send exactly one message. `NewsMessageDocument.layout = "paged-v1"` interprets its immutable `parts` as pages; the first-page receipt completes the publication, while `news_readers` retains the document/message/destination binding and current page. Manual browsing edits its existing ephemeral message and provides a Home button on every page. Both paths use the current linked title and author timestamp on every page, with Previous / disabled page counter / Next controls only for multi-page articles. Pure status cards remain single-page, icon-based, without links, dates or accent colors.

Pagination keeps headings with following content, pairs immediately preceding explanation paragraphs with their image run, and moves a complete unit to the next page when needed. Oversized runs minimize page count then balance image counts, including available preceding content when possible to avoid an isolated introduction/cover. Crop fragments always retain individual galleries and original row coverage. All retained file/message/media/text/component limits apply, with header and controls validated before caching. Markdown is split at paragraphs or list-item boundaries where possible, with fenced/inline formatting balanced across pages.

The existing reading route dispatches by the saved document shape, so legacy previews keep their original rendering. Cross-shard SQLite leases serialize edits; page state changes only after a successful edit. Edits replace the attachment set, suppress notifications and never mention roles. DM/manual views enforce owner identity; channel views share the current page. A recorded first-page receipt can repair a missing reader binding after restart. Completed deliveries are not resent; already-started continuous publications finish their original snapshot, while unstarted publications use the new layout.

The v5 preview uses an isolated `previews/news/build-v5` compilation so the running production `dist` is not replaced. Its existing dedicated test Gateway process is restarted with that build to support both old and new reading states. The preview set contains the three reported articles, long-image article 46486178, and eight simulated status cards. Production processes are not restarted as part of this preview.

## Status wording and first/last controls

Status headings combine the localized game name and event in one heading; descriptions use conversational wording while keeping download availability distinct from maintenance ending. Paged articles now have First / Previous / page counter / Next / Last in one five-button row. Manual browsing puts Home in a separate row. First/Last reuse the persisted reader, destination/owner checks and serialized attachment replacement; failed edits leave the page unchanged. Existing document snapshots and delivery identities are retained. The v6 test preview uses an isolated build and leaves production processes untouched.
