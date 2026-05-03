# /team 指令實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/team` Discord slash 指令，讓使用者透過 autocomplete 選取 1~3 個持有角色和 0~1 個邦布，生成包含武器/裝備詳情的配隊展示圖片。

**Architecture:** 指令定義在 `src/commands/slash/zzz/team.ts`，autocomplete handler 擴充現有 `src/events/autoComplete.ts`，canvas 繪圖邏輯放在 `src/utilities/zzz/team.ts`，遵循現有 `/profile` 指令的架構模式。

**Tech Stack:** TypeScript, Discord.js v14, @yeci226/hoyoapi v1.3.9, @napi-rs/canvas

---

## 檔案結構

| 檔案 | 操作 | 說明 |
|------|------|------|
| `src/commands/slash/zzz/team.ts` | 新增 | 指令定義 + execute handler |
| `src/utilities/zzz/team.ts` | 新增 | Canvas 繪圖邏輯 |
| `src/events/autoComplete.ts` | 修改 | 新增 agent1/2/3 + bangboo autocomplete handler |
| `commands-manifest.json` | 修改 | 加入 /team 條目 |

---

## API 資料結構參考

```typescript
// zzz.record.characters() 回傳 IZZZCharacterFull[]
interface IZZZCharacterFull {
  id: number;
  level: number;
  name: string;          // name_mi18n（已本地化）
  element: string;
  icon: string;
  rarity: number;
  rank: number;          // 命之印等級 0-6
  image: string;
  equip: IZZZEquipment | null;  // 音擎（武器）
  relics: IZZZRelic[];          // 驅動盤（裝備件）
  ornaments: IZZZOrnament[];    // 驅動盤（裝飾件）
  ranks: IZZZRank[];            // 命之印詳情
}

interface IZZZEquipment {
  id: number;
  level: number;
  star: number;          // 精煉等級
  rarity: string;
  name: string;
  talent_content: string;
  icon: string;
}

interface IZZZRelic {
  id: number;
  level: number;
  pos: number;
  name: string;
  desc: string;
  icon: string;
  rarity: number;
}

// zzz.record.records() 回傳 IZZZRecord
// record.buddy_list: Array<{ id, level, name, star, bangboo_rectangle_url, ... }>
// record.avatar_list: IZZZCharacterSummary[]（只有 id, level, name, element, rank, icon, rarity）
```

---

## Task 1: Autocomplete handler — 角色與邦布清單

**Files:**
- Modify: `src/events/autoComplete.ts`

- [ ] **Step 1: 新增 agent autocomplete 邏輯**

新增 `agent1`/`agent2`/`agent3` 欄位的 handler：從 `client.db` 取帳號 cookie + uid，建立 `ZenlessZoneZero` 實例，呼叫 `zzz.record.characters()` 取得角色清單，排除已選的角色。

在 `src/events/autoComplete.ts` 加入以下內容（在 `account` handler 後面）：

```typescript
import { ZenlessZoneZero } from "@yeci226/hoyoapi";
import { getUserCookie, getUserUid, getUserLang, languageMapping } from "../utilities/utilities.js";
```

將 import 加在檔案頂部，然後在 `account` handler 的 `if` 區塊後面加入：

