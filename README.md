<div align="center">

<img src="https://cdn.discordapp.com/avatars/1148417789887393832/f80b08e72451d95c2e7d4f3e4a30ac60.webp" width="120" height="120" style="border-radius:50%"/>

# 柯琳小助手

**絕區零 Discord Bot — Zenless Zone Zero**

[![Discord](https://img.shields.io/badge/加入支援伺服器-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/mPCEATJDve)

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

</div>

---

## ✨ 功能

| 功能 | 說明 |
|------|------|
| 👤 **帳號管理** | 綁定 Hoyolab 帳號，管理多帳號設定 |
| ⚙️ **快速設定** | `/setup`（`/快速設定`）一頁開啟自動簽到、兌換、Mimo 與遊戲提醒；[操作說明](docs/quick-setup.md) |
| 📅 **每日自動簽到** | 自動完成 Hoyolab 每日簽到並推播通知 |
| 🖼️ **每日 Banner** | 機器人個人檔案 Banner 沿用當天簽到壁紙，台灣時間每日 00:00 自動更換；啟動時補更新，失敗於下個整點重試 |
| ⚡ **電量 & 委託通知** | 電量達到閾值或委託完成時自動通知 |
| 🛠️ **管理員通知管理** | 移動／停用本服簽到、兌換、便箋、Mimo 及新聞頻道通知；[操作說明](docs/admin-notifications.md) |
| 🎫 **兌換禮包碼** | 快速兌換官方禮包碼，支援批次兌換 |
| 🎰 **調頻紀錄** | 查看歷史調頻紀錄與統計分析 |
| 🗓️ **卡池資訊** | 未登入也能查看已登入使用者查詢後的公開卡池資訊，不顯示帳號資源；登入後可查看自己的抽卡資源 |
| 📺 **模擬調頻** | 當期／歷史卡池單抽與十抽、預製動畫及結果圖、保存模擬保底 |
| ⚔️ **式層音擊** | 查詢式層音擊每層佈陣與通關紀錄 |
| 💀 **致命考核** | 查詢致命考核挑戰進度與紀錄 |
| 🗺️ **代理人資料** | 查看代理人詳細數據與培養資訊 |
| 💿 **驅動盤評分** | 角色卡每片驅動盤右上角顯示評分，總有效詞條旁顯示整套總分 |
| 🏆 **驅動盤排行榜** | `/排行榜`（`/leaderboard`）查看角色的全球／伺服器排行；查詢自己的角色自動更新，可於排行榜或設定退出 |

---

## 🔒 Cookie 使用須知

使用自動簽到、自動通知、帳號資料等功能時需要 Hoyolab 帳號的 Cookie。

> **設置 Cookie 即代表您同意機器人使用 Cookie 提供服務。柯琳小助手保證不會在提供服務以外的情況下使用您的 Cookie。**

- ✅ Cookie **無法**登入您的遊戲帳號
- ✅ Cookie 只能讀取遊戲資料（便籤、簽到、代理人等）
- ✅ 您可隨時使用指令刪除儲存的 Cookie

---

## 🛠️ 自行架設

### 前置需求

- [Node.js](https://nodejs.org/) 18 或更高版本
- [yarn](https://yarnpkg.com/)

### 安裝步驟

```bash
# 1. Clone 專案
git clone https://github.com/yeci226/ZZZ
cd ZZZ

# 2. 安裝依賴
yarn install

# 3. 設定設定檔
cp config.example.json config.json
# 填入你的 Bot Token 等資訊

# 4. 啟動
yarn start
```

---

## 📄 授權

本專案採用 MIT 授權。你可以自由修改與使用，但請在網站或任何公開文件中標註原作者與原機器人連結。

<div align="center">

Made with ❤️ by [Yeci](https://github.com/yeci226)

</div>
