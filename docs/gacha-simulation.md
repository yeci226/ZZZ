# 模擬調頻

`/模擬調頻 [卡池] [抽取次數]`（API 名稱 `gacha-simulate`）。卡池支援自動完成；省略時使用目前開放、開始時間最新的角色池，省略次數時十抽。不需要綁定 HoYoLAB。

流程為 Components V2 動畫訊息 → 同一則訊息替換為結果 PNG。標題為「模擬調頻｜{版本} {卡池名稱} - {S 級 UP 名稱}」，不再另列版本／抽數／UP 名單、累計統計、UP 機率或模擬說明。動畫附「跳過動畫」；結果附兩個不可按的保底計數與「再抽1抽／再抽10抽」。同一次指令的續抽串只在最新結果保留一組續抽按鈕：單抽與十抽共用一次使用機會，按下任一個就移除原訊息的兩個續抽按鈕，保留原結果圖與保底計數。新動畫送出後，直到新結果出現才提供下一組按鈕。續抽透過本次按鈕 interaction 的 `followUp` 產生新訊息，沿用原訊息的卡池快照；另外執行的新指令各有自己的續抽串。只有原使用者可以操作，尚未使用的最新按鈕不設時間期限；資料與已使用狀態持續保存在 SQLite，重啟後仍然有效。保底沿用該使用者此類卡池的最新進度。

`gsim:` 由模擬調頻專用事件處理器回應，共用按鈕處理器必須略過，避免重複 ACK。專用處理器在讀取資料庫前先 `deferUpdate`；Discord 每次點擊產生新的 interaction，不沿用原指令的 webhook token。未完成的舊動畫也可在重啟後恢復結果，不因訊息年齡被排除。

結果更新成功後會保存 30 秒後的查核時間，恢復程序以 `force: true` 重新讀取 Discord 訊息，核對同一 session 的按鈕狀態及已載入 PNG。已續抽的結果應保留計數、移除續抽按鈕；恢復結果時也會重新讀取使用狀態，避免把舊按鈕加回。若仍顯示動畫、載入失敗或錯誤結果，重新顯示同一筆保存結果；確認成功才標記已驗證。已標記完成但未驗證的舊訊息也會補查，已刪除訊息則停止重試。手動「跳過動畫」可修復本機已標記完成但實際仍卡住的訊息，全程不重抽、不增加抽數或修改保底。動畫與結果使用不同的 Container／Media Gallery 元件 ID。

2026-09-24 收錄 1.0～3.2 共 130 個一般限定角色／音擎池，其中 126 個已結束、4 個當期。自動完成可輸入版本、卡池、S／A UP 名稱、日期或池種，並支援空白分隔條件，例如「1.4 雅」、「1.0 音擎」。先篩選再取 Discord 允許的 25 個選項，空白查詢優先當期與最近卡池。各期保留自己的物品池；新 A 級角色及專屬音擎在下一版本才加入非 UP 池，2.0／3.2 新通用音擎不會出現在更早卡池。跨新舊角色池仍共用角色保底，音擎另算。