```typescript
  if (optionName === "agent1" || optionName === "agent2" || optionName === "agent3") {
    try {
      const userId = interaction.user.id;
      const accountIndexRaw = autocompleteInteraction.options.getString("account");
      const accountIndex = accountIndexRaw ? parseInt(accountIndexRaw) : 0;

      const [cookie, uid] = await Promise.all([
        getUserCookie(userId, accountIndex),
        getUserUid(userId, accountIndex),
      ]);
      if (!cookie || !uid) {
        await autocompleteInteraction.respond([]);
        return;
      }

      const userLang = await getUserLang(userId);
      const getLanguage = (locale: string) =>
        (languageMapping as any)[locale] || (languageMapping as any)["default"];
      const lang = userLang ? getLanguage(userLang) : getLanguage(interaction.locale);

      const zzz = new ZenlessZoneZero({ cookie, lang, uid } as any);
      const characters = await zzz.record.characters();

      // 排除已在其他 agent 欄位選過的角色 ID
      const otherAgentFields = ["agent1", "agent2", "agent3"].filter((f) => f !== optionName);
      const alreadySelected = otherAgentFields
        .map((f) => autocompleteInteraction.options.getString(f))
        .filter(Boolean) as string[];

      const choices = characters
        .filter((c: any) => !alreadySelected.includes(String(c.id)))
        .map((c: any) => ({
          name: `${c.name_mi18n ?? c.name} Lv.${c.level}`,
          value: String(c.id),
        }))
        .slice(0, 25);

      await autocompleteInteraction.respond(choices);
    } catch {
      await autocompleteInteraction.respond([]);
    }
    return;
  }

  if (optionName === "bangboo") {
    try {
      const userId = interaction.user.id;
      const accountIndexRaw = autocompleteInteraction.options.getString("account");
      const accountIndex = accountIndexRaw ? parseInt(accountIndexRaw) : 0;

      const [cookie, uid] = await Promise.all([
        getUserCookie(userId, accountIndex),
        getUserUid(userId, accountIndex),
      ]);
      if (!cookie || !uid) {
        await autocompleteInteraction.respond([]);
        return;
      }

      const userLang = await getUserLang(userId);
      const getLanguage = (locale: string) =>
        (languageMapping as any)[locale] || (languageMapping as any)["default"];
      const lang = userLang ? getLanguage(userLang) : getLanguage(interaction.locale);

      const zzz = new ZenlessZoneZero({ cookie, lang, uid } as any);
      const record = await zzz.record.records();

      const choices = (record.buddy_list as any[])
        .map((b: any) => ({
          name: `${b.name} Lv.${b.level ?? "?"}`,
          value: String(b.id),
        }))
        .slice(0, 25);

      await autocompleteInteraction.respond(choices);
    } catch {
      await autocompleteInteraction.respond([]);
    }
    return;
  }
```

- [ ] **Step 2: 確認 languageMapping 已匯出**

在 `src/utilities/utilities.ts` 搜尋 `languageMapping` 確認是否為 export：
- 若未 export，在 `autoComplete.ts` 中直接使用 `LanguageEnum.TraditionalChinese` 等來代替
- 若已 export，直接使用

- [ ] **Step 3: Commit**

```bash
git add src/events/autoComplete.ts
git commit -m "feat: add agent/bangboo autocomplete handlers for /team command"
```

---

## Task 2: 指令定義 — `src/commands/slash/zzz/team.ts`

**Files:**
- Create: `src/commands/slash/zzz/team.ts`

- [ ] **Step 1: 建立指令框架**

建立 `src/commands/slash/zzz/team.ts`，內容如下：

```typescript
import {
  ChatInputCommandInteraction,
  Client,
  LocalizationMap,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { getUserZZZData, getUserLang } from "../../../utilities/utilities.js";
import { handleTeamDraw } from "../../../utilities/zzz/team.js";
import { QuickDB } from "quick.db";

export default {
  data: new SlashCommandBuilder()
    .setName("team")
    .setDescription("Display your team composition with agents and bangboo")
    .setNameLocalizations({
      "zh-TW": "配隊",
      vi: "đội",
      fr: "équipe",
    } as LocalizationMap)
    .setDescriptionLocalizations({
      "zh-TW": "展示你的配隊組合（角色與邦布）",
      vi: "Hiển thị đội nhân vật và bangboo của bạn",
      fr: "Afficher votre équipe avec les agents et bangboo",
    } as LocalizationMap)
    .addStringOption((option) =>
      option
        .setName("account")
        .setDescription("Account to use")
        .setNameLocalizations({ "zh-TW": "帳號", vi: "tàikhoản", fr: "compte" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("agent1")
        .setDescription("First agent")
        .setNameLocalizations({ "zh-TW": "角色1", vi: "nhânvật1", fr: "agent1" } as LocalizationMap)
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("agent2")
        .setDescription("Second agent (optional)")
        .setNameLocalizations({ "zh-TW": "角色2", vi: "nhânvật2", fr: "agent2" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("agent3")
        .setDescription("Third agent (optional)")
        .setNameLocalizations({ "zh-TW": "角色3", vi: "nhânvật3", fr: "agent3" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("bangboo")
        .setDescription("Bangboo (optional)")
        .setNameLocalizations({ "zh-TW": "邦布", vi: "bangboo", fr: "bangboo" } as LocalizationMap)
        .setRequired(false)
        .setAutocomplete(true)
    ),

  async execute(
    _client: Client,
    interaction: ChatInputCommandInteraction,
    _args: any[],
    tr: any,
    db: QuickDB,
    emoji: any,
  ) {
    const accountIndex = parseInt(interaction.options.getString("account") || "0");
    const agent1Id = interaction.options.getString("agent1");
    const agent2Id = interaction.options.getString("agent2");
    const agent3Id = interaction.options.getString("agent3");
    const bangbooId = interaction.options.getString("bangboo");

    if (!agent1Id) {
      await interaction.reply({
        content: tr("team_NoAgent") || "Please select at least one agent.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const zzz = await getUserZZZData(
      interaction,
      tr,
      interaction.user.id,
      await getUserLang(interaction.user.id),
      accountIndex,
    );
    if (!zzz) return;

    await interaction.deferReply();

    const agentIds = [agent1Id, agent2Id, agent3Id].filter(Boolean) as string[];
    handleTeamDraw(interaction, tr, zzz, agentIds, bangbooId);
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/slash/zzz/team.ts
git commit -m "feat: add /team slash command definition"
```

