# /team 指令設計規格

**日期：** 2026-05-03  
**功能：** 讓使用者透過 autocomplete 選取 1~3 個角色和 0~1 個邦布，生成配隊展示圖片

---

## 指令結構

```
/team [account] [agent1] [agent2] [agent3] [bangboo]
```

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `account` | string (autocomplete) | 否 | 選擇綁定帳號（同現有 /profile 指令） |
| `agent1` | string (autocomplete) | 是 | 第一角色 |
| `agent2` | string (autocomplete) | 否 | 第二角色 |
| `agent3` | string (autocomplete) | 否 | 第三角色 |
| `bangboo` | string (autocomplete) | 否 | 邦布 |

所有 autocomplete 欄位的 value 為對應的角色/邦布 ID（數字字串）。

---

## Autocomplete 邏輯

### agent1 / agent2 / agent3
- 使用者聚焦欄位時，從 Hoyoverse API 拉取該帳號擁有的角色清單
- API：`ZenlessZoneZero.getAvatarInfo()` 或等效端點
- 顯示格式：`{角色名稱} Lv.{等級}` 
- value：角色 ID 字串
- 過濾：排除已在其他 agent 欄位中選過的角色（同一指令中不能重複選角色）
- 如果 API 失敗或無帳號，回傳空清單（不報錯）

### bangboo
- 從 API 拉取該帳號擁有的邦布清單
- API：`ZenlessZoneZero.getBuddyInfo()` 或等效端點
- 顯示格式：`{邦布名稱} Lv.{等級}`
- value：邦布 ID 字串
- 如果 API 失敗，回傳空清單

### account
- 同現有邏輯（`autoComplete.ts` 中已有的 account handler）

---

## 執行流程

1. 解析使用者選擇的 agent ID 和 bangboo ID
2. `interaction.deferReply()` 先回應（因為後續 API + canvas 需要時間）
3. 呼叫 Hoyoverse API 取得每個選定角色的詳細資料（包含武器、裝備）
4. 若有選邦布，同時呼叫 API 取得邦布詳細資料
5. 呼叫 canvas 繪圖函式生成配隊圖片
6. 回傳圖片

---

## Canvas 圖片內容

### 版面
- 橫向排列，背景參考現有 profile 風格
- 寬度根據角色數量動態調整（1~3 個角色 + 可選邦布卡片）

### 角色卡片（每個 agent）
- 角色立繪圖
- 角色名稱、等級
- 屬性 icon（火/冰/雷/物/以太/奇異）
- 陣營/職業
- 核心被動等級（0~6）
- **音擎（武器）**：名稱、等級、精煉等級、圖示
- **驅動盤（裝備）**：各套裝名稱及件數（例：「4件 套A + 2件 套B」）

### 邦布卡片（如有選擇）
- 邦布圖示
- 邦布名稱、等級

---

## 新增/修改的檔案

| 檔案 | 操作 | 說明 |
|------|------|------|
| `src/commands/slash/zzz/team.ts` | 新增 | 指令定義（SlashCommandBuilder）+ execute handler |
| `src/utilities/zzz/team.ts` | 新增 | Canvas 繪圖邏輯，drawTeam 函式 |
| `src/events/autoComplete.ts` | 修改 | 新增 agent1/2/3 和 bangboo 的 autocomplete handler |
| `commands-manifest.json` | 修改 | 加入 /team 條目 |

---

## 錯誤處理

- 無帳號綁定：回傳 ephemeral 錯誤訊息
- API 呼叫失敗：回傳 ephemeral 錯誤訊息，不生成圖片
- 角色 ID 無效（使用者繞過 autocomplete 手動輸入）：回傳錯誤
- Canvas 繪圖失敗：log 錯誤，回傳 ephemeral 錯誤訊息

---

## 本地化

指令名稱和描述需要提供：
- `en`（預設）
- `zh-TW`
- `vi`（越南語）
- `fr`（法語）

autocomplete 回應內容為角色名稱，依使用者語言設定（`getUserLang`）決定語言。