歷史資料綜合 [rng.moe 公開卡池設定](https://zzz.rng.moe/en/tracker)、[163 的卡池年表](https://zzz.163.moe/banners)與 HoYoLAB 公開日曆，拆開 1.4／2.5／3.1 合併的 S 與 A UP；每個 banner 的來源 ID 記於 `src/assets/gacha-simulation/history-provenance.json`。繁體物品名稱、37 張新增角色圖使用官方戰績素材；歷史標題轉為繁體，歷史時段邊界按亞洲服慣例整理，當期採已確認日曆時間。獨家重映、音擎回響、自訂頻段等不同規則仍未加入。

## 機率與資料邊界

| 頻段 | S 基礎 | A 基礎 | B 基礎 | S 硬保底 | S UP |
|---|---:|---:|---:|---:|---:|
| 角色 | 0.6% | 9.4% | 90% | 90 抽 | 50% |
| 音擎 | 1% | 15% | 84% | 80 抽 | 75% |

每十次最多連續九個 B。A、S 都會重置「A 級或以上」計數；只有 S 重置 S 計數，因此 `SBBBBBBBBB` 合法。S 非 UP 時，下個 S 必為 UP；A 非 UP 時也保存 A 的 UP 保證。十抽依序執行十次單抽，再依稀有度排列顯示。

軟保底不是官方公開的完整伺服器公式。此版本採可替換的社群重建模型：角色第 74 抽起，每抽增加 6 個百分點；音擎第 65 抽起增加 6 個百分點，分別在 90／80 抽強制 S。**不宣稱機率與遊戲伺服器完全相同。** 此前提出的「75 抽開始」與「角色 A 7.2%」沒有直接寫入模型。

來源：

- [遊戲調頻詳情頁（官方頁面，歷史活動）](https://webstatic.mihoyo.com/nap/event/e20230424gacha/index.html?gacha_id=8de6b658666b8862dc70e14526198f3ae02e5d&lang=zh-cn&region=prod_cb01_cn&game_biz=nap_cn)
- [社群重建模型作者的說明](https://yyheggegg.github.io/mihomo-gio-blogs/zzz-gacha-impl-cn/)
- [模型原始設定與公測分析來源](https://git.xeondev.com/YYHEggEgg/JaneDoe-ZS/src/branch/master/assets/GachaConfig/gacha.jsonc)

目前 `catalog.json` 的 `weaponOnly: true` 保留使用者明確指定的「音擎池只出音擎」。實際遊戲音擎池還可能出 A 級角色；若要採遊戲物品範圍，將此值改成 `false`，並把各音擎 banner 的 `agentsA` 設為 `pools.agentsA`。角色池 S 僅包含當期 UP 與明列的常駐 S 角色，不混入 S 音擎。池中物品採明列白名單，不把活動／城募限定音擎或尚未實裝角色自動加進常駐掉落。

卡池與名稱從現有 HoYoLAB `gacha_calendar` 整理；`/banner` 及調頻紀錄同步成功時更新公開資料快取。同時開放的兩個 S UP 拆成兩個選項。未提供活動正式標題的時段使用「角色／音擎名稱 UP」標示，不捏造活動名稱。新的角色尚無本機素材時會先回覆尚未準備完成，不先消耗模擬抽數。可用 `previewGachaSimulation.ts` 檢查新卡池素材。

首版只提供一般角色／音擎限定頻段，沒有混入獨家重映、音擎回響、邦布、新手或常駐頻段的其他規則。依使用者選擇，同類角色卡池共用一組模擬狀態，音擎另算。

[3.2 官方調頻公告](https://www.taptap.cn/moment/845969989931372181)另外提供自訂六個 S 候選與兩個 A UP 的功能；已新增選擇介面（見下方 2026-09-26 更新）；初始仍採原六位 S 與該期 A UP。新增普通池可掉落的物品仍須更新白名單，公開日曆只負責卡池期間、版本與 UP 名單。

## 保存與失敗處理

- 狀態存在獨立 `data/zzz-gacha-simulation.sqlite`，不寫入實際調頻紀錄資料庫。
- SQLite immediate transaction 原子保存保底、UP 保證、總抽數、取得物品與結果；依 Discord interaction ID 防止同次請求重複抽取。相隔不足 1.5 秒的不同抽取請求會被拒絕，跨分片也一致。
- 續抽另在同一個 immediate transaction 保存原結果的 `continuationId` 與新結果的 `parentId`；即使是不同 interaction、單抽與十抽同時點擊，或超過 1.5 秒再按舊按鈕，最多只建立一筆續抽。繪圖或訊息編輯之前即完成這項限制。抽取交易失敗會回滾，不消耗按鈕或保底。
- 若交易已完成，但移除舊按鈕或送出 followup 失敗，保存的續抽會在 60 秒後由恢復程序補送結果；先移除原按鈕再送出新訊息。重啟後使用 bot 的頻道傳送權限，不依賴已失效的 interaction token。恢復使用資料庫領取與穩定 nonce 防止重複傳送，不重新抽取。
- 每位使用者保存模擬收藏，用於結果圖「新！」標記。同一十抽重複取得時，只有首次顯示「新！」。
- 結果、選用 GIF 尺寸、訊息／頻道／機器人 ID 及播放截止時間都會保存。重啟時恢復已到期的動畫訊息，並每 15 秒檢查；Discord 編輯暫時失敗則稍後重試。保留原抽取結果及保底，只編輯原訊息。已刪除的訊息不會重建，測試與正式機器人不會互相編輯訊息。舊版沒有保存頻道資料的訊息仍可用「跳過」恢復。
- 未預製的罕見 S/A/B 數量組合直接顯示結果，使用中性舞台背景；不借用數量不符的動畫，不重抽。圖片生成失敗則展示文字結果和保存的計數。
- Discord 沒有傳回用戶端動畫播完事件，伺服器的媒體就緒狀態也不代表使用者已經開始播放。附件模式從訊息送出後計時；CDN 模式先等 Media Gallery 載入完成，再等待原動畫片長加 3 秒的用戶端起播緩衝。這是依「9.23 秒動畫在用戶端約播到 7 秒便換圖」的回報校正；不是精確的播放完成訊號。明確回報仍在載入時，即使已有寬高也繼續等待。GIF 末幀另加 6 秒停留，讓提早播放的客戶端停在揭曉畫面，降低等待換圖時重播的情況；這 6 秒不再重複計入換圖計時。
- 載入期間仍能立即跳過；Discord 明確回報找不到圖片或持續載入超過十二秒時直接顯示已保存的結果。若應用程式有回覆權限但沒有讀取頻道權限，則從送出後等待原片長加 3 秒。素材的首幀只有 70ms，且沒有循環標記；開頭停頓仍受 Discord／客戶端取得媒體的速度影響。超過緩衝的載入延遲、背景分頁或稍後才打開訊息，無法由伺服器精確同步。

## 素材與效能

720p／30fps MP4 母檔保留。GIF 有 960×540／640×360、動態部分約 30fps 的兩個版本，分別控制在 19.9 MB／9.9 MB 以下，播放一次。訊息附件限制不足時選較小版本；CDN 可用時優先採大版本。結果是在**機器人選用 GIF 的解碼末幀**上繪製的 1280×720 PNG；Discord 的圖片代理可能另外轉碼。

Blender 只在離線預製階段使用。S/A/B 數量相同即命中同一動畫，電視中央向外排列；角色或音擎身份只影響最後的 2D 圖片。抽取時不呼叫 Blender、不下載素材。所有預製清單與逐次耗時保存在 `src/assets/gacha-simulation/r4-pair-r1/manifest.json`（沿用既有目錄，revision 另外更新）。

預製範圍為 B／A／S 單抽，以及 `ABBBBBBBBB`、`AABBBBBBBB`、`AAABBBBBBB`、`SBBBBBBBBB`、`SABBBBBBBB`、`SAABBBBBBB`、`SAAABBBBBB`、`SSABBBBBBB`、`SSAABBBBBB` 九種十抽。原本 S 動畫 13 秒，A／B 動畫約 9.23 秒，不接個別角色展示。Discord r9 GIF 加上末幀停留後分別為 19 秒／15.23 秒；媒體就緒後的換圖時間分別為 16 秒／12.23 秒。

上述是初始清單。2026-09-24 啟動 `previews/gacha-render-test/expand_cache.py` 背景佇列，按現行抽卡規則估算的機率，補其餘 56 種合法十抽數量組合。每組驗證、上傳後原子加入 manifest，正式服務不必重啟。片頭只解碼一次，後續重用；只渲染依稀有度不同的後段。佇列、恢復操作與進度位置見 `previews/gacha-render-test/expansion-r9/README.md`。

`previews/gacha-render-test/prepare_discord_end_hold.py --output <暫存目錄>` 從快取生成 r9 版本，只修改最後一幀的 GIF 延遲欄位，不重編碼任何像素、不改播放速度或檔案大小。manifest 的 `durationMs` 是 GIF 含停留的總長，`endHoldMs` 是額外末幀停留；換圖延遲為 `durationMs - endHoldMs + 3000`。上傳與驗證暫存快取後，才切換機器人的 manifest。

GIF 片頭直接解碼使用者提供的原素材，後段使用 PNG 渲染幀，只有銜接的三幀經過母片；減少重複 H.264 壓縮。A 單抽全段使用原 level_4 影片，其他 A／B 組合另按該片的揭曉時間校正，避免誤用 S 的揭曉速度。錄影帶邊緣的彩色亮線與短閃可在[使用者提供的實錄](https://www.bilibili.com/video/BV1jGYbzCEah)及原素材中看到，沒有另加推測的全畫面閃光。GIF 色彩量化和模型重建仍有差異。

離線檢查腳本：`previews/gacha-render-test/simulator-r7/audit_cache.py`，可用 `--cache`、`--output` 指定暫存快取與報告目錄。它核對十二組數量映射、二十四份 GIF 的 SHA-256、完整解碼、播放一次、總片長、r9 末幀停留、大小限制，以及 GIF 最後一幀與結果背景逐像素相同；另檢查 MP4 為 1280×720／30fps。

2026-09-24 在此 Mac 的實測：結果圖單抽約 224ms、十抽約 195ms（不含 Discord 網路傳輸）。各組 3D 幀累計約 7.8～14.1 分鐘，受並行負載影響；離線封裝約 19～63 秒，A 單抽直接轉原片約 21 秒。360p GIF 約 7.68～9.86 MB，540p 約 15.09～19.84 MB；24 個 GIF 合計約 322 MB。53 項相關程式測試通過（包含重啟恢復與 CDN 媒體載入計時），另完成 69 個物品結果卡的素材試畫與 24 份 GIF 末幀核對。

## CDN 上傳

`img.yeci.it.com` 使用現有的 **Workers 靜態資產**服務 `yeci-images`。設定來自使用者提供的 `wrangler.jsonc`，保留在 `deploy/gacha-images/wrangler.jsonc`。登入使用 Wrangler 自己儲存的 OAuth 憑證，不把 token 寫進程式、設定或素材。

登入及準備完整圖庫（不部署）：

```sh
npx wrangler@4 login --device
npx tsx src/scripts/uploadGachaSimulationWorkers.ts --config deploy/gacha-images/wrangler.jsonc
```

實際部署並驗證：

```sh
npx tsx src/scripts/uploadGachaSimulationWorkers.ts --config deploy/gacha-images/wrangler.jsonc --apply
```

腳本先驗證 GIF 的雜湊、數量組合與 25 MiB 單檔上限（每組兩個尺寸，最多 69 組），確認網域綁定指定 Worker，且 Worker 只有靜態資產。首次更新支援原首頁格式；之後依 `gallery-index.json` 與 `zzz/gacha/assets.json` 保存所有既有圖片、GIF 和縮圖，生成各資料夾的首頁。新 GIF 以內容雜湊命名，上傳後驗證既有及新增 URL，成功才更新機器人快取。

部署前確認線上版本沒有被別人更新，執行 Wrangler dry-run 後以 strict 模式部署，沿用原有網域、route 與 workers.dev 設定。Cloudflare 會重用內容沒有改變的圖片。部署後下載原圖片、首頁及新 GIF，核對完整 SHA-256；全部通過才把 `remoteUrl` 寫入機器人的快取清單。GIF 回傳 `image/gif`，使用一年 immutable 快取。備份、部署設定及驗證清單存在 `previews/gacha-render-test/cloudflare/`，不含 OAuth token。

若部署成功但下載驗證受網路問題中斷，可接續驗證，不再部署：

```sh
npx tsx src/scripts/uploadGachaSimulationWorkers.ts --config deploy/gacha-images/wrangler.jsonc --verify-only
```

Discord 每次播放附獨立 `play` 查詢參數，讓同一組合的 GIF 能重新起播。使用 URL 省去機器人每次上傳 GIF，Discord／客戶端仍需要取得圖片。未設定 URL 時仍可使用較小的本機附件。不要只拿 GIF 資料夾直接部署 `yeci-images`，Workers 每次部署的素材目錄必須包含要保留的舊圖片。

另保留 `uploadGachaSimulation.ts --bucket ... --apply` 給另有 R2 bucket 的部署環境；目前這個網域使用上述 Workers 流程。

2026-09-24 已部署版本 `0acc23b3-9028-4b92-8d26-0ab9220d11fb`，原有 27 張圖片、首頁及 24 份 GIF 的公開內容全數通過 SHA-256 核對。Workers 實際上傳約 40 秒；未變動的 28 個檔案直接重用。實際 Discord 訊息以本機附件送出十抽約 5 秒，使用 CDN URL 約 0.6～0.9 秒送出；另外量得 Discord 約 2.5 秒完成 GIF 媒體準備，尺寸為 960×540／640×360、類型為 `image/gif`。因此不能把「訊息已送出」視為「動畫已開始播放」。

同日更新 r9 末幀停留，部署版本 `ba0c5150-db21-43f8-aac6-6a80bffd2fec`。原有 52 個公開檔案及新增 24 份 GIF 共 76 個檔案完整 SHA-256 驗證通過，實際上傳約 45 秒。部署與驗證記錄在 `previews/gacha-render-test/cloudflare-r9/`；新 manifest 驗證完成後才替換預設快取並重啟獨立測試機器人。

環境變數（選用）：`ZZZ_GACHA_CACHE_DIR`、`ZZZ_GACHA_SIMULATION_DB`、`ZZZ_GACHA_CATALOG`、`ZZZ_GACHA_R2_BUCKET`、`ZZZ_GACHA_CDN_BASE`。不要將 Cloudflare token 寫入 manifest 或 Git。

## 驗證

```sh
npx tsc --noEmit
npx jest --runInBand tests/gachaSimulation.test.ts tests/gachaSimulationHistory.test.ts tests/gachaSimulationInteraction.test.ts tests/gachaSimulationRecovery.test.ts tests/gachaPlayback.test.ts tests/interactionPreflight.test.ts tests/gachaSync.test.ts
npx tsx src/scripts/previewGachaSimulation.ts
```

已使用 Corin Beta 在指定 test 頻道送出固定 S 單抽與 1S／2A／7B 十抽；驗證 Components V2 GIF → 1280×720 PNG，分別涵蓋程式觸發跳過及自動切換。Discord 會把 `attachment://` 檔案整合進 Media Gallery，回傳的頂層 `attachments` 可能為空；實測檢查 Gallery 的實際媒體與 PNG 內容，避免把成功替換誤判為附件遺失。

2026-09-24 已透過原有 `yarn start` 流程更新正式 PM2 服務 `ZZZ`。正式機器人 `1170366976162537543` 已載入模擬調頻事件，並註冊全域 `/模擬調頻`（API 名稱 `gacha-simulate`，指令 ID `1552543258415071292`）。原有 18 個全域指令及 ID 保留，現在共 19 個。固定樣片 `/抽卡預覽` 標記為 `developmentOnly`，不會註冊到正式環境。

正式版使用 `data/zzz-gacha-simulation.sqlite` 保存模擬進度，沿用已驗證的 r9 CDN GIF 與 130 個當期／歷史卡池。上線前 61 項相關測試與建置通過；原建置備份於 `backups/gacha-simulation-launch-20260924T045021Z/`，部署與檢查記錄在 `previews/gacha-render-test/discord/production-launch.json`。

正式機器人已在授權測試頻道完成一則 1A／9B 樣片：CDN 動畫為 960×540，就緒後等待 12231ms 自動換成 1280×720 結果 PNG。記錄為 `previews/gacha-render-test/discord/smoke-production-r9-receipts.json`；只使用樣片資料庫。

2026-09-24 續抽按鈕改為每則結果共用一次使用機會；57 項相關測試與型別檢查通過。指定測試頻道的實際訊息驗證得到三則結果的續抽按鈕數為 0／0／2，重複點擊未增加抽數。既有訊息僅依 Discord 回傳的按鈕來源訊息、相同使用者及相同卡池確認續抽串，再將舊按鈕標記已使用；不以「同一使用者最後一抽」推測，避免停用另一個獨立指令。備份與紀錄分別位於 `backups/gacha-single-use-20260924T141156Z/`、`previews/gacha-render-test/discord/single-use-controls/`。

## 獨立 Discord 測試

`gachaSimulationTestServer.ts` 使用與 `TOKEN` 不同的 `TEST_TOKEN`，只載入模擬調頻，不啟動簽到、兌換碼或通知排程。測試保底存在 `previews/gacha-render-test/discord/test.sqlite`，不改正式模擬資料庫。

先做唯讀連線與頻道權限檢查：

```sh
npx tsx src/scripts/gachaSimulationTestServer.ts --channel 1501604192635064390
```

啟動測試並在指定頻道發出一次提示：

```sh
npx tsx src/scripts/gachaSimulationTestServer.ts --channel 1501604192635064390 --start --announce
```

啟動後只新增／更新所在伺服器的 `gacha-simulate` 指令，保留其他 guild／global commands；其他頻道不能執行這個測試版。`server.json` 記錄 bot／command／channel ID 與一次性的提示訊息 ID，不含 token。正式機器人仍由原入口載入相同 command、按鈕 handler 與結果恢復工作。

測試順序：省略選項十抽 → 動畫結束自動替換；另一次在動畫期間跳過 → 確認只替換一次；按結果的再抽按鈕 → 新訊息並沿用卡池；換成音擎池 → 使用獨立保底；重啟測試程序 → 未完成動畫在截止後自動恢復結果。Discord 用戶端是否自動播放、實際清晰度及按鈕操作仍需在客戶端確認，API 成功不等於已完成視覺驗收。

另有固定 S 單抽（程式觸發跳過）、1S／2A／7B 十抽（計時自動替換）的實際附件測試。它使用獨立 `smoke.sqlite`、停用樣片按鈕並清楚標示固定樣片，不寫入任何人的保底；重跑依同一 request ID 接續原訊息。預設只列印計畫，加 `--send` 才發訊息：

```sh
npx tsx src/scripts/smokeGachaSimulationDiscord.ts --channel 1501604192635064390 --send
```

可用 `--sample ten-ab --run-id ab-timing-r9` 只送出一則 1A／9B 樣片，驗證較短的 A／B 動畫切換時間。

2026-09-24 的 r9 A／B 實測：訊息送出 529ms、媒體就緒在第 2375ms、開始編輯結果在第 14607ms，即就緒後等待 12232ms；結果為 1280×720 PNG。Discord 圖片代理保留全部 276 幀的時間，總長 15230ms、末幀 6030ms，符合原片長加末幀停留。代理會重新編碼圖片，檔案雜湊與部分像素和來源不同，不能用來源雜湊判定代理是否保留動畫時間。記錄為 `discord/smoke-ab-timing-r9-receipts.json` 與 `discord/r9-discord-proxy-audit.json`（位於 `previews/gacha-render-test/`）。37 項相關程式測試、型別檢查及 24 支 GIF 的離線檢查通過。

完成後的 `smoke-receipts.json` 包含訊息連結、上傳耗時、GIF／PNG 大小和切換方式；CDN 另外記錄媒體就緒、開始編輯結果的時間及其差值。這項檢查證明 Discord 收到附件及接受 Components V2 編輯，並不代替真實使用者點按鈕的驗證。

CDN 啟用後，用 `--run-id cdn-r7` 建立另外兩則樣片，記錄訊息送出耗時、媒體來源及 Discord 識別到的尺寸／類型；同一 run ID 重跑不重複發新訊息。測試服務由 PM2 的 `zzz-gacha-simulation-test` 維持運行，僅限使用者指定的頻道。

上線後可在已授權的測試頻道加 `--production`，明確改用正式 `TOKEN` 驗證媒體流程。預設仍用 `TEST_TOKEN`；樣片繼續使用獨立 `smoke.sqlite` 與停用的按鈕，不寫入使用者的正式保底。


## 2026-09-26：設定、詳情、資源試算與分層圖庫

### Discord 使用

- `/模擬調頻設定`：可搜尋當期及過往卡池，編輯 S/A/B 基礎機率（合計 100%）、S/A 硬保底與軟保底、UP 機率及歪後必 UP，選擇動畫開關。輸入後須按「儲存設定」。
- `/模擬調頻詳情`：總覽、S 出貨歷程、S/UP 間隔分布、每抽條件機率、累積 S/UP 機率、實際出率、UP 勝率與收藏、最多三組規則比較。可篩選卡池及台北日期，匯出 PNG/CSV。
- 調頻結果底下的「設定」「詳情」只對發起者開啟私人面板；日常續抽仍只保留最後結果的一組單抽／十抽按鈕。
- 修改數值機率、保底及 UP 機制會另存規則版本；同一使用者、同類卡池、同一版本共用進度。切回原版本會恢復原進度。原本遊戲預設的資料表與資料保持不變。
- 只改候選名單、A UP 或動畫不另開進度。舊結果續抽保留該次卡池與完整設定快照，不會因後來改設定而換池或換規則。
- 自訂數值會在公開抽卡訊息標明，完整規則在私人「詳情」。遊戲預設的軟保底仍是社群重建公式；音擎池仍依本機器人選定的範圍只出音擎。

### 定製名單

3.1 起的卡池可從原六位加凱撒、柳、朱鳶中選六位作 S 非 UP 候選；對應音擎也支援九選六。A UP 選兩個，分頁時保留另一頁已選項目。更早版本保持當期原始名單。候選資格由卡池版本、物品上線時間和白名單共同限制，不從「不是當期 UP」推測資格；後續新增可用候選時應更新 `EXTRA_S_CANDIDATES`，不移除既有名單。

### 個人資源試算

從設定或詳情按「個人資源試算」。輸入擁有的菲林底片、保留底片、可用菲林、加密母帶；底片 1:1 換菲林，160 菲林換一抽。先花母帶，再花菲林，最後只換需要的底片。兩池共用此預算，各自保存輸入的已墊抽數與大小保底。角色目標為額外 0～7 份、音擎 0～5 份；0 表示略過該池。

可輸入「距硬保底還有幾抽」或 `已墊:70`。距硬保底是最多抽數，並非預測哪一抽出 S。不確定大小保底時分成 2 或 4 種情境，不擅自假定。選填 A 狀態會保存在輸入；本次只估算 S 目標，因此 A 狀態不影響結果。

預設角色達標才換音擎，可交換順序；資源耗盡或兩項目標均達成即停止。試算初始為遊戲預設機率、零墊抽、小保底，須填入實際狀態；也可指定保存的自訂機率。日常模擬的規則、抽數、收藏和保底不受影響。

每情境最多 10,000 個回合，整次 30 秒，時間到僅統計完整回合。顯示角色、音擎、全部達成的機率與 95% Wilson 區間、取得份數分布、成功回合消耗／剩餘分布、預算曲線、可證明的最壞保底預算，以及一個可能的 S 出貨範例。極端設定的範例最多列出前 200 次 S，並標明省略數；機率仍統計完整回合。再產生範例不重算或替換原機率，各自保存種子，可匯出 JSON。可載入上次輸入。

只計輸入資源，不計抽卡返還、商店兌換、未來收入或儲值。有限抽樣的 100% 不等於保證；保證預算另由有效硬／軟保底與歪後機制計算。

詳情亦支援獨立試抽 1,000／10,000／100,000 抽，可從零或目前模擬進度出發。大量試抽與個人資源試算均在 Worker 執行；SQLite 限制每人一個、全機器人同時兩個計算工作，支援取消。

### 圖庫與上傳

入口 https://img.yeci.it.com/ ，動畫位於 `/zzz/gacha/r9-discord-end-hold/`。可逐層點資料夾、返回上層、搜尋、排序、分頁，並點擊圖片／GIF 預覽、重新播放或複製原始網址。清單使用靜態末幀縮圖，點擊才載入完整 GIF。

目前 69 種組合：3 種單抽 + 66 種十抽數量組合（所有 S+A+B=10 的情況，包含全 B）。每組 360p、540p 兩個 30fps GIF，共 138 份啟用檔案；另保留舊版本 24 個 GIF 與首頁 28 張圖片。全 B 只會在自訂規則允許時使用，預設十抽保證不變。

Windows/macOS 新版一般圖片上傳工具在 `deploy/gacha-images/uploader`，可遞迴讀取 `files`，先保存線上全量庫存，再合併新增圖片、重建各層索引；發布前若網站已被另一個工作更新會停止並要求重跑。不得使用舊版只上傳首頁圖的 PowerShell 腳本，否則會漏掉遠端 GIF。

### 驗證與備份

改動前備份在 `backups/gacha-settings-20260925T183419Z`；包含原編譯輸出與 SQLite 一致性備份。對正式資料副本執行遷移，14 筆進度、259 筆收藏、98 筆調頻紀錄的雜湊均保持相同。測試涵蓋機率邊界、全 B、規則隔離、單次續抽、保底分情境、資源消耗與取消限制。另已在授權測試頻道驗證 Components V2 設定面板及 1280×720 圖表可送出、讀回。

## 2026-09-27 設定與詳情簡化

設定首頁改為圖卡與六個常用按鈕，顯示當期 UP、遊戲／自訂機率及動畫狀態。「非 UP 候選」以角色／音擎圖片標示已選六個候選；A UP 另頁選擇。機率、S／A 保底、UP 保證與舊設定移至「進階設定」，有未儲存變更才啟用儲存；離開子頁仍保留草稿。

詳情首頁只顯示總抽數、S／A／B 數量、目前保底及最近 S。紀錄以頭像排列；圖表使用「出貨抽數分布」「累積出貨機率」等精簡名稱作入口，並解釋橫縱軸。篩選、規則比較、CSV／PNG 匯出和大量試抽保留在第二層。

個人資源試算改為三步：填資源、設定角色／音擎目標與保底、開始試算。結果先顯示目標圖片和達標機會，抽取範例、曲線與 95% 區間另行展開。S 目標試算不需要的 A 保底欄位已從表單移除，舊面板提交仍相容。

圖片使用既有遊戲頭像、音擎、S／A／B 和資源素材。角色維持圓形頭像，使用相同縮放倍率覆蓋頭像區並裁切外圍；備用人物裁切保留原寬高比，不先拉成正方形。音擎、稀有度和資源素材則等比例 contain-fit，保留完整輪廓。圖表產生為 1000px 寬 PNG。Discord 按鈕使用各應用程式自己的七個遊戲表情符號，ID 保存在 `src/assets/gacha-simulation/ui/application-emojis.json`，缺少設定時才使用 Unicode 備援。準備新機器人時明確執行 `node --env-file=.env dist/scripts/syncGachaSimulationEmoji.js --test` 或 `--production`；互動期間不會上傳表情符號。

本次沒有修改機率引擎、動畫快取、原有進度或續抽規則。備份位於 `backups/gacha-simple-ui-20260926T050545Z`，圖卡及驗證記錄位於 `previews/gacha-simple-ui`。

2026-09-27 已完成建置與 87 項相關測試，正式 `ZZZ` 服務已重新載入。全域 21 個指令及原指令 ID 保留；在指定頻道完成測試版 10,000 回合資源試算、圖表切換及正式設定指令實測。部署前後正式進度 18 筆、收藏 363 筆、調頻紀錄 161 筆均未變更。新版範例訊息與媒體尺寸記錄於 `previews/gacha-simple-ui/discord-receipts.json`。

後續依使用者回饋將入口統一為「非 UP 候選」「資源試算」「統計圖表」等精簡名稱，人物恢復圓形頭像，等比例縮放後僅裁切外圍。本次建置與 7 項介面測試通過，已重新載入正式版／測試版，並原地更新兩則公開範例；下載 Discord 圖片比對雜湊與本機 PNG 一致。驗證記錄為 `previews/gacha-simple-ui/refinement-completion.json`。