---

## Task 3: Canvas 繪圖工具函式 — `src/utilities/zzz/team.ts`

**Files:**
- Create: `src/utilities/zzz/team.ts`

邏輯：
1. 對每個 agentId 呼叫 `zzz.record.character(id)` 取得完整角色資料（含 equip, relics, ornaments）
2. 若有 bangbooId，從 `zzz.record.records()` 的 `buddy_list` 找到對應邦布
3. 呼叫 canvas 繪製配隊圖

- [ ] **Step 1: 建立 team.ts 繪圖邏輯**

建立 `src/utilities/zzz/team.ts`，內容如下：

```typescript
import { AttachmentBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import {
  createCanvas,
  loadImage,
  GlobalFonts,
  SKRSContext2D,
} from "@napi-rs/canvas";
import { join } from "path";
import { ZenlessZoneZero } from "@yeci226/hoyoapi";
import Queue from "queue";
import { drawInQueueReply, getRandomColor } from "../utilities.js";

const drawQueue = new Queue({ autostart: true });

// 元素 ID → 圖示 key
const elementId: Record<number, string> = {
  200: "physic",
  201: "fire",
  202: "ice",
  203: "thunder",
  205: "ether",
};

// 職業 ID → 圖示 key
const professionId: Record<number, string> = {
  1: "attack",
  2: "stun",
  3: "anomaly",
  4: "support",
  5: "defense",
  6: "rupture",
};

/**
 * 計算驅動盤套裝分佈（件數）
 * relics + ornaments 分別計算
 */
function getRelicSetCounts(relics: any[], ornaments: any[]): Array<{ name: string; count: number }> {
  const setCounts: Record<string, { name: string; count: number }> = {};

  const allPieces = [...relics, ...ornaments];
  for (const piece of allPieces) {
    // 以 name 前半部做套裝識別（remove piece suffix if any）
    // 實際上 API 回傳的 name 是件名，我們用 id 的前3碼做套裝識別
    const setKey = String(Math.floor(piece.id / 100));
    if (!setCounts[setKey]) {
      // 取件名的前幾個字作為套裝名（後續可優化）
      setCounts[setKey] = { name: piece.name, count: 0 };
    }
    setCounts[setKey].count++;
  }

  return Object.values(setCounts).sort((a, b) => b.count - a.count);
}

/**
 * 繪製圓角矩形
 */
function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number,
  r: number, color: string,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * 繪製圓形裁剪的圖片
 */
async function drawCircleImage(
  ctx: SKRSContext2D,
  img: any,
  x: number, y: number, size: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
}

/**
 * 選字體（依語言）
 */
function selectFont(locale: string): string {
  const map: Record<string, string> = {
    "zh-TW": "TW",
    "zh-CN": "CN",
    "vi": "VI",
    "ja": "JP",
    "ko": "KR",
    "fr": "FR",
  };
  return map[locale] ?? "EN";
}

/**
 * 主函式：處理配隊繪圖
 */
export async function handleTeamDraw(
  interaction: ChatInputCommandInteraction,
  tr: any,
  zzz: ZenlessZoneZero,
  agentIds: string[],
  bangbooId: string | null,
) {
  drawQueue.push(async () => {
    try {
      const userLocale = interaction.locale ?? "en";
      const font = selectFont(userLocale);

      // 取得角色完整資料
      const agentPromises = agentIds.map((id) =>
        zzz.record.character(parseInt(id)).catch(() => null)
      );
      const agents = (await Promise.all(agentPromises)).filter(Boolean) as any[];

      if (agents.length === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("#E76161")
              .setTitle(tr("DrawError") || "Error")
              .setDescription(tr("team_NoAgentData") || "Could not retrieve agent data."),
          ],
        });
        return;
      }

      // 取得邦布資料（從 records）
      let bangboo: any = null;
      if (bangbooId) {
        try {
          const record = await zzz.record.records();
          bangboo = (record.buddy_list as any[]).find((b: any) => String(b.id) === bangbooId) ?? null;
        } catch { /* ignore */ }
      }

      // 預載圖片
      const agentImages: any[] = await Promise.all(
        agents.map((a: any) =>
          loadImage(a.image || a.icon).catch(() => null)
        )
      );

      const equipImages: Array<any | null> = await Promise.all(
        agents.map((a: any) =>
          a.equip?.icon ? loadImage(a.equip.icon).catch(() => null) : Promise.resolve(null)
        )
      );

      const relicSetImages: Array<Array<any>> = await Promise.all(
        agents.map(async (a: any) => {
          const sets = getRelicSetCounts(a.relics ?? [], a.ornaments ?? []);
          return Promise.all(
            sets.slice(0, 2).map((s: any) => {
              // 取第一件的 icon 作為套裝代表圖
              const firstPiece = [...(a.relics ?? []), ...(a.ornaments ?? [])].find(
                (r: any) => String(Math.floor(r.id / 100)) === String(Math.floor(sets[0]?.name ? 0 : 0))
              );
              return Promise.resolve(null); // icon 由 relic.icon 取得
            })
          );
        })
      );

      // 取第一件 relic icon 作為套裝圖
      const relicIconImages: Array<Array<any>> = await Promise.all(
        agents.map(async (a: any) => {
          const sets = getRelicSetCounts(a.relics ?? [], a.ornaments ?? []);
          const allPieces = [...(a.relics ?? []), ...(a.ornaments ?? [])];
          return Promise.all(
            sets.slice(0, 2).map((s: any) => {
              const setKey = Object.keys(
                allPieces.reduce((acc, p) => {
                  const k = String(Math.floor(p.id / 100));
                  if (!acc[k]) acc[k] = p.icon;
                  return acc;
                }, {} as Record<string, string>)
              ).find((k) => {
                return allPieces.some((p) => String(Math.floor(p.id / 100)) === k);
              });
              const icon = setKey ? allPieces.find((p) => String(Math.floor(p.id / 100)) === setKey)?.icon : null;
              return icon ? loadImage(icon).catch(() => null) : Promise.resolve(null);
            })
          );
        })
      );

      let bangbooImage: any = null;
      if (bangboo?.bangboo_rectangle_url) {
        bangbooImage = await loadImage(bangboo.bangboo_rectangle_url).catch(() => null);
      }

      // Canvas 尺寸
      const CARD_WIDTH = 420;
      const CARD_MARGIN = 20;
      const BANGBOO_WIDTH = bangboo ? 220 : 0;
      const CANVAS_WIDTH =
        agents.length * CARD_WIDTH +
        (agents.length - 1) * CARD_MARGIN +
        (bangboo ? BANGBOO_WIDTH + CARD_MARGIN : 0) +
        80; // padding
      const CANVAS_HEIGHT = 900;

      const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
      const ctx = canvas.getContext("2d");

      // 背景
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 繪製每個角色卡片
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const agentImg = agentImages[i];
        const equipImg = equipImages[i];
        const cardX = 40 + i * (CARD_WIDTH + CARD_MARGIN);
        const cardY = 20;

        // 卡片背景
        drawRoundedRect(ctx, cardX, cardY, CARD_WIDTH, CANVAS_HEIGHT - 40, 20, "rgba(40,40,60,0.95)");

        // 角色圖（上半部）
        if (agentImg) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(cardX, cardY, CARD_WIDTH, 360, [20, 20, 0, 0]);
          ctx.clip();
          ctx.drawImage(agentImg, cardX, cardY, CARD_WIDTH, 360);
          ctx.restore();
        }

        // 漸層遮罩（圖片→文字區域）
        const grad = ctx.createLinearGradient(cardX, cardY + 240, cardX, cardY + 360);
        grad.addColorStop(0, "rgba(40,40,60,0)");
        grad.addColorStop(1, "rgba(40,40,60,0.98)");
        ctx.fillStyle = grad;
        ctx.fillRect(cardX, cardY + 240, CARD_WIDTH, 120);

        // 角色名稱
        ctx.fillStyle = "white";
        ctx.font = `bold 28px ${font}`;
        ctx.textAlign = "left";
        const agentName = agent.name_mi18n ?? agent.name ?? "Unknown";
        ctx.fillText(agentName, cardX + 16, cardY + 330);

        // 等級 + 命之印
        ctx.fillStyle = "#aaa";
        ctx.font = `20px ${font}`;
        ctx.fillText(`Lv.${agent.level}  ✦${agent.rank}`, cardX + 16, cardY + 358);

        let y = cardY + 390;

        // 音擎（武器）
        ctx.fillStyle = "#f0c060";
        ctx.font = `bold 18px ${font}`;
        ctx.fillText(tr("team_Equip") || "音擎", cardX + 16, y);
        y += 24;

        if (agent.equip) {
          if (equipImg) {
            ctx.drawImage(equipImg, cardX + 16, y, 48, 48);
          }
          ctx.fillStyle = "white";
          ctx.font = `16px ${font}`;
          ctx.fillText(agent.equip.name, cardX + 74, y + 16);
          ctx.fillStyle = "#aaa";
          ctx.font = `14px ${font}`;
          ctx.fillText(`Lv.${agent.equip.level}  精煉${agent.equip.star}`, cardX + 74, y + 36);
          y += 64;
        } else {
          ctx.fillStyle = "#666";
          ctx.font = `14px ${font}`;
          ctx.fillText(tr("team_NoEquip") || "未裝備音擎", cardX + 16, y + 16);
          y += 32;
        }

        y += 10;

        // 驅動盤套裝
        ctx.fillStyle = "#80c0ff";
        ctx.font = `bold 18px ${font}`;
        ctx.fillText(tr("team_Relics") || "驅動盤", cardX + 16, y);
        y += 24;

        const sets = getRelicSetCounts(agent.relics ?? [], agent.ornaments ?? []);
        if (sets.length === 0) {
          ctx.fillStyle = "#666";
          ctx.font = `14px ${font}`;
          ctx.fillText(tr("team_NoRelics") || "未裝備驅動盤", cardX + 16, y);
          y += 22;
        } else {
          // 取各套裝第一件 icon
          const allPieces = [...(agent.relics ?? []), ...(agent.ornaments ?? [])];
          const setIconMap: Record<string, string> = {};
          for (const piece of allPieces) {
            const k = String(Math.floor(piece.id / 100));
            if (!setIconMap[k]) setIconMap[k] = piece.icon;
          }

          for (const s of sets.slice(0, 3)) {
            // 取套裝 icon
            const setKey = allPieces
              .reduce((acc, p) => {
                const k = String(Math.floor(p.id / 100));
                if (!acc.has(k)) acc.set(k, p.icon);
                return acc;
              }, new Map<string, string>())
              .entries();

            // 找到 s.name 對應的 icon
            const matchedPiece = allPieces.find(
              (p) => p.name === s.name || String(Math.floor(p.id / 100)) === Object.keys(setIconMap)[0]
            );
            const setIconUrl = matchedPiece?.icon ?? null;

            if (setIconUrl) {
              try {
                const setImg = await loadImage(setIconUrl);
                ctx.drawImage(setImg, cardX + 16, y, 36, 36);
              } catch { /* ignore */ }
            }

            ctx.fillStyle = "white";
            ctx.font = `14px ${font}`;
            // 套裝件數 badge
            ctx.fillStyle = s.count >= 4 ? "#f0c060" : s.count >= 2 ? "#80c0ff" : "#aaa";
            ctx.font = `bold 14px ${font}`;
            ctx.fillText(`${s.count}件`, cardX + 60, y + 14);
            ctx.fillStyle = "white";
            ctx.font = `13px ${font}`;
            // 截短長名稱
            const maxWidth = CARD_WIDTH - 80;
            ctx.fillText(s.name.length > 16 ? s.name.slice(0, 16) + "…" : s.name, cardX + 96, y + 26);
            y += 44;
          }
        }

        // 分隔線
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cardX + 16, y + 6);
        ctx.lineTo(cardX + CARD_WIDTH - 16, y + 6);
        ctx.stroke();
      }

      // 繪製邦布卡片
      if (bangboo) {
        const bCardX = 40 + agents.length * (CARD_WIDTH + CARD_MARGIN);
        const bCardY = 20;

        drawRoundedRect(ctx, bCardX, bCardY, BANGBOO_WIDTH, 340, 20, "rgba(40,40,60,0.95)");

        if (bangbooImage) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(bCardX, bCardY, BANGBOO_WIDTH, 200, [20, 20, 0, 0]);
          ctx.clip();
          ctx.drawImage(bangbooImage, bCardX, bCardY, BANGBOO_WIDTH, 200);
          ctx.restore();
        }

        ctx.fillStyle = "white";
        ctx.font = `bold 20px ${font}`;
        ctx.textAlign = "left";
        ctx.fillText(bangboo.name, bCardX + 12, bCardY + 228);

        ctx.fillStyle = "#aaa";
        ctx.font = `16px ${font}`;
        ctx.fillText(`Lv.${bangboo.level ?? "?"}  ★${bangboo.star ?? 1}`, bCardX + 12, bCardY + 252);
      }

      // 轉換為圖片
      const imageBuffer = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(imageBuffer, { name: "team.png" });

      await interaction.editReply({ files: [attachment] });
    } catch (error: any) {
      console.error("[/team] draw error:", error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#E76161")
            .setTitle(tr("DrawError") || "Error")
            .setDescription(`\`${error?.message ?? error}\``),
        ],
      });
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utilities/zzz/team.ts
git commit -m "feat: add team canvas drawing utility"
```

---

## Task 4: 更新 commands-manifest.json

**Files:**
- Modify: `commands-manifest.json`

- [ ] **Step 1: 新增 /team 條目**

在 `commands-manifest.json` 的 `commands` 陣列最後加入（在最後一個 `}` 前）：

```json
    {
      "name": "/team",
      "sourceFile": "src/commands/slash/zzz/team.ts",
      "updatedAt": "2026-05-03T00:00:00.000Z"
    }
```

- [ ] **Step 2: Commit**

```bash
git add commands-manifest.json
git commit -m "chore: register /team command in manifest"
```

---

## Task 5: 確認 languageMapping 可被 autoComplete.ts 使用

**Files:**
- Modify: `src/utilities/utilities.ts` (若需要)
- Modify: `src/events/autoComplete.ts`

- [ ] **Step 1: 確認 languageMapping 匯出狀態**

查看 `src/utilities/utilities.ts` 中 `languageMapping` 的定義。若不是 `export const languageMapping`，則需要改為 export，或是在 autoComplete.ts 中直接用 `LanguageEnum` 替代：

```typescript
// 若 languageMapping 未匯出，改用此簡單版本：
const langMap: Record<string, any> = {
  "zh-TW": "zh-tw",
  "zh-CN": "zh-cn",
  vi: "vi-vn",
  fr: "fr-fr",
  default: "en-us",
};
const lang = langMap[userLang ?? ""] ?? langMap["default"];
```

- [ ] **Step 2: Build 測試**

```bash
yarn build
```

若出現 TypeScript 型別錯誤，逐一修正。常見問題：
- `name_mi18n` 不在型別定義中（用 `(c as any).name_mi18n ?? c.name` 解決）
- `record.buddy_list` 不在型別定義中（用 `(record as any).buddy_list` 解決）
- `ctx.roundRect` 不在型別定義中（用 `(ctx as any).roundRect` 解決）

- [ ] **Step 3: Commit 修正**

```bash
git add src/events/autoComplete.ts src/utilities/utilities.ts
git commit -m "fix: export languageMapping and fix type assertions for /team"
```

---

## 翻譯 key 清單（需要加到 i18n 檔）

以下翻譯 key 在 `tr()` 中使用，需確保存在或使用 fallback：

| Key | 預設值（fallback） |
|-----|------------------|
| `team_NoAgent` | "Please select at least one agent." |
| `team_NoAgentData` | "Could not retrieve agent data." |
| `team_Equip` | "音擎" |
| `team_NoEquip` | "未裝備音擎" |
| `team_Relics` | "驅動盤" |
| `team_NoRelics` | "未裝備驅動盤" |

所有 `tr()` 呼叫都有 `|| "fallback"` 字串，因此即使翻譯 key 不存在也不會崩潰。

---

## 完成驗證清單

- [ ] `yarn build` 無 TypeScript 錯誤
- [ ] 在 Discord 輸入 `/team`，出現 `agent1`/`agent2`/`agent3`/`bangboo`/`account` 欄位
- [ ] 聚焦 `agent1` 欄位時出現角色清單（含等級）
- [ ] 聚焦 `bangboo` 欄位時出現邦布清單
- [ ] 選擇角色後 bot 回傳配隊圖片
- [ ] 圖片包含角色名稱、等級、音擎資訊、驅動盤套裝
- [ ] 選擇邦布後圖片右側出現邦布卡片
